# Architecture Decision Records (ADR)

Este arquivo documenta as principais decisões arquiteturais do projeto Apontamento de Produção.

---

## [ADR-001] Separação Monolítica e Adoção de Arquitetura LAMP (v2.0.0)

**Data:** 2026-05-07
**Contexto:** A aplicação original consistia em um `index.html` de mais de 5.000 linhas contendo marcação, CSS e regras de negócios JavaScript. Esse formato dificultava a manutenção, versionamento e escalabilidade do projeto. Além disso, a aplicação fazia requisições HTTP REST diretamente para a intranet do ERP (`192.168.8.21:20080`), o que gerava bloqueios de Mixed Content ao tentar servir o PWA de forma segura (HTTPS) para a web pública.

**Decisão:**
1. Desmembrar a aplicação em estáticos (`/assets/css/` e `/assets/js/`).
2. Introduzir um Proxy PHP (`/api/proxy.php`) servido no servidor web (LAMP).
3. Alterar os apontamentos do front-end (`app.js`) para apontar para o proxy, transferindo o peso da comunicação com a intranet para o backend em PHP.

**Consequências:**
- **Positivas:** Permite servir o site principal via HTTPS sem erros CORS ou Mixed Content. O IP interno e a topologia de rede ficam ocultos dos clientes web. Facilita a manutenção através da divisão de responsabilidades.
- **Negativas:** Exige um servidor PHP operante, perdendo a característica "serverless" do PWA estático inicial.

---

## [ADR-002] Estratégia de Invalidação de Cache Dinâmica (v2.0.0)

**Data:** 2026-05-07
**Contexto:** Arquivos essenciais como `produtos.js` e `ops.js` estavam sendo fortemente cacheados pelos navegadores dos dispositivos móveis do chão de fábrica (Chrome/Safari iOS). Isso gerava disparidades, pois a produção visualizava e apontava para OPs que já haviam sido encerradas ou alteradas.

**Decisão:**
1. Adicionar regras severas de controle no `.htaccess`.
2. Substituir as tags estáticas `<script>` no final do HTML por um carregador dinâmico sequencial escrito em JavaScript nativo.
3. Este carregador adiciona a query string `?v=[timestamp]` aos arquivos DB antes de anexá-los ao DOM, impossibilitando a leitura pelo cache local.

**Consequências:**
- **Positivas:** Operadores *sempre* consumirão a carga de dados exata do momento em que recarregam a página.
- **Negativas:** Leve aumento no consumo de banda na rede Wi-Fi interna da fábrica, dado que scripts extensos (como `produtos.js` de ~2MB) serão trafegados em todo refresh.

---

## [ADR-003] Regras de Validação Dinâmica de Quantidades e Peso por Unidade de Medida (v2.0.1)

**Data:** 2026-05-19
**Contexto:** O sistema original permitia qualquer caractere numérico e decimal no campo de quantidade produzida (`p-qtd`), sem validar se o produto selecionado aceitava valores fracionários. Isso causava erros operacionais, como apontar frações de peças (ex: `0.5 PC`), o que gerava inconsistências na integração com o ERP.

**Decisão:**
1. Habilitar dinamicamente a validação de decimais ou inteiros no campo de Quantidade Produzida com base na Unidade de Medida (`um`) do produto.
2. Criar uma lista branca de UMs que admitem ponto decimal (`KG`, `M`, `MT`). Todas as demais UMs (como `PC` e `UN`) são tratadas estritamente como inteiras.
3. Bloquear o caractere vírgula (`,`) em tempo real em todos os inputs decimais, aceitando apenas ponto (`.`).
4. Mudar o tratamento do campo `p-peso` para usar `parseFloat` ao invés de `parseInt`, permitindo pesos fracionários e arredondando para cima (`Math.ceil`).
5. Configurar `step`, `placeholder` e `inputmode` dinamicamente para melhor acessibilidade.

