const express = require("express");
const router = express.Router();
const pool = require("../config/db"); // Certifique-se que o caminho está correto
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require("axios"); // <-- ADICIONADO

// !!! IMPORTANTE: COPIADO DO syncservice.js !!!
const IRRIGATION_THRESHOLD_MM = 5.0; // <-- AJUSTE AQUI (Ex: Irrigar quando acumular 5mm)

function toCamelCase(str) {
  if (!str) return "";
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    })
    .replace(/\s+/g, "");
}

// --- FUNÇÃO AUXILIAR (COPIADA DO SYNCSERVICE) ---
async function enviarComandoThingSpeak(sistema, comando) {
  const writeKey = sistema.thingspeak_write_apikey;
  const commandField = 8; // Assumindo Field 8 para o comando

  if (!writeKey) {
    console.log(
      `  -> ERRO: Chave de ESCRITA do ThingSpeak não configurada para o sistema ID: ${sistema.id}`
    );
    // Retorna um erro para a rota saber que falhou
    throw new Error("Chave de escrita ThingSpeak não configurada.");
  }

  const url = `https://api.thingspeak.com/update?api_key=${writeKey}&field${commandField}=${comando}`;

  try {
    await axios.get(url);
    console.log(
      `  -> Comando MANUAL ${comando} (1=Ligar, 0=Desligar) enviado para o ThingSpeak (Sistema ID: ${sistema.id})`
    );
  } catch (error) {
    console.error(
      `  -> ERRO ao enviar comando MANUAL ${comando} para o ThingSpeak:`,
      error.message
    );
    throw new Error("Erro ao enviar comando para ThingSpeak.");
  }
}

// --- ROTAS PÚBLICAS ---
router.post("/cadastro", async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha)
      return res
        .status(400)
        .json({ message: "Todos os campos são obrigatórios." });
    const [usuariosExistentes] = await pool.query(
      "SELECT id FROM Usuarios WHERE email = ?",
      [email]
    );
    if (usuariosExistentes.length > 0)
      return res.status(409).json({ message: "Este e-mail já está em uso." });
    const salt = await bcrypt.genSalt(10);
    const senha_hash = await bcrypt.hash(senha, salt);
    const [result] = await pool.query(
      "INSERT INTO Usuarios (nome, email, senha_hash) VALUES (?, ?, ?)",
      [nome, email, senha_hash]
    );
    res.status(201).json({
      message: "Usuário cadastrado com sucesso!",
      usuarioId: result.insertId,
    });
  } catch (error) {
    console.error("Erro na rota /cadastro:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha)
      return res
        .status(400)
        .json({ message: "E-mail e senha são obrigatórios." });
    const [usuarios] = await pool.query(
      "SELECT * FROM Usuarios WHERE email = ?",
      [email]
    );
    if (usuarios.length === 0)
      return res.status(401).json({ message: "E-mail ou senha incorretos." });
    const usuario = usuarios[0];
    const senhaCorresponde = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaCorresponde)
      return res.status(401).json({ message: "E-mail ou senha incorretos." });
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email },
      process.env.JWT_SECRET, // Certifique-se que JWT_SECRET está no seu .env
      { expiresIn: "8h" }
    );
    res.status(200).json({ message: "Login bem-sucedido!", token });
  } catch (error) {
    console.error("Erro na rota /login:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
const verificarToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    console.warn("Token não fornecido");
    return res.status(401).json({ message: "Token não fornecido" });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, usuario) => {
    if (err) {
      console.error("Erro na verificação do token:", err);
      return res.status(403).json({ message: "Token inválido ou expirado" });
    }
    req.usuario = usuario; // Adiciona os dados do usuário (id, email) ao request
    next();
  });
};
router.use(verificarToken); // Aplica o middleware a todas as rotas abaixo

// --- ROTAS PROTEGIDAS ---

