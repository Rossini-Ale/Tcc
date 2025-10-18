document.addEventListener("DOMContentLoaded", () => {
  // --- 1. VERIFICAÇÃO DE AUTENTICAÇÃO E CONFIGURAÇÕES ---
  const token = localStorage.getItem("authToken");
  if (!token) {
    window.location.href = "login.html";
    return;
  }
  const API_URL = "http://localhost:3000"; // Certifique-se que a porta está correta
  let sistemaIdAtivo = null;
  let listaDeSistemas = [];

  // --- 2. SELETORES DE ELEMENTOS DO DOM ---
  const gerenciamentoSistemasEl = document.getElementById(
    "gerenciamentoSistemas"
  );
  const seletorSistemasEl = document.getElementById("seletorSistemas");
  const dashboardContentEl = document.getElementById("dashboard-content");
  const emptyStateEl = document.getElementById("empty-state");
  const nomeSistemaAtivoDisplayEl = document.getElementById(
    "nomeSistemaAtivoDisplay"
  );
  const btnAdicionarPrimeiroSistema = document.getElementById(
    "btnAdicionarPrimeiroSistema"
  );
  const btnAbrirModalSistema = document.getElementById("btnAbrirModalSistema");
  const btnEditarSistema = document.getElementById("btnEditarSistema");
  const btnExcluirSistema = document.getElementById("btnExcluirSistema");
  const logoutButton = document.getElementById("logoutButton");
  const valorUmidadeSoloEl = document.getElementById("valorUmidadeSolo");
  const valorTemperaturaArEl = document.getElementById("valorTemperaturaAr");
  const valorUmidadeArEl = document.getElementById("valorUmidadeAr");
  const valorETEl = document.getElementById("valorET");
  const statusBombaEl = document.getElementById("statusBomba");
  const cardStatusBombaEl = document.getElementById("cardStatusBomba");
  const tabelaEventosEl = document.getElementById("tabelaEventos");
  const ctx = document.getElementById("graficoHistorico").getContext("2d");
  let graficoHistorico;
  const modalAdicionarSistemaEl = document.getElementById(
    "modalAdicionarSistema"
  );
  const formAdicionarSistema = document.getElementById("formAdicionarSistema");
  const modalSistema = new bootstrap.Modal(modalAdicionarSistemaEl);
  const modalEditarSistemaEl = document.getElementById("modalEditarSistema");
  const formEditarSistema = document.getElementById("formEditarSistema");
  const modalEditar = new bootstrap.Modal(modalEditarSistemaEl);
  const selectCulturaNoModalEditar = document.getElementById(
    "edit_cultura_sistema"
  );
  const dataPlantioNoModalEditar = document.getElementById("edit_data_plantio");
  const btnAbrirModalMapeamento = document.getElementById(
    "btnAbrirModalMapeamento"
  );
  const modalMapeamentoEl = document.getElementById("modalMapeamento");
  const formMapeamento = document.getElementById("formMapeamento");
  const modalMapeamento = new bootstrap.Modal(modalMapeamentoEl);

  // *** NOVOS SELETORES PARA GRÁFICO DETALHADO ***
  const modalGraficoDetalhadoEl = document.getElementById(
    "modalGraficoDetalhado"
  );
  const modalGraficoDetalhado = new bootstrap.Modal(modalGraficoDetalhadoEl);
  const modalGraficoTituloEl = document.getElementById("modalGraficoTitulo");
  const canvasGraficoDetalhadoEl = document.getElementById(
    "canvasGraficoDetalhado"
  );
  const intervaloGraficoBtnsEl = document.getElementById(
    "intervaloGraficoBtns"
  );
  let graficoDetalhado; // Variável para a instância do gráfico detalhado
  let sensorKeyAtualGraficoDetalhado = null; // Para saber qual sensor está no modal
  let sensorLabelAtualGraficoDetalhado = null; // Para o título

  // --- 3. FUNÇÕES AUXILIARES DE API ---
  async function fetchData(endpoint) {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) logout();
        throw new Error(
          `Falha na requisição: ${response.statusText} (${response.status})`
        );
      }
      if (response.status === 204) {
        return null;
      }
      return response.json();
    } catch (error) {
      console.error(`Erro em fetchData para ${endpoint}:`, error);
      showErrorAlert(`Erro ao buscar dados: ${error.message}`);
      return null;
    }
  }

  async function postData(endpoint, body, method = "POST") {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) logout();
        const errorData = await response
          .json()
          .catch(() => ({ message: `Erro ${response.status}` }));
        throw new Error(
          errorData.message ||
            `Falha na requisição: ${response.statusText} (${response.status})`
        );
      }
      if (
        response.status === 204 ||
        response.headers.get("content-length") === "0"
      ) {
        return { message: "Operação realizada com sucesso (sem conteúdo)" };
      }
      return response.json();
    } catch (error) {
      console.error(`Erro em ${method} para ${endpoint}:`, error);
      showErrorAlert(`Erro ao enviar dados: ${error.message}`);
      throw error;
    }
  }

  async function putData(endpoint, body) {
    return postData(endpoint, body, "PUT");
  }
  async function deleteData(endpoint) {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) logout();
        const errorData = await response
          .json()
          .catch(() => ({ message: `Erro ${response.status}` }));
        throw new Error(
          errorData.message ||
            `Falha na requisição: ${response.statusText} (${response.status})`
        );
      }
      if (
        response.status === 204 ||
        response.headers.get("content-length") === "0"
      ) {
        return { message: "Exclusão realizada com sucesso (sem conteúdo)" };
      }
      return response.json();
    } catch (error) {
      console.error(`Erro em deleteData para ${endpoint}:`, error);
      showErrorAlert(`Erro ao excluir: ${error.message}`);
      throw error;
    }
  }

  function showErrorAlert(message) {
    alert(message);
  }
  function showSuccessAlert(message) {
    alert(message);
  }

  // --- 4. LÓGICA PRINCIPAL DO DASHBOARD ---
  async function inicializarDashboard() {
    try {
      listaDeSistemas = (await fetchData("/api/sistemas")) || [];
      if (listaDeSistemas.length > 0) {
        gerenciamentoSistemasEl.classList.remove("d-none");
        dashboardContentEl.classList.remove("d-none");
        emptyStateEl.classList.add("d-none");
        popularSeletorDeSistemas();
        const ultimoSistemaId = localStorage.getItem("ultimoSistemaId");
        sistemaIdAtivo =
          ultimoSistemaId &&
          listaDeSistemas.some((s) => s.id == ultimoSistemaId)
            ? ultimoSistemaId
            : listaDeSistemas[0].id;
        seletorSistemasEl.value = sistemaIdAtivo;
        localStorage.setItem("ultimoSistemaId", sistemaIdAtivo);
        carregarDashboardParaSistema(sistemaIdAtivo);
      } else {
        gerenciamentoSistemasEl.classList.add("d-none");
        dashboardContentEl.classList.add("d-none");
        emptyStateEl.classList.remove("d-none");
        sistemaIdAtivo = null;
        nomeSistemaAtivoDisplayEl.textContent = "Nenhum sistema cadastrado.";
        localStorage.removeItem("ultimoSistemaId");
      }
    } catch (error) {
      console.error("Erro fatal ao inicializar dashboard:", error);
      showErrorAlert("Erro crítico ao carregar o dashboard.");
    }
  }

  function popularSeletorDeSistemas() {
    seletorSistemasEl.innerHTML = "";
    listaDeSistemas.forEach((sistema) => {
      const option = document.createElement("option");
      option.value = sistema.id;
      option.textContent = sistema.nome_sistema;
      seletorSistemasEl.appendChild(option);
    });
  }

  function carregarDashboardParaSistema(sistemaId) {
    if (!sistemaId) {
      return;
    }
    sistemaIdAtivo = sistemaId;
    localStorage.setItem("ultimoSistemaId", sistemaIdAtivo);
    const sistemaAtivo = listaDeSistemas.find((s) => s.id == sistemaId);
    if (sistemaAtivo) {
      nomeSistemaAtivoDisplayEl.textContent = `Exibindo dados para: ${sistemaAtivo.nome_sistema}`;
    } else {
      nomeSistemaAtivoDisplayEl.textContent = "Sistema não encontrado.";
      // Limpar dados antigos
      if (graficoHistorico) graficoHistorico.destroy();
      // ... (limpar outros elementos se necessário) ...
      return;
    }
    carregarDadosAtuais(sistemaId);
    desenharGraficoHistorico(sistemaId); // Carrega gráfico principal com dados de 1 dia
    carregarHistoricoEventos(sistemaId);
  }

  // --- 5. FUNÇÕES DE CARREGAMENTO DE DADOS ---
  async function carregarDadosAtuais(sistemaId) {
    if (!sistemaId) return;
    const colUmidadeSolo = document.getElementById("colUmidadeSolo");
    const colTemperaturaAr = document.getElementById("colTemperaturaAr");
    const colET = document.getElementById("colET");
    const colUmidadeAr = document.getElementById("colUmidadeAr");
    const colStatusBomba = document.getElementById("colStatusBomba");

    try {
      const dados = await fetchData(`/api/sistemas/${sistemaId}/dados-atuais`);
      function atualizarCard(colEl, dataKey, valEl, unit = "", decimals = 1) {
        const dado = dados ? dados[dataKey] : undefined;
        if (dado?.valor !== undefined && dado?.valor !== null) {
          colEl.classList.remove("d-none");
          valEl.textContent = `${parseFloat(dado.valor).toFixed(decimals)} ${
            dado.unidade || unit
          }`;
          return true;
        } else {
          colEl.classList.add("d-none");
          valEl.textContent = `-- ${unit}`;
          return false;
        }
      }
      if (!dados) {
        [colUmidadeSolo, colTemperaturaAr, colET, colUmidadeAr].forEach((el) =>
          el.classList.add("d-none")
        );
        [
          valorUmidadeSoloEl,
          valorTemperaturaArEl,
          valorETEl,
          valorUmidadeArEl,
          statusBombaEl,
        ].forEach((el) => (el.textContent = "Erro"));
        cardStatusBombaEl.classList.remove("status-ligada", "status-desligada");
        return;
      }
      atualizarCard(colUmidadeSolo, "umidadeDoSolo", valorUmidadeSoloEl, "%");
      atualizarCard(
        colTemperaturaAr,
        "temperaturaDoAr",
        valorTemperaturaArEl,
        "°C"
      );
      atualizarCard(colET, "evapotranspiracao", valorETEl, "", 2);
      atualizarCard(colUmidadeAr, "umidadeDoAr", valorUmidadeArEl, "%");
      colStatusBomba.classList.remove("d-none");
      cardStatusBombaEl.classList.remove("status-ligada", "status-desligada");
      if (dados.statusBomba === "LIGAR") {
        statusBombaEl.textContent = "Ligada";
        cardStatusBombaEl.classList.add("status-ligada");
      } else if (dados.statusBomba === "DESLIGAR") {
        statusBombaEl.textContent = "Desligada";
        cardStatusBombaEl.classList.add("status-desligada");
      } else {
        statusBombaEl.textContent = "--";
      }
    } catch (error) {
      console.error("Erro ao carregar dados atuais:", error);
      [colUmidadeSolo, colTemperaturaAr, colET, colUmidadeAr].forEach((el) =>
        el.classList.add("d-none")
      );
      [
        valorUmidadeSoloEl,
        valorTemperaturaArEl,
        valorETEl,
        valorUmidadeArEl,
        statusBombaEl,
      ].forEach((el) => (el.textContent = "Erro"));
      cardStatusBombaEl.classList.remove("status-ligada", "status-desligada");
    }
  }

  async function desenharGraficoHistorico(sistemaId, intervalo = "1d") {
    // Adicionado intervalo padrão
    if (!sistemaId) return;
    try {
      // Busca dados SEM filtro de sensor, mas com intervalo
      const dados = await fetchData(
        `/api/sistemas/${sistemaId}/dados-historicos?intervalo=${intervalo}`
      );

      if (!dados || dados.length === 0) {
        console.log(
          `Sem dados históricos para exibir no gráfico principal (intervalo: ${intervalo}).`
        );
        if (graficoHistorico) graficoHistorico.destroy();
        // Opcional: Mostrar mensagem no canvas principal
        const mainCtx = document
          .getElementById("graficoHistorico")
          .getContext("2d");
        mainCtx.clearRect(0, 0, mainCtx.canvas.width, mainCtx.canvas.height);
        mainCtx.textAlign = "center";
        mainCtx.fillText(
          "Sem dados para exibir neste período.",
          mainCtx.canvas.width / 2,
          mainCtx.canvas.height / 2
        );
        return;
      }

      const graficoOptions = {
        /* ... (como definido na resposta anterior, com type: 'time') ... */
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "time",
            time: {
              tooltipFormat: intervalo === "1d" ? "HH:mm" : "dd/MM HH:mm", // Ajusta tooltip
              unit: intervalo === "1d" ? "hour" : "day", // Ajusta unidade
              displayFormats: { hour: "HH:mm", day: "dd/MM" },
            },
            title: { display: true, text: "Hora / Data" },
          },
          // Y scales são adicionados dinamicamente
        },
      };

      const datasets = [];
      const cores = [
        "rgba(54, 162, 235, 1)",
        "rgba(255, 99, 132, 1)",
        "rgba(75, 192, 192, 1)",
        "rgba(255, 206, 86, 1)",
        "rgba(153, 102, 255, 1)",
      ];
      let corIndex = 0;
      let yAxisCount = 0;
      const chavesDeDados =
        dados.length > 0
          ? Object.keys(dados[0]).filter((k) => k !== "timestamp")
          : [];

      chavesDeDados.forEach((chave) => {
        const valoresFormatados = dados
          .map((d) => ({
            x: new Date(d.timestamp).getTime(),
            y:
              d[chave] !== undefined && d[chave] !== null
                ? parseFloat(d[chave])
                : null,
          }))
          .filter((p) => p.y !== null && !isNaN(p.y)); // Filtra nulos e NaN

        if (valoresFormatados.length === 0) return; // Pula se não houver dados válidos

        let unidade = "";
        if (chave.toLowerCase().includes("temperatura")) unidade = "°C";
        else if (chave.toLowerCase().includes("umidade")) unidade = "%";

        const yAxisID = `y${yAxisCount}`;
        const position = yAxisCount % 2 === 0 ? "left" : "right";

        datasets.push({
          label: `${chave
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (str) => str.toUpperCase())} (${unidade})`,
          data: valoresFormatados,
          borderColor: cores[corIndex % cores.length],
          yAxisID: yAxisID,
          tension: 0.1,
          pointRadius: 2,
          borderWidth: 2,
        });

        graficoOptions.scales[yAxisID] = {
          position: position,
          title: {
            display: true,
            text: `${chave
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (str) => str.toUpperCase())} (${unidade})`,
          },
          grid: { drawOnChartArea: yAxisCount === 0 },
        };
        corIndex++;
        yAxisCount++;
      });

      if (graficoHistorico) {
        graficoHistorico.destroy();
      }

      // Verifica se há datasets para desenhar
      if (datasets.length > 0) {
        graficoHistorico = new Chart(ctx, {
          type: "line",
          data: { datasets },
          options: graficoOptions,
        });
      } else {
        console.log(
          "Nenhum dataset válido para desenhar no gráfico principal."
        );
        // Limpa canvas se não houver datasets
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.textAlign = "center";
        ctx.fillText(
          "Nenhum dado válido para exibir.",
          ctx.canvas.width / 2,
          ctx.canvas.height / 2
        );
      }
    } catch (error) {
      console.error("Erro ao desenhar gráfico:", error);
      if (graficoHistorico) graficoHistorico.destroy();
      // Limpa e mostra erro no canvas
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.textAlign = "center";
      ctx.fillText(
        "Erro ao carregar dados do gráfico.",
        ctx.canvas.width / 2,
        ctx.canvas.height / 2
      );
    }
  }

  async function carregarHistoricoEventos(sistemaId) {
    /* ... (sem alterações) ... */
  }
  async function carregarCulturasParaModal(selectElement) {
    /* ... (sem alterações) ... */
  }
  async function carregarMapeamentoDoSistema(sistemaId) {
    /* ... (sem alterações) ... */
  }
  async function salvarMapeamentoDoSistema(sistemaId) {
    /* ... (sem alterações) ... */
  }

  // *** NOVA FUNÇÃO PARA ABRIR MODAL COM GRÁFICO DETALHADO ***
  function abrirModalGraficoDetalhado(sensorKey, sensorLabel) {
    if (!sistemaIdAtivo) {
      showErrorAlert("Selecione um sistema primeiro.");
      return;
    }
    sensorKeyAtualGraficoDetalhado = sensorKey;
    sensorLabelAtualGraficoDetalhado = sensorLabel;
    modalGraficoTituloEl.textContent = `Histórico Detalhado: ${sensorLabel}`;
    const defaultInterval = "7d";
    const defaultRadio = document.getElementById(`intervalo${defaultInterval}`);
    if (defaultRadio) defaultRadio.checked = true; // Marca 7d como padrão
    carregarDesenharGraficoDetalhado(sensorKey, sensorLabel, defaultInterval);
    modalGraficoDetalhado.show();
  }

  // *** NOVA FUNÇÃO PARA CARREGAR E DESENHAR O GRÁFICO DETALHADO ***
  async function carregarDesenharGraficoDetalhado(
    sensorKey,
    sensorLabel,
    intervalo
  ) {
    const ctxDetalhado = canvasGraficoDetalhadoEl.getContext("2d");
    if (!ctxDetalhado || !sistemaIdAtivo || !sensorKey) {
      return;
    }

    modalGraficoTituloEl.textContent = `Carregando Histórico: ${sensorLabel} (${
      intervalo === "1d" ? "24h" : intervalo
    })...`;

    try {
      const url = `/api/sistemas/${sistemaIdAtivo}/dados-historicos?sensor=${sensorKey}&intervalo=${intervalo}`;
      const dados = await fetchData(url); // API agora retorna [{timestamp, valor}, ...]

      modalGraficoTituloEl.textContent = `Histórico: ${sensorLabel} (${
        intervalo === "1d"
          ? "Últimas 24h"
          : `Últimos ${intervalo.replace("d", " dias")}`
      })`;

      if (!dados || dados.length === 0) {
        console.log(
          `Sem dados históricos para ${sensorKey} no intervalo ${intervalo}.`
        );
        if (graficoDetalhado) graficoDetalhado.destroy();
        ctxDetalhado.clearRect(
          0,
          0,
          canvasGraficoDetalhadoEl.width,
          canvasGraficoDetalhadoEl.height
        );
        ctxDetalhado.textAlign = "center";
        ctxDetalhado.fillText(
          "Sem dados para exibir neste período.",
          canvasGraficoDetalhadoEl.width / 2,
          canvasGraficoDetalhadoEl.height / 2
        );
        return;
      }

      const dataPoints = dados.map((d) => ({
        x: new Date(d.timestamp).getTime(),
        y: d.valor, // API já retorna o valor numérico
      }));

      // Descobre a unidade (busca no mapeamento ou infere)
      let unidade = "";
      if (sensorKey.toLowerCase().includes("temperatura")) unidade = "°C";
      else if (sensorKey.toLowerCase().includes("umidade")) unidade = "%";
      else if (sensorKey.toLowerCase().includes("evapo")) unidade = "mm"; // Apenas exemplo

      const optionsDetalhado = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "time",
            time: {
              tooltipFormat: "dd/MM/yyyy HH:mm",
              unit: intervalo === "1d" ? "hour" : "day",
              displayFormats: { hour: "HH:mm", day: "dd/MM" },
            },
            title: { display: true, text: "Data / Hora" },
          },
          y: {
            title: {
              display: true,
              text: `${sensorLabel}${unidade ? ` (${unidade})` : ""}`,
            },
          },
        },
        plugins: { legend: { display: false } },
      };

      if (graficoDetalhado) {
        graficoDetalhado.destroy();
      }

      graficoDetalhado = new Chart(ctxDetalhado, {
        type: "line",
        data: {
          datasets: [
            {
              label: sensorLabel,
              data: dataPoints,
              borderColor: "rgba(54, 162, 235, 1)",
              tension: 0.1,
              pointRadius: dataPoints.length > 100 ? 1 : 2,
              borderWidth: 2, // Ajusta raio do ponto
            },
          ],
        },
        options: optionsDetalhado,
      });
    } catch (error) {
      console.error(
        `Erro ao carregar/desenhar gráfico detalhado para ${sensorKey}:`,
        error
      );
      showErrorAlert(`Erro ao buscar dados do gráfico para ${sensorLabel}.`);
      if (graficoDetalhado) graficoDetalhado.destroy();
      ctxDetalhado.clearRect(
        0,
        0,
        canvasGraficoDetalhadoEl.width,
        canvasGraficoDetalhadoEl.height
      );
      ctxDetalhado.textAlign = "center";
      ctxDetalhado.fillText(
        "Erro ao carregar dados do gráfico.",
        canvasGraficoDetalhadoEl.width / 2,
        canvasGraficoDetalhadoEl.height / 2
      );
    }
  }

  function logout() {
    /* ... (sem alterações) ... */
  }

  // --- 6. EVENT LISTENERS ---
  logoutButton.addEventListener("click", logout);
  seletorSistemasEl.addEventListener("change", (event) => {
    carregarDashboardParaSistema(event.target.value);
  });
  btnAdicionarPrimeiroSistema.addEventListener("click", () => {
    /* ... */
  });
  btnAbrirModalSistema.addEventListener("click", () => {
    /* ... */
  });
  document
    .getElementById("ligarBombaBtn")
    .addEventListener("click", async () => {
      /* ... */
    });
  document
    .getElementById("desligarBombaBtn")
    .addEventListener("click", async () => {
      /* ... */
    });
  btnExcluirSistema.addEventListener("click", async () => {
    /* ... */
  });
  btnEditarSistema.addEventListener("click", async () => {
    /* ... */
  });
  formAdicionarSistema.addEventListener("submit", async (event) => {
    /* ... */
  });
  formEditarSistema.addEventListener("submit", async (event) => {
    /* ... */
  });
  btnAbrirModalMapeamento.addEventListener("click", () => {
    /* ... */
  });
  formMapeamento.addEventListener("submit", (event) => {
    /* ... */
  });

  // *** ADICIONAR EVENT LISTENERS AOS CARDS DE SENSORES ***
  const cardsSensores = document.querySelectorAll(".card-sensor");
  cardsSensores.forEach((card) => {
    // Garante que a coluna inteira seja o gatilho, não só o card interno
    const colunaCard = card.closest(".col-lg.col-md-6"); // Pega o elemento pai da coluna
    if (colunaCard) {
      colunaCard.addEventListener("click", () => {
        // Pega os dados do elemento com a classe .card-sensor (que pode ser a própria coluna ou filho)
        const cardSensorElement =
          colunaCard.querySelector(".card-sensor") || colunaCard;
        const sensorKey = cardSensorElement.dataset.sensor;
        const sensorLabel = cardSensorElement.dataset.label;

        if (sensorKey && sensorLabel) {
          // Verifica se o card não está oculto antes de abrir o modal
          if (!colunaCard.classList.contains("d-none")) {
            abrirModalGraficoDetalhado(sensorKey, sensorLabel);
          }
        } else {
          console.warn(
            "Card clicado não possui data-sensor ou data-label:",
            colunaCard
          );
        }
      });
      colunaCard.style.cursor = "pointer"; // Adiciona cursor pointer à coluna
    } else {
      // Fallback se a estrutura for diferente (ex: o card-sensor é a própria coluna)
      card.addEventListener("click", () => {
        const sensorKey = card.dataset.sensor;
        const sensorLabel = card.dataset.label;
        if (sensorKey && sensorLabel) {
          if (!card.classList.contains("d-none")) {
            abrirModalGraficoDetalhado(sensorKey, sensorLabel);
          }
        }
      });
      card.style.cursor = "pointer";
    }
  });

  // *** ADICIONAR EVENT LISTENER AOS BOTÕES DE INTERVALO NO MODAL ***
  intervaloGraficoBtnsEl.addEventListener("change", (event) => {
    // Verifica se o evento veio de um radio button dentro do grupo e se temos um sensor ativo no modal
    if (
      event.target.type === "radio" &&
      event.target.name === "intervaloGrafico" &&
      sensorKeyAtualGraficoDetalhado
    ) {
      const novoIntervalo = event.target.value; // '1d', '7d', ou '30d'
      carregarDesenharGraficoDetalhado(
        sensorKeyAtualGraficoDetalhado,
        sensorLabelAtualGraficoDetalhado,
        novoIntervalo
      );
    }
  });

  // --- 7. INICIALIZAÇÃO E ATUALIZAÇÃO AUTOMÁTICA ---
  inicializarDashboard();
  setInterval(() => {
    if (sistemaIdAtivo) {
      carregarDadosAtuais(sistemaIdAtivo);
    }
  }, 30000); // 30 segundos
});