**Consequências:**
- **Positivas:** Redução de erros de digitação no chão de fábrica; validação reativa e imediata na interface; cálculo preciso da produção por pesagem.
- **Negativas:** Exige sincronização precisa da UM no arquivo `produtos.js` exportado do ERP.

---

## [ADR-004] Restrição de Matrícula e Validação Cruzada de O.P. (v2.0.1)

**Data:** 2026-05-19
**Contexto:** Matrícula sem comprimento fixo gerava logs confusos. O campo de OP aceitava qualquer número sem validação de existência real na base local.

**Decisão:**
1. Fixar comprimento da matrícula em exatamente 6 números (`maxlength="6"`).
2. Manter OP como opcional, mas validar contra `db.ops` se preenchida.

**Consequências:**
- **Positivas:** Prevenção antecipada de lançamentos incorretos; formato idêntico ao ERP Protheus.
- **Negativas:** Requer atualização regular do banco de OPs ativas (`ops.js`) no servidor.

---

## [ADR-005] Preenchimento Automático do Produto por O.P. em Tempo Real (v2.0.2)

**Data:** 2026-05-19
**Contexto:** Operador digitava O.P. e associava manualmente qualquer produto, gerando inconsistências no ERP.

**Decisão:**
1. Interceptar digitação no campo de O.P. via evento `input`.
2. Ao encontrar O.P. válida, preencher automaticamente **Produto** e **Descrição**.
3. Aplicar feedback visual (classe `.user-interacted` + `validateLive()`) imediato.

**Consequências:**
- **Positivas:** Elimina associação incorreta de produto à O.P.; UX otimizada.
- **Negativas:** Nenhuma identificada.

---

## [ADR-006] Fallback de Comunicação Resiliente no Proxy PHP (v2.0.3)

**Data:** 2026-05-20
**Contexto:** O `proxy.php` dependia exclusivamente da extensão `cURL`, que não estava ativada no servidor Apache/PHP, gerando erro 500 fatal.

**Decisão:**
1. Implementar verificação dinâmica com `extension_loaded('curl')`.
2. Se cURL ausente, usar `file_get_contents` com `stream_context_create`.
3. Capturar código HTTP de retorno via `$http_response_header`.

**Consequências:**
- **Positivas:** Proxy funciona em qualquer servidor PHP sem configurar extensões.
- **Negativas:** Nenhuma identificada.

---

## [ADR-007] Prevenção de Apontamentos Duplicados — Idempotência em 3 Camadas (v2.1.0)

**Data:** 2026-05-29
**Contexto:** Sem proteção contra envio de apontamentos duplicados. Em lentidão de rede, o mesmo apontamento podia ser enviado múltiplas vezes ao Protheus.

**Decisão:**
1. **Proxy (PHP):** Idempotência via SHA-256 + file locking exclusivo.
2. **Frontend:** `Set` de submissões em andamento (`pendingSubmissions`).
3. **Frontend:** Retry automático desativado.
4. Resposta "incerta" em falhas de rede: cacheia erro 409 por 15 min.

**Consequências:**
- **Positivas:** Garantia de nenhum apontamento duplicado, mesmo sem banco de dados.
- **Negativas:** Cache de 15 min pode bloquear reenvios legítimos dentro da janela.

---

## [ADR-008] Adequação do Manifest.json para PWABuilder (v2.1.1)

**Data:** 2026-06-02
**Contexto:** PWABuilder rejeitava o `manifest.json` por falta de campos obrigatórios.

**Decisão:**
1. Adicionar `lang`, `scope`, `orientation`, `categories`, `prefer_related_applications`.
2. Alterar `start_url` de relativo para absoluto.
3. Expandir `description`.

**Consequências:**
- **Positivas:** Manifest.json passa em todas as validações do PWABuilder/Bubblewrap.
- **Negativas:** Nenhuma identificada.

---

## [ADR-009] Escolha do Capacitor + Ionic Appflow para Geração de APK (v1.4.0)