// -- Sistemas de Irrigação --
router.get("/sistemas", async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const [sistemas] = await pool.query(
      `SELECT si.id, si.nome_sistema, si.cultura_id_atual, c.nome as nome_cultura
       FROM Sistemas_Irrigacao si
       LEFT JOIN Culturas c ON si.cultura_id_atual = c.id
       WHERE si.usuario_id = ?`,
      [usuario_id]
    );
    res.json(sistemas);
  } catch (error) {
    console.error("Erro ao buscar sistemas:", error);
    res
      .status(500)
      .json({ message: "Erro interno no servidor ao buscar sistemas." });
  }
});

router.post("/sistemas", async (req, res) => {
  try {
    const {
      nome_sistema,
      thingspeak_channel_id,
      thingspeak_read_apikey,
      thingspeak_write_apikey, // <-- ADICIONADO
      cultura_id_atual, // Pode ser null ou undefined
    } = req.body;
    const usuario_id = req.usuario.id;

    if (
      !nome_sistema ||
      !thingspeak_channel_id ||
      !thingspeak_read_apikey ||
      !thingspeak_write_apikey // <-- ADICIONADO
    ) {
      return res.status(400).json({
        message:
          "Nome do sistema e todas as credenciais ThingSpeak (Read e Write) são obrigatórios.",
      });
    }

    // Validar se o thingspeak_channel_id já existe para evitar erro de UNIQUE
    const [existente] = await pool.query(
      "SELECT id FROM Sistemas_Irrigacao WHERE thingspeak_channel_id = ?",
      [thingspeak_channel_id]
    );
    if (existente.length > 0) {
      return res
        .status(409)
        .json({ message: "Este ID de canal ThingSpeak já está em uso." });
    }

    const [result] = await pool.query(
      "INSERT INTO Sistemas_Irrigacao (usuario_id, nome_sistema, thingspeak_channel_id, thingspeak_read_apikey, thingspeak_write_apikey, cultura_id_atual) VALUES (?, ?, ?, ?, ?, ?)",
      [
        usuario_id,
        nome_sistema,
        thingspeak_channel_id,
        thingspeak_read_apikey,
        thingspeak_write_apikey, // <-- ADICIONADO
        cultura_id_atual || null, // Garante que seja NULL se não for fornecido
      ]
    );
    res.status(201).json({
      message: "Sistema de irrigação cadastrado com sucesso!",
      sistemaId: result.insertId,
    });
  } catch (error) {
    console.error("Erro ao cadastrar sistema:", error);
    // Verifica erro específico de chave única (pode acontecer se a validação acima falhar por concorrência)
    if (error.code === "ER_DUP_ENTRY" || error.errno === 1062) {
      return res
        .status(409)
        .json({ message: "Este ID de canal ThingSpeak já está em uso." });
    }
    res
      .status(500)
      .json({ message: "Erro interno no servidor ao cadastrar sistema." });
  }
});

router.get("/sistemas/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const usuario_id = req.usuario.id;
    // Usando LEFT JOIN para trazer o nome da cultura junto
    const [[sistema]] = await pool.query(
      `SELECT si.*, c.nome as nome_cultura
       FROM Sistemas_Irrigacao si
       LEFT JOIN Culturas c ON si.cultura_id_atual = c.id
       WHERE si.id = ? AND si.usuario_id = ?`,
      [id, usuario_id]
    );
    if (!sistema) {
      return res.status(404).json({
        message: "Sistema não encontrado ou não pertence a este usuário.",
      });
    }
    res.json(sistema);
  } catch (error) {
    console.error("Erro ao buscar detalhes do sistema:", error);
    res.status(500).json({ message: "Erro ao buscar detalhes do sistema." });
  }
});

