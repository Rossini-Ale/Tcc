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
  const valorETEl = document.getElementById("valorET"); // Agora para ETc
  const detalhesETEl = document.getElementById("detalhesET"); // Detalhes do ETc
  const statusBombaEl = document.getElementById("statusBomba");
  const cardStatusBombaEl = document.getElementById("cardStatusBomba");
  const tabelaEventosEl = document.getElementById("tabelaEventos");
  const canvasGraficoHistoricoEl = document.getElementById("graficoHistorico"); // Seleciona o canvas
  let graficoHistorico; // Instância do Chart.js principal
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

  // Seletores para Gráfico Detalhado
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
  let graficoDetalhado; // Instância do Chart.js detalhado
  let sensorKeyAtualGraficoDetalhado = null;
  let sensorLabelAtualGraficoDetalhado = null;

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
      return response.json();
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
        return { message: "Sucesso (sem conteúdo)" };
      }
      return response.json();
    } catch (error) {
      console.error(`Erro ${method} ${endpoint}:`, error);
      showErrorAlert(`Erro enviar dados: ${error.message}`);
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
      return response.json();
    } catch (error) {
      console.error(`Erro deleteData ${endpoint}:`, error);
      showErrorAlert(`Erro ao excluir: ${error.message}`);
      throw error;
    }
  }
  function showErrorAlert(message) {
    alert(`Erro: ${message}`);
  } // Adiciona "Erro:"
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
      console.error("Erro fatal inicializar dashboard:", error);
      showErrorAlert("Erro crítico ao carregar.");
    }
  }
  function popularSeletorDeSistemas() {
    seletorSistemasEl.innerHTML = "";
    listaDeSistemas.forEach((s) => {
      seletorSistemasEl.innerHTML += `<option value="${s.id}">${s.nome_sistema}</option>`;
    });
  }
  function carregarDashboardParaSistema(sistemaId) {
    if (!sistemaId) {
      return;
    }
    sistemaIdAtivo = sistemaId;
    localStorage.setItem("ultimoSistemaId", sistemaIdAtivo);
    const sistemaAtivo = listaDeSistemas.find((s) => s.id == sistemaId);
    if (sistemaAtivo)
      nomeSistemaAtivoDisplayEl.textContent = `Exibindo: ${sistemaAtivo.nome_sistema}`;
    else {
      nomeSistemaAtivoDisplayEl.textContent = "Sistema não encontrado.";
      if (graficoHistorico) graficoHistorico.destroy();
      return;
    }
    carregarDadosAtuais(sistemaId);
    desenharGraficoHistorico(sistemaId, "1d"); // Carrega gráfico principal (padrão 1 dia)
    carregarHistoricoEventos(sistemaId);
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
        const colExists = !!colElement; // Verifica se a coluna foi encontrada no HTML
        const valorExists = !!valorElement;
        const detailsExists = !!detailsElement;

        if (dado?.valor !== undefined && dado?.valor !== null) {
          if (colExists) colElement.classList.remove("d-none");
          if (valorExists)
            valorElement.textContent = `${parseFloat(dado.valor).toFixed(
              casasDecimais
            )} ${dado.unidade || unidadePadrao}`;
          if (
            detailsExists &&
            dado.kc !== undefined &&
            dado.fase !== undefined
          ) {
            detailsElement.textContent = `mm/dia (Kc=${parseFloat(
              dado.kc
            ).toFixed(2)}, ${dado.fase})`;
            detailsElement.classList.remove("d-none");
          } else if (detailsExists) {
            detailsElement.textContent = `mm/dia`;
            // Mantém visível por padrão, a menos que a coluna inteira seja oculta
          }
          return true;
        } else {
          if (colExists) colElement.classList.add("d-none"); // Oculta coluna inteira
          if (valorExists) valorElement.textContent = `-- ${unidadePadrao}`;
          if (detailsExists) detailsElement.textContent = `mm/dia`; // Reseta detalhes
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
        cardStatusBombaEl.classList.remove("status-ligada", "status-desligada");
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

      // Garante que o card ET0 (colETc) permaneça oculto (d-none está no HTML)
      if (colETc) colETc.classList.add("d-none");
      // Poderia atualizar o valor dele aqui se quisesse mostrá-lo condicionalmente:
      // atualizarCard(colETc, 'evapotranspiracao', document.getElementById("valorETc"), '', 2, document.getElementById("detalhesETc"));

      // Status da Bomba
      colStatusBomba?.classList.remove("d-none");
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
      cardStatusBombaEl.classList.remove("status-ligada", "status-desligada");
    }
  }

  // Função para desenhar o gráfico histórico principal
  async function desenharGraficoHistorico(sistemaId, intervalo = "1d") {
    if (!sistemaId || !canvasGraficoHistoricoEl) return; // Verifica se o canvas existe
    const mainCtx = canvasGraficoHistoricoEl.getContext("2d");
    if (!mainCtx) return;

    // Limpa e mostra 'Carregando...'
    if (graficoHistorico) graficoHistorico.destroy();
    mainCtx.clearRect(0, 0, mainCtx.canvas.width, mainCtx.canvas.height);
    mainCtx.textAlign = "center";
    mainCtx.fillStyle = "#6c757d";
    mainCtx.fillText(
      "Carregando gráfico...",
      mainCtx.canvas.width / 2,
      mainCtx.canvas.height / 2
    );

    try {
      const dados = await fetchData(
        `/api/sistemas/${sistemaId}/dados-historicos?intervalo=${intervalo}`
      );

      if (!dados || dados.length === 0) {
        console.log(`Sem dados históricos (intervalo: ${intervalo}).`);
        if (graficoHistorico) graficoHistorico.destroy(); // Garante limpeza
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
        interaction: { mode: "index", intersect: false }, // Melhora tooltip
        scales: {
          x: {
            type: "time",
            grid: { display: false }, // Oculta grid X
            time: {
              tooltipFormat: intervalo === "1d" ? "HH:mm" : "dd/MM HH:mm",
              unit: intervalo === "1d" ? "hour" : "day",
              displayFormats: { hour: "HH:mm", day: "dd/MM" },
            },
            title: { display: true, text: "Hora / Data" },
          },
          // Y scales são adicionados dinamicamente
        },
        plugins: { legend: { position: "bottom" } }, // Legenda embaixo
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
      ]; // Cores Bootstrap
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

        if (valoresFormatados.length === 0) return; // Pula sensor sem dados

        let unidade = "";
        if (chave.toLowerCase().includes("temperatura")) unidade = "°C";
        else if (chave.toLowerCase().includes("umidade")) unidade = "%";
        else if (chave.toLowerCase().includes("evapo")) unidade = "mm";

        const yAxisID = `y${yAxisCount}`;
        const position = yAxisCount % 2 === 0 ? "left" : "right";
        // Adapta o label para ser mais legível
        const label = `${chave
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (str) => str.toUpperCase())}`;
        const fullLabel = `${label}${unidade ? ` (${unidade})` : ""}`;

        datasets.push({
          label: label,
          data: valoresFormatados,
          borderColor: cores[corIndex % cores.length],
          yAxisID,
          tension: 0.1,
          pointRadius: 1,
          borderWidth: 2,
          fill: false,
        }); // Pontos menores, sem preenchimento

        graficoOptions.scales[yAxisID] = {
          position,
          title: { display: true, text: fullLabel },
          grid: { drawOnChartArea: yAxisCount === 0 },
        };
        corIndex++;
        yAxisCount++;
      });

      if (graficoHistorico) {
        graficoHistorico.destroy();
      } // Destroi de novo por segurança

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
      if (graficoHistorico) graficoHistorico.destroy();
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
      '<tr><td colspan="3">Carregando eventos...</td></tr>';
    try {
      const eventos = await fetchData(`/api/sistemas/${sistemaId}/eventos`);
      tabelaEventosEl.innerHTML = "";
      if (!eventos || eventos.length === 0) {
        tabelaEventosEl.innerHTML =
          '<tr><td colspan="3">Nenhum evento registrado.</td></tr>';
        return;
      }
      eventos.slice(0, 10).forEach((evento) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${new Date(evento.timestamp).toLocaleString(
          "pt-BR"
        )}</td><td>${evento.acao || "N/A"}</td><td>${
          evento.motivo || "N/A"
        }</td>`;
        tabelaEventosEl.appendChild(tr);
      });
    } catch (error) {
      console.error("Erro carregar eventos:", error);
      tabelaEventosEl.innerHTML =
        '<tr><td colspan="3">Erro ao carregar eventos.</td></tr>';
    }
  }

  // Carregar culturas para modal
  async function carregarCulturasParaModal(selectElement) {
    if (!selectElement) return;
    try {
      const culturas = await fetchData("/api/culturas");
      if (!culturas) return;
      const valorSelecionado = selectElement.value;
      selectElement.innerHTML = `<option value="">-- Sem Cultura --</option>`;
      culturas.forEach((c) => {
        selectElement.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
      });
      if (valorSelecionado) selectElement.value = valorSelecionado; // Restaura seleção
    } catch (error) {
      console.error("Erro carregar culturas modal:", error);
    }
  }

  // Carregar mapeamento
  async function carregarMapeamentoDoSistema(sistemaId) {
    if (!sistemaId || !formMapeamento) return;
    formMapeamento.reset(); // Limpa form
    try {
      const mapeamentos = await fetchData(
        `/api/sistemas/${sistemaId}/mapeamento`
      );
      if (mapeamentos) {
        mapeamentos.forEach((map) => {
          const tipoInput = document.getElementById(
            `map_tipo_${map.field_number}`
          );
          const unidadeInput = document.getElementById(
            `map_unidade_${map.field_number}`
          );
          if (tipoInput) tipoInput.value = map.tipo_leitura || "";
          if (unidadeInput) unidadeInput.value = map.unidade || "";
        });
      }
    } catch (error) {
      console.error("Erro carregar mapeamento:", error);
      showErrorAlert("Erro ao carregar mapeamento.");
    }
  }

  // Salvar mapeamento
  async function salvarMapeamentoDoSistema(sistemaId) {
    if (!sistemaId || !formMapeamento) return;
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
      // Recarrega tudo para garantir consistência
      carregarDashboardParaSistema(sistemaId);
    } catch (error) {
      console.error(
        "Erro salvar mapeamento:",
        error
      ); /* Alerta já mostrado em putData */
    }
  }

  // Abrir modal gráfico detalhado
  function abrirModalGraficoDetalhado(sensorKey, sensorLabel) {
    if (!sistemaIdAtivo) {
      showErrorAlert("Selecione um sistema.");
      return;
    }
    if (!modalGraficoDetalhadoEl) {
      console.error("Modal do gráfico detalhado não encontrado no HTML.");
      return;
    }
    sensorKeyAtualGraficoDetalhado = sensorKey;
    sensorLabelAtualGraficoDetalhado = sensorLabel;
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
    if (!ctxDetalhado) return;

    modalGraficoTituloEl.textContent = `Carregando: ${sensorLabel} (${
      intervalo === "1d" ? "24h" : intervalo
    })...`;
    if (graficoDetalhado) graficoDetalhado.destroy(); // Limpa antes de buscar
    ctxDetalhado.clearRect(
      0,
      0,
      canvasGraficoDetalhadoEl.width,
      canvasGraficoDetalhadoEl.height
    );
    ctxDetalhado.textAlign = "center";
    ctxDetalhado.fillStyle = "#6c757d";
    ctxDetalhado.fillText(
      "Carregando dados...",
      canvasGraficoDetalhadoEl.width / 2,
      canvasGraficoDetalhadoEl.height / 2
    );

    try {
      const url = `/api/sistemas/${sistemaIdAtivo}/dados-historicos?sensor=${sensorKey}&intervalo=${intervalo}`;
      const dados = await fetchData(url);
      const intervaloLabel =
        intervalo === "1d"
          ? "Últimas 24h"
          : `Últimos ${intervalo.replace("d", " dias")}`;
      modalGraficoTituloEl.textContent = `Histórico: ${sensorLabel} (${intervaloLabel})`;

      if (graficoDetalhado) graficoDetalhado.destroy(); // Limpa de novo por segurança

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
      if (sensorKey.toLowerCase().includes("temperatura")) unidade = "°C";
      else if (sensorKey.toLowerCase().includes("umidade")) unidade = "%";
      else if (sensorKey.toLowerCase().includes("evapo")) unidade = "mm";

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
          },
        },
        plugins: { legend: { display: false } },
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
              pointRadius: dataPoints.length > 200 ? 0 : 1,
              borderWidth: 2,
              fill: false,
            },
          ],
        }, // Oculta pontos se muitos dados
        options: optionsDetalhado,
      });
    } catch (error) {
      console.error(`Erro gráfico detalhado ${sensorKey}:`, error);
      showErrorAlert(`Erro buscar dados gráfico ${sensorLabel}.`);
      if (graficoDetalhado) graficoDetalhado.destroy();
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
  logoutButton.addEventListener("click", logout);
  seletorSistemasEl.addEventListener("change", (event) => {
    carregarDashboardParaSistema(event.target.value);
  });
  btnAdicionarPrimeiroSistema.addEventListener("click", () => {
    formAdicionarSistema.reset();
    modalSistema.show();
  });
  btnAbrirModalSistema.addEventListener("click", () => {
    formAdicionarSistema.reset();
    modalSistema.show();
  });

  // Botões Ligar/Desligar
  document
    .getElementById("ligarBombaBtn")
    ?.addEventListener("click", async () => {
      if (!sistemaIdAtivo) return;
      try {
        await postData(`/api/sistemas/${sistemaIdAtivo}/comando`, {
          comando: "LIGAR",
        });
        statusBombaEl.textContent = "Ligando...";
        cardStatusBombaEl.classList.remove("status-desligada");
        cardStatusBombaEl.classList.add("status-ligada");
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
      if (!sistemaIdAtivo) return;
      try {
        await postData(`/api/sistemas/${sistemaIdAtivo}/comando`, {
          comando: "DESLIGAR",
        });
        statusBombaEl.textContent = "Desligando...";
        cardStatusBombaEl.classList.add("status-desligada");
        cardStatusBombaEl.classList.remove("status-ligada");
        setTimeout(() => {
          carregarDadosAtuais(sistemaIdAtivo);
          carregarHistoricoEventos(sistemaIdAtivo);
        }, 2000);
      } catch (error) {
        console.error("Erro desligar bomba:", error);
      }
    });

  // Botão Excluir Sistema
  btnExcluirSistema?.addEventListener("click", async () => {
    if (!sistemaIdAtivo) return;
    const sistemaAtual = listaDeSistemas.find((s) => s.id == sistemaIdAtivo);
    if (!sistemaAtual) return;
    if (
      confirm(
        `Excluir "${sistemaAtual.nome_sistema}"?\nTODOS os dados serão perdidos.`
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

  // Botão Editar Sistema
  btnEditarSistema?.addEventListener("click", async () => {
    if (!sistemaIdAtivo) return;
    try {
      const sistema = await fetchData(`/api/sistemas/${sistemaIdAtivo}`);
      if (!sistema) return;
      document.getElementById("edit_sistema_id").value = sistema.id;
      document.getElementById("edit_nome_sistema").value = sistema.nome_sistema;
      document.getElementById("edit_channel_id").value =
        sistema.thingspeak_channel_id;
      document.getElementById("edit_read_api_key").value =
        sistema.thingspeak_read_apikey;
      await carregarCulturasParaModal(selectCulturaNoModalEditar);
      selectCulturaNoModalEditar.value = sistema.cultura_id_atual || "";
      dataPlantioNoModalEditar.value = sistema.data_plantio
        ? sistema.data_plantio.split("T")[0]
        : "";
      // Adicionar preenchimento da latitude se o campo existir no modal
      // document.getElementById("edit_latitude").value = sistema.latitude || '';
      modalEditar.show();
    } catch (error) {
      console.error("Erro carregar para edição:", error);
      showErrorAlert("Erro ao carregar dados para edição.");
    }
  });

  // Form Adicionar Sistema
  formAdicionarSistema?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = {
      nome_sistema: document.getElementById("nome_sistema").value,
      thingspeak_channel_id: document.getElementById("channel_id").value,
      thingspeak_read_apikey: document.getElementById("read_api_key").value,
    };
    try {
      await postData("/api/sistemas", body);
      showSuccessAlert("Sistema cadastrado!");
      formAdicionarSistema.reset();
      modalSistema.hide();
      inicializarDashboard();
    } catch (error) {
      console.error("Erro cadastrar sistema:", error);
    }
  });

  // Form Editar Sistema
  formEditarSistema?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = document.getElementById("edit_sistema_id").value;
    const body = {
      nome_sistema: document.getElementById("edit_nome_sistema").value,
      thingspeak_channel_id: document.getElementById("edit_channel_id").value,
      thingspeak_read_apikey:
        document.getElementById("edit_read_api_key").value,
      cultura_id_atual: selectCulturaNoModalEditar.value || null,
      data_plantio: dataPlantioNoModalEditar.value || null,
      // Adicionar leitura da latitude se o campo existir no modal
      // latitude: document.getElementById("edit_latitude")?.value || null
    };
    try {
      await putData(`/api/sistemas/${id}`, body);
      showSuccessAlert("Sistema atualizado!");
      modalEditar.hide();
      inicializarDashboard();
    } catch (error) {
      console.error("Erro atualizar sistema:", error);
    }
  });

  // Botão Abrir Mapeamento
  btnAbrirModalMapeamento?.addEventListener("click", () => {
    if (sistemaIdAtivo) {
      carregarMapeamentoDoSistema(sistemaIdAtivo);
      modalMapeamento.show();
    } else {
      showErrorAlert("Selecione um sistema.");
    }
  });

  // Form Salvar Mapeamento
  formMapeamento?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (sistemaIdAtivo) {
      salvarMapeamentoDoSistema(sistemaIdAtivo);
    }
  });

  // Listeners dos Cards Sensores
  document.querySelectorAll(".card-sensor").forEach((card) => {
    const colunaCard = card.closest(".col-lg.col-md-6") || card; // Pega a coluna
    if (!colunaCard.classList.contains("d-none")) {
      // Aplica apenas se visível inicialmente
      colunaCard.style.cursor = "pointer"; // Adiciona cursor
      colunaCard.addEventListener("click", () => {
        // Pega dados do elemento com .card-sensor (pode ser a própria coluna ou filho)
        const cardSensorElement =
          colunaCard.querySelector(".card-sensor") || colunaCard;
        const sensorKey = cardSensorElement.dataset.sensor;
        const sensorLabel = cardSensorElement.dataset.label;
        // Abre modal apenas se o card estiver visível no momento do clique
        if (
          sensorKey &&
          sensorLabel &&
          !colunaCard.classList.contains("d-none")
        ) {
          abrirModalGraficoDetalhado(sensorKey, sensorLabel);
        } else {
          console.warn("Card clicado sem dados ou oculto:", colunaCard);
        }
      });
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
  inicializarDashboard();
  setInterval(() => {
    if (sistemaIdAtivo) {
      carregarDadosAtuais(sistemaIdAtivo);
    }
  }, 30000); // Atualiza a cada 30 segundos
});