**Data:** 2026-06-02
**Contexto:** O PWABuilder/Bubblewrap não conseguia gerar APK funcional porque a URL do app (`http://interno.progeral.com.br/Apps-testes/`) é interna (acessível apenas na rede da Progeral). O Bubblewrap precisa acessar a URL publicamente para gerar o Trusted Web Activity (TWA). O Ionic Appflow, por outro lado, compila o APK na nuvem a partir do código fonte e permite configurar uma URL interna no WebView.

**Decisão:**
1. Utilizar **Capacitor** como framework de container Android (substitui o Cordova).
2. Utilizar **Ionic Appflow** como serviço de Cloud Build (compila o APK sem necessidade de Android Studio).
3. Configurar `capacitor.config.json` com `server.url` apontando para a URL interna.
4. Manter `allowNavigation` para os IPs/domínios internos (`interno.progeral.com.br`, `192.168.8.21`).

**Consequências:**
- **Positivas:** APK funcional mesmo com URL interna; build na nuvem sem instalar Android Studio; mesmo repositório GitHub serve para código e build; distribuição via Headwind MDM.
- **Negativas:** Dependência de terceiros (Ionic Appflow) para compilar; o build falha se o repositório não estiver íntegro.

---

## [ADR-010] Abordagem de Responsividade Agressiva para Landscape (v1.4.5)

**Data:** 2026-06-03
**Contexto:** Em modo landscape (~1280x800), a altura disponível (~700px após chrome do navegador) era insuficiente para exibir todo o conteúdo dos formulários sem scroll vertical. A timeline visual, padding excessivo e fontes grandes contribuíam para o estouro vertical.

**Decisão:**
1. Criar media query específica para `(orientation: landscape) and (min-width: 900px)`.
2. Ocultar componente visual de timeline (não essencial para o preenchimento).
3. Reduzir drasticamente: padding de cards (`.45rem .7rem`), altura de inputs (`4px 7px`), fontes (`.72rem` labels `.55rem`), botões (`5px 12px`).
4. Reduzir header (`1rem`, logo `28px`).
5. Minimizar gaps e margens entre todos os elementos do formulário.

**Consequências:**
- **Positivas:** Todo o formulário cabe na viewport landscape sem scroll vertical ou horizontal.
- **Negativas:** Interface mais compacta, pode ser menos confortável para toque em tablets muito pequenos.

---

## [ADR-011] Estratégia de Versionamento e Deploy (v1.4.5)

**Data:** 2026-06-03
**Contexto:** O fluxo de atualização precisa ser claro: o APK é um container WebView que carrega o conteúdo do servidor interno. Mudanças em CSS/JS/HTML não exigem novo APK. Apenas mudanças na configuração do Capacitor, permissões Android ou manifesto exigem rebuild.

**Decisão:**
1. Manter versionamento semântico no `versionName` do `build.gradle`.
2. Incrementar `versionCode` a cada build do APK (para MDM identificar atualização).
3. Documentar explicitamente que alterações de front-end (CSS/JS/HTML) são aplicadas imediatamente no servidor interno, sem necessidade de novo APK.
4. Manter `.build/dist/index.html` como placeholder de redirecionamento no repositório (exigência do Ionic Appflow). `dist/` e `node_modules/` movidos para `.build/` para manter a raiz do projeto limpa ao copiar arquivos para o servidor interno.

**Consequências:**
- **Positivas:** Fluxo claro de deploy; MDM atualiza apenas quando necessário.
- **Negativas:** Requer disciplina para versionar corretamente.

---

## [ADR-012] Geração Automatizada de Ícones do App (v1.4.5)

**Data:** 2026-06-03
**Contexto:** O APK estava usando o ícone padrão do Capacitor (círculo azul com raio). O PWA estava usando ícones antigos. A equipe precisava de um método simples para trocar todos os ícones (Android + PWA) a partir de uma única imagem fonte.

