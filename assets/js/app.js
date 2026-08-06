(function () {

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 1 — STATE (Memória de sessão)
  // Arrays que guardam os registros feitos durante a sessão atual.
  // São perdidos ao recarregar a página.
  // produções[]: cada item = um apontamento de produção confirmado
  // paradas[]  : cada item = uma parada confirmada
  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 0.5 — CONFIGURAÇÃO DE INTEGRAÇÃO (POST)
  // Defina aqui as URLs que receberão os dados via POST.
  // ══════════════════════════════════════════════════════════════════
  const API_CONFIG = {
    URL_PRODUCAO: 'https://interno.progeral.com.br/Apps-testes/api/proxy.php?tipo=producao',
    URL_PARADA: 'https://interno.progeral.com.br/Apps-testes/api/proxy.php?tipo=parada',
    HEADERS: {
      'Content-Type': 'application/json'
    }
  };

  // Funções de validação e regras de negócio de produtos
  window.isProdutoZink = function (prod) {
    if (!prod) return false;
    const p = prod.trim().toUpperCase();
    return window.ZINK_DATA && window.ZINK_DATA.hasOwnProperty(p);
  };

  window.isProdutoIsento = function (prod) {
    if (!prod) return false;
    const p = prod.trim().toUpperCase();
    const isentos = ['ISENTO', 'TESTE', 'AMOSTRA'];
    return isentos.includes(p);
  };

  const state = {
    // Campos de cada produção: { matricula, op, produto, desc, recursoCod... }
    produções: [],
    // Campos de cada parada: { matricula, motCod, motDesc, op, produto... }
    paradas: []
  };

  // Set de submissões em andamento (idempotência no cliente)
  const pendingSubmissions = new Set();

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  }

  function getSubmissionKey(type, record) {
    const keyPayload = type === 'producao'
      ? { matricula: record.matricula, op: record.op, produto: record.produto, recursoCod: record.recursoCod, dIni: record.dIni, hIni: record.hIni, dFim: record.dFim, hFim: record.hFim, qtd: record.qtd, ret: record.ret, setup: record.setup, rnc: record.rnc, cestos: record.cestos, shiftKey: record.shiftKey }
      : { matricula: record.matricula, motCod: record.motCod, op: record.op, produto: record.produto, recursoCod: record.recursoCod, dIni: record.dIni, hIni: record.hIni, dFim: record.dFim, hFim: record.hFim, shiftKey: record.shiftKey };

    return type + '|' + stableStringify(keyPayload);
  }

  /**
   * Função auxiliar para ajustar a data com as setas para não ter que abrir o calendário  
   */
  window.adjustDateByDays = function (inputId, days) {
    const input = document.getElementById(inputId);
    if (!input) return;

    let dateToUse = new Date();
    if (input.value && input.value.trim().length === 10) {
      const parts = input.value.split('/');
      if (parts.length === 3) {
        const parsed = new Date(parts[2], parts[1] - 1, parts[0]);
        if (!isNaN(parsed.getTime())) {
          dateToUse = parsed;
        }
      }
    }

    dateToUse.setDate(dateToUse.getDate() + days);
    const d = String(dateToUse.getDate()).padStart(2, '0');
    const m = String(dateToUse.getMonth() + 1).padStart(2, '0');
    const y = dateToUse.getFullYear();

    input.value = `${d}/${m}/${y}`;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.classList.add('user-interacted');
    validateLive(inputId.startsWith('p-'));
  };

  /**
   * Função auxiliar para converter DD/MM/YYYY para YYYYMMDD
   */
  function aux_formatDate(dStr) {
    if (!dStr || dStr.trim() === "") return null;
    const clean = dStr.trim();
    const parts = clean.split('/');
    if (parts.length !== 3) return clean;
    return parts[2] + parts[1] + parts[0];
  }

  /**
   * Função para enviar os dados para a API via POST
   * @param {Object} rawData - Objeto contendo os dados originais do state
   * @param {String} type - 'producao' ou 'parada'
   */
  async function enviarParaAPI(rawData, type) {
    // Bloqueio de segurança do navegador: Mixed Content
    // Se a página estiver em HTTPS e a API em HTTP, o navegador vai bloquear o fetch.

    const url = type === 'producao' ? API_CONFIG.URL_PRODUCAO : API_CONFIG.URL_PARADA;

    // Recuperar o Usuário Protheus baseado na matrícula
    // O usuário solicitou que no JSON seja enviado o usuarioProtheus no campo 'operador'
    const userObj = window.COLABORADORES[rawData.matricula.trim()];
    const usuarioProtheus = userObj ? userObj.usuarioProtheus : rawData.matricula;

    // Formatar dados conforme solicitado pelo usuário
    let dataToPost = {};
    if (type === 'producao') {
      dataToPost = {
        "operador": usuarioProtheus,
        "ordem": rawData.op,
        "turno": String(rawData.shiftKey).replace('121', 'D1').replace('122', 'D2'),
        "produto": rawData.produto,
        "recurso": rawData.recursoCod,
        "data_inicial": aux_formatDate(rawData.dIni),
        "hora_inicial": rawData.hIni,
        "data_final": aux_formatDate(rawData.dFim),
        "hora_final": rawData.hFim,
        "qtd_produzida": rawData.qtd,
        "qtd_perda": rawData.rnc,
        "qtd_setup": rawData.setup,
        "qtd_cestos": rawData.cestos,
        "qtd_retrabalho": rawData.ret
      };
    } else {
      dataToPost = {
        "recurso": rawData.recursoCod,
        "produto": rawData.produto,
        "datainicio": aux_formatDate(rawData.dIni),
        "datafinal": aux_formatDate(rawData.dFim || rawData.dIni), // Fallback para data inicial se final não existir
        "horainicio": rawData.hIni,
        "horafinal": rawData.hFim,
        "operador": usuarioProtheus,
        "motivo": rawData.motCod,
        "turno": String(rawData.shiftKey).replace('121', 'D1').replace('122', 'D2')
      };
    }

    // ─── TRAVA DE SEGURANÇA: VALIDAÇÃO FINAL DO PAYLOAD ──────
    // Impede que dados em branco cheguem à API por instabilidade no estado do DOM
    const mandatory = (type === 'producao')
      ? ['operador', 'produto', 'recurso', 'data_inicial', 'hora_inicial', 'data_final', 'hora_final']
      : ['recurso', 'produto', 'datainicio', 'datafinal', 'horainicio', 'horafinal', 'operador', 'motivo'];

    const missing = mandatory.filter(f => !dataToPost[f] || dataToPost[f] === "");
    if (missing.length > 0) {
      console.error('[CRITICAL] Tentativa de envio com campos vazios:', missing);
      return {
        success: false,
        error: `Erro de Integridade: Os campos [${missing.join(', ')}] não foram preenchidos corretamente.`,
        errorType: 'sistema'
      };
    }

    // Logando no console para depuração antes do envio real
    console.group(`[API DEBUG] Enviando ${type.toUpperCase()}`);
    console.log(`URL: ${url}`);
    console.log(`PAYLOAD:`, dataToPost);
    console.groupEnd();

    // Sistema tenta enviar +1 vez automaticamente em caso de falha (total = 2 tentativas)
    let retries = 2;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Aumentamos o timeout para 15 segundos para dar mais margem em conexões lentas
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, {
          method: 'POST',
          mode: 'cors',
          cache: 'no-cache',
          headers: API_CONFIG.HEADERS,
          body: JSON.stringify(dataToPost),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        let responseText = '';
        try {
          responseText = await response.text();
        } catch (e) {
          responseText = '(O servidor não permitiu a leitura do corpo da resposta)';
        }

        if (!response.ok) {
          if (response.status >= 500 && attempt < retries) {
            console.warn(`[API WARNING] Falha (Status ${response.status}). Tentativa ${attempt} de ${retries}...`);
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }

          let errorMsg = 'Erro no servidor';
          let technical = '';
          let errorType = 'sistema';

          try {
            const json = JSON.parse(responseText);
            // O Protheus pode retornar o erro direto na raiz do JSON ou dentro de uma propriedade "erro"
            const erroObj = json.erro ? json.erro : json;

            if (erroObj.codigo === "02" && erroObj.problema) {
              errorType = 'saldo';
              errorMsg = erroObj.resultado || 'Falta de saldo no estoque';

              // Limpeza do texto gigante do Protheus, mantendo apenas as linhas com o produto afetado
              let linhasComErro = erroObj.problema
                .split('\n')
                .map(line => line.trim())
                .filter(line => {
                  if (!line) return false;
                  // Ignora as linhas de cabeçalho do Protheus e pega só os dados
                  if (line.startsWith('AJUDA:')) return false;
                  if (line.includes('Não existe quantidade suficiente')) return false;
                  if (line.includes('Itens Sem Sld')) return false;
                  if (line.startsWith('Produto Armazem Saldo')) return false;
                  return true; // As linhas que sobrarem serão as linhas dos produtos (ex: "4114120000 11 -29600.000000 Sem Saldo...")
                });

              technical = linhasComErro.join('<br>') || erroObj.problema;
            } else if (erroObj.resultado) {
              errorMsg = erroObj.resultado;
              technical = erroObj.problema || '';
            } else {
              technical = ''; // Força vazio para não mostrar JSON na tela em erros genéricos
            }
          } catch (e) {
            // Se não for JSON, não joga a resposta gigante na tela para não quebrar o layout amigável
            technical = '';
          }

          return { success: false, error: errorMsg, technical: technical, errorType: errorType, status: response.status };
        }

        console.log(`[API SUCCESS] ${type}:`, responseText);
        return { success: true, data: responseText };

      } catch (error) {
        console.error(`[API ERROR] ${type} (Tentativa ${attempt}):`, error);
        
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        let errorMsg = error.message;
        let errorType = 'sistema';

        if (error.name === 'AbortError') {
          errorMsg = 'O servidor demorou demais para responder.';
          errorType = 'timeout';
        } else if (errorMsg === 'Failed to fetch' || errorMsg.includes('NetworkError')) {
          errorMsg = 'Sem conexão com o servidor.';
          errorType = 'rede';
        }

        return { success: false, error: errorMsg, errorType: errorType };
      }
    }
  }

  /**
   * Gera o título amigável do modal de erro baseado no tipo retornado pela API.
   */
  function buildFriendlyErrorTitle(apiRes) {
    const titles = {
      saldo: 'Falta de Saldo',
      timeout: 'Servidor Lento',
      rede: 'Erro de Conexão',
      sistema: 'Erro no Registro'
    };
    return titles[apiRes.errorType] || titles.sistema;
  }

  /**
   * Gera HTML amigável para modais de erro, seguindo o design padronizado.
   * Classifica o erro por tipo e mostra instruções claras para o operador.
   */
  function buildFriendlyErrorHTML(apiRes) {
    const errorType = apiRes.errorType || 'sistema';

    const templates = {
      saldo: {
        heading: 'ESTOQUE INSUFICIENTE',
        actions: [
          'Avise seu <b>líder</b> imediatamente.',
          'Vá até o <b>setor anterior</b> ao seu.',
          'Peça o <b>apontamento do produto</b> que está faltando no sistema.'
        ]
      },
      timeout: {
        heading: 'SERVIDOR LENTO',
        actions: [
          'Aguarde <b>30 segundos</b> e tente novamente.',
          'Se persistir, avise seu <b>líder</b>.',
          'Anote os dados no <b>papel</b> para não perder o registro.'
        ]
      },
      rede: {
        heading: 'SEM CONEXÃO',
        actions: [
          'Verifique se o <b>Wi-Fi</b> está conectado.',
          'Avise seu <b>líder</b> sobre o problema de rede.',
          'Anote os dados no <b>papel</b> enquanto o sistema estiver fora.'
        ]
      },
      sistema: {
        heading: 'ERRO NO ENVIO',
        actions: [
          'Anote este erro e os dados do apontamento no <b>papel</b>.',
          'Avise a <b>liderança</b> IMEDIATAMENTE.',
          'Continue produzindo e <b>registre no papel</b>.'
        ]
      }
    };

    const tmpl = templates[errorType] || templates.sistema;
    let html = '';

    // Heading em destaque (letras garrafais)
    html += `<div class="modal-error-heading">${tmpl.heading}</div>`;

    // Box de detalhe do erro (info técnica do Protheus)
    const detail = apiRes.technical || apiRes.error || '';
    if (detail) {
      html += `<div class="error-highlight-box">${detail}</div>`;
    }

    // Guia de ação: "O QUE FAZER?"
    html += `<div class="action-guide-box">`;
    html += `<div class="action-guide-title"><i class="fas fa-exclamation-circle"></i> O QUE FAZER?</div>`;
    html += `<ul class="action-list">`;
    tmpl.actions.forEach((text, i) => {
      html += `<li><span class="action-num">${i + 1}.</span> <span>${text}</span></li>`;
    });
    html += `</ul></div>`;

    return html;
  }

  /**
   * Função de teste rápido para validar o recebimento de dados no servidor
   */
  window.testarEnvioAPI = async function () {
    showModal('aviso', 'Teste desativado', 'O envio de teste foi desativado em producao.');
  };

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 2 — DB: DADOS ESTÁTICOS
  // Tabelas de referência embutidas no código.
  // Estas NÃO dependem do arquivo db-data.js.
  // Para adicionar/remover motivos, edite o objeto motivosPadrao abaixo.
  // ══════════════════════════════════════════════════════════════════
  const motivosPadrao = {
    AM: 'AMOSTRA', FR: 'FERRAMENTAL',
    LE: 'FALTA DE EMBALAGEM', LM: 'FALTA DE MATÉRIA PRIMA',
    LP: 'FALTA DE PROGRAMAÇÃO', PL: 'LIMPEZA / ORGANIZAÇÃO',
    ME: 'MANUTENÇÃO ELÉTRICA', MM: 'MANUTENÇÃO MECÂNICA',
    MP: 'MANUTENÇÃO PREVENTIVA', IP: 'INSPEÇÃO',
    MU: 'PANE EM UTILIDADES', PD: 'MÃO DE OBRA DESLOCADA',
    PJ: 'AJUSTE DE OPERAÇÃO', PM: 'FALTA DE MÃO DE OBRA (OPERADOR)',
    PR: 'REFEIÇÃO/NECESS. PESSOAIS', PT: 'PROTÓTIPO',
    QM: 'MATÉRIA PRIMA NÃO CONFORME', QP: 'PRODUTO NÃO CONFORME',
    PC: 'PROCESSO SUBSEQUENTE CHEIO', ST: 'SET-UP',
    TO: 'TRY-OUT', TR: 'TREINAMENTO / REUNIÃO'
  };

  // Dados de fallback usados quando db-data.js NÃO está disponível.
  // Em produção, estes dados são sobrescritos pelo merge com APP_DB.
  const db = {
    colaboradores: {
      // Formato: 'MATRICULA|SENHA' : 'Nome Completo'
      '101|123': 'Samuel Inácio',
      '102|123': 'João Silva',
      '103|123': 'Maria Oliveira'
    },
    produtos: {
      // Formato: 'COD_PRODUTO' : { descricao: 'Descrição do Produto', um: 'PC' }
      'P001': { descricao: 'Abraçadeira T10 Blue', um: 'PC' },
      'P002': { descricao: 'Suporte L50 Metal', um: 'PC' },
      'P003': { descricao: 'Anel O-Ring 22mm', um: 'PC' }
    },
    recursos: {
      // Formato: 'COD_RECURSO' : 'Nome da Máquina'
      'INJ-01': 'Injetora Romi 130T',
      'INJ-02': 'Injetora Haitian 200T',
      'PRE-01': 'Prensa Hidráulica 50T'
    },
    motivos: motivosPadrao,
    ops: {
      // Formato: 'NUM_OP' : { produto: 'COD_PRODUTO', desc: 'Descrição' }
      // Populado via db-data.js gerado pelo Excel
    }
  };

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 3 — DB: MERGE COM EXCEL
  // Arquivos de dados extraídos de produtos.js, recursos.js, motivos.js, ops.js e colaboradores.js
  // Este bloco mescla os dados desses arquivos sobre os dados de fallback.
  // ══════════════════════════════════════════════════════════════════
  if (window.COLABORADORES) {
    Object.assign(db.colaboradores, window.COLABORADORES);
  }

  if (window.APP_DB) {
    if (window.APP_DB.produtos) Object.assign(db.produtos, window.APP_DB.produtos);
    if (window.APP_DB.recursos) Object.assign(db.recursos, window.APP_DB.recursos);
    if (window.APP_DB.motivos) Object.assign(db.motivos, window.APP_DB.motivos);
    if (window.APP_DB.ops) Object.assign(db.ops, window.APP_DB.ops);
  }

  // ──────────────────────────────────────────────────────────────────
  // CARGA DINÂMICA DE OPs (SQL Server)
  // ──────────────────────────────────────────────────────────────────
  async function loadDynamicOps() {
    try {
      console.log('[OPs] Buscando novas OPs no Protheus...');
      // Usando URL absoluta agora para o Capacitor webview
      const url = API_CONFIG.URL_OPS || 'https://interno.progeral.com.br/Apps-testes/api/get_ops.php';
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const opsData = await response.json();
        let opsCount = 0;
        
        // Remove as OPs antigas e carrega as novas dinamicamente
        db.ops = {}; 
        
        for (const opKey in opsData) {
           db.ops[opKey] = opsData[opKey];
           opsCount++;
        }
        
        console.log(`[OPs] ${opsCount} OPs carregadas dinamicamente com sucesso.`);
        return true;
      } else {
        console.warn('[OPs] Falha ao carregar OPs (Status ' + response.status + ')');
        return false;
      }
    } catch (e) {
      console.warn('[OPs] Erro de rede ou timeout ao buscar OPs. O sistema continuará com OPs em cache se houver.', e.message);
      return false;
    }
  }

  
    window.forceSyncOPs = async function(btn) {
      if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
        btn.disabled = true;
      }
      
      await window.forceSyncStaticData();
      const success = await loadDynamicOps();
      
      if (success) {
        showModal('sucesso', 'OPs Atualizadas', '<p>As Ordens de Produção foram sincronizadas com o banco de dados.</p>');
      } else {
        showModal('erro', 'Falha na Sincronização', '<p>Não foi possível atualizar as OPs. Verifique a conexão com o servidor.</p>');
      }
      
      if (btn) {
        btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
        btn.disabled = false;
      }
    };
    
    // Chama no carregamento inicial da página (assíncrono)

  loadDynamicOps();

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 3.5 — BUSCA (SEARCH)
  // Implementação dos botões de lupa (magnifying glass)
  // ══════════════════════════════════════════════════════════════════
  window.openSearch = function (type, targetId) {
    let title = '';
    if (type === 'ops') title = 'Pesquisar Ordem de Produção';
    else if (type === 'produtos') title = 'Pesquisar Produto';
    else if (type === 'recursos') title = 'Pesquisar Recurso';
    else if (type === 'motivos') title = 'Pesquisar Motivo de Parada';

    // 1. Mostrar modal de carregamento primário para dar feedback imediato
    const loadingHtml = `
            <div style="text-align:center; padding: 40px 20px;">
                <div class="modern-spinner" style="border-color: #e2e8f0; border-top-color: var(--accent); margin: 0 auto 20px;"></div>
                <div style="font-weight: 600; color: var(--text2); font-size: 1.1rem;">Buscando informações, aguarde...</div>
            </div>
        `;
    showModal('sucesso', title, loadingHtml);

    // 2. Usar setTimeout para permitir que o navegador renderize o modal de carregamento e não trave a tela
    setTimeout(() => {
      let items = [];

      if (type === 'ops') {
        items = Object.keys(db.ops).map(op => {
          const data = db.ops[op];
          const prodDesc = db.produtos[data.produto] ? db.produtos[data.produto].descricao : null;
          return { code: op, label: (data.produto || 'N/A') + ' - ' + (prodDesc || data.desc || 'Sem descrição') };
        });
      } else if (type === 'produtos') {
        items = Object.keys(db.produtos).map(code => ({ code, label: db.produtos[code].descricao || 'Sem descrição' }));
      } else if (type === 'recursos') {
        items = Object.keys(db.recursos).map(code => ({ code, label: db.recursos[code] }));
      } else if (type === 'motivos') {
        items = Object.keys(db.motivos).map(code => ({ code, label: db.motivos[code] }));
      }

      let html = `
                      <div style="margin-bottom: 5px;">
                          <input type="text" id="search-modal-input" placeholder="Digite para filtrar..." style="width:100%; padding:12px; border-radius:8px; border:2px solid var(--accent); outline:none; font-size: 1rem;">
                      </div>
                      <div id="search-modal-count" style="font-size:0.75rem; color:var(--text3); text-align:right; margin-bottom: 10px; min-height: 15px;"></div>
                      <div id="search-modal-results" style="max-height: 350px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;">
                      </div>
                      <style>
                          .search-item:hover { background: var(--surface2) !important; border-left: 4px solid var(--accent); padding-left: 8px !important; }
                          #search-modal-results::-webkit-scrollbar { width: 6px; }
                          #search-modal-results::-webkit-scrollbar-thumb { background: var(--text3); border-radius: 10px; }
                      </style>
                  `;

      // Substituímos o conteúdo do modal existente (sem fechar e reabrir para não piscar)
      document.getElementById('modalBody').innerHTML = html;

      const input = document.getElementById('search-modal-input');
      const resultsBox = document.getElementById('search-modal-results');
      const countBox = document.getElementById('search-modal-count');

      // Função de renderização limitada (Lazy/Windowing básico)
      const renderResults = (filterText) => {
        const query = filterText.toLowerCase().trim();
        let filtered = items;

        if (query) {
          filtered = items.filter(item =>
            item.code.toLowerCase().includes(query) ||
            item.label.toLowerCase().includes(query)
          );
        }

        const limit = 50; // Limite de 50 itens para NUNCA travar o DOM
        const toShow = filtered.slice(0, limit);

        resultsBox.innerHTML = toShow.map(item => {
          const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          return `
                 <div class="search-item" onclick="selectSearchItem('${targetId}', '${esc(item.code)}')" style="padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer; transition: 0.2s; background: white;">
                     <div style="font-weight: 700; color: var(--accent); font-size: 1rem;">${esc(item.code)}</div>
                     <div style="color: var(--text2); font-size: 0.85rem; margin-top: 2px;">${esc(item.label)}</div>
                 </div>
                 `;
        }).join('');

        if (filtered.length > limit) {
          countBox.textContent = `Mostrando ${limit} de ${filtered.length} resultados. Digite para refinar.`;
        } else if (filtered.length === 0) {
          countBox.textContent = 'Nenhum resultado encontrado.';
          resultsBox.innerHTML = '<div style="padding:15px; text-align:center; color:var(--text3);">Nenhum item correspondente à pesquisa.</div>';
        } else {
          countBox.textContent = `${filtered.length} resultado(s) encontrado(s).`;
        }
      };

      // Renderização inicial
      renderResults('');

      if (input) {
        input.focus();
        let debounceTimer;
        input.addEventListener('input', (e) => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            renderResults(e.target.value);
          }, 200); // Debounce de 200ms para evitar engasgos durante a digitação
        });
      }
    }, 50); // Timeout de 50ms
  };

  window.selectSearchItem = function (targetId, code) {
    const el = document.getElementById(targetId);
    if (el) {
      el.value = code;
      el.dispatchEvent(new Event('input'));
      el.dispatchEvent(new Event('change'));
    }
    document.getElementById('modalOverlay').classList.remove('open');
  };

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 4 — AUTO-FILL (Preenchimento automático por código)
  // Ao digitar um código, o campo de descrição é preenchido
  // automaticamente consultando os objetos db.
  // isProd = true  → prefixo 'p-' (tela de Produção)
  // isProd = false → prefixo 's-' (tela de Parada)
  // ══════════════════════════════════════════════════════════════════

  function bindEnterAndChange(id, callback) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', callback);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        el.classList.add('user-interacted');
        callback();
      }
    });
  }

  // Auto-fill colaborador (Matrícula)
  function fillColab(isProd) {
    const prefix = isProd ? 'p-' : 's-';
    const opp = isProd ? 's-' : 'p-';
    const mat = document.getElementById(prefix + 'matricula').value;

    // Emula a digitação em tempo real na outra tela
    document.getElementById(opp + 'matricula').value = mat;

    let nome = '';
    if (mat.trim()) {
      // Busca colaborador pela matrícula no novo formato de objeto
      const colab = window.COLABORADORES[mat.trim()];
      nome = colab ? colab.nome : 'Colaborador não encontrado';
    }
    document.getElementById(prefix + 'nome').value = nome;
    document.getElementById(opp + 'nome').value = nome;

    // Atualiza o feedback visual silenciosamente na outra tela
    validateLive(!isProd);
  }
  bindEnterAndChange('p-matricula', () => { fillColab(true); validateLive(true); });
  bindEnterAndChange('s-matricula', () => { fillColab(false); validateLive(false); });

  // Sincronização Turno/Datas cruzadas (Produção <=> Parada)
  ['turno', 'data-ini', 'data-fim'].forEach(f => {
    document.getElementById('p-' + f).addEventListener('change', e => {
      document.getElementById('s-' + f).value = e.target.value;
      validateLive(false);
    });
    document.getElementById('s-' + f).addEventListener('change', e => {
      document.getElementById('p-' + f).value = e.target.value;
      validateLive(true);
    });
  });

  // Auto-fill OP
  function fillOP(isProd) {
    const prefix = isProd ? 'p-' : 's-';
    const op = document.getElementById(prefix + 'op').value.trim();
    if (db.ops[op]) {
      const prodCod = db.ops[op].produto;
      document.getElementById(prefix + 'produto').value = prodCod;
      const prodDesc = db.produtos[prodCod] ? db.produtos[prodCod].descricao : null;
      document.getElementById(prefix + 'desc').value = prodDesc || db.ops[op].desc || 'Descrição não encontrada';
    }
  }
  bindEnterAndChange('p-op', () => { fillOP(true); validateLive(true); });
  bindEnterAndChange('s-op', () => { fillOP(false); validateLive(false); });

  // Auto-fill produto (individual)
  function fillProd(isProd) {
    const prefix = isProd ? 'p-' : 's-';
    const cod = document.getElementById(prefix + 'produto').value.trim();
    // Case-insensitive search
    const foundKey = Object.keys(db.produtos).find(k => k.toUpperCase() === cod.toUpperCase());
    if (foundKey) {
      document.getElementById(prefix + 'desc').value = db.produtos[foundKey].descricao || 'Descrição não encontrada';
    }

    if (isProd) {
      updateZinkUI();
    }
  }
  bindEnterAndChange('p-produto', () => { fillProd(true); validateLive(true); });
  bindEnterAndChange('s-produto', () => { fillProd(false); validateLive(false); });

  // Auto-fill recurso
  function fillRecurso(isProd) {
    const prefix = isProd ? 'p-' : 's-';
    const cod = document.getElementById(prefix + 'recurso-cod').value.trim().toUpperCase();

    if (db.recursos[cod]) {
      document.getElementById(prefix + 'recurso').value = db.recursos[cod];
    } else {
      document.getElementById(prefix + 'recurso').value = '';
    }
  }
  bindEnterAndChange('p-recurso-cod', () => { fillRecurso(true); validateLive(true); });
  bindEnterAndChange('s-recurso-cod', () => { fillRecurso(false); validateLive(false); });

  // Auto-fill motivo de parada (somente na tela de Parada)
  bindEnterAndChange('s-motivo-cod', () => {
    const cod = document.getElementById('s-motivo-cod').value.trim().toUpperCase();
    document.getElementById('s-motivo-desc').value = db.motivos[cod] || 'Motivo não encontrado';
    validateLive(false);
  });

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 5 — VALIDAÇÃO VISUAL EM TEMPO REAL
  // updateFieldClass: muda a cor do campo com base na validade.
  //   🟡 field-empty   = obrigatório e vazio
  //   🟢 field-valid   = valor reconhecido no banco
  //   🔴 field-invalid = valor digitado mas inválido
  // validateLive: orquestra a validação de todos os campos da tela.
  //   Chamada a cada input/change nos campos monitorados (liveFields).
  // ══════════════════════════════════════════════════════════════════
  function updateFieldClass(id, isValid, errorMsg = '') {
    const el = document.getElementById(id);
    if (!el) return;

    // Gerenciar mensagem de erro no container principal (.field)
    const container = el.closest('.field') || el.parentNode;
    let msgEl = container.querySelector('.field-error-message');

    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.className = 'field-error-message';
      container.appendChild(msgEl);
    }
    msgEl.textContent = errorMsg;

    el.classList.remove('field-empty', 'field-valid', 'field-invalid');
    const val = el.value.trim();

    if (!val) {
      el.classList.add('field-empty');
      if (el.classList.contains('user-interacted')) {
        msgEl.textContent = 'Campo obrigatório';
        el.classList.add('field-invalid');
      }
    } else if (el.classList.contains('user-interacted')) {
      if (isValid) {
        el.classList.add('field-valid');
      } else {
        el.classList.add('field-invalid');
      }
    }

    // Exibe a mensagem de erro se estiver inválido e com interação do usuário
    if (el.classList.contains('field-invalid')) {
      msgEl.style.display = 'inline-block';
    } else {
      msgEl.style.display = 'none';
    }
  }

  const PROD_FIELDS_TO_BLOCK = ['p-recurso-cod', 'p-data-ini', 'p-data-fim', 'p-hora-ini', 'p-hora-fim', 'p-qtd', 'p-qtd-ret', 'p-setup', 'p-rnc', 'p-cestos', 'p-peso'];
  function toggleProdFieldsBlocked(blocked) {
    PROD_FIELDS_TO_BLOCK.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.disabled = blocked;
    });
    const btn = document.getElementById('p-btn-confirmar');
    if (btn) btn.disabled = blocked;

    const msg = document.getElementById('p-op-required-msg');
    if (blocked) {
      if (!msg) {
        const m = document.createElement('div');
        m.id = 'p-op-required-msg';
        m.style.cssText = 'padding:12px 16px;margin-bottom:12px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;color:#991b1b;font-weight:600;font-size:14px;text-align:center;';
        m.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Preencha uma O.P. válida para liberar os demais campos';
        const card = document.querySelector('#screen-prod .form-card:nth-of-type(2)');
        if (card && card.parentNode) {
          card.parentNode.insertBefore(m, card.nextSibling);
        }
      }
    } else {
      if (msg) msg.remove();
    }
  }

  function validateLive(isProd) {
    const p = isProd ? 'p-' : 's-';
    // Usuário
    const mat = document.getElementById(p + 'matricula').value.trim();
    let loginCompleto = false;
    let loginErrorMsg = '';
    if (!mat) {
      loginErrorMsg = 'Matrícula é obrigatória';
    } else if (mat.length !== 6) {
      loginErrorMsg = 'Matrícula deve ter exatamente 6 números';
    } else if (!window.COLABORADORES.hasOwnProperty(mat)) {
      loginErrorMsg = 'Usuário não encontrado';
    } else {
      loginCompleto = true;
    }

    // Recurso
    const rCod = document.getElementById(p + 'recurso-cod').value.trim().toUpperCase();

    // Horas e Validação de Retrocesso
    const hI = document.getElementById(p + 'hora-ini').value;
    const hF = document.getElementById(p + 'hora-fim').value;
    const dSel = document.getElementById(p + 'data-ini').value;
    const tVal = document.getElementById(p + 'turno').value;

    let hIniValid = isValidTimeStr(hI);
    let hFimValid = isValidTimeStr(hF);

    const prodVal = document.getElementById(p + 'produto').value.trim().toUpperCase();
    const isento = window.isProdutoIsento(prodVal);



    updateFieldClass(p + 'matricula', loginCompleto, loginErrorMsg);
    updateFieldClass(p + 'recurso-cod', !!db.recursos[rCod], 'Recurso não encontrado');

    if (isProd) {
      const prod = document.getElementById('p-produto').value.trim().toUpperCase();
      updateFieldClass('p-produto', !!db.produtos[prod], 'Produto não encontrado');

      const op = document.getElementById('p-op').value.trim();
      const requerOP = !!prod && window.produtoRequerOP(prod);
      const opOk = op && !!db.ops[op];
      if (op) {
        updateFieldClass('p-op', !!db.ops[op], opOk ? '' : 'OP não encontrada');
      } else if (requerOP) {
        const elOp = document.getElementById('p-op');
        elOp.classList.add('user-interacted');
        elOp.classList.remove('field-empty', 'field-valid');
        elOp.classList.add('field-invalid');
        const container = elOp.closest('.field') || elOp.parentNode;
        let msgEl = container.querySelector('.field-error-message');
        if (!msgEl) {
          msgEl = document.createElement('div');
          msgEl.className = 'field-error-message';
          container.appendChild(msgEl);
        }
        msgEl.textContent = 'Este produto exige informar a O.P.';
        msgEl.style.display = 'inline-block';
      } else {
        // O.P. é opcional para produtos sem restrição
        const elOp = document.getElementById('p-op');
        elOp.classList.remove('field-empty', 'field-valid', 'field-invalid');
        const container = elOp.closest('.field') || elOp.parentNode;
        const msgEl = container.querySelector('.field-error-message');
        if (msgEl) {
          msgEl.textContent = '';
          msgEl.style.display = 'none';
        }
      }

      toggleProdFieldsBlocked(requerOP && !opOk);

      const prodData = db.produtos[prod];
      const um = prodData ? (prodData.um || '').toUpperCase() : '';
      const isDecimalAllowed = (um === 'KG' || um === 'M' || um === 'MT');

      const qtdStr = document.getElementById('p-qtd').value;
      const qtd = qtdStr === '' ? NaN : (isDecimalAllowed ? parseFloat(qtdStr) : parseInt(qtdStr, 10)) || 0;

      let isQtdValid = !isNaN(qtd) && qtd >= 0;
      let errorMsg = 'Qtd deve ser >= 0';
      if (isQtdValid && !isDecimalAllowed) {
        if (parseFloat(qtdStr) % 1 !== 0) {
          isQtdValid = false;
          errorMsg = 'Apenas números inteiros permitidos para esta UM';
        }
      }
      updateFieldClass('p-qtd', isQtdValid, errorMsg);
    } else {
      const op = document.getElementById('s-op').value.trim();
      if (op) {
        const opExists = !!db.ops[op];
        updateFieldClass('s-op', opExists, opExists ? '' : 'OP não encontrada');
      } else {
        // O.P. é sempre opcional
        const elOp = document.getElementById('s-op');
        elOp.classList.remove('field-empty', 'field-valid', 'field-invalid');
        const container = elOp.closest('.field') || elOp.parentNode;
        const msgEl = container.querySelector('.field-error-message');
        if (msgEl) {
          msgEl.textContent = '';
          msgEl.style.display = 'none';
        }
      }

      const mot = document.getElementById('s-motivo-cod').value.trim().toUpperCase();
      updateFieldClass('s-motivo-cod', !!db.motivos[mot], 'Código de parada incorreto');
      const prodPar = document.getElementById('s-produto').value.trim().toUpperCase();
      updateFieldClass('s-produto', !!db.produtos[prodPar], 'Produto não encontrado');
    }


    const vIniStr = document.getElementById(p + 'data-ini').value;
    const vFimStr = document.getElementById(p + 'data-fim').value;
    let dIniValid = isValidDateStr(vIniStr);
    let dFimValid = isValidDateStr(vFimStr);
    let dIniError = dIniValid ? (window.checkDateLimit ? window.checkDateLimit(vIniStr) : '') : 'Data invalida';
    let dFimError = dFimValid ? (window.checkDateLimit ? window.checkDateLimit(vFimStr) : '') : 'Data invalida';

    updateFieldClass(p + 'data-ini', dIniValid && !dIniError, dIniError);
    updateFieldClass(p + 'data-fim', dFimValid && !dFimError, dFimError);

    updateFieldClass(p + 'hora-ini', hIniValid, hIniValid ? '' : 'Horário já preenchido');
    updateFieldClass(p + 'hora-fim', hFimValid, hFimValid ? '' : 'Horário já preenchido');

    updateTimeline();
  }

  const liveFields = [
    'p-matricula', 'p-recurso-cod', 'p-op', 'p-produto', 'p-qtd', 'p-peso', 'p-data-ini', 'p-data-fim', 'p-hora-ini', 'p-hora-fim',
    's-matricula', 's-recurso-cod', 's-motivo-cod', 's-produto', 's-data-ini', 's-data-fim', 's-hora-ini', 's-hora-fim'
  ];

  // Lógica ZINK: Alternar visibilidade do peso e auto-cálculo
  function updateQtdInputStep(prodCod) {
    const inpQtd = document.getElementById('p-qtd');
    if (!inpQtd) return;
    const prod = (prodCod || '').trim().toUpperCase();
    const prodData = db.produtos[prod];
    const um = prodData ? (prodData.um || '').toUpperCase() : '';
    const isDecimalAllowed = (um === 'KG' || um === 'M' || um === 'MT');

    if (isDecimalAllowed) {
      inpQtd.setAttribute('step', 'any');
      inpQtd.setAttribute('placeholder', '0.000');
      inpQtd.setAttribute('inputmode', 'decimal');
    } else {
      inpQtd.setAttribute('step', '1');
      inpQtd.setAttribute('placeholder', '0');
      inpQtd.setAttribute('inputmode', 'numeric');

      let val = inpQtd.value;
      if (val.includes('.')) {
        inpQtd.value = val.split('.')[0];
      }
    }
  }

  function updateZinkUI() {
    const prod = document.getElementById('p-produto').value.trim().toUpperCase();
    const wrap = document.getElementById('p-peso-wrap');
    const inpQtd = document.getElementById('p-qtd');

    if (window.isProdutoZink(prod)) {
      wrap.style.display = 'block';
      inpQtd.readOnly = true;
      inpQtd.tabIndex = -1;
      inpQtd.classList.add('readonly-field');
      calculateZinkQtd();
    } else {
      wrap.style.display = 'none';
      inpQtd.readOnly = false;
      inpQtd.tabIndex = 0;
      inpQtd.classList.remove('readonly-field');
    }

    updateQtdInputStep(prod);
  }

  function calculateZinkQtd() {
    const prod = document.getElementById('p-produto').value.trim().toUpperCase();
    const peso = parseFloat(document.getElementById('p-peso').value) || 0;
    const unit = window.ZINK_DATA[prod];

    if (unit && peso > 0) {
      const totalQtd = Math.ceil(peso / unit); // Arredonda sempre para cima
      document.getElementById('p-qtd').value = totalQtd;
    } else {
      document.getElementById('p-qtd').value = '';
    }
    // Dispara a validação da quantidade
    validateLive(true);
  }

  document.getElementById('p-peso').addEventListener('input', calculateZinkQtd);
  document.getElementById('p-op').addEventListener('input', () => { setTimeout(updateZinkUI, 50); });
  document.getElementById('p-produto').addEventListener('input', updateZinkUI);

  // Impedir vírgula no campo de quantidade, e ponto caso não seja decimal permitido
  const pQtdEl = document.getElementById('p-qtd');
  if (pQtdEl) {
    pQtdEl.addEventListener('keydown', function (e) {
      if (e.key === ',' || e.keyCode === 188) {
        e.preventDefault();
        return;
      }
      if (e.key === '.' || e.keyCode === 190 || e.keyCode === 110) {
        const prod = document.getElementById('p-produto').value.trim().toUpperCase();
        const prodData = db.produtos[prod];
        const um = prodData ? (prodData.um || '').toUpperCase() : '';
        const isDecimalAllowed = (um === 'KG' || um === 'M' || um === 'MT');
        if (!isDecimalAllowed) {
          e.preventDefault();
        }
      }
    });

    pQtdEl.addEventListener('input', function (e) {
      let val = this.value;
      if (val.includes(',')) {
        val = val.replace(/,/g, '');
      }
      const prod = document.getElementById('p-produto').value.trim().toUpperCase();
      const prodData = db.produtos[prod];
      const um = prodData ? (prodData.um || '').toUpperCase() : '';
      const isDecimalAllowed = (um === 'KG' || um === 'M' || um === 'MT');

      if (!isDecimalAllowed && val.includes('.')) {
        val = val.split('.')[0];
      }
      if (this.value !== val) {
        this.value = val;
      }
    });
  }

  // Impedir vírgula no campo de peso
  const pPesoEl = document.getElementById('p-peso');
  if (pPesoEl) {
    pPesoEl.addEventListener('keydown', function (e) {
      if (e.key === ',' || e.keyCode === 188) {
        e.preventDefault();
      }
    });
    pPesoEl.addEventListener('input', function (e) {
      let val = this.value;
      if (val.includes(',')) {
        val = val.replace(/,/g, '');
        if (this.value !== val) {
          this.value = val;
        }
      }
    });
  }

  liveFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        el.classList.add('user-interacted');
        validateLive(id.startsWith('p-'));
        if (el.classList.contains('field-invalid')) {
          setTimeout(() => el.focus(), 50);
        }
      });

      // Alerta ao pressionar Enter
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          el.classList.add('user-interacted'); // Marca que o usuário tentou confirmar
          validateLive(id.startsWith('p-')); // Re-valida para aplicar a cor vermelha ou verde

          if (el.classList.contains('field-invalid')) {
            // Mantém na caixa atual (Trava)
            e.preventDefault();
            setTimeout(() => el.focus(), 10);
          } else {
            // Avançar para próximo campo automaticamente (UX Rápido)
            e.preventDefault();
            const formFields = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([readonly]), select')).filter(f => f.offsetParent !== null && !f.disabled && f.tabIndex >= 0);
            const currentIndex = formFields.indexOf(el);
            if (currentIndex >= 0 && currentIndex < formFields.length - 1) {
              formFields[currentIndex + 1].focus();
            }
          }
        }
      });

      // Limpa o estado de erro/sucesso visual ao começar a digitar novamente 
      el.addEventListener('input', () => {
        el.classList.remove('user-interacted', 'field-invalid', 'field-valid');

        // Se for o campo de OP e a OP for válida, preenche o produto imediatamente
        if (id === 'p-op' || id === 's-op') {
          const isProd = id.startsWith('p-');
          const opVal = el.value.trim();
          if (db.ops[opVal]) {
            fillOP(isProd);
            el.classList.add('user-interacted');
            const prodEl = document.getElementById(isProd ? 'p-produto' : 's-produto');
            if (prodEl) {
              prodEl.classList.add('user-interacted');
            }
            validateLive(isProd);
          }
        }
      });
    }
  });
  // Inicializa as classes visuais ao carregar a página
  setTimeout(() => { validateLive(true); validateLive(false); }, 100);

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 6 — NAVEGAÇÃO ENTRE TELAS
  // goTo(screenId): oculta todas as telas e exibe a indicada.
  // Telas disponíveis: screen-home | screen-prod | screen-parada | screen-duvidas
  // ══════════════════════════════════════════════════════════════════
  window.goTo = function (id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
  };

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 7 — MODAL (Diálogos de feedback)
  // showModal(type, title, html, confirmCallback)
  //   type: 'erro' | 'aviso' | 'sucesso' | 'confirm'
  //   confirmCallback: se passado, exibe botões Cancelar + Confirmar.
  //     Se null, exibe apenas botão Fechar.
  // ══════════════════════════════════════════════════════════════════
  function showModal(type, title, html, confirmCallback = null, isFinal = false, retryCallback = null, cancelCallback = null) {
    const box = document.getElementById('modalBox');
    box.className = 'modal-box type-' + type;
    const icons = { erro: 'fas fa-times-circle', aviso: 'fas fa-exclamation-triangle', sucesso: 'fas fa-check-circle', confirm: 'fas fa-clipboard-check' };
    const colors = { erro: 'var(--red)', aviso: 'var(--yellow)', sucesso: 'var(--green)', confirm: 'var(--accent)' };
    const ico = document.getElementById('modalIcon');
    ico.className = icons[type];
    ico.style.color = colors[type];
    document.getElementById('modalTitle').style.color = colors[type];
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = html;

    const foot = document.querySelector('.modal-foot');
    foot.innerHTML = '';

    if (confirmCallback) {
      const btnCancel = document.createElement('button');
      btnCancel.className = 'btn btn-ghost';
      btnCancel.textContent = 'Cancelar';
      btnCancel.onclick = () => {
        document.getElementById('modalOverlay').classList.remove('open');
        if (cancelCallback) cancelCallback();
      };

      const btnConfirm = document.createElement('button');
      btnConfirm.className = 'btn btn-primary';
      btnConfirm.textContent = 'Confirmar Registro';
      btnConfirm.onclick = () => {
        document.getElementById('modalOverlay').classList.remove('open');
        setTimeout(() => confirmCallback(), 50);
      };

      foot.appendChild(btnCancel);
      foot.appendChild(btnConfirm);
    } else {
      if (isFinal) {
        const btnSairPop = document.createElement('button');
        btnSairPop.className = 'btn btn-red';
        btnSairPop.innerHTML = '<i class="fas fa-door-open"></i> Sair do Sistema';
        btnSairPop.style.marginRight = 'auto'; // Afasta o botão do fechar
        btnSairPop.onclick = () => {
          document.getElementById('modalOverlay').classList.remove('open');
          sairOperadorGlobal();
        };
        foot.appendChild(btnSairPop);
      }

      if (retryCallback) {
        const btnRetry = document.createElement('button');
        btnRetry.className = 'btn btn-primary';
        btnRetry.textContent = 'Tentar Novamente';
        btnRetry.onclick = () => {
          document.getElementById('modalOverlay').classList.remove('open');
          retryCallback();
        };
        foot.appendChild(btnRetry);
      }

      const btnClose = document.createElement('button');
      btnClose.className = 'btn btn-ghost';
      btnClose.textContent = retryCallback ? 'Cancelar e Limpar' : 'Fechar';
      btnClose.onclick = () => {
        document.getElementById('modalOverlay').classList.remove('open');
        if (cancelCallback) cancelCallback();
      };
      foot.appendChild(btnClose);
    }

    document.getElementById('modalOverlay').classList.add('open');
  }

  // Centraliza o fechamento e clique fora
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target.id === 'modalOverlay') {
      // O usuário solicitou que o modal não feche mais ao clicar fora (no escuro)
      // para que só saia pelos botões explícitos ou pelo F5.
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 8 — SESSÃO DO OPERADOR
  // trocarOperador: limpa apenas os campos de login (matrícula/senha/nome) globais.
  // sairOperadorGlobal: limpa TUDO e retorna para a home.
  // ══════════════════════════════════════════════════════════════════
  function sairOperadorGlobal() {
    ['p-matricula', 'p-senha', 'p-nome', 's-matricula', 's-senha', 's-nome'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    limparFormProd();
    limparFormParadaCompleto();
    goTo('screen-home');
  }

  window.trocarOperador = function (isProd) {
    ['p-matricula', 'p-senha', 'p-nome', 's-matricula', 's-senha', 's-nome'].forEach(f => {
      const el = document.getElementById(f);
      if (el) el.value = '';
    });
    validateLive(true);
    validateLive(false);
  };

  window.sairOperadorProd = sairOperadorGlobal;
  window.sairOperadorParada = sairOperadorGlobal;

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 9 — TIMELINE VISUAL DO TURNO
  // updateTimeline: redesenha a barra de progresso do turno.
  //   Verde  = segmentos de produção
  //   Vermelho = segmentos de parada
  //   Alerta de GAP: aparece quando o horário atual do campo
  //   é maior que o fim do último registro (lacuna detectada).
  // ══════════════════════════════════════════════════════════════════
  function updateTimeline() {
    const isProd = document.getElementById('screen-prod').classList.contains('active');
    const suffix = isProd ? 'p-' : 's-';
    const turnoVal = document.getElementById(suffix + 'turno').value;
    const dataSel = document.getElementById(suffix + 'data-ini').value;
    const rCod = document.getElementById(suffix + 'recurso-cod').value.trim().toUpperCase();

    const bar = document.getElementById(suffix + 'timeline-bar');
    const labelStart = document.getElementById(suffix + 'timeline-start');
    const labelEnd = document.getElementById(suffix + 'timeline-end');
    const alertEl = document.getElementById(suffix + 'timeline-alert');

    if (!turnoVal || !bar) return;
    const [tId, tIni, tFim] = turnoVal.split('|');
    labelStart.textContent = tIni;
    labelEnd.textContent = tFim;
    bar.innerHTML = '';

    const sT = parseDateTime(dataSel, tIni);
    const eT = parseDateTime(dataSel, tFim);
    if (tFim < tIni) eT.setDate(eT.getDate() + 1);
    const totalMin = (eT - sT) / 60000;

    const regs = [...state.produções, ...state.paradas]
      .filter(i => i.recursoCod.toUpperCase() === rCod.toUpperCase() && i.shiftKey === tId && i.dIni === dataSel);
    regs.sort((a, b) => parseDateTime(a.dIni, a.hIni) - parseDateTime(b.dIni, b.hIni));

    let lastEnd = sT;
    let lastEndStr = tIni;
    if (regs.length > 0) {
      const last = regs[regs.length - 1];
      lastEnd = parseDateTime(last.dFim, last.hFim);
      lastEndStr = last.hFim;
    }

    // Posiciona label da última hora (last pointed)
    const labelLast = document.getElementById(suffix + 'timeline-last');
    if (labelLast) {
      const offsetLast = Math.max(0, (lastEnd - sT) / 60000);
      const leftLast = (offsetLast / totalMin) * 100;
      labelLast.style.left = leftLast + '%';
      labelLast.textContent = lastEndStr;
      // Esconde se estiver muito perto das pontas para não encavalar
      labelLast.style.display = (leftLast < 8 || leftLast > 92) ? 'none' : 'block';
    }

    const currentHIni = document.getElementById(suffix + 'hora-ini').value;
    const currentHFim = document.getElementById(suffix + 'hora-fim').value;

    if (alertEl) {
      if (isValidTimeStr(currentHIni)) {
        const cStart = parseDateTime(dataSel, currentHIni);
        // Se o turno cruza meia-noite e a hora inicial é <= fim do turno, avança 1 dia
        if (tFim < tIni && currentHIni <= tFim) cStart.setDate(cStart.getDate() + 1);

        alertEl.style.display = (cStart > lastEnd && (cStart - lastEnd) / 60000 > 1) ? 'block' : 'none';
      } else alertEl.style.display = 'none';
    }

    const renderSegs = (list, styleClass) => {
      list.filter(item => item.recursoCod.toUpperCase() === rCod.toUpperCase() && item.shiftKey === tId && item.dIni === dataSel)
        .forEach(item => {
          const start = parseDateTime(item.dIni, item.hIni);
          const end = parseDateTime(item.dFim, item.hFim);
          if (end > start) {
            const offset = Math.max(0, (start - sT) / 60000);
            const duration = (end - start) / 60000;
            const left = (offset / totalMin) * 100;
            const width = (duration / totalMin) * 100;

            const seg = document.createElement('div');
            const isento = window.isProdutoIsento(item.produto);
            seg.className = 'timeline-segment ' + styleClass + (isento ? ' segment-isento' : '');
            seg.style.left = left + '%';
            seg.style.width = width + '%';
            seg.title = `${item.hIni} - ${item.hFim} | ${item.produto || ''}`;
            bar.appendChild(seg);
          }
        });
    };

    renderSegs(state.produções, 'segment-prod');
    renderSegs(state.paradas, 'segment-para');

    // Renderiza preview fraquinho (ghost)
    if (isValidTimeStr(currentHIni) && isValidTimeStr(currentHFim)) {
      const pStart = parseDateTime(dataSel, currentHIni);
      if (tFim < tIni && currentHIni <= tFim) pStart.setDate(pStart.getDate() + 1);

      let pEnd = parseDateTime(dataSel, currentHFim);
      if (tFim < tIni && currentHFim <= tFim) pEnd.setDate(pEnd.getDate() + 1);
      else if (currentHFim < currentHIni) pEnd.setDate(pEnd.getDate() + 1);
      if (pEnd > pStart) {
        const offsetP = Math.max(0, (pStart - sT) / 60000);
        const durP = (pEnd - pStart) / 60000;
        const ghost = document.createElement('div');
        const isento = window.isProdutoIsento(isProd ? document.getElementById('p-produto').value : document.getElementById('s-produto').value);
        ghost.className = 'timeline-segment ' + (isProd ? 'segment-prod' : 'segment-para') + (isento ? ' segment-isento' : '');
        ghost.style.left = (offsetP / totalMin) * 100 + '%';
        ghost.style.width = (durP / totalMin) * 100 + '%';
        ghost.style.opacity = '0.35';
        ghost.style.border = '1.5px dashed var(--text)';
        bar.appendChild(ghost);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 10 — HELPERS (Utilitários)
  window.isProdutoIsento = function (prodCode) {
    if (!prodCode) return false;
    const p = prodCode.toUpperCase();
    return p.endsWith('Z') || p.endsWith('J') || p.endsWith('TT');
  };

  window.produtoRequerOP = function (prodCode) {
    if (!prodCode) return false;
    const p = prodCode.toUpperCase();
    return p.endsWith('E') || p.endsWith('TT') || p.endsWith('J');
  };

  // maskTime(id)       : aplica máscara HH:MM ao digitar
  // isValidTimeStr(t)  : valida se a string está no formato HH:MM


  // parseDateTime(d,t) : converte 'YYYY-MM-DD' + 'HH:MM' em Date
  // fmt(date)          : extrai HH:MM de um objeto Date
  // today()            : retorna a data de hoje no formato YYYY-MM-DD
  // ══════════════════════════════════════════════════════════════════
  function maskTime(id) {
    const el = document.getElementById(id);
    el.addEventListener('input', e => {
      let v = e.target.value.replace(/\D/g, "");
      if (v.length > 4) v = v.slice(0, 4);

      // Bloqueio de valores impossíveis durante a digitação
      if (v.length >= 2) {
        let h = parseInt(v.slice(0, 2));
        if (h > 23) v = "23" + v.slice(2);
      }
      if (v.length >= 4) {
        let m = parseInt(v.slice(2, 4));
        if (m > 59) v = v.slice(0, 2) + "59";
      }

      if (v.length > 2) v = v.slice(0, 2) + ":" + v.slice(2);
      e.target.value = v;
    });
    el.addEventListener('blur', e => {
      let v = e.target.value;
      if (v.length === 0) return;
      // Auto-completar formato básico
      if (v.length === 1) v = "0" + v + ":00";
      else if (v.length === 2) v = v + ":00";
      else if (v.length === 3 && v.includes(':')) v = v + "00";
      else if (v.length === 4 && v.includes(':')) v = v.slice(0, 3) + "0" + v[3];

      e.target.value = v;
      e.target.classList.add('user-interacted');
      validateLive(id.startsWith('p-'));
    });
  }
  ['p-hora-ini', 'p-hora-fim', 's-hora-ini', 's-hora-fim'].forEach(maskTime);

  function maskDate(id) {
    const el = document.getElementById(id);
    el.addEventListener('input', e => {
      let v = e.target.value.replace(/\D/g, "");
      if (v.length > 8) v = v.slice(0, 8);
      if (v.length > 4) v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
      else if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
      e.target.value = v;
    });
    el.addEventListener('blur', e => {
      let v = e.target.value;
      if (v.length === 0) return;
      if (v.length <= 5) {
        const year = new Date().getFullYear();
        if (v.length === 2) v = v + "/" + (new Date().getMonth() + 1).toString().padStart(2, '0') + "/" + year;
        else if (v.length === 5) v = v + "/" + year;
      }
      e.target.value = v;
      e.target.classList.add('user-interacted');
      validateLive(id.startsWith('p-'));
    });
  }
  ['p-data-ini', 'p-data-fim', 's-data-ini', 's-data-fim'].forEach(maskDate);

  function maskNumber(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, "");
    });
  }
  ['p-matricula', 'p-op', 's-matricula', 's-op'].forEach(maskNumber);

  // Função para abrir o seletor nativo e sincronizar
  window.openDatePicker = function (id) {
    const picker = document.getElementById(id + '-picker');
    if (picker) {
      if (picker.showPicker) picker.showPicker();
      else picker.focus();
    }
  };

  // Sincronizar picker -> input text
  ['p-data-ini', 'p-data-fim', 's-data-ini', 's-data-fim'].forEach(id => {
    const picker = document.getElementById(id + '-picker');
    if (picker) {
      picker.addEventListener('change', (e) => {
        if (e.target.value) {
          const [y, m, d] = e.target.value.split('-');
          const inputEl = document.getElementById(id);
          inputEl.value = `${d}/${m}/${y}`;
          inputEl.classList.add('user-interacted');
          validateLive(id.startsWith('p-'));
        }
      });
    }
  });


  function isValidDateStr(dStr) {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dStr)) return false;
    const parts = dStr.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (year < 2000 || year > 2100 || month === 0 || month > 12) return false;
    const monthLength = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year % 400 === 0 || (year % 100 !== 0 && year % 4 === 0)) monthLength[1] = 29;
    return day > 0 && day <= monthLength[month - 1];
  }

  window.checkDateLimit = function (dStr) {
    if (!dStr) return '';
    const parts = dStr.split('/');
    if (parts.length !== 3) return '';
    const dDate = new Date(parts[2], parts[1] - 1, parts[0]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = today - dDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 30) return 'Máximo 30 dias atrás';
    if (diffDays < -1) return 'Data futura inválida';
    return '';
  };

  function isValidTimeStr(t) {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(t)) return false;
    return true;
  }

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 11 — SINCRONIZAÇÃO DAS LISTAS
  // syncLists: atualiza as tabelas de histórico (produções e paradas)
  //   e redesenha a timeline. Chamada após confirmar ou remover um registro.
  // ══════════════════════════════════════════════════════════════════
  function syncLists() {
    const isProd = document.getElementById('screen-prod').classList.contains('active');
    const prefix = isProd ? 'p-' : 's-';

    const turno = document.getElementById(prefix + 'turno').value;
    const data = document.getElementById(prefix + 'data-ini').value;
    const recurso = document.getElementById(prefix + 'recurso-cod').value.trim().toUpperCase();

    renderProdLista(turno, data, recurso);
    renderParadaLista(turno, data, recurso);
    updateTimeline();
  }

  // Registrar listeners para atualização dinâmica do histórico
  ['p-turno', 'p-data-ini', 'p-recurso-cod', 's-turno', 's-data-ini', 's-recurso-cod'].forEach(id => {
    document.getElementById(id).addEventListener('change', syncLists);
    if (id.includes('recurso')) document.getElementById(id).addEventListener('input', syncLists);
  });

  function parseDateTime(d, t) {
    if (!d || !t) return null;
    // Suporta tanto DD/MM/YYYY quanto YYYY-MM-DD
    if (d.includes('/')) {
      const [day, month, year] = d.split('/');
      return new Date(`${year}-${month}-${day}T${t}:00`);
    }
    return new Date(d + 'T' + t + ':00');
  }
  function fmt(d) { return d.toTimeString().slice(0, 5); }
  function today() {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // Init dates
  document.getElementById('p-data-ini').value = today();
  document.getElementById('p-data-fim').value = today();
  document.getElementById('s-data-ini').value = today();
  document.getElementById('s-data-fim').value = today();

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 12 — TESTAR PRODUÇÃO
  // Executa as mesmas validações do Confirmar, mas SEM gravar.
  // Exibe modal de sucesso ou erro para feedback visual ao operador.
  // Uso: botão [Testar] na tela de Produção.
  // ══════════════════════════════════════════════════════════════════
  window.testarProd = function () {
    const op = document.getElementById('p-op').value.trim();
    const prod = document.getElementById('p-produto').value.trim().toUpperCase();
    const rCod = document.getElementById('p-recurso-cod').value.trim().toUpperCase();
    const dIni = document.getElementById('p-data-ini').value;
    const hIni = document.getElementById('p-hora-ini').value;
    const dFim = document.getElementById('p-data-fim').value;
    const hFim = document.getElementById('p-hora-fim').value;

    const prodData = db.produtos[prod];
    const um = prodData ? (prodData.um || '').toUpperCase() : '';
    const isDecimalAllowed = (um === 'KG' || um === 'M' || um === 'MT');
    const qtdStr = document.getElementById('p-qtd').value;
    const qtd = qtdStr === '' ? NaN : (isDecimalAllowed ? parseFloat(qtdStr) : parseInt(qtdStr, 10)) || 0;

    const matricula = document.getElementById('p-matricula').value.trim();
    const senha = document.getElementById('p-senha').value.trim();
    const turnoInfo = document.getElementById('p-turno').value.split('|');
    if (turnoInfo.length < 3) { showModal('erro', 'Turno', 'Selecione um turno válido.'); return; }
    const iniT = turnoInfo[1], fimT = turnoInfo[2];

    // Validações básicas (igual confirmarProd)
    if (!matricula || !senha) { showModal('erro', 'Usuário/Senha', 'Preencha os campos de operador.'); return; }
    if (matricula.length !== 6) { showModal('erro', 'Usuário', 'A matrícula deve ter exatamente 6 números.'); return; }
    if (!window.COLABORADORES.hasOwnProperty(matricula) && !db.colaboradores[`${matricula}|${senha}`]) { showModal('erro', 'Acesso Negado', 'Usuário ou Senha incorretos.'); return; }
    if (op && !db.ops[op]) { showModal('erro', 'OP não encontrada', 'A Ordem de Produção informada não existe no cadastro.'); return; }
    if (!prod || !db.produtos[prod]) { showModal('erro', 'Produto Inválido', 'Código do produto não encontrado.'); return; }
    if (!rCod || !db.recursos[rCod]) { showModal('erro', 'Recurso Inválido', 'Máquina não encontrada no cadastro.'); return; }
    if (qtd <= 0) { showModal('erro', 'Quantidade', 'A quantidade produzida deve ser maior que zero.'); return; }
    if (!dIni || !hIni || !dFim || !hFim) { showModal('erro', 'Datas/Horas', 'Preencha todos os campos de período.'); return; }
    if (!isValidTimeStr(hIni) || !isValidTimeStr(hFim)) { showModal('erro', 'Hora inválida', 'Formato HH:MM.'); return; }

    const dIniErr = window.checkDateLimit(dIni);
    if (dIniErr) { showModal('erro', 'Data Inicial', dIniErr); return; }
    const dFimErr = window.checkDateLimit(dFim);
    if (dFimErr) { showModal('erro', 'Data Final', dFimErr); return; }

    const start = parseDateTime(dIni, hIni);
    if (fimT < iniT && hIni <= fimT) start.setDate(start.getDate() + 1);

    let end = parseDateTime(dFim, hFim);
    if (fimT < iniT && hFim <= fimT && dIni === dFim) end.setDate(end.getDate() + 1);
    else if (hFim < hIni && dIni === dFim) end.setDate(end.getDate() + 1);

    if (!start || !end || end <= start) { showModal('erro', 'Horário inválido', 'Hora Final deve ser após Inicial.'); return; }

    const durMin = (end - start) / 60000;
    if (durMin > 720) { showModal('erro', 'Duração Excedida', 'Máximo 12 horas.'); return; }

    let shiftStart = parseDateTime(dIni, iniT);
    let shiftEnd = parseDateTime(dIni, fimT);
    if (fimT < iniT) shiftEnd.setDate(shiftEnd.getDate() + 1);

    if (!window.isProdutoIsento(prod)) {
      if (start < shiftStart || end > shiftEnd) { showModal('erro', 'Fora do Turno', `Período deve estar entre ${iniT} e ${fimT}.`); return; }
    }

    // Se passou tudo — apenas exibe aviso visual, os botões já estão visíveis
    showModal('sucesso', 'Apontamento Válido!', 'Os dados estão corretos. Clique em <b>Confirmar</b> para registrar.');
  };

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 13 — CONFIRMAR PRODUÇÃO
  // Valida todos os campos, exibe resumo de confirmação e, após
  // aprovação do operador, grava em state.produções[].
  // Após gravar: chama limparFormProd(hFim) para continuidade inteligente
  //   (hFim torna-se o novo hIni do próximo registro).
  // Regras verificadas:
  //   ✔ Credenciais válidas  ✔ Produto existente  ✔ Recurso existente
  //   ✔ Quantidade > 0       ✔ Horário dentro do turno
  //   ✔ Duração ≤ 720 min   ✔ Cadência (ritmo) razoável
  // ══════════════════════════════════════════════════════════════════
  window.confirmarProd = function () {
    const op = document.getElementById('p-op').value.trim();
    const prod = document.getElementById('p-produto').value.trim().toUpperCase();
    const rCod = document.getElementById('p-recurso-cod').value.trim().toUpperCase();
    const dIni = document.getElementById('p-data-ini').value.trim();
    const hIni = document.getElementById('p-hora-ini').value.trim();
    let dFim = document.getElementById('p-data-fim').value.trim();
    const hFim = document.getElementById('p-hora-fim').value.trim();

    const prodData = db.produtos[prod];
    const um = prodData ? (prodData.um || '').toUpperCase() : '';
    const isDecimalAllowed = (um === 'KG' || um === 'M' || um === 'MT');
    const qtdStr = document.getElementById('p-qtd').value;
    const qtd = qtdStr === '' ? NaN : (isDecimalAllowed ? parseFloat(qtdStr) : parseInt(qtdStr, 10)) || 0;
    const ret = parseInt(document.getElementById('p-qtd-ret').value, 10) || 0;
    const setup = parseInt(document.getElementById('p-setup').value, 10) || 0;
    const rnc = parseInt(document.getElementById('p-rnc').value, 10) || 0;
    const cestos = parseInt(document.getElementById('p-cestos').value) || 1;
    const peso = parseFloat(document.getElementById('p-peso').value) || 0;

    const matricula = document.getElementById('p-matricula').value.trim();
    const shiftVal = document.getElementById('p-turno').value;
    const turnoInfo = shiftVal.split('|');
    const iniT = turnoInfo[1], fimT = turnoInfo[2];

    // ─── VALIDAÇÃO 1: IDENTIFICAÇÃO ───────────────────────────
    if (!matricula) { showModal('erro', 'ERRO: Operador', 'A matrícula do operador é obrigatória.'); return; }
    if (matricula.length !== 6) { showModal('erro', 'ERRO: Operador', 'A matrícula do operador deve ter exatamente 6 números.'); return; }
    const userExists = window.COLABORADORES.hasOwnProperty(matricula);
    if (!userExists) { showModal('erro', 'ERRO: Acesso', 'Usuário não encontrado.'); return; }
    if (!prod || !db.produtos[prod]) { showModal('erro', 'ERRO: Produto', 'Código do produto inválido ou não encontrado.'); return; }
    if (window.produtoRequerOP(prod) && !op) { showModal('erro', 'ERRO: O.P. Obrigatória', 'Para este produto é obrigatório informar a Ordem de Produção (O.P.).'); return; }
    if (op && !db.ops[op]) { showModal('erro', 'ERRO: O.P.', 'Ordem de Produção não encontrada no cadastro.'); return; }
    if (!rCod || !db.recursos[rCod]) { showModal('erro', 'ERRO: Recurso/Máquina', 'Máquina não encontrada no cadastro.'); return; }
    if (qtd <= 0) { showModal('erro', 'ERRO: Quantidade', 'A quantidade produzida deve ser maior que zero.'); return; }

    // ─── VALIDAÇÃO 2: PERÍODO E TURNO ─────────────────────────
    if (!dIni || !hIni || !dFim || !hFim) { showModal('erro', 'ERRO: Período', 'Preencha todos os campos de Data e Hora.'); return; }
    if (!isValidTimeStr(hIni) || !isValidTimeStr(hFim)) { showModal('erro', 'ERRO: Hora', 'Formato de hora inválido (Use HH:MM).'); return; }

    const dIniErr = window.checkDateLimit(dIni);
    if (dIniErr) { showModal('erro', 'ERRO: Data Inicial', dIniErr); return; }
    const dFimErr = window.checkDateLimit(dFim);
    if (dFimErr) { showModal('erro', 'ERRO: Data Final', dFimErr); return; }

    const start = parseDateTime(dIni, hIni);
    if (fimT < iniT && hIni <= fimT) start.setDate(start.getDate() + 1);

    let end = parseDateTime(dFim, hFim);
    if (fimT < iniT && hFim <= fimT && dIni === dFim) {
      end.setDate(end.getDate() + 1);
      const d = String(end.getDate()).padStart(2, '0');
      const m = String(end.getMonth() + 1).padStart(2, '0');
      const y = end.getFullYear();
      dFim = `${d}/${m}/${y}`;
      document.getElementById('p-data-fim').value = dFim;
    } else if (hFim < hIni && dIni === dFim) {
      end.setDate(end.getDate() + 1);
      const d = String(end.getDate()).padStart(2, '0');
      const m = String(end.getMonth() + 1).padStart(2, '0');
      const y = end.getFullYear();
      dFim = `${d}/${m}/${y}`; // Atualiza a variável local para o envio
      document.getElementById('p-data-fim').value = dFim; // Atualiza o campo na tela
    }
    if (!start || !end || end <= start) { showModal('erro', 'ERRO: Horário', 'A Hora Final deve ser maior que a Hora Inicial.'); return; }

    const durMin = (end - start) / 60000;
    if (durMin > 720) { showModal('erro', 'ERRO: Duração', 'Um único apontamento não pode exceder 12 horas.'); return; }

    const shiftStart = parseDateTime(dIni, iniT);
    let shiftEnd = parseDateTime(dIni, fimT);
    if (fimT < iniT) shiftEnd.setDate(shiftEnd.getDate() + 1);

    const isentoProd = window.isProdutoIsento(prod);

    if (!isentoProd) {
      if (start < shiftStart) { showModal('erro', 'ERRO: Fora do Turno', `Início (${hIni}) é anterior ao início do turno (${iniT}).`); return; }
      if (end > shiftEnd) { showModal('erro', 'ERRO: Fora do Turno', `Fim (${hFim}) ultrapassa o fim do turno (${fimT}).`); return; }
    }

    // Não pode sobrepor outra PRODUÇÃO (mesmo horário e máquina) - DESATIVADO 
    /*
    const overProd = state.produções.find(p => {
      if (p.recursoCod !== rCod || p.shiftKey !== turnoInfo[0] || p.dIni !== dIni) return false;
      if (window.isProdutoIsento(p.produto) || isentoProd) return false;
      const s2 = parseDateTime(p.dIni, p.hIni), e2 = parseDateTime(p.dFim, p.hFim);
      return Math.max(start, s2) < Math.min(end, e2);
    });
    if (overProd) { showModal('erro', 'ERRO: Sobreposição', `Já existe outra PRODUÇÃO registrada para esta máquina entre ${overProd.hIni} e ${overProd.hFim}.`); return; }
    */

    // ─── VALIDAÇÃO 4: RITMO ───────────────────────────────────
    if (qtd / durMin > 250) {
      showModal('aviso', 'AVISO: Ritmo Elevado', `Produção de ${Math.round(qtd / durMin * 60)} pç/h detectada. Confirme se a quantidade está correta.`);
    }

    // ─── CONFIRMAÇÃO ──────────────────────────────────────────
    const htmlConfirm = `
                    <div class="confirm-summary">
                        <h4>Resumo do Apontamento</h4>
                        <p><span>Máquina:</span> <b>${rCod}</b></p>
                        <p><span>Produto:</span> <b>${prod}</b></p>
                        <p><span>Turno:</span> <b>${iniT} às ${fimT}</b></p>
                        <p><span>Data:</span> <b>${dIni === dFim ? dIni : `${dIni} a ${dFim}`}</b></p>
                        <p><span>Horário:</span> <b>${hIni} às ${hFim}</b></p>
                        <p><span>Quantidade:</span> <b>${qtd} peças</b></p>
                    </div>
                `;

    showModal('confirm', 'Confirmar Registro?', htmlConfirm, async () => {
      const prodDesc = db.produtos[prod] ? db.produtos[prod].descricao : '';
      const recProd = { matricula, op, produto: prod, desc: prodDesc, recursoCod: rCod, recurso: db.recursos[rCod] || '', dIni, hIni, dFim, hFim, qtd, ret, setup, rnc, cestos, shiftKey: turnoInfo[0], peso };
      const submissionKey = getSubmissionKey('producao', recProd);
      if (pendingSubmissions.has(submissionKey)) {
        showModal('aviso', 'Envio em Andamento', 'Este apontamento ja esta sendo enviado. Aguarde a resposta antes de qualquer acao.');
        return;
      }
      pendingSubmissions.add(submissionKey);
      state.produções.push(recProd);

      // Bloquear botão e mostrar overlay
      const btnConfirm = document.getElementById('p-btn-confirmar');
      const originalBtnHtml = btnConfirm.innerHTML;
      btnConfirm.disabled = true;
      btnConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

      const overlay = document.getElementById('fullLoadingOverlay');
      overlay.classList.add('active');

      // Enviar para API
      const apiRes = await enviarParaAPI(recProd, 'producao');
      pendingSubmissions.delete(submissionKey);

      // Oculta a tela de carregamento e restaura botão
      overlay.classList.remove('active');
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = originalBtnHtml;

      syncLists();

      let title = '';
      let modalType = '';
      let msg = '';

      if (apiRes.success) {
        window._retryProd = 0;
        title = 'Registro Lançado';
        modalType = 'sucesso';
        msg = `<div style="text-align:center; padding:10px;">
                     <i class="fas fa-check-circle" style="font-size:3rem; color:var(--green); margin-bottom:15px;"></i>
                     <h3 style="color:var(--text); margin-bottom:10px; text-transform:uppercase;">Apontamento Realizado com Sucesso</h3>
                     <p style="color:var(--mid); font-size:0.95rem;">O registro foi salvo no sistema.</p>
                   </div>
                   <div style="background:var(--green2); color:var(--green); padding:12px; border-radius:8px; margin-bottom:12px; font-size:13px; border-left:4px solid var(--green); text-align:center;">
                      <b>Você já pode retornar ao seu trabalho.</b>
                   </div>`;

        msg += `<div style="background:var(--yellow); color:var(--text); padding:10px; border-radius:8px; font-size:13px; border-left:4px solid var(--f59e0b); margin-top: 12px;">
                                 <i class="fas fa-sign-out-alt"></i> <b>Lembrete:</b> Não esqueça de <b>sair</b> do sistema após finalizar seus apontamentos.
                             </div>`;

        showModal(modalType, title, msg, null, true, null, () => limparFormProd());
      } else {
        window._retryProd = 0;
        title = buildFriendlyErrorTitle(apiRes);
        modalType = 'erro';
        msg = buildFriendlyErrorHTML(apiRes);
        showModal(modalType, title, msg);
        return;

        if (false && window._retryProd >= 3) {
          // retries desativados para evitar duplicidade
        } else {
          // ...
        }
      }
    });
  };

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 14 — TESTAR PARADA
  // Mesmo comportamento do testarProd, mas para a tela de Parada.
  // Valida sem gravar. Uso: botão [Testar] na tela de Parada.
  // ══════════════════════════════════════════════════════════════════
  window.testarParada = function () {
    const motCod = document.getElementById('s-motivo-cod').value.trim().toUpperCase();
    const rCod = document.getElementById('s-recurso-cod').value.trim().toUpperCase();
    const dIni = document.getElementById('s-data-ini').value;
    const hIni = document.getElementById('s-hora-ini').value;
    const dFim = document.getElementById('s-data-fim').value;
    const hFim = document.getElementById('s-hora-fim').value;

    const matricula = document.getElementById('s-matricula').value.trim();
    const turnoInfo = document.getElementById('s-turno').value.split('|');
    if (turnoInfo.length < 3) { showModal('erro', 'Turno', 'Selecione um turno válido.'); return; }
    const iniT = turnoInfo[1], fimT = turnoInfo[2];

    const prodPar = document.getElementById('s-produto').value.trim().toUpperCase();
    if (!matricula) { showModal('erro', 'Operador', 'Preencha a matrícula.'); return; }
    const userExistsStop = window.COLABORADORES.hasOwnProperty(matricula);
    if (!userExistsStop) { showModal('erro', 'Acesso Negado', 'Usuário não encontrado.'); return; }
    if (!motCod || !db.motivos[motCod]) { showModal('erro', 'Motivo', 'Selecione um motivo válido.'); return; }
    if (!prodPar || !db.produtos[prodPar]) { showModal('erro', 'Produto Obrigatório', 'Informe o código do produto da parada.'); return; }
    if (!rCod || !db.recursos[rCod]) { showModal('erro', 'Recurso', 'Máquina não encontrada.'); return; }
    if (!dIni || !hIni || !dFim || !hFim) { showModal('erro', 'Período', 'Preencha datas/horas.'); return; }

    const dIniErr = window.checkDateLimit(dIni);
    if (dIniErr) { showModal('erro', 'Data Inicial', dIniErr); return; }
    const dFimErr = window.checkDateLimit(dFim);
    if (dFimErr) { showModal('erro', 'Data Final', dFimErr); return; }

    const start = parseDateTime(dIni, hIni);
    if (fimT < iniT && hIni <= fimT) start.setDate(start.getDate() + 1);

    let end = parseDateTime(dFim, hFim);
    if (fimT < iniT && hFim <= fimT && dIni === dFim) end.setDate(end.getDate() + 1);
    else if (hFim < hIni && dIni === dFim) end.setDate(end.getDate() + 1);

    if (!start || !end || end <= start) { showModal('erro', 'Horário', 'Inválido.'); return; }

    const durMin = (end - start) / 60000;
    let shiftStart = parseDateTime(dIni, iniT);
    let shiftEnd = parseDateTime(dIni, fimT);
    if (fimT < iniT) shiftEnd.setDate(shiftEnd.getDate() + 1);

    if (start < shiftStart || end > shiftEnd) { showModal('erro', 'Fora do Turno', `Período deve estar entre ${iniT} e ${fimT}.`); return; }

    // Se passou tudo — apenas exibe aviso visual, os botões já estão visíveis
    showModal('sucesso', 'Apontamento Válido!', 'Os dados estão corretos. Clique em <b>Confirmar</b> para registrar.');
  };

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 15 — CONFIRMAR PARADA
  // Valida, exibe resumo e grava em state.paradas[].
  // Após gravar: chama limparFormParada(hFim) — lógica de pulo:
  //   mantém produto e recurso, avança a hora inicial automaticamente.
  // Regras verificadas:
  //   ✔ Credenciais válidas  ✔ Motivo existente   ✔ Produto obrigatório
  //   ✔ Recurso existente    ✔ Duração > 5 min    ✔ Duração ≤ 720 min
  //   ✔ Horário dentro do turno
  // ══════════════════════════════════════════════════════════════════
  window.confirmarParada = function () {
    const motCod = document.getElementById('s-motivo-cod').value.trim().toUpperCase();
    const op = document.getElementById('s-op').value.trim();
    const rCod = document.getElementById('s-recurso-cod').value.trim().toUpperCase();
    const dIni = document.getElementById('s-data-ini').value.trim();
    const hIni = document.getElementById('s-hora-ini').value.trim();
    let dFim = document.getElementById('s-data-fim').value.trim();
    const hFim = document.getElementById('s-hora-fim').value.trim();

    const matricula = document.getElementById('s-matricula').value.trim();
    const shiftVal = document.getElementById('s-turno').value;
    const turnoInfo = shiftVal.split('|');
    const iniT = turnoInfo[1], fimT = turnoInfo[2];
    const prodPar = document.getElementById('s-produto').value.trim().toUpperCase();

    // ─── VALIDAÇÃO 1: IDENTIFICAÇÃO ───────────────────────────
    if (!matricula) { showModal('erro', 'ERRO: Operador', 'Identifique-se com sua matrícula.'); return; }
    if (matricula.length !== 6) { showModal('erro', 'ERRO: Operador', 'A matrícula deve ter exatamente 6 números.'); return; }
    const userExistsConfirmStop = window.COLABORADORES.hasOwnProperty(matricula);
    if (!userExistsConfirmStop) { showModal('erro', 'ERRO: Acesso', 'Usuário não encontrado.'); return; }
    if (op && !db.ops[op]) { showModal('erro', 'ERRO: O.P.', 'Ordem de Produção não encontrada no cadastro.'); return; }
    if (!motCod || !db.motivos[motCod]) { showModal('erro', 'ERRO: Motivo', 'Selecione um motivo de parada válido.'); return; }
    if (!prodPar || !db.produtos[prodPar]) { showModal('erro', 'ERRO: Produto', 'Informe o código do produto da parada.'); return; }
    if (!rCod || !db.recursos[rCod]) { showModal('erro', 'ERRO: Recurso', 'Máquina/Recurso não encontrado.'); return; }

    // ─── VALIDAÇÃO 2: PERÍODO E TURNO ─────────────────────────
    if (!dIni || !hIni || !dFim || !hFim) { showModal('erro', 'ERRO: Período', 'Preencha as datas e horários.'); return; }
    if (!isValidTimeStr(hIni) || !isValidTimeStr(hFim)) { showModal('erro', 'ERRO: Hora', 'Use o formato HH:MM (ex: 14:30).'); return; }

    const dIniErr = window.checkDateLimit(dIni);
    if (dIniErr) { showModal('erro', 'ERRO: Data Inicial', dIniErr); return; }
    const dFimErr = window.checkDateLimit(dFim);
    if (dFimErr) { showModal('erro', 'ERRO: Data Final', dFimErr); return; }

    const start = parseDateTime(dIni, hIni);
    if (fimT < iniT && hIni <= fimT) start.setDate(start.getDate() + 1);

    let end = parseDateTime(dFim, hFim);
    if (fimT < iniT && hFim <= fimT && dIni === dFim) {
      end.setDate(end.getDate() + 1);
      const d = String(end.getDate()).padStart(2, '0');
      const m = String(end.getMonth() + 1).padStart(2, '0');
      const y = end.getFullYear();
      dFim = `${d}/${m}/${y}`;
      document.getElementById('s-data-fim').value = dFim;
    } else if (hFim < hIni && dIni === dFim) {
      end.setDate(end.getDate() + 1);
      const d = String(end.getDate()).padStart(2, '0');
      const m = String(end.getMonth() + 1).padStart(2, '0');
      const y = end.getFullYear();
      dFim = `${d}/${m}/${y}`; // Atualiza a variável local para o envio
      document.getElementById('s-data-fim').value = dFim; // Atualiza o campo na tela
    }
    if (!start || !end || end <= start) { showModal('erro', 'ERRO: Horário', 'A Hora Final deve ser maior que a Hora Inicial.'); return; }

    const durMin = (end - start) / 60000;
    if (durMin > 720) { showModal('erro', 'ERRO: Duração', 'Uma parada não pode exceder 12 horas.'); return; }
    if (durMin <= 5) { showModal('erro', 'ERRO: Parada Curta', `Paradas de 5 min ou menos não devem ser registradas.`); return; }

    const shiftStart = parseDateTime(dIni, iniT);
    let shiftEnd = parseDateTime(dIni, fimT);
    if (fimT < iniT) shiftEnd.setDate(shiftEnd.getDate() + 1);

    if (start < shiftStart || end > shiftEnd) { showModal('erro', 'ERRO: Fora do Turno', `A parada deve estar dentro do horário do turno (${iniT}-${fimT}).`); return; }

    // Não pode sobrepor outra PARADA (mesmo horário e máquina) - DESATIVADO
    /*
    const overStop = state.paradas.find(s => {
      if (s.recursoCod !== rCod || s.shiftKey !== turnoInfo[0] || s.dIni !== dIni) return false;
      const s2 = parseDateTime(s.dIni, s.hIni), e2 = parseDateTime(s.dFim, s.hFim);
      return Math.max(start, s2) < Math.min(end, e2);
    });
    if (overStop) { showModal('erro', 'ERRO: Sobreposição', `Já existe outra PARADA registrada para esta máquina entre ${overStop.hIni} e ${overStop.hFim}.`); return; }
  
    const totalShiftMin = (shiftEnd - shiftStart) / 60000;
    const currentStopTotal = state.paradas
      .filter(s => s.recursoCod === rCod && s.shiftKey === turnoInfo[0] && s.dIni === dIni)
      .reduce((acc, s) => acc + (parseDateTime(s.dIni, s.hFim) - parseDateTime(s.dIni, s.hIni)) / 60000, 0);
  
    if (currentStopTotal + durMin > totalShiftMin) {
      showModal('erro', 'ERRO: Impossível', `A soma das paradas (${Math.round(currentStopTotal + durMin)} min) não pode ser maior que o tempo do turno (${totalShiftMin} min).`);
      return;
    }
    */

    // ─── CONFIRMAÇÃO ──────────────────────────────────────────
    const htmlConfirm = `
                    <div class="confirm-summary">
                        <h4>Resumo da Parada</h4>
                        <p><span>Máquina:</span> <b>${rCod}</b></p>
                        <p><span>Produto:</span> <b>${prodPar}</b></p>
                        <p><span>Turno:</span> <b>${iniT} às ${fimT}</b></p>
                        <p><span>Data:</span> <b>${dIni === dFim ? dIni : `${dIni} a ${dFim}`}</b></p>
                        <p><span>Horário:</span> <b>${hIni} às ${hFim}</b></p>
                        <p><span>Motivo:</span> <b>${motCod}</b></p>
                        <p><span>Duração:</span> <b>${durMin} minutos</b></p>
                    </div>
                `;

    showModal('confirm', 'Confirmar Parada?', htmlConfirm, async () => {
      const recStop = { matricula, motCod, motDesc: db.motivos[motCod] || '', op, produto: prodPar, recursoCod: rCod, dIni, hIni, dFim, hFim, shiftKey: turnoInfo[0] };
      const submissionKey = getSubmissionKey('parada', recStop);
      if (pendingSubmissions.has(submissionKey)) {
        showModal('aviso', 'Envio em Andamento', 'Esta parada ja esta sendo enviada. Aguarde a resposta antes de qualquer acao.');
        return;
      }
      pendingSubmissions.add(submissionKey);
      state.paradas.push(recStop);

      // Bloquear botão e mostrar overlay
      const activeBtn = document.querySelector('.screen.active .btn-primary');
      const originalBtnHtml = activeBtn ? activeBtn.innerHTML : '';
      if (activeBtn) {
        activeBtn.disabled = true;
        activeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
      }

      const overlay = document.getElementById('fullLoadingOverlay');
      overlay.classList.add('active');

      // Enviar para API
      const apiRes = await enviarParaAPI(recStop, 'parada');
      pendingSubmissions.delete(submissionKey);

      // Oculta a tela de carregamento e restaura botão
      overlay.classList.remove('active');
      if (activeBtn) {
        activeBtn.disabled = false;
        activeBtn.innerHTML = originalBtnHtml;
      }

      syncLists();

      let title = '';
      let modalType = '';
      let msg = '';

      if (apiRes.success) {
        window._retryParada = 0;
        title = 'Registro Lançado';
        modalType = 'sucesso';
        msg = `<div style="text-align:center; padding:10px;">
                     <i class="fas fa-check-circle" style="font-size:3rem; color:var(--green); margin-bottom:15px;"></i>
                     <h3 style="color:var(--text); margin-bottom:10px; text-transform:uppercase;">Apontamento Realizado com Sucesso</h3>
                     <p style="color:var(--mid); font-size:0.95rem;">A parada foi salva no sistema.</p>
                   </div>
                   <div style="background:var(--green2); color:var(--green); padding:12px; border-radius:8px; margin-bottom:12px; font-size:13px; border-left:4px solid var(--green); text-align:center;">
                      <b>Você já pode retornar ao seu trabalho.</b>
                   </div>`;

        msg += `<div style="background:var(--yellow); color:var(--text); padding:10px; border-radius:8px; font-size:13px; border-left:4px solid var(--f59e0b); margin-top: 12px;">
                                <i class="fas fa-sign-out-alt"></i> <b>Lembrete:</b> Não esqueça de <b>sair</b> do sistema após finalizar seus apontamentos.
                            </div>`;

        showModal(modalType, title, msg, null, true, null, () => limparFormParada());
      } else {
        window._retryParada = 0;
        title = buildFriendlyErrorTitle(apiRes);
        modalType = 'erro';
        msg = buildFriendlyErrorHTML(apiRes);
        showModal(modalType, title, msg);
        return;

        if (false && window._retryParada >= 3) {
          // retries desativados para evitar duplicidade
        } else {
          // ...
        }
      }
    });
  };

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 16 — RENDERIZAÇÃO DAS LISTAS DE HISTÓRICO
  // renderProdLista / renderParadaLista:
  //   Filtram state por turno + data + recurso e renderizam na tabela.
  // removeProd / removeParada:
  //   Removem um item do state pelo índice e chamam syncLists.
  // ══════════════════════════════════════════════════════════════════
  function renderProdLista(turno, data, recurso) {
    const body = document.getElementById('prod-lista-body');
    body.innerHTML = '';
    const filtrados = state.produções.filter(p =>
      (!turno || p.shiftKey === turno.split('|')[0]) &&
      (!data || p.dIni === data) &&
      (!recurso || p.recursoCod === recurso)
    );
    filtrados.forEach((p, i) => {
      const realIndex = state.produções.indexOf(p);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${p.op}</td><td>${p.produto || '—'}</td><td>${p.recursoCod}</td><td>${p.hIni}</td><td>${p.hFim}</td><td>${p.qtd.toFixed(2)}</td><td>${p.ret.toFixed(2)}</td><td>${p.setup.toFixed(2)}</td><td>${p.rnc.toFixed(2)}</td><td></td>`;
      body.appendChild(tr);
    });
    document.getElementById('prod-lista-wrap').style.display = filtrados.length ? '' : 'none';
  }
  function renderParadaLista(turno, data, recurso) {
    const body = document.getElementById('parada-lista-body');
    body.innerHTML = '';
    const filtrados = state.paradas.filter(p =>
      (!turno || p.shiftKey === turno.split('|')[0]) &&
      (!data || p.dIni === data) &&
      (!recurso || p.recursoCod === recurso)
    );
    filtrados.forEach((p, i) => {
      const realIndex = state.paradas.indexOf(p);
      const s = parseDateTime(p.dIni, p.hIni);
      const e = parseDateTime(p.dFim, p.hFim);
      const dur = s && e ? Math.round((e - s) / 60000) + ' min' : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${p.motCod}</td><td>${p.op || '—'}</td><td>${p.recursoCod}</td><td>${p.hIni}</td><td>${p.hFim}</td><td>${dur}</td><td></td>`;
      body.appendChild(tr);
    });
    document.getElementById('parada-lista-wrap').style.display = filtrados.length ? '' : 'none';
  }
  window.removeProd = i => { state.produções.splice(i, 1); syncLists(); };
  window.removeParada = i => { state.paradas.splice(i, 1); syncLists(); };

  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 17 — LIMPEZA DOS FORMULÁRIOS
  // limparFormProd(nextStart):
  //   Limpa campos de produção. Se nextStart informado, preenche
  //   hora-ini com esse valor (continuidade inteligente).
  // limparFormParada(nextStart):
  //   Limpeza parcial — MANTÉM produto e recurso (lógica de pulo).
  //   Preenche hora-ini com nextStart se informado.
  // limparFormParadaCompleto():
  //   Limpeza total — apaga todos os campos inclusive produto.
  //   Chamado pelo botão [Limpar] manual.
  // ══════════════════════════════════════════════════════════════════
  window.limparFormProd = function () {
    // Manter matrícula, senha e nome do operador após o apontamento (conforme solicitado pelo usuário)
    ['p-op', 'p-produto', 'p-desc', 'p-recurso-cod', 'p-recurso', 'p-qtd', 'p-qtd-ret', 'p-setup', 'p-rnc', 'p-cestos', 'p-hora-ini', 'p-hora-fim', 'p-peso'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    updateZinkUI();
    validateLive(true);
  };
  window.limparFormParada = function () {
    // Limpeza Parcial (Lógica de pulo): mantemos O.P., Produto e Recurso
    ['s-motivo-cod', 's-motivo-desc', 's-hora-ini', 's-hora-fim'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    validateLive(false);
  };

  // Limpar completo (para quando clicar em "Limpar" manualmente)
  window.limparFormParadaCompleto = function () {
    // Manter matrícula, senha e nome do operador também na parada
    ['s-op', 's-produto', 's-desc', 's-recurso-cod', 's-recurso', 's-motivo-cod', 's-motivo-desc', 's-hora-ini', 's-hora-fim'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    validateLive(false);
  };





  // ══════════════════════════════════════════════════════════════════
  // SEÇÃO 19 — NAVEGAÇÃO POR TECLADO (Enter)
  // Em qualquer campo de input/select:
  //   → Se há campo seguinte: avança o foco
  //   → Se é o último campo : dispara confirmarProd() ou confirmarParada()
  // Não interfere quando o foco já está em um <button>.
  // ══════════════════════════════════════════════════════════════════
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      // 1. Lidar com Modal Aberto
      const modal = document.getElementById('modalOverlay');
      if (modal.classList.contains('open')) {
        e.preventDefault();
        const btnPrimary = modal.querySelector('.btn-primary');
        const btnGhost = modal.querySelector('.btn-ghost');
        if (btnPrimary) btnPrimary.click();
        else if (btnGhost) btnGhost.click();
        return;
      }

      // Ignorar se o foco já estiver em um botão (deixa o comportamento padrão)
      if (e.target.tagName === 'BUTTON' || e.target.type === 'submit') return;

      const activeScreen = document.querySelector('.screen.active');
      if (!activeScreen || activeScreen.id === 'screen-home') return;

      // 2. Lidar com Campos do Formulário (Pular campos ou Confirmar no fim)
      const focusable = Array.from(activeScreen.querySelectorAll('input:not([readonly]):not([disabled]), select:not([disabled])'))
        .filter(el => el.type !== 'hidden' && el.offsetParent !== null);

      const index = focusable.indexOf(e.target);
      if (index > -1 && index < focusable.length - 1) {
        // Ainda há campos -> pula para o próximo
        e.preventDefault();
        focusable[index + 1].focus();
      } else if (index === focusable.length - 1 || index === -1) {
        // Último campo ou campo não listado (ex: fora da grade de foco padrão) -> confirma
        e.preventDefault();
        if (activeScreen.id === 'screen-prod') {
          window.confirmarProd();
        } else if (activeScreen.id === 'screen-parada') {
          window.confirmarParada();
        }
      }
    }
  });

})();

