const express = require("express");
const router = express.Router();
const pool = require("../config/db"); // Certifique-se que o caminho está correto
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

function toCamelCase(str) {
  if (!str) return "";
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    })
    .replace(/\s+/g, "");
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
      cultura_id_atual, // Pode ser null ou undefined
    } = req.body;
    const usuario_id = req.usuario.id;

    if (!nome_sistema || !thingspeak_channel_id || !thingspeak_read_apikey) {
      return res.status(400).json({
        message: "Nome do sistema e credenciais ThingSpeak são obrigatórios.",
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
      "INSERT INTO Sistemas_Irrigacao (usuario_id, nome_sistema, thingspeak_channel_id, thingspeak_read_apikey, cultura_id_atual) VALUES (?, ?, ?, ?, ?)",
      [
        usuario_id,
        nome_sistema,
        thingspeak_channel_id,
        thingspeak_read_apikey,
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
      cultura_id_atual,
      data_plantio,
    } = req.body; // Adicionado cultura_id_atual e data_plantio
    const usuario_id = req.usuario.id;

    if (!nome_sistema || !thingspeak_channel_id || !thingspeak_read_apikey) {
      return res.status(400).json({
        message: "Nome do sistema e credenciais ThingSpeak são obrigatórios.",
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
      "UPDATE Sistemas_Irrigacao SET nome_sistema = ?, thingspeak_channel_id = ?, thingspeak_read_apikey = ?, cultura_id_atual = ?, data_plantio = ? WHERE id = ? AND usuario_id = ?",
      [
        nome_sistema,
        thingspeak_channel_id,
        thingspeak_read_apikey,
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

// Rota movida para PUT /sistemas/:id (mais RESTful)
// router.put("/sistemas/:sistemaId/cultura", ...);

// -- Comando Irrigação (ESP32) --
// Esta rota é para o ESP32 buscar o comando pendente
router.get("/comando/:sistemaId", async (req, res) => {
  try {
    const { sistemaId } = req.params;
    // NÃO AUTENTICADA: O ESP32 pode não ter como enviar token facilmente.
    // Considere adicionar alguma forma de autenticação aqui se necessário (API Key?)
    const [[sistema]] = await pool.query(
      "SELECT comando_irrigacao FROM Sistemas_Irrigacao WHERE id = ?",
      [sistemaId]
    );
    if (sistema) {
      res.json({ comando: sistema.comando_irrigacao });
      // Reseta o comando para DESLIGAR após o ESP32 ler, SE o comando for LIGAR
      if (sistema.comando_irrigacao === "LIGAR") {
        await pool.query(
          "UPDATE Sistemas_Irrigacao SET comando_irrigacao = 'DESLIGAR' WHERE id = ?",
          [sistemaId]
        );
      }
    } else {
      res.status(404).json({ message: "Sistema não encontrado." });
    }
  } catch (error) {
    console.error("Erro ao buscar comando para ESP:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// -- Comando Irrigação (Dashboard) --
// Esta rota é para o DASHBOARD enviar um comando manual
router.post("/sistemas/:sistemaId/comando", async (req, res) => {
  try {
    const { sistemaId } = req.params;
    const { comando } = req.body; // Espera 'LIGAR' ou 'DESLIGAR'
    const usuario_id = req.usuario.id; // Autenticado

    if (comando !== "LIGAR" && comando !== "DESLIGAR") {
      return res
        .status(400)
        .json({ message: "Comando inválido. Use 'LIGAR' ou 'DESLIGAR'." });
    }

    // Verificar se o sistema pertence ao usuário
    const [resultUpdate] = await pool.query(
      "UPDATE Sistemas_Irrigacao SET comando_irrigacao = ? WHERE id = ? AND usuario_id = ?",
      [comando, sistemaId, usuario_id]
    );

    if (resultUpdate.affectedRows === 0) {
      return res.status(404).json({
        message: "Sistema não encontrado ou não pertence a este usuário.",
      });
    }

    // Registrar o evento de irrigação manual
    await pool.query(
      "INSERT INTO Eventos_Irrigacao (sistema_id, acao, motivo, `timestamp`) VALUES (?, ?, ?, NOW())", // Usando timestamp do DB
      [sistemaId, `${comando}_MANUAL`, "Acionamento via dashboard"]
    );

    res
      .status(200)
      .json({ message: `Comando ${comando} enviado com sucesso.` });
  } catch (error) {
    console.error("Erro ao enviar comando manual:", error);
    res.status(500).json({ message: "Erro ao enviar comando manual." });
  }
});

// -- Dados Atuais --
router.get("/sistemas/:sistemaId/dados-atuais", async (req, res) => {
  try {
    const { sistemaId } = req.params;
    const usuario_id = req.usuario.id; // Autenticado

    // Verifica se o sistema pertence ao usuário E pega o comando atual
    const [[sistema]] = await pool.query(
      "SELECT id, comando_irrigacao FROM Sistemas_Irrigacao WHERE id = ? AND usuario_id = ?",
      [sistemaId, usuario_id]
    );
    if (!sistema) {
      return res.status(404).json({
        message: "Sistema não encontrado ou não pertence a este usuário.",
      });
    }

    // Busca as últimas leituras de cada tipo para o sistema
    const sql = `
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
    const [rows] = await pool.query(sql, [sistemaId, sistemaId]); // Passa o ID duas vezes

    // Formata os dados num objeto mais fácil de usar no frontend
    const dadosFormatados = rows.reduce(
      (acc, { tipo_leitura, unidade, valor, timestamp }) => {
        const key = toCamelCase(tipo_leitura); // Ex: "temperaturaAmbiente"
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
    dadosFormatados.statusBomba = sistema.comando_irrigacao;

    // Busca o último cálculo de ET0 (opcional)
    const [[ultimoET]] = await pool.query(
      "SELECT valor_et_calculado, timestamp_calculo FROM Calculos_ET WHERE sistema_id = ? ORDER BY timestamp_calculo DESC LIMIT 1",
      [sistemaId]
    );
    if (ultimoET) {
      dadosFormatados.evapotranspiracao = {
        valor: parseFloat(ultimoET.valor_et_calculado),
        timestamp: ultimoET.timestamp_calculo,
      };
    }

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
// (Adaptação da sua rota GET /sistemas/:id/mapeamento)
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
    res.json(mapeamentos); // Retorna um array [{ field_number: 1, tipo_leitura: 'Temp', unidade: 'C' }, ...]
  } catch (error) {
    console.error(
      `Erro ao buscar mapeamento para sistema ${req.params.sistemaId}:`,
      error
    );
    res.status(500).json({ message: "Erro interno ao buscar mapeamento." });
  }
});

// ROTA PARA ATUALIZAR O MAPEAMENTO DE UM SISTEMA
// (Adaptação da sua rota PUT /sistemas/:id/mapeamento com melhorias)
router.put("/sistemas/:sistemaId/mapeamento", async (req, res) => {
  const sistemaId = parseInt(req.params.sistemaId, 10);
  const usuario_id = req.usuario.id; // Autenticado
  const mapeamentos = req.body.mapeamentos; // Espera um array no corpo: { mapeamentos: [{ field_number: 1, tipo_leitura: 'Temp', unidade: 'C' }, ...] }

  if (isNaN(sistemaId)) {
    return res.status(400).json({ message: "ID do sistema inválido" });
  }
  if (!Array.isArray(mapeamentos)) {
    return res.status(400).json({
      message:
        'Formato de dados inválido. Esperado um objeto com a chave "mapeamentos" contendo um array.',
    });
  }

  let connection;
  try {
    connection = await pool.getConnection(); // Obter uma conexão para usar transação
    await connection.beginTransaction();

    // Validação de segurança (dentro da transação)
    const [sistemas] = await connection.query(
      "SELECT id FROM Sistemas_Irrigacao WHERE id = ? AND usuario_id = ?",
      [sistemaId, usuario_id]
    );
    if (sistemas.length === 0) {
      await connection.rollback(); // Desfaz antes de retornar erro
      return res.status(404).json({
        message: "Sistema não encontrado ou não pertence a este usuário.",
      });
    }

    // 1. Apaga os mapeamentos antigos para este sistema
    await connection.query(
      "DELETE FROM Mapeamento_ThingSpeak WHERE sistema_id = ?",
      [sistemaId]
    );

    // 2. Insere os novos mapeamentos (apenas os que têm tipo_leitura definido e não é "Nenhum" ou vazio)
    const novosMapeamentos = mapeamentos
      .filter(
        (map) =>
          map &&
          map.field_number &&
          map.tipo_leitura &&
          map.tipo_leitura.trim() !== "" &&
          map.tipo_leitura.toLowerCase() !== "nenhum"
      )
      .map((map) => [
        sistemaId,
        map.field_number,
        map.tipo_leitura.trim(),
        map.unidade || null,
      ]); // Trim para limpar espaços

    if (novosMapeamentos.length > 0) {
      await connection.query(
        "INSERT INTO Mapeamento_ThingSpeak (sistema_id, field_number, tipo_leitura, unidade) VALUES ?",
        [novosMapeamentos] // Passa o array de arrays diretamente
      );
    }

    await connection.commit(); // Confirma a transação
    res.status(200).json({ message: "Mapeamento atualizado com sucesso!" });
  } catch (error) {
    if (connection) await connection.rollback(); // Desfaz em caso de erro
    console.error(
      `Erro ao atualizar mapeamento para sistema ${sistemaId}:`,
      error
    );
    res.status(500).json({ message: "Erro interno ao atualizar mapeamento." });
  } finally {
    if (connection) connection.release(); // Libera a conexão de volta para o pool
  }
});

// -- Dados Históricos -- (Sua rota existente, parece OK)
router.get("/sistemas/:sistemaId/dados-historicos", async (req, res) => {
  try {
    const { sistemaId } = req.params;
    const usuario_id = req.usuario.id; // Autenticado
    const { sensor, intervalo } = req.query; // Pega 'sensor' (ex: umidadeDoSolo) e 'intervalo' (ex: 7d) da query string

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

    // --- Monta a query SQL dinamicamente ---
    let sql = `
            SELECT mt.tipo_leitura, l.valor, l.timestamp
            FROM Leituras l
            JOIN Mapeamento_ThingSpeak mt ON l.mapeamento_id = mt.id
            WHERE mt.sistema_id = ?
        `;
    const params = [sistemaId]; // Parâmetros para a query SQL

    // Adiciona filtro de intervalo de tempo
    let intervalClause = "INTERVAL 1 DAY"; // Padrão é 1 dia
    if (intervalo === "7d") {
      intervalClause = "INTERVAL 7 DAY";
    } else if (intervalo === "30d") {
      intervalClause = "INTERVAL 30 DAY";
    }
    // Se for '1d' ou qualquer outro valor/ausente, usa o padrão 'INTERVAL 1 DAY'

    sql += ` AND l.timestamp >= NOW() - ${intervalClause}`;

    // Adiciona filtro de sensor, SE o parâmetro 'sensor' foi fornecido
    if (sensor) {
      // Precisamos encontrar o 'tipo_leitura' no banco que corresponde à chave 'sensor' (camelCase)
      const [mappings] = await pool.query(
        "SELECT field_number, tipo_leitura FROM Mapeamento_ThingSpeak WHERE sistema_id = ?",
        [sistemaId]
      );
      let tipoLeituraFiltrar = null;
      for (const mapping of mappings) {
        if (toCamelCase(mapping.tipo_leitura) === sensor) {
          tipoLeituraFiltrar = mapping.tipo_leitura;
          break;
        }
      }

      if (tipoLeituraFiltrar) {
        // Se encontramos o tipo_leitura correspondente, adicionamos ao filtro SQL
        sql += " AND mt.tipo_leitura = ?";
        params.push(tipoLeituraFiltrar);
      } else {
        // Se a chave 'sensor' não corresponde a nenhum mapeamento, retornamos vazio
        console.warn(
          `Chave de sensor "${sensor}" não encontrada no mapeamento do sistema ${sistemaId} para filtro.`
        );
        return res.json([]); // Retorna array vazio pois o sensor solicitado não existe no mapeamento
      }
    }

    sql += " ORDER BY l.timestamp ASC;"; // Ordena por tempo para o gráfico

    // Executa a query
    const [leituras] = await pool.query(sql, params);

    // --- Formata a resposta ---
    let dadosFormatados = [];
    if (sensor && leituras.length > 0) {
      // Se filtramos por um sensor específico, o formato é simples: [{ timestamp: ..., valor: ... }]
      // Ideal para um gráfico de linha única
      dadosFormatados = leituras.map((l) => ({
        timestamp: l.timestamp.toISOString(), // Envia como ISO string completa
        valor: parseFloat(l.valor), // Garante que é número
      }));
    } else if (!sensor) {
      // Se NÃO filtramos por sensor (gráfico principal), mantém o formato agrupado por timestamp
      const timestamps = [
        ...new Set(leituras.map((l) => l.timestamp.toISOString())),
      ];
      timestamps.forEach((ts) => {
        const point = { timestamp: ts };
        const leiturasNessePonto = leituras.filter(
          (l) => l.timestamp.toISOString() === ts
        );
        leiturasNessePonto.forEach((leitura) => {
          const key = toCamelCase(leitura.tipo_leitura);
          point[key] = parseFloat(leitura.valor);
        });
        dadosFormatados.push(point);
      });
    }
    // Se `sensor` foi passado mas `leituras` está vazio, `dadosFormatados` continua como `[]`

    res.json(dadosFormatados);
  } catch (error) {
    console.error("Erro ao buscar dados históricos:", error);
    res.status(500).json({ message: "Erro ao buscar dados históricos." });
  }
});

module.exports = router;
