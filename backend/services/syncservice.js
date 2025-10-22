const axios = require("axios");
const cron = require("node-cron");
const pool = require("../config/db");

// --- Constantes e Funções Auxiliares de ET ---

// !!! IMPORTANTE: AJUSTE A LATITUDE PARA A SUA LOCALIDADE !!!
const LATITUDE_PADRAO_GRAUS = -23.55; // <-- AJUSTE AQUI (Ex: São Paulo)

// !!! IMPORTANTE: AJUSTE O LIMITE DE ETc ACUMULADO PARA IRRIGAR !!!
const IRRIGATION_THRESHOLD_MM = 5.0; // <-- AJUSTE AQUI (Ex: Irrigar quando acumular 5mm)

// Função para calcular o dia Juliano (1 a 365/366)
function calcularDiaJuliano(data) {
  const inicioDoAno = new Date(data.getFullYear(), 0, 0);
  const diff = data - inicioDoAno;
  const umDia = 1000 * 60 * 60 * 24;
  return Math.floor(diff / umDia);
}

// Função para calcular Radiação Extraterrestre (Ra em MJ/m²/dia)
function calcularRadiacaoExtraterrestre(latitudeGraus, diaJuliano) {
  const Gsc = 0.082; // Constante solar em MJ/m²/min
  const PI = Math.PI;
  const phi = latitudeGraus * (PI / 180); // Latitude em radianos
  const dr = 1 + 0.033 * Math.cos(((2 * PI) / 365) * diaJuliano); // Distância relativa Terra-Sol
  const delta = 0.409 * Math.sin(((2 * PI) / 365) * diaJuliano - 1.39); // Declinação solar (rad)
  const cosWs = -Math.tan(phi) * Math.tan(delta);
  const ws = Math.acos(Math.max(-1, Math.min(1, cosWs))); // Ângulo horário do pôr do sol (rad)
  const Ra =
    ((24 * 60) / PI) *
    Gsc *
    dr *
    (ws * Math.sin(phi) * Math.sin(delta) +
      Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
  return Ra > 0 ? Ra : 0; // Garante Ra >= 0 (MJ/m²/dia)
}

// Função para buscar leituras de temperatura (Tmax, Tmin, Tavg) das últimas 24h
async function buscarLeiturasDoDiaET(sistemaId, dataReferencia, connection) {
  const dataFim = new Date(dataReferencia);
  const dataInicio = new Date(dataReferencia);
  dataInicio.setHours(dataInicio.getHours() - 24);

  const sql = `
        SELECT
            mt.tipo_leitura, AVG(l.valor) as valor_medio,
            MAX(l.valor) as valor_max, MIN(l.valor) as valor_min
        FROM Leituras l
        JOIN Mapeamento_ThingSpeak mt ON l.mapeamento_id = mt.id
        WHERE mt.sistema_id = ? AND l.timestamp BETWEEN ? AND ?
          AND LOWER(mt.tipo_leitura) LIKE '%temperatura%'
        GROUP BY mt.tipo_leitura;
     `;
  try {
    const [rows] = await connection.query(sql, [
      sistemaId,
      dataInicio,
      dataFim,
    ]);
    const leituras = {};
    rows.forEach((row) => {
      leituras[row.tipo_leitura] = {
        medio: row.valor_medio,
        max: row.valor_max,
        min: row.valor_min,
      };
    });

    let Tmax, Tmin, Tavg;
    const chaves = Object.keys(leituras);
    const chaveTmax =
      chaves.find((k) => k.toLowerCase().includes("maxima")) ||
      chaves.find((k) => k.toLowerCase().includes("temperatura"));
    const chaveTmin =
      chaves.find((k) => k.toLowerCase().includes("minima")) ||
      chaves.find((k) => k.toLowerCase().includes("temperatura"));
    const chaveTavg =
      chaves.find(
        (k) =>
          k.toLowerCase().includes(" ar") ||
          k.toLowerCase().includes("ambiente") ||
          k.toLowerCase().includes("média")
      ) ||
      chaveTmax ||
      chaveTmin;

    Tmax =
      chaveTmax && leituras[chaveTmax]?.max !== null
        ? parseFloat(leituras[chaveTmax]?.max)
        : undefined;
    Tmin =
      chaveTmin && leituras[chaveTmin]?.min !== null
        ? parseFloat(leituras[chaveTmin]?.min)
        : undefined;
    Tavg =
      chaveTavg && leituras[chaveTavg]?.medio !== null
        ? parseFloat(leituras[chaveTavg]?.medio)
        : undefined;

    if (Tmax === undefined && chaveTavg && leituras[chaveTavg]?.max !== null)
      Tmax = parseFloat(leituras[chaveTavg]?.max);
    if (Tmin === undefined && chaveTavg && leituras[chaveTavg]?.min !== null)
      Tmin = parseFloat(leituras[chaveTavg]?.min);
    if (Tavg === undefined && Tmax !== undefined && Tmin !== undefined)
      Tavg = (Tmax + Tmin) / 2;

    const tmaxValido = Tmax !== undefined && !isNaN(Tmax);
    const tminValido = Tmin !== undefined && !isNaN(Tmin);
    const tavgValido = Tavg !== undefined && !isNaN(Tavg);

    if (tmaxValido && tminValido && tavgValido) {
      if (Tmax < Tmin) {
        console.warn(
          `  -> Aviso: Tmax (${Tmax.toFixed(1)}) < Tmin (${Tmin.toFixed(
            1
          )}). Invertendo.`
        );
        [Tmax, Tmin] = [Tmin, Tmax];
      }
      console.log(
        `  -> Leituras Temp: Tmax=${Tmax.toFixed(1)}°C, Tmin=${Tmin.toFixed(
          1
        )}°C, Tavg=${Tavg.toFixed(1)}°C`
      );
      return { Tmax, Tmin, Tavg };
    } else {
      let msg = "  -> Leituras Temp insuficientes/inválidas:";
      if (tmaxValido) msg += ` Tmax=${Tmax.toFixed(1)}`;
      if (tminValido) msg += ` Tmin=${Tmin.toFixed(1)}`;
      if (tavgValido) msg += ` Tavg=${Tavg.toFixed(1)}`;
      console.warn(msg + ". Verifique mapeamento/dados.");
      return null;
    }
  } catch (error) {
    console.error(
      `  -> Erro buscar/processar leituras Temp ET (sistema ${sistemaId}):`,
      error
    );
    return null;
  }
}

// --- Funções de Cálculo ET₀ ---
function calcularET0_HargreavesSamani(Tmax, Tmin, Tavg, Ra) {
  if (
    [Tmax, Tmin, Tavg, Ra].some(
      (v) => v === undefined || v === null || isNaN(v)
    )
  ) {
    console.warn("   - Dados insuficientes para Hargreaves-Samani.");
    return null;
  }
  const deltaT = Math.max(0, Tmax - Tmin);
  const kRs = 0.16; // Ajuste se necessário (0.16 interior, 0.19 costa)
  const et0 = 0.0023 * kRs * Math.sqrt(deltaT) * (Tavg + 17.8) * (Ra / 2.45);
  return et0 >= 0 ? et0 : 0; // mm/dia
}

function calcularET0_Camargo(Tavg, Ra) {
  if ([Tavg, Ra].some((v) => v === undefined || v === null || isNaN(v))) {
    console.warn("   - Dados insuficientes para Camargo.");
    return null;
  }
  const F = 0.01; // Fator de Camargo (ajuste regional se necessário)
  const Q0_cal_cm2_dia = Ra * 23.9; // Converte Ra MJ m⁻² dia⁻¹ -> cal cm⁻² dia⁻¹
  const et0 = F * Q0_cal_cm2_dia * Tavg;
  return et0 >= 0 ? et0 : 0; // mm/dia
}

// --- Função para Obter Kc da Cultura ---
async function obterKcCultura(culturaId, diasDesdePlantio, connection) {
  if (!culturaId || diasDesdePlantio === null || diasDesdePlantio < 0)
    return null;
  try {
    const [fases] = await connection.query(
      `SELECT fase, duracao_dias, valor as kc_valor
             FROM Parametros_Cultura
             WHERE cultura_id = ? AND parametro = 'kc'
             ORDER BY id`,
      [culturaId]
    );
    if (fases.length === 0) {
      console.warn(
        `  -> Nenhuma fase com 'kc' encontrada para cultura ID ${culturaId}.`
      );
      return null;
    }
    let diasAcumulados = 0;
    for (const fase of fases) {
      const duracao = parseInt(fase.duracao_dias, 10);
      const kc = parseFloat(fase.kc_valor);
      if (isNaN(duracao) || isNaN(kc)) {
        console.warn(
          `  -> Dados inválidos (duração/Kc) fase '${fase.fase}' cultura ${culturaId}.`
        );
        continue;
      }
      diasAcumulados += duracao;
      if (diasDesdePlantio <= diasAcumulados) {
        console.log(
          `  -> Cultura fase: ${
            fase.fase
          } (${diasDesdePlantio}/${diasAcumulados}d), Kc=${kc.toFixed(2)}`
        );
        return { kc: kc, fase: fase.fase };
      }
    }
    const ultimaFaseValida = fases
      .slice()
      .reverse()
      .find((f) => !isNaN(parseFloat(f.kc_valor)));
    if (ultimaFaseValida) {
      const kcUltima = parseFloat(ultimaFaseValida.kc_valor);
      console.log(
        `  -> Dias (${diasDesdePlantio}) > duração total. Usando última fase: ${
          ultimaFaseValida.fase
        }, Kc=${kcUltima.toFixed(2)}`
      );
      return { kc: kcUltima, fase: ultimaFaseValida.fase };
    } else {
      console.warn(
        `  -> Nenhuma fase válida com Kc encontrada para cultura ${culturaId}.`
      );
      return null;
    }
  } catch (error) {
    console.error(`  -> Erro obter Kc cultura ${culturaId}:`, error);
    return null;
  }
}

// --- FUNÇÃO PRINCIPAL DE SINCRONIZAÇÃO E CÁLCULOS / AUTOMAÇÃO ETc ---
async function syncAndAutomate() {
  console.log(`[${new Date().toLocaleString("pt-BR")}] Iniciando tarefa...`);
  let connection;
  try {
    connection = await pool.getConnection();
    const [sistemas] = await connection.query(
      "SELECT id, nome_sistema, thingspeak_channel_id, thingspeak_read_apikey, cultura_id_atual, data_plantio, last_etc_irrigation_timestamp, comando_irrigacao FROM Sistemas_Irrigacao"
    );

    if (sistemas.length === 0) {
      console.log("Nenhum sistema cadastrado.");
      return;
    }

    for (const sistema of sistemas) {
      console.log(
        `--- Processando sistema: "${sistema.nome_sistema}" (ID: ${sistema.id}) ---`
      );
      let etcCalculadoHoje = null;

      // --- 1. Sincronização com ThingSpeak ---
      if (sistema.thingspeak_channel_id && sistema.thingspeak_read_apikey) {
        try {
          const url = `https://api.thingspeak.com/channels/${sistema.thingspeak_channel_id}/feeds.json?api_key=${sistema.thingspeak_read_apikey}&results=100`;
          const response = await axios.get(url);
          const feeds = response.data.feeds || [];
          if (feeds.length > 0) {
            const [lastEntries] = await connection.query(
              `SELECT MAX(l.timestamp) as lastTimestamp FROM Leituras l JOIN Mapeamento_ThingSpeak m ON l.mapeamento_id = m.id WHERE m.sistema_id = ?`,
              [sistema.id]
            );
            const lastTimestamp = lastEntries[0].lastTimestamp
              ? new Date(lastEntries[0].lastTimestamp)
              : new Date(0);
            const newFeeds = feeds.filter(
              (feed) => new Date(feed.created_at) > lastTimestamp
            );
            if (newFeeds.length > 0) {
              const [mapeamentos] = await connection.query(
                "SELECT id, field_number FROM Mapeamento_ThingSpeak WHERE sistema_id = ?",
                [sistema.id]
              );
              const mapeamentoDict = mapeamentos.reduce((acc, map) => {
                acc[map.field_number] = map.id;
                return acc;
              }, {});
              let leiturasSalvasCount = 0;
              await connection.beginTransaction();
              try {
                for (const feed of newFeeds) {
                  const timestampLeitura = new Date(feed.created_at);
                  for (let fieldNum = 1; fieldNum <= 8; fieldNum++) {
                    const mapeamentoId = mapeamentoDict[fieldNum];
                    const fieldValue = feed[`field${fieldNum}`];
                    if (
                      mapeamentoId &&
                      fieldValue !== null &&
                      fieldValue !== undefined
                    ) {
                      const valorNumerico = parseFloat(fieldValue);
                      if (!isNaN(valorNumerico)) {
                        await connection.query(
                          "INSERT INTO Leituras (mapeamento_id, valor, timestamp) VALUES (?, ?, ?)",
                          [mapeamentoId, valorNumerico, timestampLeitura]
                        );
                        leiturasSalvasCount++;
                      }
                    }
                  }
                }
                await connection.commit();
                console.log(
                  `  -> ${leiturasSalvasCount} novas leituras salvas.`
                );
              } catch (insertError) {
                await connection.rollback();
                console.error(
                  `  -> Erro ao salvar leituras: Rollback.`,
                  insertError
                );
              }
            } else {
              console.log(`  -> Dados ThingSpeak sincronizados.`);
            }
          } else {
            console.log(`  -> Nenhuma leitura no ThingSpeak.`);
          }
        } catch (thingspeakError) {
          if (thingspeakError.response)
            console.error(
              `  -> Erro ThingSpeak: Status ${thingspeakError.response.status}`
            );
          else
            console.error(
              `  -> Erro rede ThingSpeak:`,
              thingspeakError.message
            );
        }
      } else {
        console.log("  -> Sem config. ThingSpeak.");
      }

      // --- 2. Cálculo de ET₀ e ETc ---
      const hoje = new Date();
      const diaJuliano = calcularDiaJuliano(hoje);
      const latitude = LATITUDE_PADRAO_GRAUS; // !!! AJUSTE !!!
      const leiturasTemp = await buscarLeiturasDoDiaET(
        sistema.id,
        hoje,
        connection
      );
      let et0Calculado = null;
      let metodoET0Utilizado = null;

      if (leiturasTemp) {
        const Ra = calcularRadiacaoExtraterrestre(latitude, diaJuliano);
        if (!isNaN(Ra)) {
          console.log(`  -> Calculando ET₀ | Ra: ${Ra.toFixed(2)} MJ/m²/dia`);
          const et0_HS = calcularET0_HargreavesSamani(
            leiturasTemp.Tmax,
            leiturasTemp.Tmin,
            leiturasTemp.Tavg,
            Ra
          );
          if (et0_HS !== null && et0_HS >= 0) {
            et0Calculado = et0_HS;
            metodoET0Utilizado = "Hargreaves-Samani";
            console.log(`   - ET₀ (H-S): ${et0_HS.toFixed(4)} mm/dia`);
          } else {
            console.log(`   - Falha H-S. Tentando Camargo...`);
            const et0_Camargo = calcularET0_Camargo(leiturasTemp.Tavg, Ra);
            if (et0_Camargo !== null && et0_Camargo >= 0) {
              et0Calculado = et0_Camargo;
              metodoET0Utilizado = "Camargo";
              console.log(
                `   - ET₀ (Camargo): ${et0_Camargo.toFixed(4)} mm/dia`
              );
            } else {
              console.log(`   - Falha Camargo.`);
            }
          }
        } else {
          console.warn("  -> Falha ao calcular Ra.");
        }
      } else {
        console.log("  -> Sem leituras Temp para ET₀.");
      }

      // Salvar ET₀
      if (et0Calculado !== null) {
        try {
          // REMOVA a linha DELETE abaixo se quiser manter histórico de ET0
          await connection.query(
            "DELETE FROM Calculos_ET WHERE sistema_id = ?",
            [sistema.id]
          );
          await connection.query(
            "INSERT INTO Calculos_ET (sistema_id, valor_et_calculado, metodo_et, timestamp_calculo) VALUES (?, ?, ?, NOW())",
            [sistema.id, et0Calculado, metodoET0Utilizado]
          );
          console.log(`  -> ET₀ (${metodoET0Utilizado}) salvo.`);
        } catch (error) {
          console.error(`  -> Erro ao salvar ET₀:`, error);
        }

        // Calcular e Salvar ETc
        if (sistema.cultura_id_atual && sistema.data_plantio) {
          const dataPlantio = new Date(sistema.data_plantio);
          const diffTime = Math.abs(hoje - dataPlantio);
          const diasDesdePlantio = Math.max(
            0,
            Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          );
          const infoKc = await obterKcCultura(
            sistema.cultura_id_atual,
            diasDesdePlantio,
            connection
          );

          if (infoKc && infoKc.kc) {
            etcCalculadoHoje = et0Calculado * infoKc.kc; // Armazena ETc de HOJE
            console.log(
              `  -> Fase: ${infoKc.fase}, Kc: ${infoKc.kc.toFixed(
                2
              )}, ETc Hoje: ${etcCalculadoHoje.toFixed(4)} mm`
            );
            try {
              // REMOVA a linha DELETE abaixo se quiser manter histórico de ETc
              await connection.query(
                "DELETE FROM Calculos_ETc WHERE sistema_id = ?",
                [sistema.id]
              );
              await connection.query(
                "INSERT INTO Calculos_ETc (sistema_id, valor_etc_calculado, kc_utilizado, fase_cultura, dias_desde_plantio, timestamp_calculo) VALUES (?, ?, ?, ?, ?, NOW())",
                [
                  sistema.id,
                  etcCalculadoHoje,
                  infoKc.kc,
                  infoKc.fase,
                  diasDesdePlantio,
                ]
              );
              console.log(`  -> ETc salvo.`);
            } catch (error) {
              console.error(`  -> Erro ao salvar ETc:`, error);
            }
          } else {
            console.warn(`  -> Não foi possível obter Kc. Cálculo ETc pulado.`);
          }
        } else {
          console.log("  -> Sem cultura/data plantio. Cálculo ETc pulado.");
        }
      } else {
        console.warn(`  -> Cálculo de ET₀ falhou. ETc não calculado.`);
      }

      // --- 3. Automação da Irrigação Baseada em ETc Acumulado ---
      if (
        etcCalculadoHoje !== null &&
        etcCalculadoHoje >= 0 &&
        sistema.cultura_id_atual &&
        sistema.data_plantio
      ) {
        // Permite ETc=0
        console.log("  -> Verificando irrigação por ETc acumulado...");
        const inicioAcumulacao = sistema.last_etc_irrigation_timestamp
          ? new Date(sistema.last_etc_irrigation_timestamp)
          : new Date(0);
        const ultimaIrrigacaoStr =
          inicioAcumulacao.getTime() === 0
            ? "Nunca"
            : inicioAcumulacao.toLocaleString("pt-BR");
        console.log(`   - Última irrigação ETc: ${ultimaIrrigacaoStr}`);

        // Busca ETc DESDE a última irrigação por ETc
        // Funciona se você MANTÉM histórico ou NÃO (se não mantém, só retornará o de hoje)
        const [etcRecords] = await connection.query(
          `SELECT valor_etc_calculado FROM Calculos_ETc WHERE sistema_id = ? AND timestamp_calculo > ? ORDER BY timestamp_calculo ASC`,
          [sistema.id, inicioAcumulacao]
        );

        const accumulatedEtc = etcRecords.reduce(
          (sum, record) => sum + parseFloat(record.valor_etc_calculado),
          0
        );
        console.log(
          `   - ETc acumulado: ${accumulatedEtc.toFixed(
            4
          )} mm (Limite: ${IRRIGATION_THRESHOLD_MM} mm)`
        );

        // Verifica se atingiu o limite E se a bomba não está já LIGADA
        if (
          accumulatedEtc >= IRRIGATION_THRESHOLD_MM &&
          sistema.comando_irrigacao !== "LIGAR"
        ) {
          console.log("   - Limite ETc atingido! Acionando irrigação.");
          try {
            await connection.beginTransaction(); // Transação para garantir consistência
            // Atualiza comando e timestamp
            await connection.query(
              "UPDATE Sistemas_Irrigacao SET comando_irrigacao = 'LIGAR', last_etc_irrigation_timestamp = NOW() WHERE id = ?",
              [sistema.id]
            );
            // Registra evento
            await connection.query(
              "INSERT INTO Eventos_Irrigacao (sistema_id, acao, motivo, timestamp) VALUES (?, ?, ?, NOW())",
              [
                sistema.id,
                "LIGOU_AUTO_ETC",
                `ETc (${accumulatedEtc.toFixed(
                  2
                )}mm) >= Limite (${IRRIGATION_THRESHOLD_MM}mm)`,
              ]
            );
            await connection.commit();
            console.log(
              "   -> Comando LIGAR (ETc) enviado e timestamp atualizado."
            );
          } catch (error) {
            await connection.rollback();
            console.error("   -> Erro ao ligar irrigação por ETc:", error);
          }
        } else if (accumulatedEtc < IRRIGATION_THRESHOLD_MM) {
          console.log("   - Limite ETc não atingido.");
          // OPCIONAL: Desligar se estava ligada por ETc e ETc acumulado < threshold (ex: após chuva)?
          // CUIDADO: Esta lógica pode ser complexa. Por ora, não faremos nada se não atingir.
        } else if (sistema.comando_irrigacao === "LIGAR") {
          console.log("   - Limite ETc atingido, mas bomba já LIGADA.");
        }
      } else {
        console.log(
          "  -> Irrigação por ETc pulada (sem ETc válido, cultura ou data)."
        );
      }
      // --- Fim da Automação ETc ---

      console.log(
        `--- Fim do processamento para: "${sistema.nome_sistema}" ---`
      );
    } // Fim do loop for
  } catch (error) {
    console.error("Erro crítico durante a tarefa:", error);
  } finally {
    if (connection) connection.release();
    console.log(`[${new Date().toLocaleString("pt-BR")}] Tarefa finalizada.`);
  }
}

// --- FUNÇÃO PARA INICIAR O AGENDADOR ---
function startSyncSchedule() {
  cron.schedule("*/5 * * * *", syncAndAutomate); // A cada 5 minutos (para teste)
  // cron.schedule('0 6 * * *', syncAndAutomate); // Todo dia às 6 da manhã
  console.log(
    "Agendador de sincronização, cálculos (ET0/ETc) e Automação ETc iniciado."
  );
  // syncAndAutomate(); // Descomente para testar imediatamente
}

module.exports = { startSyncSchedule };