router.put("/sistemas/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nome_sistema,
      thingspeak_channel_id,
      thingspeak_read_apikey,
      thingspeak_write_apikey, // <-- ADICIONADO
      cultura_id_atual,
      data_plantio,
    } = req.body; // Adicionado cultura_id_atual e data_plantio
    const usuario_id = req.usuario.id;

    if (
      !nome_sistema ||
      !thingspeak_channel_id ||
      !thingspeak_read_apikey ||
      !thingspeak_write_apikey // <-- ADICIONADO
    ) {
      return res.status(400).json({
        message:
          "Nome do sistema e todas as credenciais ThingSpeak (Read e Write) são obrigatórios.",
      });
    }

    // Validar se o thingspeak_channel_id já existe em OUTRO sistema
    const [existente] = await pool.query(
      "SELECT id FROM Sistemas_Irrigacao WHERE thingspeak_channel_id = ? AND id != ?",
      [thingspeak_channel_id, id]
    );
    if (existente.length > 0) {
      return res.status(409).json({
        message:
          "Este ID de canal ThingSpeak já está em uso por outro sistema.",
      });
    }

    const [result] = await pool.query(
      "UPDATE Sistemas_Irrigacao SET nome_sistema = ?, thingspeak_channel_id = ?, thingspeak_read_apikey = ?, thingspeak_write_apikey = ?, cultura_id_atual = ?, data_plantio = ? WHERE id = ? AND usuario_id = ?",
      [
        nome_sistema,
        thingspeak_channel_id,
        thingspeak_read_apikey,
        thingspeak_write_apikey, // <-- ADICIONADO
        cultura_id_atual || null, // Garante NULL se não fornecido
        data_plantio || null, // Garante NULL se não fornecido
        id,
        usuario_id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Sistema não encontrado ou não pertence a este usuário.",
      });
    }
    res.status(200).json({ message: "Sistema atualizado com sucesso!" });
  } catch (error) {
    console.error("Erro ao atualizar sistema:", error);
    // Verifica erro específico de chave única
    if (error.code === "ER_DUP_ENTRY" || error.errno === 1062) {
      return res.status(409).json({
        message:
          "Este ID de canal ThingSpeak já está em uso por outro sistema.",
      });
    }
    res
      .status(500)
      .json({ message: "Erro interno no servidor ao atualizar sistema." });
  }
});

router.delete("/sistemas/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const usuario_id = req.usuario.id;

    // A constraint ON DELETE CASCADE no banco de dados cuidará de apagar
    // os mapeamentos, leituras, cálculos e eventos associados.
    const [result] = await pool.query(
      "DELETE FROM Sistemas_Irrigacao WHERE id = ? AND usuario_id = ?",
      [id, usuario_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Sistema não encontrado ou não pertence a este usuário.",
      });
    }
    res.status(200).json({ message: "Sistema excluído com sucesso!" });
  } catch (error) {
    console.error("Erro ao excluir sistema:", error);
    res
      .status(500)
      .json({ message: "Erro interno no servidor ao excluir sistema." });
  }
});

// -- Culturas --
router.get("/culturas", async (req, res) => {
  try {
    const [culturas] = await pool.query(
      "SELECT id, nome FROM Culturas ORDER BY nome ASC"
    );
    res.json(culturas);
  } catch (error) {
    console.error("Erro ao buscar culturas:", error);
    res.status(500).json({ message: "Erro ao buscar culturas." });
  }
});