// ══════════════════════════════════════════════════════════════════
// SEÇÃO 20 — SERVICE WORKER (Modo Offline / PWA)
// Registra o arquivo sw.js para cache dos assets.
// Permite uso do app sem conexão com a internet.
// ══════════════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registrado', reg))
      .catch(err => console.log('Erro SW', err));
  });
}

// MONITOR DE CONEXÃO REMOVIDO PARA EVITAR FALSOS POSITIVOS
// O app não ficará pingando o servidor constantemente.

// ==========================================================================
// OFFLINE BANNER LOGIC (Real-time Network Monitor via Ping)
// ==========================================================================
(function() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  
  let isOffline = false;
  let onlineTimeout;

  function showOffline() {
    if (isOffline) return; // Prevent DOM thrashing
    isOffline = true;
    clearTimeout(onlineTimeout);
    banner.className = 'offline-banner active offline';
    banner.innerHTML = '<i class="fas fa-wifi-slash"></i><span id="offline-banner-text">Sem conexão com o servidor. O envio está bloqueado.</span>';
  }

  function showOnline() {
    if (!isOffline) return; // Se já estava online, não faz a animação verde de novo
    isOffline = false;
    
    banner.className = 'offline-banner active online';
    banner.innerHTML = '<i class="fas fa-wifi"></i><span id="offline-banner-text">Conexão Restabelecida!</span>';
    
    clearTimeout(onlineTimeout);
    onlineTimeout = setTimeout(() => {
      banner.classList.remove('active');
    }, 3000);
    
    if (typeof syncLists === 'function') {
      setTimeout(syncLists, 1000);
    }
  }

    // Monitor Passivo: Escuta Eventos Nativos de Hardware (HTML5)
  // Revertido a pedido do usuário para teste nativo no tablet.
  window.addEventListener('offline', showOffline);
  
  window.addEventListener('online', () => {
    showOnline();
  });

  // Verificação inicial ao carregar a página
  window.addEventListener('DOMContentLoaded', () => {
    if (!navigator.onLine) {
      showOffline();
    }
  });
})();
