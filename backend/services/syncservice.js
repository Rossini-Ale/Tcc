const axios = require("axios");
const cron = require("node-cron");
const pool = require("../config/db");

// --- FUNÇÃO DE CÁLCULO DE EVAPOTRANSPIRAÇÃO (MÉTODO DE CAMARGO) ---
async function calcularET_Camargo(sistema_id, connection) {
  try {
    console.log(
      `  -> Calculando ET (Camargo) para o sistema ID: ${sistema_id}`
    );
    const radiacaoSolarMensal = [
      16.0, 15.1, 13.6, 11.7, 10.2, 9.4, 9.8, 11.2, 13.0, 14.8, 15.7, 16.2,
    ];
    const hoje = new Date();
    const mesAtual = hoje.getMonth();
    const Q0 = radiacaoSolarMensal[mesAtual];
    const diasNoMes = new Date(hoje.getFullYear(), mesAtual + 1, 0).getDate();
    const [[mapTemperatura]] = await connection.query(
      "SELECT id FROM Mapeamento_ThingSpeak WHERE sistema_id = ? AND tipo_leitura = ?",
      [sistema_id, "Temperatura do Ar"]
    );
    if (!mapTemperatura) {
      console.log(
        "     - Mapeamento de temperatura não encontrado. Cálculo pulado."
      );
      return;
    }
    const [leituras] = await connection.query(
      "SELECT valor FROM Leituras WHERE mapeamento_id = ? AND timestamp >= NOW() - INTERVAL 1 DAY",
      [mapTemperatura.id]
    );
    if (leituras.length === 0) {
      console.log("     - Dados de temperatura insuficientes. Cálculo pulado.");
      return;
    }
    const temps = leituras.map((l) => parseFloat(l.valor));
    const tMed = temps.reduce((a, b) => a + b, 0) / temps.length;
    if (isNaN(tMed)) {
      console.log(
        "     - Erro no cálculo da temperatura média. Cálculo pulado."
      );
      return;
    }
    const etCalculadoMensal = 0.01 * tMed * Q0 * diasNoMes;
    if (isNaN(etCalculadoMensal)) {
      console.log(
        "     - Erro no cálculo final da ET. Inserção no banco pulada."
      );
      return;
    }
    const etDiario = etCalculadoMensal / diasNoMes;
    console.log(
      `     - TMed: ${tMed.toFixed(
        2
      )}°C, Q₀: ${Q0}, F: ${diasNoMes} -> ET Diário Estimado: ${etDiario.toFixed(
        2
      )} mm/dia`
    );
    await connection.query("DELETE FROM Calculos_ET WHERE sistema_id = ?", [
      sistema_id,
    ]);
    await connection.query(
      "INSERT INTO Calculos_ET (sistema_id, valor_et_calculado) VALUES (?, ?)",
      [sistema_id, etDiario]
    );
  } catch (error) {
    console.error(
      `     - Erro ao calcular ET (Camargo) para o sistema ${sistema_id}:`,
      error
    );
  }
}