**Decisão:**
1. Criar um script PowerShell que usa `System.Drawing` para redimensionar `icons/app-icon.jpg` (1024×1024) para todos os tamanhos necessários.
2. Gerar automaticamente: `ic_launcher.png`, `ic_launcher_round.png` (com corte circular via GraphicsPath) e `ic_launcher_foreground.png` para cada densidade mipmap (mdpi a xxxhdpi).
3. Gerar os ícones PWA (`icon-192.png` e `icon-512.png`) a partir da mesma fonte.

**Consequências:**
- **Positivas:** Troca de ícone centralizada — substitui um arquivo e executa o script. Consistência entre APK e PWA.
- **Negativas:** Depende do .NET Framework (`System.Drawing`) disponível no Windows.

---

## [ADR-013] Monitor de Conexão com Ping HTTP para WebView (v1.4.5)

**Data:** 2026-06-03
**Contexto:** O monitor de conexão original dependia exclusivamente de `navigator.onLine` e dos eventos `online`/`offline`. Em testes com o APK (Android WebView), desligar o WiFi não disparava o banner de offline — o WebView não refletia corretamente a perda de conectividade.

**Decisão:**
1. Manter `navigator.onLine` como primeira camada de detecção.
2. Adicionar uma segunda camada: ping HTTP periódico a cada 5s com `fetch('manifest.json', { method: 'HEAD' })` e timeout de 3s via `AbortController`.
3. Considerar offline se o ping falhar **ou** `navigator.onLine` for `false`.
4. Reduzir intervalo de polling de 10s para 5s para resposta mais rápida.

**Consequências:**
- **Positivas:** Detecção de perda de conexão funciona de forma confiável tanto em navegador quanto no APK WebView.
- **Negativas:** Leve tráfego adicional (1 requisição HEAD a cada 5s para `manifest.json`).

---

## [ADR-014] Font Awesome Local (Offline First) (v1.4.6)

**Data:** 2026-06-03
**Contexto:** O APK Android (WebView) carrega a URL interna `http://interno.progeral.com.br/Apps-testes/`. O Android WebView bloqueia requisições para domínios CDN públicos (como `cdnjs.cloudflare.com`) quando o APK não tem acesso à internet aberta ou quando a política de segurança do MDM restringe tráfego externo. Os ícones do Font Awesome simplesmente não apareciam no APK.

**Decisão:**
1. Remover todos os links para `cdnjs.cloudflare.com/ajax/libs/font-awesome/...` do `index.html` e `sw.js`.
2. Baixar o `all.min.css` do Font Awesome e salvar em `assets/css/fa/all.min.css`.
3. Baixar os 4 webfonts (woff2) e salvar em `assets/fonts/fa-*.woff2`.
4. Corrigir o path relativo no `all.min.css` de `url(../fonts/` (que resolve para `assets/css/fonts/`) para `url(../../fonts/` (que resolve para `assets/fonts/`).
5. Remover o script `fa-fallback` do HTML (não é mais necessário).
6. Remover as regras de fallback de ícones em `duvidas.css` que estavam ativas sem escopo e sobrescrevendo o Font Awesome.

**Consequências:**
- **Positivas:** Ícones funcionam no APK independentemente de rede externa. Zero dependência de CDN. Carregamento mais rápido (sem DNS lookup para CDN).
- **Negativas:** Aumento do repositório (~160KB em assets). Requer atualização manual do all.min.css se quiser versão mais nova do FA.

---

## [ADR-016] OP Obrigatória para Produtos com Sufixo E, TT ou J (v1.4.7)

**Data:** 2026-07-07
**Contexto:** Produtos cujo código termina com `E`, `TT` ou `J` representam operações especiais (ex: estamparia, tratamento térmico, jato) que exigem Ordem de Produção (OP) para rastreabilidade no ERP. Operadores estavam apontando produção nesses produtos sem informar a OP, gerando inconsistências.