// -- Comando Irrigação (ESP32) --
// ESTA ROTA NÃO É MAIS USADA PELO ESP32
router.get("/comando/:sistemaId", async (req, res) => {
  try {
    const { sistemaId } = req.params;
    const [[sistema]] = await pool.query(
      "SELECT comando_irrigacao FROM Sistemas_Irrigacao WHERE id = ?",
      [sistemaId]
    );
    if (sistema) {
      res.json({ comando: sistema.comando_irrigacao });
    } else {
      res.status(404).json({ message: "Sistema não encontrado." });
    }
  } catch (error) {
    console.error("Erro ao buscar comando para ESP:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// -- Comando Irrigação (Dashboard) --
// ===== ROTA MODIFICADA =====
router.post("/sistemas/:sistemaId/comando", async (req, res) => {
  try {
    const { sistemaId } = req.params;
    const { comando } = req.body; // Espera 1 (LIGAR) ou 0 (DESLIGAR)
    const usuario_id = req.usuario.id; // Autenticado

    let comandoNumerico;
    let comandoString;
    let motivoLog;

    if (comando === 1 || comando === "1") {
      comandoNumerico = 1;
      comandoString = "LIGAR";
      motivoLog = "Acionamento manual via dashboard";
    } else {
      comandoNumerico = 0;
      comandoString = "DESLIGAR";
      motivoLog = "Desligamento manual via dashboard";
    }

    // 1. Buscar o sistema e sua chave de escrita
    const [[sistema]] = await pool.query(
      "SELECT * FROM Sistemas_Irrigacao WHERE id = ? AND usuario_id = ?",
      [sistemaId, usuario_id]
    );

    if (!sistema) {
      return res.status(404).json({
        message: "Sistema não encontrado ou não pertence a este usuário.",
      });
    }

    // 2. Enviar o comando para o ThingSpeak
    await enviarComandoThingSpeak(sistema, comandoNumerico);

    // 3. Atualizar o status no NOSSO banco de dados (para o dashboard refletir)
    await pool.query(
      "UPDATE Sistemas_Irrigacao SET comando_irrigacao = ? WHERE id = ?",
      [comandoString, sistemaId]
    );

    // 4. Registrar o evento de irrigação manual
    await pool.query(
      "INSERT INTO Eventos_Irrigacao (sistema_id, acao, motivo, `timestamp`) VALUES (?, ?, ?, NOW())",
      [sistemaId, `${comandoString}_MANUAL`, motivoLog]
    );

    res
      .status(200)
      .json({ message: `Comando ${comandoString} enviado com sucesso.` });
  } catch (error) {
    console.error("Erro ao enviar comando manual:", error);
    res.status(500).json({ message: "Erro ao enviar comando manual." });
  }
});

// -- Dados Atuais --
// ===== ROTA /DADOS-ATUAIS MODIFICADA =====
router.get("/sistemas/:sistemaId/dados-atuais", async (req, res) => {
  try {
    const { sistemaId } = req.params;
    const usuario_id = req.usuario.id; // Autenticado

    // Verifica se o sistema pertence ao usuário E pega o comando E o timestamp da última rega
    const [[sistemaStatus]] = await pool.query(
      "SELECT id, comando_irrigacao, last_etc_irrigation_timestamp FROM Sistemas_Irrigacao WHERE id = ? AND usuario_id = ?",
      [sistemaId, usuario_id]
    );
    if (!sistemaStatus) {
      return res.status(404).json({
        message: "Sistema não encontrado ou não pertence a este usuário.",
      });
    }

    // Busca as últimas leituras de cada tipo para o sistema
    const sqlLeituras = `
      SELECT mt.tipo_leitura, mt.unidade, l.valor, l.timestamp
      FROM Leituras l
      JOIN Mapeamento_ThingSpeak mt ON l.mapeamento_id = mt.id
      WHERE mt.sistema_id = ?
      AND (l.mapeamento_id, l.timestamp) IN (
          SELECT mapeamento_id, MAX(timestamp)
          FROM Leituras sub_l
          JOIN Mapeamento_ThingSpeak sub_mt ON sub_l.mapeamento_id = sub_mt.id
          WHERE sub_mt.sistema_id = ?
          GROUP BY mapeamento_id
      );
    `;
    const [leiturasRows] = await pool.query(sqlLeituras, [
      sistemaId,
      sistemaId,
    ]);

    // Formata os dados num objeto mais fácil de usar no frontend
    const dadosFormatados = leiturasRows.reduce(
      (acc, { tipo_leitura, unidade, valor, timestamp }) => {
        const key = toCamelCase(tipo_leitura); // Ex: "temperaturaDoAr"
        acc[key] = {
          valor: parseFloat(valor), // Converte para número
          unidade: unidade,
          timestamp: timestamp,
        };
        return acc;
      },
      {}
    );

    // Adiciona o status da bomba
    dadosFormatados.statusBomba = sistemaStatus.comando_irrigacao;

    // --- CÁLCULO DE ETc ACUMULADO (NOVA LÓGICA) ---
    const inicioAcumulacao = sistemaStatus.last_etc_irrigation_timestamp
      ? new Date(sistemaStatus.last_etc_irrigation_timestamp)
      : new Date(0);

    const [etcSum] = await pool.query(
      `SELECT SUM(valor_etc_calculado) as etc_acumulado
       FROM Calculos_ETc
       WHERE sistema_id = ? AND timestamp_calculo > ?`,
      [sistemaId, inicioAcumulacao]
    );

    dadosFormatados.etcAcumulado = etcSum[0].etc_acumulado || 0;
    dadosFormatados.etcLimite = IRRIGATION_THRESHOLD_MM;
    // --- FIM DA NOVA LÓGICA ---

    // Busca informações básicas do sistema (ET0, data plantio, ID cultura)
    const [[sistemaInfoBase]] = await pool.query(
      `SELECT
           si.cultura_id_atual,
           si.data_plantio,
           (SELECT valor_et_calculado FROM Calculos_ET WHERE sistema_id = ? ORDER BY timestamp_calculo DESC LIMIT 1) as ultimo_et0,
           (SELECT timestamp_calculo FROM Calculos_ET WHERE sistema_id = ? ORDER BY timestamp_calculo DESC LIMIT 1) as timestamp_et0
         FROM Sistemas_Irrigacao si
         WHERE si.id = ? AND si.usuario_id = ?`,
      [sistemaId, sistemaId, sistemaId, usuario_id]
    );

    let kc_atual = null;
    let fase_atual = "N/A";
    let timestamp_et0 = null;
    let ultimo_et0 = null;

    if (sistemaInfoBase) {
      timestamp_et0 = sistemaInfoBase.timestamp_et0;
      ultimo_et0 =
        sistemaInfoBase.ultimo_et0 !== null
          ? parseFloat(sistemaInfoBase.ultimo_et0)
          : null;

      // Procede para buscar Kc/Fase apenas se houver cultura, data de plantio e ET0 base
      if (
        sistemaInfoBase.cultura_id_atual &&
        sistemaInfoBase.data_plantio &&
        ultimo_et0 !== null
      ) {
        const culturaId = sistemaInfoBase.cultura_id_atual;
        const dataPlantio = new Date(sistemaInfoBase.data_plantio);
        const hoje = new Date();
        // Calcula dias desde plantio (considerando apenas a data, não a hora)
        const diaPlantio = new Date(
          dataPlantio.getFullYear(),
          dataPlantio.getMonth(),
          dataPlantio.getDate()
        );
        const diaHoje = new Date(
          hoje.getFullYear(),
          hoje.getMonth(),
          hoje.getDate()
        );
        const diffTime = Math.abs(diaHoje - diaPlantio);
        const diasDesdePlantio =
          Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 porque o dia do plantio é dia 1

        // Busca todos os parâmetros para esta cultura
        const [parametros] = await pool.query(
          `SELECT fase, duracao_dias, parametro, valor
               FROM Parametros_Cultura
               WHERE cultura_id = ?`,
          [culturaId]
        );

        // Agrupa parâmetros por fase para facilitar o acesso
        const fasesInfo = {};
        parametros.forEach((p) => {
          if (!fasesInfo[p.fase]) {
            // Assume que a primeira linha encontrada para a fase tem a duração correta
            fasesInfo[p.fase] = {
              duracao: parseInt(p.duracao_dias, 10) || 0,
              parametros: {},
            };
          }
          // Armazena o parâmetro (ex: 'Kc') e seu valor
          fasesInfo[p.fase].parametros[p.parametro.toLowerCase()] = p.valor;
        });

        // *** IMPORTANTE: Define a ordem esperada das fases aqui ***
        // Ajuste esta lista se os nomes ou a ordem das suas fases forem diferentes
        const ordemFases = [
          "Inicial",
          "Desenvolvimento",
          "Intermediário",
          "Final",
        ];
        let diasAcumulados = 0;
        let faseEncontrada = false;

        for (const nomeFase of ordemFases) {
          if (fasesInfo[nomeFase]) {
            diasAcumulados += fasesInfo[nomeFase].duracao;
            if (diasDesdePlantio <= diasAcumulados) {
              fase_atual = nomeFase;
              // Busca o valor do Kc para esta fase (convertido para minúsculo)
              const kcFase = fasesInfo[nomeFase].parametros["kc"];
              if (kcFase !== undefined) {
                kc_atual = parseFloat(kcFase);
              } else {
                console.warn(
                  `Parâmetro 'Kc' não encontrado para a fase '${nomeFase}' da cultura ${culturaId}`
                );
                kc_atual = null; // Garante que será null se não encontrar Kc
              }
              faseEncontrada = true;
              break; // Sai do loop assim que encontrar a fase atual
            }
          } else {
            console.warn(
              `Fase '${nomeFase}' definida na ordem não encontrada nos parâmetros da cultura ${culturaId}`
            );
          }
        }

        // Se passou por todas as fases e não encontrou (diasDesdePlantio > duração total)
        if (!faseEncontrada && ordemFases.length > 0) {
          const ultimaFaseNome = ordemFases[ordemFases.length - 1];
          if (fasesInfo[ultimaFaseNome]) {
            fase_atual = ultimaFaseNome;
            const kcFase = fasesInfo[ultimaFaseNome].parametros["kc"];
            if (kcFase !== undefined) {
              kc_atual = parseFloat(kcFase);
            } else {
              console.warn(
                `Parâmetro 'Kc' não encontrado para a última fase '${ultimaFaseNome}' da cultura ${culturaId}`
              );
              kc_atual = null;
            }
          }
        }

        // Validação final: Se kc_atual não for um número válido, reseta para null
        if (isNaN(kc_atual)) {
          kc_atual = null;
        }
      }
    }

    // Monta a resposta final
    if (ultimo_et0 !== null && kc_atual !== null) {
      // Calcula ETc se tiver ET0 e Kc
      const etc = ultimo_et0 * kc_atual;
      dadosFormatados.evapotranspiracaoCultura = {
        valor: etc,
        kc: kc_atual,
        fase: fase_atual,
        timestamp: timestamp_et0,
      };
      // Opcional: Inclui ET0 separadamente
      dadosFormatados.evapotranspiracao = {
        valor: ultimo_et0,
        timestamp: timestamp_et0,
      };
    } else if (ultimo_et0 !== null) {
      // Fallback: Se não tem Kc, mostra ET0 no card ETc
      dadosFormatados.evapotranspiracaoCultura = {
        valor: ultimo_et0,
        timestamp: timestamp_et0,
        // kc e fase ficam undefined
      };
      // Opcional: Inclui ET0 separadamente
      dadosFormatados.evapotranspiracao = {
        valor: ultimo_et0,
        timestamp: timestamp_et0,
      };
    }
    // Se ultimo_et0 for null, nenhuma chave de evapotranspiração será adicionada.

    res.json(dadosFormatados);
  } catch (error) {
    console.error("Erro ao buscar dados atuais:", error);
    res.status(500).json({ message: "Erro ao buscar dados atuais." });
  }
});

// -- Eventos de Irrigação --
router.get("/sistemas/:sistemaId/eventos", async (req, res) => {
  try {
    const { sistemaId } = req.params;
    const usuario_id = req.usuario.id; // Autenticado

    // Verifica se o sistema pertence ao usuário
    const [[sistema]] = await pool.query(
      "SELECT id FROM Sistemas_Irrigacao WHERE id = ? AND usuario_id = ?",
      [sistemaId, usuario_id]
    );
    if (!sistema) {
      return res.status(404).json({
        message: "Sistema não encontrado ou não pertence a este usuário.",
      });
    }

    // Busca os últimos 10 eventos
    const [eventos] = await pool.query(
      "SELECT id, acao, motivo, duracao_segundos, `timestamp` FROM Eventos_Irrigacao WHERE sistema_id = ? ORDER BY `timestamp` DESC LIMIT 10",
      [sistemaId]
    );
    res.json(eventos);
  } catch (error) {
    console.error("Erro ao buscar eventos:", error);
    res.status(500).json({ message: "Erro ao buscar eventos." });
  }
});

// --- ROTAS DE MAPEAMENTO THINKSPEAK ---

// ROTA PARA OBTER O MAPEAMENTO DE UM SISTEMA
router.get("/sistemas/:sistemaId/mapeamento", async (req, res) => {
  try {
    const sistemaId = parseInt(req.params.sistemaId, 10);
    const usuario_id = req.usuario.id; // Autenticado

    if (isNaN(sistemaId)) {
      return res.status(400).json({ message: "ID do sistema inválido" });
    }

    // Validação de segurança: verifica se o sistema pertence ao utilizador
    const [[sistema]] = await pool.query(
      "SELECT id FROM Sistemas_Irrigacao WHERE id = ? AND usuario_id = ?",
      [sistemaId, usuario_id]
    );
    if (!sistema) {
      return res.status(404).json({
        message: "Sistema não encontrado ou não pertence a este usuário.",
      });
    }

    // Busca os mapeamentos existentes
    const [mapeamentos] = await pool.query(
      "SELECT field_number, tipo_leitura, unidade FROM Mapeamento_ThingSpeak WHERE sistema_id = ? ORDER BY field_number",
      [sistemaId]
    );
    res.json(mapeamentos);
  } catch (error) {
    console.error(
      `Erro ao buscar mapeamento para sistema ${req.params.sistemaId}:`,
      error
    );
    res.status(500).json({ message: "Erro interno ao buscar mapeamento." });
  }
});

// ROTA PARA ATUALIZAR O MAPEAMENTO DE UM SISTEMA
router.put("/sistemas/:sistemaId/mapeamento", async (req, res) => {
  const sistemaId = parseInt(req.params.sistemaId, 10);
  const usuario_id = req.usuario.id; // Autenticado
  const mapeamentos = req.body.mapeamentos; // Espera { mapeamentos: [...] }

  if (isNaN(sistemaId)) {
    return res.status(400).json({ message: "ID do sistema inválido" });
  }
  if (!Array.isArray(mapeamentos)) {
    return res.status(400).json({
      message:
        'Formato inválido. Esperado objeto com chave "mapeamentos" contendo array.',
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Validação de segurança
    const [sistemas] = await connection.query(
      "SELECT id FROM Sistemas_Irrigacao WHERE id = ? AND usuario_id = ?",
      [sistemaId, usuario_id]
    );
    if (sistemas.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        message: "Sistema não encontrado ou não pertence a este usuário.",
      });
    }

    // Apaga antigos
    await connection.query(
      "DELETE FROM Mapeamento_ThingSpeak WHERE sistema_id = ?",
      [sistemaId]
    );

    // Insere novos
    const novosMapeamentos = mapeamentos
      .filter(
        (map) =>
          map &&
          map.field_number &&
          map.tipo_leitura &&
          map.tipo_leitura.trim() &&
          map.tipo_leitura.toLowerCase() !== "nenhum"
      )
      .map((map) => [
        sistemaId,
        map.field_number,
        map.tipo_leitura.trim(),
        map.unidade || null,
      ]);

    if (novosMapeamentos.length > 0) {
      await connection.query(
        "INSERT INTO Mapeamento_ThingSpeak (sistema_id, field_number, tipo_leitura, unidade) VALUES ?",
        [novosMapeamentos]
      );
    }

    await connection.commit();
    res.status(200).json({ message: "Mapeamento atualizado com sucesso!" });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(
      `Erro ao atualizar mapeamento para sistema ${sistemaId}:`,
      error
    );
    res.status(500).json({ message: "Erro interno ao atualizar mapeamento." });
  } finally {
    if (connection) connection.release();
  }
});

// -- Dados Históricos --
router.get("/sistemas/:sistemaId/dados-historicos", async (req, res) => {
  try {
    const { sistemaId } = req.params;
    const usuario_id = req.usuario.id; // Autenticado
    const { sensor, intervalo } = req.query;

    // Verifica se o sistema pertence ao usuário
    const [[sistema]] = await pool.query(
      "SELECT id FROM Sistemas_Irrigacao WHERE id = ? AND usuario_id = ?",
      [sistemaId, usuario_id]
    );
    if (!sistema) {
      return res.status(404).json({
        message: "Sistema não encontrado ou não pertence a este usuário.",
      });
    }

    // Monta a query SQL
    let sqlBase = `
        SELECT mt.tipo_leitura, l.valor, l.timestamp
        FROM Leituras l
        JOIN Mapeamento_ThingSpeak mt ON l.mapeamento_id = mt.id
        WHERE mt.sistema_id = ?
    `;
    const params = [sistemaId];

    // Filtro de intervalo
    let intervalClause = "INTERVAL 1 DAY";
    if (intervalo === "7d") intervalClause = "INTERVAL 7 DAY";
    else if (intervalo === "30d") intervalClause = "INTERVAL 30 DAY";
    const timeFilterSql = ` AND l.timestamp >= NOW() - ${intervalClause}`;

    let sql = sqlBase + timeFilterSql;
    let orderBy = " ORDER BY l.timestamp ASC";
    let isEtQuery = false;

    // Filtro de sensor
    if (sensor) {
      const [mappings] = await pool.query(
        "SELECT tipo_leitura FROM Mapeamento_ThingSpeak WHERE sistema_id = ?",
        [sistemaId]
      );
      const tipoLeituraFiltrar = mappings.find(
        (m) => toCamelCase(m.tipo_leitura) === sensor
      )?.tipo_leitura;

      if (tipoLeituraFiltrar) {
        sql += " AND mt.tipo_leitura = ?";
        params.push(tipoLeituraFiltrar);
      } else if (
        sensor === "evapotranspiracao" ||
        sensor === "evapotranspiracaoCultura"
      ) {
        // Busca ET0 histórico se o sensor for relacionado a evapotranspiração
        sql = `SELECT 'Evapotranspiração Ref.' as tipo_leitura, valor_et_calculado as valor, timestamp_calculo as timestamp
                   FROM Calculos_ET
                   WHERE sistema_id = ? AND timestamp_calculo >= NOW() - ${intervalClause}`;
        params.length = 0; // Limpa params
        params.push(sistemaId);
        orderBy = " ORDER BY timestamp ASC"; // Ajusta ORDER BY
        isEtQuery = true;
      } else {
        console.warn(
          `Sensor "${sensor}" não encontrado para sistema ${sistemaId}.`
        );
        return res.json([]);
      }
    }

    sql += orderBy; // Adiciona ordenação

    // Executa a query principal
    const [leituras] = await pool.query(sql, params);

    // --- Formata a resposta ---
    let dadosFormatados = [];
    if (sensor && leituras.length > 0) {
      // Formato simples para gráfico de linha única
      dadosFormatados = leituras.map((l) => ({
        timestamp: l.timestamp.toISOString(),
        valor: parseFloat(l.valor),
      }));
    } else if (!sensor) {
      // Agrupa por timestamp para gráfico principal
      const dataMap = {};
      leituras.forEach((l) => {
        const ts = l.timestamp.toISOString();
        if (!dataMap[ts]) dataMap[ts] = { timestamp: ts };
        const key = toCamelCase(l.tipo_leitura);
        dataMap[ts][key] = parseFloat(l.valor);
      });

      // Adiciona dados de ET0 (histórico)
      const [etRows] = await pool.query(
        `SELECT valor_et_calculado, timestamp_calculo as timestamp
             FROM Calculos_ET
             WHERE sistema_id = ? AND timestamp_calculo >= NOW() - ${intervalClause}
             ORDER BY timestamp_calculo ASC`,
        [sistemaId]
      );

      etRows.forEach((row) => {
        const ts = row.timestamp.toISOString();
        if (!dataMap[ts]) dataMap[ts] = { timestamp: ts };
        dataMap[ts].evapotranspiracao = parseFloat(row.valor_et_calculado); // Usa chave 'evapotranspiracao' para ET0
      });

      // Converte o mapa para array e ordena
      dadosFormatados = Object.values(dataMap).sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );
    }

    res.json(dadosFormatados);
  } catch (error) {
    console.error("Erro ao buscar dados históricos:", error);
    res.status(500).json({ message: "Erro ao buscar dados históricos." });
  }
});

module.exports = router;
