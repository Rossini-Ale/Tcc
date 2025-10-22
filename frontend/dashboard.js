document.addEventListener("DOMContentLoaded", () => {
  // --- 1. VERIFICAÇÃO DE AUTENTICAÇÃO E CONFIGURAÇÕES ---
  const token = localStorage.getItem("authToken");
  if (!token) {
    window.location.href = "login.html";
    return;
  }
  const API_URL = "http://localhost:3000"; // <-- AJUSTE AQUI se a porta for diferente
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
  const valorETEl = document.getElementById("valorET"); // Agora mostra ETc
  const detalhesETEl = document.getElementById("detalhesET"); // Detalhes do ETc (Kc, Fase)
  const statusBombaEl = document.getElementById("statusBomba");
  const cardStatusBombaEl = document.getElementById("cardStatusBomba");
  const tabelaEventosEl = document.getElementById("tabelaEventos");
  const canvasGraficoHistoricoEl = document.getElementById("graficoHistorico");
  let graficoHistorico;
  const modalAdicionarSistemaEl = document.getElementById(
    "modalAdicionarSistema"
  );
  const formAdicionarSistema = document.getElementById("formAdicionarSistema");
  let modalSistema;
  const modalEditarSistemaEl = document.getElementById("modalEditarSistema");
  const formEditarSistema = document.getElementById("formEditarSistema");
  let modalEditar;
  const selectCulturaNoModalEditar = document.getElementById(
    "edit_cultura_sistema"
  );
  const dataPlantioNoModalEditar = document.getElementById("edit_data_plantio");
  const btnAbrirModalMapeamento = document.getElementById(
    "btnAbrirModalMapeamento"
  );
  const modalMapeamentoEl = document.getElementById("modalMapeamento");
  const formMapeamento = document.getElementById("formMapeamento");
  let modalMapeamento;

  // Seletores Gráfico Detalhado
  const modalGraficoDetalhadoEl = document.getElementById(
    "modalGraficoDetalhado"
  );
  let modalGraficoDetalhado;
  const modalGraficoTituloEl = document.getElementById("modalGraficoTitulo");
  const canvasGraficoDetalhadoEl = document.getElementById(
    "canvasGraficoDetalhado"
  );
  const intervaloGraficoBtnsEl = document.getElementById(
    "intervaloGraficoBtns"
  );
  let graficoDetalhado;
  let sensorKeyAtualGraficoDetalhado = null;
  let sensorLabelAtualGraficoDetalhado = null;

  // Inicializa Modais (com verificação)
  try {
    if (modalAdicionarSistemaEl)
      modalSistema = new bootstrap.Modal(modalAdicionarSistemaEl);
    if (modalEditarSistemaEl)
      modalEditar = new bootstrap.Modal(modalEditarSistemaEl);
    if (modalMapeamentoEl)
      modalMapeamento = new bootstrap.Modal(modalMapeamentoEl);
    if (modalGraficoDetalhadoEl)
      modalGraficoDetalhado = new bootstrap.Modal(modalGraficoDetalhadoEl);
  } catch (e) {
    console.error("Erro ao inicializar modais Bootstrap:", e);
  }

  // --- 3. FUNÇÕES AUXILIARES DE API ---
  async function fetchData(endpoint) {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) logout();
        throw new Error(`Falha: ${response.statusText} (${response.status})`);
      }
      if (response.status === 204) {
        return null;
      }
      return await response.json().catch((err) => {
        console.error("Erro parse JSON fetchData:", err, "Endpoint:", endpoint);
        throw new Error(`Resposta inválida do servidor`);
      });
    } catch (error) {
      console.error(`Erro fetchData ${endpoint}:`, error);
      showErrorAlert(`Erro buscar dados: ${error.message}`);
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
        const err = await response.json().catch(() => ({}));
        throw new Error(
          err.message || `Falha: ${response.statusText} (${response.status})`
        );
      }
      if (
        response.status === 204 ||
        response.headers.get("content-length") === "0"
      ) {
        return { message: "Sucesso" };
      }
      return await response.json().catch((err) => {
        console.error("Erro parse JSON postData:", err, "Endpoint:", endpoint);
        throw new Error(`Resposta inválida do servidor`);
      });
    } catch (error) {
      console.error(`Erro ${method} ${endpoint}:`, error);
      showErrorAlert(`${error.message}`);
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
        const err = await response.json().catch(() => ({}));
        throw new Error(
          err.message || `Falha: ${response.statusText} (${response.status})`
        );
      }
      if (
        response.status === 204 ||
        response.headers.get("content-length") === "0"
      ) {
        return { message: "Exclusão sucesso" };
      }
      return await response.json().catch((err) => {
        console.error(
          "Erro parse JSON deleteData:",
          err,
          "Endpoint:",
          endpoint
        );
        throw new Error(`Resposta inválida do servidor`);
      });
    } catch (error) {
      console.error(`Erro deleteData ${endpoint}:`, error);
      showErrorAlert(`${error.message}`);
      throw error;
    }
  }
  function showErrorAlert(message) {
    alert(`Erro: ${message}`);
  }
  function showSuccessAlert(message) {
    alert(message);
  }

  // --- 4. LÓGICA PRINCIPAL DO DASHBOARD ---
  async function inicializarDashboard() {
    try {
      listaDeSistemas = (await fetchData("/api/sistemas")) || [];
      if (listaDeSistemas.length > 0) {
        gerenciamentoSistemasEl?.classList.remove("d-none");
        dashboardContentEl?.classList.remove("d-none");
        emptyStateEl?.classList.add("d-none");
        popularSeletorDeSistemas();
        const ultimoSistemaId = localStorage.getItem("ultimoSistemaId");
        sistemaIdAtivo =
          ultimoSistemaId &&
          listaDeSistemas.some((s) => s.id == ultimoSistemaId)
            ? ultimoSistemaId
            : listaDeSistemas[0]?.id;
        if (sistemaIdAtivo && seletorSistemasEl) {
          seletorSistemasEl.value = sistemaIdAtivo;
          localStorage.setItem("ultimoSistemaId", sistemaIdAtivo);
          carregarDashboardParaSistema(sistemaIdAtivo);
        } else {
          limparDashboard();
          if (nomeSistemaAtivoDisplayEl)
            nomeSistemaAtivoDisplayEl.textContent =
              "Nenhum sistema disponível.";
        }
      } else {
        gerenciamentoSistemasEl?.classList.add("d-none");
        dashboardContentEl?.classList.add("d-none");
        emptyStateEl?.classList.remove("d-none");
        sistemaIdAtivo = null;
        if (nomeSistemaAtivoDisplayEl)
          nomeSistemaAtivoDisplayEl.textContent = "Nenhum sistema cadastrado.";
        localStorage.removeItem("ultimoSistemaId");
        limparDashboard();
      }
    } catch (error) {
      console.error("Erro fatal inicializar dashboard:", error);
      showErrorAlert("Erro crítico ao carregar.");
    }
  }
  function popularSeletorDeSistemas() {
    if (!seletorSistemasEl) return;
    seletorSistemasEl.innerHTML = "";
    listaDeSistemas.forEach((s) => {
      seletorSistemasEl.innerHTML += `<option value="${s.id}">${s.nome_sistema}</option>`;
    });
  }
  function carregarDashboardParaSistema(sistemaId) {
    if (!sistemaId) {
      limparDashboard();
      return;
    }
    sistemaIdAtivo = sistemaId;
    localStorage.setItem("ultimoSistemaId", sistemaIdAtivo);
    const sistemaAtivo = listaDeSistemas.find((s) => s.id == sistemaId);
    if (sistemaAtivo && nomeSistemaAtivoDisplayEl)
      nomeSistemaAtivoDisplayEl.textContent = `Exibindo: ${sistemaAtivo.nome_sistema}`;
    else if (nomeSistemaAtivoDisplayEl) {
      nomeSistemaAtivoDisplayEl.textContent = "Sistema não encontrado.";
      limparDashboard();
      return;
    }
    carregarDadosAtuais(sistemaId);
    desenharGraficoHistorico(sistemaId, "1d");
    carregarHistoricoEventos(sistemaId);
    // ***** CORREÇÃO: Linha abaixo REMOVIDA *****
    // adicionarListenersCards();
  }
  function limparDashboard() {
    [
      valorUmidadeSoloEl,
      valorTemperaturaArEl,
      valorETEl,
      valorUmidadeArEl,
      statusBombaEl,
      detalhesETEl,
    ].forEach((el) => {
      if (el) el.textContent = "--";
    });
    if (detalhesETEl) detalhesETEl.textContent = "mm/dia";
    if (cardStatusBombaEl)
      cardStatusBombaEl.classList.remove("status-ligada", "status-desligada");
    [
      "colUmidadeSolo",
      "colTemperaturaAr",
      "colET",
      "colETc",
      "colUmidadeAr",
    ].forEach((id) => document.getElementById(id)?.classList.add("d-none"));
    if (document.getElementById("colStatusBomba"))
      document.getElementById("colStatusBomba").classList.remove("d-none");
    if (graficoHistorico) {
      graficoHistorico.destroy();
      graficoHistorico = null;
    }
    if (canvasGraficoHistoricoEl) {
      const mainCtx = canvasGraficoHistoricoEl.getContext("2d");
      if (mainCtx) {
        mainCtx.clearRect(0, 0, mainCtx.canvas.width, mainCtx.canvas.height);
        mainCtx.textAlign = "center";
        mainCtx.fillStyle = "#6c757d";
        mainCtx.fillText(
          "Selecione um sistema.",
          mainCtx.canvas.width / 2,
          mainCtx.canvas.height / 2
        );
      }
    }
    if (tabelaEventosEl)
      tabelaEventosEl.innerHTML =
        '<tr><td colspan="3" class="text-center text-muted">Selecione um sistema.</td></tr>';
  }

  // --- 5. FUNÇÕES DE CARREGAMENTO DE DADOS ---
  async function carregarDadosAtuais(sistemaId) {
    if (!sistemaId) return;
    const colUmidadeSolo = document.getElementById("colUmidadeSolo");
    const colTemperaturaAr = document.getElementById("colTemperaturaAr");
    const colET = document.getElementById("colET"); // Coluna agora para ETc
    const colETc = document.getElementById("colETc"); // Coluna para ET0 (oculta)
    const colUmidadeAr = document.getElementById("colUmidadeAr");
    const colStatusBomba = document.getElementById("colStatusBomba");

    try {
      const dados = await fetchData(`/api/sistemas/${sistemaId}/dados-atuais`);

      function atualizarCard(
        colElement,
        dataKey,
        valorElement,
        unidadePadrao = "",
        casasDecimais = 1,
        detailsElement = null
      ) {
        const dado = dados ? dados[dataKey] : undefined;
        if (dado?.valor !== undefined && dado?.valor !== null) {
          colElement?.classList.remove("d-none");
          if (valorElement)
            valorElement.textContent = `${parseFloat(dado.valor).toFixed(
              casasDecimais
            )} ${dado.unidade || unidadePadrao}`;
          if (
            detailsElement &&
            dado.kc !== undefined &&
            dado.fase !== undefined
          ) {
            detailsElement.textContent = `mm/dia (Kc=${parseFloat(
              dado.kc
            ).toFixed(2)}, ${dado.fase})`;
            detailsElement.classList.remove("d-none");
          } else if (detailsElement) {
            detailsElement.textContent = `mm/dia`;
            detailsElement.classList.add("d-none"); // Esconde se não tiver dados Kc/Fase
          }
          return true;
        } else {
          colElement?.classList.add("d-none");
          if (valorElement) valorElement.textContent = `-- ${unidadePadrao}`;
          if (detailsElement) {
            detailsElement.textContent = `mm/dia`;
            detailsElement.classList.add("d-none");
          }
          return false;
        }
      }

      if (!dados) {
        [colUmidadeSolo, colTemperaturaAr, colET, colETc, colUmidadeAr].forEach(
          (el) => el?.classList.add("d-none")
        );
        [
          valorUmidadeSoloEl,
          valorTemperaturaArEl,
          valorETEl,
          valorUmidadeArEl,
          statusBombaEl,
          detalhesETEl,
        ].forEach((el) => {
          if (el) el.textContent = "Erro";
        });
        if (detalhesETEl) detalhesETEl.textContent = "mm/dia";
        cardStatusBombaEl?.classList.remove(
          "status-ligada",
          "status-desligada"
        );
        // ***** CORREÇÃO: Linha abaixo REMOVIDA *****
        // adicionarListenersCards();
        return;
      }

      // Atualiza cards visíveis
      atualizarCard(colUmidadeSolo, "umidadeDoSolo", valorUmidadeSoloEl, "%");
      atualizarCard(
        colTemperaturaAr,
        "temperaturaDoAr",
        valorTemperaturaArEl,
        "°C"
      );
      atualizarCard(
        colET,
        "evapotranspiracaoCultura",
        valorETEl,
        "",
        2,
        detalhesETEl
      ); // ETc visível
      atualizarCard(colUmidadeAr, "umidadeDoAr", valorUmidadeArEl, "%");

      // Atualiza card ET0 (oculto)
      atualizarCard(
        colETc,
        "evapotranspiracao",
        document.getElementById("valorETc"),
        "",
        2,
        document.getElementById("detalhesETc")
      );
      if (colETc) colETc.classList.add("d-none"); // Garante que fica oculto

      // Status da Bomba
      colStatusBomba?.classList.remove("d-none");
      cardStatusBombaEl?.classList.remove("status-ligada", "status-desligada");
      if (dados.statusBomba === "LIGAR") {
        if (statusBombaEl) statusBombaEl.textContent = "Ligada";
        cardStatusBombaEl?.classList.add("status-ligada");
      } else if (dados.statusBomba === "DESLIGAR") {
        if (statusBombaEl) statusBombaEl.textContent = "Desligada";
        cardStatusBombaEl?.classList.add("status-desligada");
      } else {
        if (statusBombaEl) statusBombaEl.textContent = "--";
      }

      // ***** CORREÇÃO: Linha abaixo REMOVIDA *****
      // adicionarListenersCards();
    } catch (error) {
      console.error("Erro carregar dados atuais:", error);
      [colUmidadeSolo, colTemperaturaAr, colET, colETc, colUmidadeAr].forEach(
        (el) => el?.classList.add("d-none")
      );
      [
        valorUmidadeSoloEl,
        valorTemperaturaArEl,
        valorETEl,
        valorUmidadeArEl,
        statusBombaEl,
        detalhesETEl,
      ].forEach((el) => {
        if (el) el.textContent = "Erro";
      });
      if (detalhesETEl) detalhesETEl.textContent = "mm/dia";
      cardStatusBombaEl?.classList.remove("status-ligada", "status-desligada");
      // ***** CORREÇÃO: Linha abaixo REMOVIDA *****
      // adicionarListenersCards();
    }
  }

  // Função para desenhar o gráfico histórico principal
  async function desenharGraficoHistorico(sistemaId, intervalo = "1d") {
    if (!sistemaId || !canvasGraficoHistoricoEl) return;
    const mainCtx = canvasGraficoHistoricoEl.getContext("2d");
    if (!mainCtx) {
      console.error("Contexto 2D gráfico principal não encontrado.");
      return;
    }

    if (graficoHistorico) {
      graficoHistorico.destroy();
      graficoHistorico = null;
    }
    mainCtx.clearRect(0, 0, mainCtx.canvas.width, mainCtx.canvas.height);
    mainCtx.textAlign = "center";
    mainCtx.fillStyle = "#6c757d";
    mainCtx.font = "16px sans-serif";
    mainCtx.fillText(
      "Carregando gráfico...",
      mainCtx.canvas.width / 2,
      mainCtx.canvas.height / 2
    );

    try {
      const dados = await fetchData(
        `/api/sistemas/${sistemaId}/dados-historicos?intervalo=${intervalo}`
      );
      if (graficoHistorico) {
        graficoHistorico.destroy();
        graficoHistorico = null;
      }

      if (!dados || dados.length === 0) {
        console.log(`Sem dados históricos (intervalo: ${intervalo}).`);
        mainCtx.clearRect(0, 0, mainCtx.canvas.width, mainCtx.canvas.height);
        mainCtx.textAlign = "center";
        mainCtx.fillStyle = "#6c757d";
        mainCtx.fillText(
          "Sem dados para exibir neste período.",
          mainCtx.canvas.width / 2,
          mainCtx.canvas.height / 2
        );
        return;
      }

      const graficoOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            type: "time",
            grid: { display: false },
            time: {
              tooltipFormat: intervalo === "1d" ? "HH:mm" : "dd/MM HH:mm",
              unit: intervalo === "1d" ? "hour" : "day",
              displayFormats: { hour: "HH:mm", day: "dd/MM" },
            },
            title: { display: true, text: "Hora / Data" },
          },
        },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, padding: 15 } },
          tooltip: { bodyFont: { size: 13 }, titleFont: { size: 15 } },
        },
      };

      const datasets = [];
      const cores = [
        "#0d6efd",
        "#dc3545",
        "#198754",
        "#ffc107",
        "#6f42c1",
        "#fd7e14",
        "#20c997",
        "#6610f2",
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
          .filter((p) => p.y !== null && !isNaN(p.y));
        if (valoresFormatados.length === 0) return;

        let unidade = "";
        if (chave.toLowerCase().includes("temperatura")) unidade = "°C";
        else if (chave.toLowerCase().includes("umidade")) unidade = "%";
        else if (chave.toLowerCase().includes("evapo")) unidade = "mm";

        const yAxisID = `y${yAxisCount}`;
        const position = yAxisCount % 2 === 0 ? "left" : "right";
        const label = `${chave
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (str) => str.toUpperCase())}`;
        const fullLabel = `${label}${unidade ? ` (${unidade})` : ""}`;

        datasets.push({
          label: label,
          data: valoresFormatados,
          borderColor: cores[corIndex % cores.length],
          backgroundColor: cores[corIndex % cores.length] + "33",
          yAxisID,
          tension: 0.1,
          pointRadius: 1,
          borderWidth: 2,
          fill: false,
        });

        graficoOptions.scales[yAxisID] = {
          position,
          title: { display: true, text: fullLabel },
          grid: { drawOnChartArea: yAxisCount === 0 },
          beginAtZero: chave.toLowerCase().includes("umidade"),
        };
        corIndex++;
        yAxisCount++;
      });

      if (datasets.length > 0) {
        graficoHistorico = new Chart(mainCtx, {
          type: "line",
          data: { datasets },
          options: graficoOptions,
        });
      } else {
        console.log("Nenhum dataset válido para gráfico principal.");
        mainCtx.clearRect(0, 0, mainCtx.canvas.width, mainCtx.canvas.height);
        mainCtx.textAlign = "center";
        mainCtx.fillStyle = "#6c757d";
        mainCtx.fillText(
          "Nenhum dado válido para exibir.",
          mainCtx.canvas.width / 2,
          mainCtx.canvas.height / 2
        );
      }
    } catch (error) {
      console.error("Erro desenhar gráfico:", error);
      if (graficoHistorico) {
        graficoHistorico.destroy();
        graficoHistorico = null;
      }
      mainCtx.clearRect(0, 0, mainCtx.canvas.width, mainCtx.canvas.height);
      mainCtx.textAlign = "center";
      mainCtx.fillStyle = "#dc3545";
      mainCtx.fillText(
        "Erro ao carregar dados do gráfico.",
        mainCtx.canvas.width / 2,
        mainCtx.canvas.height / 2
      );
    }
  }

  // Carregar eventos
  async function carregarHistoricoEventos(sistemaId) {
    if (!sistemaId || !tabelaEventosEl) return;
    tabelaEventosEl.innerHTML =
      '<tr><td colspan="3" class="text-center text-muted">Carregando eventos...</td></tr>';
    try {
      const eventos = await fetchData(`/api/sistemas/${sistemaId}/eventos`);
      tabelaEventosEl.innerHTML = "";
      if (!eventos || eventos.length === 0) {
        tabelaEventosEl.innerHTML =
          '<tr><td colspan="3" class="text-center text-muted">Nenhum evento registrado.</td></tr>';
        return;
      }
      eventos.slice(0, 10).forEach((ev) => {
        const dataHora = new Date(ev.timestamp).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        });
        const acao = ev.acao?.replace(/_/g, " ") || "N/A"; // Troca _ por espaço
        const motivo = ev.motivo || "--";
        tabelaEventosEl.innerHTML += `<tr><td>${dataHora}</td><td class="text-capitalize">${acao.toLowerCase()}</td><td>${motivo}</td></tr>`;
      });
    } catch (error) {
      console.error("Erro carregar eventos:", error);
      tabelaEventosEl.innerHTML =
        '<tr><td colspan="3" class="text-center text-danger">Erro ao carregar eventos.</td></tr>';
    }
  }

  // Carregar culturas para modal
  async function carregarCulturasParaModal(selectElement) {
    if (!selectElement) return;
    const valorGuardado =
      selectElement.dataset.loadingValue || selectElement.value;
    selectElement.innerHTML = `<option value="">Carregando...</option>`;
    selectElement.disabled = true;
    selectElement.dataset.loadingValue = valorGuardado;
    try {
      const culturas = await fetchData("/api/culturas");
      selectElement.innerHTML = `<option value="">-- Sem Cultura --</option>`;
      if (culturas) {
        culturas.forEach((c) => {
          selectElement.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
        });
      }
      if (culturas?.some((c) => c.id == valorGuardado)) {
        selectElement.value = valorGuardado;
      }
    } catch (error) {
      console.error("Erro carregar culturas modal:", error);
      selectElement.innerHTML = `<option value="">Erro</option>`;
    } finally {
      selectElement.disabled = false;
      delete selectElement.dataset.loadingValue;
    }
  }

  // Carregar mapeamento
  async function carregarMapeamentoDoSistema(sistemaId) {
    if (!sistemaId || !formMapeamento) return;
    formMapeamento.reset();
    try {
      const mapeamentos = await fetchData(
        `/api/sistemas/${sistemaId}/mapeamento`
      );
      for (let i = 1; i <= 8; i++) {
        document.getElementById(`map_tipo_${i}`)?.setAttribute("value", "");
        document.getElementById(`map_unidade_${i}`)?.setAttribute("value", "");
      }
      if (mapeamentos) {
        mapeamentos.forEach((map) => {
          document
            .getElementById(`map_tipo_${map.field_number}`)
            ?.setAttribute("value", map.tipo_leitura || "");
          document
            .getElementById(`map_unidade_${map.field_number}`)
            ?.setAttribute("value", map.unidade || "");
        });
      }
    } catch (error) {
      console.error("Erro carregar mapeamento:", error);
      showErrorAlert("Erro ao carregar mapeamento.");
    }
  }

  // Salvar mapeamento
  async function salvarMapeamentoDoSistema(sistemaId) {
    if (!sistemaId || !formMapeamento || !modalMapeamento) return;
    const mapeamentosParaSalvar = [];
    for (let i = 1; i <= 8; i++) {
      const tipo = document.getElementById(`map_tipo_${i}`)?.value.trim();
      const unidade = document.getElementById(`map_unidade_${i}`)?.value.trim();
      if (tipo && tipo.toLowerCase() !== "nenhum") {
        mapeamentosParaSalvar.push({
          field_number: i,
          tipo_leitura: tipo,
          unidade: unidade || null,
        });
      }
    }
    try {
      await putData(`/api/sistemas/${sistemaId}/mapeamento`, {
        mapeamentos: mapeamentosParaSalvar,
      });
      showSuccessAlert("Mapeamento salvo!");
      modalMapeamento.hide();
      carregarDashboardParaSistema(sistemaId);
    } catch (error) {
      console.error("Erro salvar mapeamento:", error);
    }
  }

  // Abrir modal gráfico detalhado
  function abrirModalGraficoDetalhado(sensorKey, sensorLabel) {
    if (!sistemaIdAtivo) {
      showErrorAlert("Selecione um sistema.");
      return;
    }
    if (!modalGraficoDetalhadoEl || !modalGraficoDetalhado) {
      console.error("Modal gráfico detalhado não encontrado.");
      return;
    }
    sensorKeyAtualGraficoDetalhado = sensorKey;
    sensorLabelAtualGraficoDetalhado = sensorLabel;
    if (modalGraficoTituloEl)
      modalGraficoTituloEl.textContent = `Histórico: ${sensorLabel}`;
    const defaultInterval = "7d";
    const defaultRadio = document.getElementById(`intervalo${defaultInterval}`);
    if (defaultRadio) defaultRadio.checked = true;
    carregarDesenharGraficoDetalhado(sensorKey, sensorLabel, defaultInterval);
    modalGraficoDetalhado.show();
  }

  // Carregar/Desenhar gráfico detalhado
  async function carregarDesenharGraficoDetalhado(
    sensorKey,
    sensorLabel,
    intervalo
  ) {
    if (!canvasGraficoDetalhadoEl || !sistemaIdAtivo || !sensorKey) {
      return;
    }
    const ctxDetalhado = canvasGraficoDetalhadoEl.getContext("2d");
    if (!ctxDetalhado) {
      console.error("Contexto 2D gráfico detalhado não encontrado.");
      return;
    }

    const intervaloLabel =
      intervalo === "1d"
        ? "Últimas 24h"
        : `Últimos ${intervalo.replace("d", " dias")}`;
    if (modalGraficoTituloEl)
      modalGraficoTituloEl.textContent = `Carregando: ${sensorLabel} (${intervaloLabel})...`;
    if (graficoDetalhado) {
      graficoDetalhado.destroy();
      graficoDetalhado = null;
    }
    ctxDetalhado.clearRect(
      0,
      0,
      canvasGraficoDetalhadoEl.width,
      canvasGraficoDetalhadoEl.height
    );
    ctxDetalhado.textAlign = "center";
    ctxDetalhado.fillStyle = "#6c757d";
    ctxDetalhado.font = "16px sans-serif";
    ctxDetalhado.fillText(
      "Carregando dados...",
      canvasGraficoDetalhadoEl.width / 2,
      canvasGraficoDetalhadoEl.height / 2
    );

    try {
      const url = `/api/sistemas/${sistemaIdAtivo}/dados-historicos?sensor=${sensorKey}&intervalo=${intervalo}`;
      const dados = await fetchData(url);
      if (modalGraficoTituloEl)
        modalGraficoTituloEl.textContent = `Histórico: ${sensorLabel} (${intervaloLabel})`;
      if (graficoDetalhado) {
        graficoDetalhado.destroy();
        graficoDetalhado = null;
      }

      if (!dados || dados.length === 0) {
        console.log(`Sem dados ${sensorKey} intervalo ${intervalo}.`);
        ctxDetalhado.clearRect(
          0,
          0,
          canvasGraficoDetalhadoEl.width,
          canvasGraficoDetalhadoEl.height
        );
        ctxDetalhado.textAlign = "center";
        ctxDetalhado.fillStyle = "#6c757d";
        ctxDetalhado.fillText(
          "Sem dados para exibir neste período.",
          canvasGraficoDetalhadoEl.width / 2,
          canvasGraficoDetalhadoEl.height / 2
        );
        return;
      }

      const dataPoints = dados.map((d) => ({
        x: new Date(d.timestamp).getTime(),
        y: d.valor,
      }));

      let unidade = "";
      const cardCol = document.querySelector(
        `.card-sensor[data-sensor="${sensorKey}"]`
      );
      if (cardCol && !cardCol.classList.contains("d-none")) {
        const valorEl = cardCol.querySelector(".card-value");
        const valorTexto = valorEl?.textContent;
        if (valorTexto && valorTexto.includes(" ")) {
          unidade = valorTexto.split(" ").pop();
        }
      }
      if (!unidade) {
        // Fallback
        if (sensorKey.toLowerCase().includes("temperatura")) unidade = "°C";
        else if (sensorKey.toLowerCase().includes("umidade")) unidade = "%";
        else if (sensorKey.toLowerCase().includes("evapo")) unidade = "mm";
      }

      const optionsDetalhado = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            type: "time",
            grid: { display: false },
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
            beginAtZero: sensorKey.toLowerCase().includes("umidade"),
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { bodyFont: { size: 13 }, titleFont: { size: 15 } },
        },
      };

      graficoDetalhado = new Chart(ctxDetalhado, {
        type: "line",
        data: {
          datasets: [
            {
              label: sensorLabel,
              data: dataPoints,
              borderColor: "#0d6efd",
              backgroundColor: "#0d6efd",
              tension: 0.1,
              pointRadius: dataPoints.length > 250 ? 0 : 1,
              borderWidth: 2,
              fill: false,
            },
          ],
        },
        options: optionsDetalhado,
      });
    } catch (error) {
      console.error(`Erro gráfico detalhado ${sensorKey}:`, error);
      showErrorAlert(`Erro buscar dados gráfico ${sensorLabel}.`);
      if (graficoDetalhado) {
        graficoDetalhado.destroy();
        graficoDetalhado = null;
      }
      ctxDetalhado.clearRect(
        0,
        0,
        canvasGraficoDetalhadoEl.width,
        canvasGraficoDetalhadoEl.height
      );
      ctxDetalhado.textAlign = "center";
      ctxDetalhado.fillStyle = "#dc3545";
      ctxDetalhado.fillText(
        "Erro ao carregar dados do gráfico.",
        canvasGraficoDetalhadoEl.width / 2,
        canvasGraficoDetalhadoEl.height / 2
      );
    }
  }

  function logout() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("ultimoSistemaId");
    window.location.href = "login.html";
  }

  // --- 6. EVENT LISTENERS ---
  logoutButton?.addEventListener("click", logout);
  seletorSistemasEl?.addEventListener("change", (event) => {
    carregarDashboardParaSistema(event.target.value);
  });
  btnAdicionarPrimeiroSistema?.addEventListener("click", () => {
    if (formAdicionarSistema) formAdicionarSistema.reset();
    modalSistema?.show();
  });
  btnAbrirModalSistema?.addEventListener("click", () => {
    if (formAdicionarSistema) formAdicionarSistema.reset();
    modalSistema?.show();
  });

  document
    .getElementById("ligarBombaBtn")
    ?.addEventListener("click", async () => {
      if (!sistemaIdAtivo) {
        showErrorAlert("Nenhum sistema selecionado.");
        return;
      }
      try {
        await postData(`/api/sistemas/${sistemaIdAtivo}/comando`, {
          comando: "LIGAR",
        });
        if (statusBombaEl) statusBombaEl.textContent = "Ligando...";
        if (cardStatusBombaEl) {
          cardStatusBombaEl.classList.remove("status-desligada");
          cardStatusBombaEl.classList.add("status-ligada");
        }
        setTimeout(() => {
          carregarDadosAtuais(sistemaIdAtivo);
          carregarHistoricoEventos(sistemaIdAtivo);
        }, 2000);
      } catch (error) {
        console.error("Erro ligar bomba:", error);
      }
    });
  document
    .getElementById("desligarBombaBtn")
    ?.addEventListener("click", async () => {
      if (!sistemaIdAtivo) {
        showErrorAlert("Nenhum sistema selecionado.");
        return;
      }
      try {
        await postData(`/api/sistemas/${sistemaIdAtivo}/comando`, {
          comando: "DESLIGAR",
        });
        if (statusBombaEl) statusBombaEl.textContent = "Desligando...";
        if (cardStatusBombaEl) {
          cardStatusBombaEl.classList.add("status-desligada");
          cardStatusBombaEl.classList.remove("status-ligada");
        }
        setTimeout(() => {
          carregarDadosAtuais(sistemaIdAtivo);
          carregarHistoricoEventos(sistemaIdAtivo);
        }, 2000);
      } catch (error) {
        console.error("Erro desligar bomba:", error);
      }
    });

  btnExcluirSistema?.addEventListener("click", async () => {
    if (!sistemaIdAtivo) {
      showErrorAlert("Nenhum sistema selecionado.");
      return;
    }
    const sistemaAtual = listaDeSistemas.find((s) => s.id == sistemaIdAtivo);
    if (!sistemaAtual) return;
    if (
      confirm(
        `Tem certeza que deseja excluir o sistema "${sistemaAtual.nome_sistema}"?\nTODOS os dados (leituras, eventos, cálculos, mapeamentos) serão perdidos permanentemente.`
      )
    ) {
      try {
        await deleteData(`/api/sistemas/${sistemaIdAtivo}`);
        showSuccessAlert("Sistema excluído!");
        localStorage.removeItem("ultimoSistemaId");
        inicializarDashboard();
      } catch (error) {
        console.error("Erro excluir sistema:", error);
      }
    }
  });

  btnEditarSistema?.addEventListener("click", async () => {
    if (!sistemaIdAtivo || !modalEditar) {
      showErrorAlert("Nenhum sistema selecionado.");
      return;
    }
    try {
      if (selectCulturaNoModalEditar) selectCulturaNoModalEditar.value = "";
      if (dataPlantioNoModalEditar) dataPlantioNoModalEditar.value = "";
      await carregarCulturasParaModal(selectCulturaNoModalEditar);
      const sistema = await fetchData(`/api/sistemas/${sistemaIdAtivo}`);
      if (!sistema) {
        showErrorAlert("Não foi possível carregar dados do sistema.");
        return;
      }
      document.getElementById("edit_sistema_id").value = sistema.id;
      document.getElementById("edit_nome_sistema").value = sistema.nome_sistema;
      document.getElementById("edit_channel_id").value =
        sistema.thingspeak_channel_id;
      document.getElementById("edit_read_api_key").value =
        sistema.thingspeak_read_apikey;
      if (selectCulturaNoModalEditar)
        selectCulturaNoModalEditar.value = sistema.cultura_id_atual || "";
      if (dataPlantioNoModalEditar)
        dataPlantioNoModalEditar.value = sistema.data_plantio
          ? sistema.data_plantio.split("T")[0]
          : "";
      modalEditar.show();
    } catch (error) {
      console.error("Erro carregar para edição:", error);
      showErrorAlert("Erro ao carregar dados para edição.");
    }
  });

  formAdicionarSistema?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = {
      nome_sistema: document.getElementById("nome_sistema")?.value,
      thingspeak_channel_id: document.getElementById("channel_id")?.value,
      thingspeak_read_apikey: document.getElementById("read_api_key")?.value,
    };
    if (
      !body.nome_sistema ||
      !body.thingspeak_channel_id ||
      !body.thingspeak_read_apikey
    ) {
      showErrorAlert("Preencha todos os campos obrigatórios.");
      return;
    }
    try {
      await postData("/api/sistemas", body);
      showSuccessAlert("Sistema cadastrado!");
      formAdicionarSistema.reset();
      modalSistema?.hide();
      inicializarDashboard();
    } catch (error) {
      console.error("Erro cadastrar sistema:", error);
    }
  });

  formEditarSistema?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = document.getElementById("edit_sistema_id")?.value;
    if (!id) return;
    const body = {
      nome_sistema: document.getElementById("edit_nome_sistema")?.value,
      thingspeak_channel_id: document.getElementById("edit_channel_id")?.value,
      thingspeak_read_apikey:
        document.getElementById("edit_read_api_key")?.value,
      cultura_id_atual: selectCulturaNoModalEditar?.value || null,
      data_plantio: dataPlantioNoModalEditar?.value || null,
    };
    if (
      !body.nome_sistema ||
      !body.thingspeak_channel_id ||
      !body.thingspeak_read_apikey
    ) {
      showErrorAlert("Preencha Nome, ID Canal e Chave API.");
      return;
    }
    try {
      await putData(`/api/sistemas/${id}`, body);
      showSuccessAlert("Sistema atualizado!");
      modalEditar?.hide();
      inicializarDashboard();
    } catch (error) {
      console.error("Erro atualizar sistema:", error);
    }
  });

  btnAbrirModalMapeamento?.addEventListener("click", () => {
    if (sistemaIdAtivo) {
      carregarMapeamentoDoSistema(sistemaIdAtivo);
      modalMapeamento?.show();
    } else {
      showErrorAlert("Selecione um sistema primeiro.");
    }
  });

  formMapeamento?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (sistemaIdAtivo) {
      salvarMapeamentoDoSistema(sistemaIdAtivo);
    }
  });

  // *** CORREÇÃO: Usa Delegação de Eventos para cliques nos cards ***
  dashboardContentEl?.addEventListener("click", (event) => {
    // Encontra o elemento '.card-sensor' mais próximo que foi clicado
    const colunaCard = event.target.closest(".card-sensor");
    // Verifica se encontrou o card, se ele tem os dados e se NÃO está oculto
    if (colunaCard && !colunaCard.classList.contains("d-none")) {
      const sensorKey = colunaCard.dataset.sensor;
      const sensorLabel = colunaCard.dataset.label;
      if (sensorKey && sensorLabel) {
        abrirModalGraficoDetalhado(sensorKey, sensorLabel);
      } else {
        console.warn(
          "Card clicado (delegado) sem data-sensor/label:",
          colunaCard
        );
      }
    }
  });

  // Listener Botões Intervalo Gráfico Detalhado
  intervaloGraficoBtnsEl?.addEventListener("change", (event) => {
    if (
      event.target.type === "radio" &&
      event.target.name === "intervaloGrafico" &&
      sensorKeyAtualGraficoDetalhado
    ) {
      carregarDesenharGraficoDetalhado(
        sensorKeyAtualGraficoDetalhado,
        sensorLabelAtualGraficoDetalhado,
        event.target.value
      );
    }
  });

  // --- 7. INICIALIZAÇÃO E ATUALIZAÇÃO AUTOMÁTICA ---
  inicializarDashboard(); // Inicia o carregamento do dashboard

  let updateInterval = setInterval(() => {
    if (sistemaIdAtivo) {
      carregarDadosAtuais(sistemaIdAtivo);
      carregarHistoricoEventos(sistemaIdAtivo); // Atualiza o log de eventos também
    }
  }, 30000); // Atualiza a cada 30 segundos

  // Opcional: Pausar atualização quando a janela não estiver visível
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(updateInterval);
    } else {
      if (sistemaIdAtivo) {
        carregarDadosAtuais(sistemaIdAtivo);
        carregarHistoricoEventos(sistemaIdAtivo);
      }
      clearInterval(updateInterval); // Limpa o antigo
      updateInterval = setInterval(() => {
        if (sistemaIdAtivo) {
          carregarDadosAtuais(sistemaIdAtivo);
          carregarHistoricoEventos(sistemaIdAtivo);
        }
      }, 30000);
    }
  });
});
