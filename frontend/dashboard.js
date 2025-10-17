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
  // (Seletores existentes...)
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
  // const selectCulturaNoModal = document.getElementById("cultura_sistema"); // Removido do modal de adicionar
  const modalEditarSistemaEl = document.getElementById("modalEditarSistema");
  const formEditarSistema = document.getElementById("formEditarSistema");
  const modalEditar = new bootstrap.Modal(modalEditarSistemaEl);
  const selectCulturaNoModalEditar = document.getElementById(
    "edit_cultura_sistema"
  ); // Para o modal de editar
  const dataPlantioNoModalEditar = document.getElementById("edit_data_plantio"); // Para o modal de editar

  // ELEMENTOS DE SELEÇÃO DE CULTURA (Removidos do Card Principal)
  // const formSelecionarCultura = document.getElementById("formSelecionarCultura");
  // const selectCultura = document.getElementById("select_cultura");

  // *** NOVOS SELETORES PARA MAPEAMENTO ***
  const btnAbrirModalMapeamento = document.getElementById(
    "btnAbrirModalMapeamento"
  );
  const modalMapeamentoEl = document.getElementById("modalMapeamento"); // Adicione este ID ao seu modal HTML
  const formMapeamento = document.getElementById("formMapeamento"); // Adicione este ID ao form no modal de mapeamento
  const modalMapeamento = new bootstrap.Modal(modalMapeamentoEl);

  // --- 3. FUNÇÕES AUXILIARES DE API ---
  // (Funções fetchData, postData, putData, deleteData existentes - sem alterações)
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
      // Se a resposta for 204 No Content, retorna null pois não há corpo
      if (response.status === 204) {
        return null;
      }
      return response.json();
    } catch (error) {
      console.error(`Erro em fetchData para ${endpoint}:`, error);
      showErrorAlert(`Erro ao buscar dados: ${error.message}`);
      return null; // Retorna null para indicar falha
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
      // Se a resposta for 204 No Content ou outras sem corpo JSON
      if (
        response.status === 204 ||
        response.headers.get("content-length") === "0"
      ) {
        return { message: "Operação realizada com sucesso (sem conteúdo)" }; // Retorna um objeto padrão
      }
      return response.json();
    } catch (error) {
      console.error(`Erro em ${method} para ${endpoint}:`, error);
      showErrorAlert(`Erro ao enviar dados: ${error.message}`);
      throw error; // Re-lança o erro para quem chamou tratar (ex: no submit do form)
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

  // Função para mostrar alertas de erro (substitua por sua implementação preferida, ex: toast)
  function showErrorAlert(message) {
    alert(message); // Simples alert, pode ser melhorado
  }
  // Função para mostrar alertas de sucesso
  function showSuccessAlert(message) {
    alert(message); // Simples alert, pode ser melhorado
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
        // Tenta pegar o último sistema usado do localStorage, senão usa o primeiro
        const ultimoSistemaId = localStorage.getItem("ultimoSistemaId");
        sistemaIdAtivo =
          ultimoSistemaId &&
          listaDeSistemas.some((s) => s.id == ultimoSistemaId)
            ? ultimoSistemaId
            : listaDeSistemas[0].id;
        seletorSistemasEl.value = sistemaIdAtivo;
        localStorage.setItem("ultimoSistemaId", sistemaIdAtivo); // Guarda o sistema ativo
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
      showErrorAlert(
        "Erro crítico ao carregar o dashboard. Tente recarregar a página."
      );
    }
  }

  function popularSeletorDeSistemas() {
    seletorSistemasEl.innerHTML = ""; // Limpa opções antigas
    listaDeSistemas.forEach((sistema) => {
      const option = document.createElement("option");
      option.value = sistema.id;
      option.textContent = sistema.nome_sistema;
      seletorSistemasEl.appendChild(option);
    });
  }

  function carregarDashboardParaSistema(sistemaId) {
    if (!sistemaId) {
      console.warn("Tentativa de carregar dashboard sem ID de sistema.");
      return;
    }
    sistemaIdAtivo = sistemaId; // Atualiza a variável global
    localStorage.setItem("ultimoSistemaId", sistemaIdAtivo); // Guarda o ID no localStorage

    const sistemaAtivo = listaDeSistemas.find((s) => s.id == sistemaId);
    if (sistemaAtivo) {
      nomeSistemaAtivoDisplayEl.textContent = `Exibindo dados para: ${sistemaAtivo.nome_sistema}`;
    } else {
      nomeSistemaAtivoDisplayEl.textContent = "Sistema não encontrado.";
      // Limpar os dados do dashboard se o sistema não for encontrado
      valorUmidadeSoloEl.textContent = "-- %";
      valorTemperaturaArEl.textContent = "-- °C";
      valorUmidadeArEl.textContent = "-- %";
      valorETEl.textContent = "--";
      statusBombaEl.textContent = "Indisponível";
      cardStatusBombaEl.classList.remove("status-ligada", "status-desligada");
      tabelaEventosEl.innerHTML = "";
      if (graficoHistorico) graficoHistorico.destroy();
      return; // Não prossegue se não encontrou o sistema
    }

    // Carrega os dados
    carregarDadosAtuais(sistemaId);
    desenharGraficoHistorico(sistemaId);
    carregarHistoricoEventos(sistemaId);
    // Não precisamos mais carregar culturas aqui, isso é feito no modal de edição
  }

  // --- 5. FUNÇÕES DE CARREGAMENTO DE DADOS ---
  async function carregarDadosAtuais(sistemaId) {
    if (!sistemaId) return;

    // Seleciona as colunas dos cards
    const colUmidadeSolo = document.getElementById("colUmidadeSolo");
    const colTemperaturaAr = document.getElementById("colTemperaturaAr");
    const colET = document.getElementById("colET");
    const colUmidadeAr = document.getElementById("colUmidadeAr");
    const colStatusBomba = document.getElementById("colStatusBomba"); // Geralmente sempre visível

    try {
      const dados = await fetchData(`/api/sistemas/${sistemaId}/dados-atuais`);

      // Função auxiliar para mostrar/ocultar coluna e atualizar valor
      function atualizarCard(
        colElement,
        dataKey,
        valorElement,
        unidadePadrao = "",
        casasDecimais = 1
      ) {
        const dado = dados ? dados[dataKey] : undefined; // Pega o dado específico
        if (dado?.valor !== undefined && dado?.valor !== null) {
          // Tem dado válido: mostra a coluna e atualiza o valor
          colElement.classList.remove("d-none");
          valorElement.textContent = `${parseFloat(dado.valor).toFixed(
            casasDecimais
          )} ${dado.unidade || unidadePadrao}`;
          return true; // Indica que o card está visível
        } else {
          // Não tem dado válido: oculta a coluna e mostra '--'
          colElement.classList.add("d-none");
          valorElement.textContent = `-- ${unidadePadrao}`;
          return false; // Indica que o card está oculto
        }
      }

      if (!dados) {
        // Se a API falhou completamente, oculta todos os cards de sensores
        colUmidadeSolo.classList.add("d-none");
        colTemperaturaAr.classList.add("d-none");
        colET.classList.add("d-none");
        colUmidadeAr.classList.add("d-none");
        // Mantém o status da bomba visível, mas com erro
        valorUmidadeSoloEl.textContent = "Erro";
        valorTemperaturaArEl.textContent = "Erro";
        valorETEl.textContent = "Erro";
        valorUmidadeArEl.textContent = "Erro";
        statusBombaEl.textContent = "Erro";
        cardStatusBombaEl.classList.remove("status-ligada", "status-desligada");
        return;
      }

      // Atualiza cada card individualmente
      atualizarCard(colUmidadeSolo, "umidadeDoSolo", valorUmidadeSoloEl, "%");
      atualizarCard(
        colTemperaturaAr,
        "temperaturaDoAr",
        valorTemperaturaArEl,
        "°C"
      );
      atualizarCard(colET, "evapotranspiracao", valorETEl, "", 2); // 2 casas decimais para ET
      atualizarCard(colUmidadeAr, "umidadeDoAr", valorUmidadeArEl, "%");

      // --- Status da Bomba (lógica separada, pois geralmente queremos sempre mostrá-lo) ---
      colStatusBomba.classList.remove("d-none"); // Garante que a coluna da bomba esteja visível
      cardStatusBombaEl.classList.remove("status-ligada", "status-desligada");
      if (dados.statusBomba === "LIGAR") {
        statusBombaEl.textContent = "Ligada";
        cardStatusBombaEl.classList.add("status-ligada");
      } else if (dados.statusBomba === "DESLIGAR") {
        statusBombaEl.textContent = "Desligada";
        cardStatusBombaEl.classList.add("status-desligada");
      } else {
        statusBombaEl.textContent = "--"; // Caso não venha LIGAR ou DESLIGAR
      }
    } catch (error) {
      console.error("Erro ao carregar dados atuais:", error);
      // Em caso de erro na requisição, oculta e mostra mensagem de erro
      colUmidadeSolo.classList.add("d-none");
      colTemperaturaAr.classList.add("d-none");
      colET.classList.add("d-none");
      colUmidadeAr.classList.add("d-none");
      valorUmidadeSoloEl.textContent = "Erro";
      valorTemperaturaArEl.textContent = "Erro";
      valorETEl.textContent = "Erro";
      valorUmidadeArEl.textContent = "Erro";
      statusBombaEl.textContent = "Erro";
      cardStatusBombaEl.classList.remove("status-ligada", "status-desligada");
    }
  }

  async function desenharGraficoHistorico(sistemaId) {
    if (!sistemaId) return;
    try {
      const dados = await fetchData(
        `/api/sistemas/${sistemaId}/dados-historicos`
      );
      if (!dados || dados.length === 0) {
        if (graficoHistorico) graficoHistorico.destroy();
        return;
      }

      // Configurações iniciais do gráfico
      const graficoOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            // Define a escala X (tempo)
            type: "time",
            time: {
              tooltipFormat: "HH:mm",
              displayFormats: {
                hour: "HH:mm",
                minute: "HH:mm",
              },
            },
            title: { display: true, text: "Hora" },
          },
        },
      };

      // Cria labels a partir do timestamp (formata como hora:minuto)
      const labels = dados.map((d) => {
        const ts = d.timestamp || d.time || d.created_at;
        const dt = ts ? new Date(ts) : null;
        return dt
          ? dt.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          : "";
      });

      const datasets = [];
      const cores = [
        "#3e95cd",
        "#8e5ea2",
        "#3cba9f",
        "#e8c3b9",
        "#c45850",
        "#ff6384",
        "#36a2eb",
        "#ffcd56",
      ];
      let corIndex = 0;
      let yAxisCount = 0;

      // Determina as chaves de dados (remove timestamp/time)
      const chavesDeDados =
        dados.length > 0
          ? Object.keys(dados[0]).filter(
              (k) => k !== "timestamp" && k !== "time" && k !== "created_at"
            )
          : [];

      chavesDeDados.forEach((chave) => {
        // Extrai valores numéricos por ponto no tempo
        const valores = dados.map((item) => {
          const val = item[chave];
          if (val === undefined || val === null) return null;
          if (typeof val === "object" && val.valor !== undefined)
            return Number(val.valor);
          return Number(val);
        });

        // Tenta determinar a unidade a partir do primeiro item que contenha objeto com unidade
        let unidade = "";
        for (let i = 0; i < dados.length; i++) {
          const v = dados[i][chave];
          if (v !== undefined && v !== null) {
            if (typeof v === "object" && v.unidade) {
              unidade = v.unidade;
              break;
            }
          }
        }

        const yAxisID = `y${yAxisCount}`;
        const color = cores[corIndex % cores.length];
        const position = yAxisCount % 2 === 0 ? "left" : "right";

        // Adiciona configuração da escala Y específica para este dataset
        graficoOptions.scales[yAxisID] = {
          type: "linear",
          display: true,
          position: position,
          title: { display: !!unidade, text: unidade || chave },
          grid: { drawOnChartArea: yAxisCount === 0 },
        };

        datasets.push({
          label: unidade ? `${chave} (${unidade})` : chave,
          data: valores,
          borderColor: color,
          backgroundColor: color,
          fill: false,
          tension: 0.2,
          yAxisID: yAxisID,
          spanGaps: true,
          pointRadius: 2,
        });

        corIndex++;
        yAxisCount++;
      });

      if (graficoHistorico) {
        graficoHistorico.destroy();
      }

      graficoHistorico = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: datasets,
        },
        options: graficoOptions,
      });
    } catch (error) {
      console.error("Erro ao desenhar gráfico:", error);
      if (graficoHistorico) graficoHistorico.destroy();
    }
  }

  // carregarHistoricoEventos (sem alterações)
  async function carregarHistoricoEventos(sistemaId) {
    if (!sistemaId) return;
    try {
      const eventos = await fetchData(`/api/sistemas/${sistemaId}/eventos`);
      if (!eventos) {
        tabelaEventosEl.innerHTML =
          '<tr><td colspan="3">Não foi possível carregar os eventos.</td></tr>';
        return;
      }
      tabelaEventosEl.innerHTML = ""; // Limpa tabela
      if (eventos.length === 0) {
        tabelaEventosEl.innerHTML =
          '<tr><td colspan="3">Nenhum evento registrado.</td></tr>';
        return;
      }
      eventos.slice(0, 10).forEach((evento) => {
        // Limita aos últimos 10
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${new Date(evento.timestamp).toLocaleString(
          "pt-BR"
        )}</td><td>${evento.acao || "N/A"}</td><td>${
          evento.motivo || "N/A"
        }</td>`;
        tabelaEventosEl.appendChild(tr);
      });
    } catch (error) {
      console.error("Erro ao carregar eventos:", error);
      tabelaEventosEl.innerHTML =
        '<tr><td colspan="3">Erro ao carregar eventos.</td></tr>';
    }
  }

  // carregarCulturas agora é usado apenas nos modais
  async function carregarCulturasParaModal(selectElement) {
    try {
      const culturas = await fetchData("/api/culturas");
      if (!culturas) return;
      // Guarda o valor selecionado antes de limpar
      const valorSelecionadoAnteriormente = selectElement.value;
      selectElement.innerHTML = `<option value="">-- Sem Cultura --</option>`; // Opção padrão
      culturas.forEach((cultura) => {
        const option = document.createElement("option");
        option.value = cultura.id;
        option.textContent = cultura.nome;
        selectElement.appendChild(option);
      });
      // Restaura a seleção se possível
      if (valorSelecionadoAnteriormente) {
        selectElement.value = valorSelecionadoAnteriormente;
      }
    } catch (error) {
      console.error("Erro ao carregar culturas para o modal:", error);
    }
  }

  // *** NOVA FUNÇÃO PARA CARREGAR MAPEAMENTO ***
  async function carregarMapeamentoDoSistema(sistemaId) {
    if (!sistemaId) return;
    try {
      const mapeamentos = await fetchData(
        `/api/sistemas/${sistemaId}/mapeamento`
      );
      // Limpa o formulário antes de preencher
      formMapeamento.reset();

      if (mapeamentos) {
        mapeamentos.forEach((map) => {
          const fieldNum = map.field_number;
          const tipoInput = document.getElementById(`map_tipo_${fieldNum}`);
          const unidadeInput = document.getElementById(
            `map_unidade_${fieldNum}`
          );
          if (tipoInput) {
            tipoInput.value = map.tipo_leitura || "";
          }
          if (unidadeInput) {
            unidadeInput.value = map.unidade || "";
          }
        });
      }
    } catch (error) {
      console.error("Erro ao carregar mapeamento:", error);
      showErrorAlert("Erro ao carregar configurações de mapeamento.");
    }
  }

  // *** NOVA FUNÇÃO PARA SALVAR MAPEAMENTO ***
  async function salvarMapeamentoDoSistema(sistemaId) {
    if (!sistemaId) return;

    const mapeamentosParaSalvar = [];
    for (let i = 1; i <= 8; i++) {
      const tipoInput = document.getElementById(`map_tipo_${i}`);
      const unidadeInput = document.getElementById(`map_unidade_${i}`);
      const tipo = tipoInput ? tipoInput.value.trim() : "";
      const unidade = unidadeInput ? unidadeInput.value.trim() : "";

      // Só adiciona se tiver um tipo definido (não vazio e não "Nenhum")
      if (tipo && tipo.toLowerCase() !== "nenhum") {
        mapeamentosParaSalvar.push({
          field_number: i,
          tipo_leitura: tipo,
          unidade: unidade || null, // Envia null se unidade estiver vazia
        });
      }
    }

    try {
      // A API espera um objeto { mapeamentos: [...] }
      await putData(`/api/sistemas/${sistemaId}/mapeamento`, {
        mapeamentos: mapeamentosParaSalvar,
      });
      showSuccessAlert("Mapeamento salvo com sucesso!");
      modalMapeamento.hide();
      // Recarrega os dados atuais para refletir possíveis mudanças de nome/unidade
      carregarDadosAtuais(sistemaId);
      // Recarrega o gráfico histórico
      desenharGraficoHistorico(sistemaId);
    } catch (error) {
      console.error("Erro ao salvar mapeamento:", error);
      // O erro já deve ter sido mostrado pelo putData
      // showErrorAlert("Erro ao salvar mapeamento.");
    }
  }

  function logout() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("ultimoSistemaId"); // Limpa também o último sistema
    window.location.href = "login.html";
  }

  // --- 6. EVENT LISTENERS ---
  logoutButton.addEventListener("click", logout);

  seletorSistemasEl.addEventListener("change", (event) => {
    carregarDashboardParaSistema(event.target.value);
  });

  btnAdicionarPrimeiroSistema.addEventListener("click", () => {
    formAdicionarSistema.reset(); // Limpa o formulário
    // Não carrega culturas aqui, pois foi removido
    modalSistema.show();
  });

  btnAbrirModalSistema.addEventListener("click", () => {
    formAdicionarSistema.reset(); // Limpa o formulário
    // Não carrega culturas aqui
    modalSistema.show();
  });

  document
    .getElementById("ligarBombaBtn")
    .addEventListener("click", async () => {
      if (sistemaIdAtivo) {
        try {
          await postData(`/api/sistemas/${sistemaIdAtivo}/comando`, {
            comando: "LIGAR",
          });
          // Atualiza o status visualmente imediatamente (feedback otimista)
          statusBombaEl.textContent = "Ligando..."; // Ou "Ligada"
          cardStatusBombaEl.classList.remove("status-desligada");
          cardStatusBombaEl.classList.add("status-ligada");
          // Recarrega dados após um pequeno atraso para confirmar
          setTimeout(() => carregarDadosAtuais(sistemaIdAtivo), 2000);
          setTimeout(() => carregarHistoricoEventos(sistemaIdAtivo), 2000); // Recarrega eventos
        } catch (error) {
          console.error("Erro ao ligar bomba:", error);
          // Reverte se der erro (opcional, pois o refresh pode corrigir)
        }
      }
    });

  document
    .getElementById("desligarBombaBtn")
    .addEventListener("click", async () => {
      if (sistemaIdAtivo) {
        try {
          await postData(`/api/sistemas/${sistemaIdAtivo}/comando`, {
            comando: "DESLIGAR",
          });
          statusBombaEl.textContent = "Desligando..."; // Ou "Desligada"
          cardStatusBombaEl.classList.add("status-desligada");
          cardStatusBombaEl.classList.remove("status-ligada");
          setTimeout(() => carregarDadosAtuais(sistemaIdAtivo), 2000);
          setTimeout(() => carregarHistoricoEventos(sistemaIdAtivo), 2000);
        } catch (error) {
          console.error("Erro ao desligar bomba:", error);
        }
      }
    });

  btnExcluirSistema.addEventListener("click", async () => {
    if (!sistemaIdAtivo) return;
    const sistemaAtual = listaDeSistemas.find((s) => s.id == sistemaIdAtivo);
    if (!sistemaAtual) return; // Segurança extra

    if (
      confirm(
        `Tem certeza que deseja excluir o sistema "${sistemaAtual.nome_sistema}"?\nTODOS os dados associados (leituras, eventos, mapeamentos) serão perdidos.`
      )
    ) {
      try {
        await deleteData(`/api/sistemas/${sistemaIdAtivo}`);
        showSuccessAlert("Sistema excluído com sucesso!");
        localStorage.removeItem("ultimoSistemaId"); // Remove o ID do sistema excluído
        inicializarDashboard(); // Recarrega a lista e o dashboard
      } catch (error) {
        console.error("Erro ao excluir sistema:", error);
        // O erro já deve ter sido mostrado pelo deleteData
      }
    }
  });

  btnEditarSistema.addEventListener("click", async () => {
    if (!sistemaIdAtivo) return;
    try {
      // Busca os dados MAIS RECENTES do sistema, incluindo cultura_id_atual e data_plantio
      const sistema = await fetchData(`/api/sistemas/${sistemaIdAtivo}`);
      if (!sistema) return; // Erro já tratado em fetchData

      // Preenche o formulário de edição
      document.getElementById("edit_sistema_id").value = sistema.id;
      document.getElementById("edit_nome_sistema").value = sistema.nome_sistema;
      document.getElementById("edit_channel_id").value =
        sistema.thingspeak_channel_id;
      document.getElementById("edit_read_api_key").value =
        sistema.thingspeak_read_apikey;

      // Carrega as culturas no select do modal ANTES de tentar selecionar
      await carregarCulturasParaModal(selectCulturaNoModalEditar);

      // Define a cultura atual e data de plantio
      selectCulturaNoModalEditar.value = sistema.cultura_id_atual || ""; // Define como "" se for null
      dataPlantioNoModalEditar.value = sistema.data_plantio
        ? sistema.data_plantio.split("T")[0]
        : ""; // Formata YYYY-MM-DD

      modalEditar.show();
    } catch (error) {
      console.error("Erro ao carregar dados para edição:", error);
      showErrorAlert("Erro ao carregar dados para edição.");
    }
  });

  formAdicionarSistema.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = {
      nome_sistema: document.getElementById("nome_sistema").value,
      thingspeak_channel_id: document.getElementById("channel_id").value,
      thingspeak_read_apikey: document.getElementById("read_api_key").value,
      // Cultura e data de plantio são definidos/editados separadamente agora
    };
    try {
      await postData("/api/sistemas", body);
      showSuccessAlert("Sistema cadastrado com sucesso!");
      formAdicionarSistema.reset();
      modalSistema.hide();
      inicializarDashboard(); // Recarrega tudo
    } catch (error) {
      console.error("Erro ao cadastrar sistema:", error);
      // Erro já mostrado pelo postData
    }
  });

  formEditarSistema.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = document.getElementById("edit_sistema_id").value;
    const body = {
      nome_sistema: document.getElementById("edit_nome_sistema").value,
      thingspeak_channel_id: document.getElementById("edit_channel_id").value,
      thingspeak_read_apikey:
        document.getElementById("edit_read_api_key").value,
      cultura_id_atual: selectCulturaNoModalEditar.value || null, // Envia null se "Sem Cultura"
      data_plantio: dataPlantioNoModalEditar.value || null, // Envia null se vazio
    };
    try {
      await putData(`/api/sistemas/${id}`, body);
      showSuccessAlert("Sistema atualizado com sucesso!");
      modalEditar.hide();
      inicializarDashboard(); // Recarrega lista e dados do dashboard
    } catch (error) {
      console.error("Erro ao atualizar sistema:", error);
      // Erro já mostrado pelo putData
    }
  });

  // *** EVENT LISTENER PARA ABRIR MODAL DE MAPEAMENTO ***
  btnAbrirModalMapeamento.addEventListener("click", () => {
    if (sistemaIdAtivo) {
      carregarMapeamentoDoSistema(sistemaIdAtivo); // Carrega dados ANTES de mostrar
      modalMapeamento.show();
    } else {
      showErrorAlert("Selecione um sistema primeiro.");
    }
  });

  // *** EVENT LISTENER PARA SALVAR MAPEAMENTO ***
  formMapeamento.addEventListener("submit", (event) => {
    event.preventDefault();
    if (sistemaIdAtivo) {
      salvarMapeamentoDoSistema(sistemaIdAtivo);
    }
  });

  // Listener para SUBMIT de CULTURA foi REMOVIDO (agora é junto com Editar Sistema)
  // formSelecionarCultura.addEventListener("submit", ... );

  // --- 7. INICIALIZAÇÃO E ATUALIZAÇÃO AUTOMÁTICA ---
  inicializarDashboard();

  // Atualiza dados a cada 30 segundos (aumentei o intervalo)
  setInterval(() => {
    if (sistemaIdAtivo) {
      carregarDadosAtuais(sistemaIdAtivo);
      // Atualizar eventos e gráfico com menos frequência, se desejado
      // carregarHistoricoEventos(sistemaIdAtivo);
      // desenharGraficoHistorico(sistemaIdAtivo); // Cuidado: redesenhar gráfico frequentemente pode ser pesado
    }
  }, 30000); // 30 segundos
});