**Decisão:**
1. Implementar `produtoRequerOP(codigo)` que retorna `true` se o código do produto terminar com `E`, `TT` ou `J`.
2. Implementar `toggleProdFieldsBlocked()` que desabilita todos os campos de produção (recurso, datas, horas, quantidades, botão confirmar) quando o produto exige OP e o campo está vazio.
3. Exibir banner vermelho no topo: *"Preencha uma O.P. válida para liberar os demais campos"*.
4. Bloquear o envio em `confirmarProd()` com modal de erro se a validação falhar.
5. Estilizar campos desabilitados com `opacity: 0.5`, `pointer-events: none` e `filter: grayscale(1)`.

**Consequências:**
- **Positivas:** Garantia de que produtos que exigem OP sempre terão uma OP associada. Feedback visual claro para o operador.
- **Negativas:** Nenhuma identificada.

---

## [ADR-017] Deploy Simplificado com Paramiko SFTP (v1.4.7)

**Data:** 2026-07-07
**Contexto:** O deploy anterior via tarball completo do projeto era lento (~79MB) e arriscado por sobrescrever arquivos de configuração do servidor (`.htaccess`) e pastas de build. O SSH interativo com senha não funcionava no ambiente de desenvolvimento (PowerShell não passa senha por pipe).

**Decisão:**
1. Criar `deploy.py` usando Paramiko (SFTP) que sobe apenas `app.js` e `main.css`.
2. Fazer backup local dos arquivos remotos atuais antes de sobrescrever (`backups/`).
3. Centralizar credenciais em `api/.env` (excluído do upload).
4. Criar wrapper `deploy.ps1` que verifica dependências e chama o Python.

**Consequências:**
- **Positivas:** Deploy em segundos (~130KB vs 79MB). Backup local permite reversão imediata. Configuração externa evita hardcode de senha. Não toca em arquivos de configuração do servidor.
- **Negativas:** Dependência de Python com Paramiko no ambiente de desenvolvimento.

---

## [ADR-015] Otimizações de Performance e Especificidade CSS (v1.4.6)

**Data:** 2026-06-03
**Contexto:** A tela de Dúvidas apresentava dois problemas: (1) os cards das seções estavam colados (sem espaçamento vertical) e (2) os ícones não apareciam. Ambos causados por conflitos de especificidade CSS introduzidos durante a restauração do CSS do backup v1.4.4. Além disso, não havia otimizações de renderização (will-change, content-visibility, carregamento deferido de fontes).

**Decisão:**
1. Restaurar `duvidas.css` a partir do backup v1.4.4.
2. Corrigir `.section { margin: 0 auto 32px }` para `#screen-duvidas .section` — o reset universal `#screen-duvidas * { margin: 0 }` tem especificidade maior que `.section` e anulava a margin.
3. Escopar regras de fallback de ícones com `.fa-fallback #screen-duvidas ...` para não interferirem quando o FA está carregando normalmente.
4. Remover `content-visibility: auto` das sections (interferia com accordion `overflow: hidden`).
5. Adicionar guard `if (event.request.method !== 'GET') return;` no fetch handler do service worker para evitar processar requisições POST/OPTIONS.
6. Adicionar `will-change: transform` em elementos animados (spinner, screens, overlay modal) para hints de composição.
7. Deferir carregamento do Google Fonts via `media="print" onload="this.media='all'"`.

**Consequências:**
- **Positivas:** Espaçamento correto entre cards de dúvidas; ícones aparecem; melhor performance de renderização; service worker não intercepta requisições não-GET.
- **Negativas:** Nenhuma identificada.

---

## [ADR-018] Implementação do Ping de Imagem Clássico (v2.0.0)

**Data:** 2026-08-06
**Contexto:** O uso da `Fetch API` para verificar conexão offline em arquivos estáticos ou chamadas HEAD gerava falsos positivos de CORS e bloqueios no servidor Apache, fazendo o aplicativo exibir alertas de "Sem Rede" mesmo quando o dispositivo estava conectado. O Android WebView e requisições OPTIONS/HEAD sofrem restrições rígidas no ambiente atual.