// --- FUNÇÃO PRINCIPAL DE SINCRONIZAÇÃO E AUTOMAÇÃO ---
async function syncAndAutomate() {
  console.log(
    `[${new Date().toLocaleString(
      "pt-BR"
    )}] Iniciando tarefa de automação e sincronização...`
  );
  const connection = await pool.getConnection();
  try {
    const [sistemas] = await connection.query(
      "SELECT * FROM Sistemas_Irrigacao WHERE thingspeak_channel_id IS NOT NULL AND thingspeak_read_apikey IS NOT NULL"
    );
    if (sistemas.length === 0) {
      console.log("Nenhum sistema configurado para sincronizar.");
      connection.release();
      return;
    }
    for (const sistema of sistemas) {
      console.log(
        `--- Processando sistema: "${sistema.nome_sistema}" (ID: ${sistema.id}) ---`
      );
      const url = `https://api.thingspeak.com/channels/${sistema.thingspeak_channel_id}/feeds.json?api_key=${sistema.thingspeak_read_apikey}&results=100`;
      const response = await axios.get(url);
      const feeds = response.data.feeds || [];
      if (feeds.length > 0) {
        const [lastEntries] = await connection.query(
          `SELECT MAX(l.timestamp) as lastTimestamp FROM Leituras l JOIN Mapeamento_ThingSpeak m ON l.mapeamento_id = m.id WHERE m.sistema_id = ?`,
          [sistema.id]
        );
        const lastTimestamp = lastEntries[0].lastTimestamp || new Date(0);
        const newFeeds = feeds.filter(
          (feed) => new Date(feed.created_at) > new Date(lastTimestamp)
        );
        if (newFeeds.length > 0) {
          const [mapeamentos] = await connection.query(
            "SELECT * FROM Mapeamento_ThingSpeak WHERE sistema_id = ?",
            [sistema.id]
          );
          for (const feed of newFeeds) {
            for (const map of mapeamentos) {
              const fieldValue = feed[`field${map.field_number}`];
              if (fieldValue) {
                const valorNumerico = parseFloat(fieldValue);
                if (!isNaN(valorNumerico)) {
                  await connection.query(
                    "INSERT INTO Leituras (mapeamento_id, valor, timestamp) VALUES (?, ?, ?)",
                    [map.id, valorNumerico, new Date(feed.created_at)]
                  );
                }
              }
            }
          }
          console.log(`  -> ${newFeeds.length} novas leituras salvas.`);
        } else {
          console.log(`  -> Dados do ThingSpeak já estão sincronizados.`);
        }
      }
      await calcularET_Camargo(sistema.id, connection);
      if (!sistema.cultura_id_atual) {
        console.log(`  -> Automação pulada: Nenhuma cultura selecionada.`);
        continue;
      }
      const [[parametro]] = await connection.query(
        "SELECT valor FROM Parametros_Cultura WHERE cultura_id = ? AND parametro = ?",
        [sistema.cultura_id_atual, "umidade_minima_gatilho"]
      );
      if (!parametro) continue;
      const umidadeMinima = parseFloat(parametro.valor);
      const [[mapUmidade]] = await connection.query(
        "SELECT id FROM Mapeamento_ThingSpeak WHERE sistema_id = ? AND tipo_leitura = ?",
        [sistema.id, "Umidade do Solo"]
      );
      if (!mapUmidade) continue;
      const [[ultimaLeitura]] = await connection.query(
        "SELECT valor FROM Leituras WHERE mapeamento_id = ? ORDER BY timestamp DESC LIMIT 1",
        [mapUmidade.id]
      );
      if (ultimaLeitura && ultimaLeitura.valor < umidadeMinima) {
        await connection.query(
          "UPDATE Sistemas_Irrigacao SET comando_irrigacao = 'LIGAR' WHERE id = ?",
          [sistema.id]
        );
        await connection.query(
          "INSERT INTO Eventos_Irrigacao (sistema_id, acao, motivo) VALUES (?, ?, ?)",
          [
            sistema.id,
            "LIGOU_AUTOMATICO",
            `Umidade (${ultimaLeitura.valor}%) abaixo de ${umidadeMinima}%`,
          ]
        );
      } else {
        await connection.query(
          "UPDATE Sistemas_Irrigacao SET comando_irrigacao = 'DESLIGAR' WHERE id = ?",
          [sistema.id]
        );
      }
    }
  } catch (error) {
    console.error("Erro crítico durante a tarefa:", error);
  } finally {
    if (connection) connection.release();
    console.log("Tarefa de sincronização e automação finalizada.");
  }
}

// --- FUNÇÃO PARA INICIAR O AGENDADOR ---
function startSyncSchedule() {
  cron.schedule("*/5 * * * *", syncAndAutomate);
  console.log(
    "Agendador de automação e sincronização iniciado. Tarefa rodará a cada 5 minutos."
  );
  syncAndAutomate();
}
module.exports = { startSyncSchedule };