**Decisão:**
1. Substituir a Fetch API por um ping de imagem clássico (`new Image()`).
2. Tentar carregar uma imagem minúscula do servidor com timestamp para evitar cache (ex: `favicon.ico?v=123`).
3. Utilizar os eventos `onload` e `onerror` da imagem para inferir sucesso ou falha de conectividade de maneira assíncrona, robusta e imune a restrições de CORS.

**Consequências:**
- **Positivas:** Contorna restrições de CORS e do Apache, reduzindo radicalmente falsos alertas de ausência de rede no Android WebView.
- **Negativas:** Exige a existência de um arquivo de imagem acessível publicamente no servidor.

---

## [ADR-019] Parser Agressivo e Resgate Regex para JSON (v2.2.0)

**Data:** 2026-08-06
**Contexto:** A comunicação com a API do ERP (Protheus) frequentemente resultava em retornos truncados ou com lixo (caracteres invisíveis, tags residuais) ao redor da string JSON, quebrando o `JSON.parse` nativo do Javascript mesmo quando o payload principal era perfeitamente válido.

**Decisão:**
1. Criar um parser customizado (defensivo/agressivo).
2. Em caso de falha do parse padrão, aplicar uma Regex que vasculha a resposta retornada e extrai estritamente o conteúdo contido entre as chaves principais `{ ... }`.
3. Tentar fazer o parse do conteúdo resgatado antes de falhar definitivamente.

**Consequências:**
- **Positivas:** Alta resiliência contra instabilidades de retornos do Protheus; salva requisições que antes resultariam em erro fatal para o operador.
- **Negativas:** Pequeno overhead de Regex quando há falhas estruturais, e risco de mascarar bugs mais graves do ERP se o JSON for mutilado por dentro.

---

## [ADR-020] Carregador Dinâmico de JS Estáticos Offline-First (v2.1.0)

**Data:** 2026-08-06
**Contexto:** Como a arquitetura depende de arquivos DB injetados (como `colaboradores.js`), a dependência puramente online para carregar esses scripts gerava problemas se o tablet fosse iniciado e aberto diretamente num ponto cego sem Wi-Fi (os dados ficavam em branco).

**Decisão:**
1. Modificar o mecanismo de injeção e leitura para ser "offline-first".
2. Garantir que os dados previamente cacheados ou embutidos (bundle) sejam carregados imediatamente, utilizando técnicas de fallback se a requisição dinâmica da rede (com query string timestamp) falhar.

**Consequências:**
- **Positivas:** O app se torna funcional a partir do primeiro segundo de execução, independentemente da qualidade da rede inicial.
- **Negativas:** Aumenta a complexidade de debug sobre qual versão do dado o operador está realmente visualizando no momento.

---

## [ADR-021] Validação de O.P. baseada em Centro de Custo (v2.2.1)

**Data:** 2026-09-02
**Contexto:** A exigência de Ordem de Produção (O.P.) anteriormente dependia do sufixo no código do produto (`E`, `TT`, `J`). Isso se tornou insustentável devido ao cadastro não padronizado de produtos e a inserção de novos processos no ERP. Era preciso validar de forma dinâmica e precisa o setor real de destino.
**Decisão:**
1. Alterar a lógica para validar com base no Centro de Custo (`B1_CC`), vinculando um novo arquivo de banco local `centro_custo.js` (carregado via `APP_DB`).
2. Adicionar o campo `"cc"` a todos os itens na view de `produtos.js`.
3. Bloquear inputs se o produto destino tiver `cc` pertencente à array estrita de restrição (`10022`, `10023`, `10025`, `10051`, `10052`).
4. Implementar notificação visual automática em formato pop-up nativo com auto-close para reter a atenção do usuário.

**Consequências:**
- **Positivas:** Permite travar qualquer apontamento incorreto independentemente da nomenclatura (sufixo) do código do produto. Escalabilidade imediata para travar novos setores alterando o array.
- **Negativas:** Requer que o script de exportação do ERP (`produtos.js`) traga obrigatoriamente a junção do campo `B1_CC`, tornando a view de banco mais pesada.
