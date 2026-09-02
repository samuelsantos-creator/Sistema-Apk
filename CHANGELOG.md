# Changelog

Toda mudança notável neste projeto será documentada neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adota o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [2.2.1] — 2026-09-02

### Adicionado
- **Dicionário de Centro de Custo:** Inclusão do arquivo `centro_custo.js` que carrega a tabela de setores no `window.APP_DB["centro_custo"]`.
- **Notificação Auto-close:** O sistema agora emite um modal visual automático de alerta (estilo SweetAlert) para o operador durante a digitação caso a O.P. seja exigida.
- **Ferramenta de Diagnóstico (Ping Test):** Adicionado um ícone discreto de servidor na barra de status e nos cabeçalhos. Ao clicar, o aplicativo dispara um teste de latência e conectividade com o servidor (IP `192.168.50.2`), informando o status, tempo de resposta em ms, e possíveis motivos de bloqueio.

### Correções de Segurança e Estabilidade
- **Invalidador de Cache do APK:** Implementado um "Cache Buster" no `index.html` que verifica a `CURRENT_APK_VERSION` contra a memória do dispositivo (`localStorage`). Se o APK for atualizado, ele deleta agressivamente todos os scripts em cache offline (`offline_script_...`). Isso impede que o app fique preso rodando Javascript velho após a instalação de um novo APK em cenários sem rede.
- **Rollback de Protocolo e DNS:** Após testes locais, constatou-se que tentar contornar a resolução de DNS apontando diretamente para o IP interno (`192.168.50.2`) resulta em um bloqueio severo (hard block) de segurança (`ERR_CERT_COMMON_NAME_INVALID`) pelos navegadores e pela Webview do Android, por conta da incompatibilidade com o certificado SSL. Todas as chamadas foram revertidas para `https://interno.progeral.com.br` para reestabelecer o funcionamento da rede.
- **UX da O.P. e Trava de Campos:** Adicionado o campo `p-turno` na array de travamento. Além disso, adicionada uma trava inteligente de foco: ao digitar um produto válido que exige OP e pressionar `Enter`, se a OP não estiver preenchida, o sistema aborta o salto rápido de campos e joga o ponteiro forçosamente para o campo da O.P. Adicionalmente, removemos o banner vermelho estático de erro e forçamos o popup modal original (com auto-close de 2.5s) a piscar sempre que o usuário tenta avançar sem a OP.

### Alterado
- **Lógica de O.P. Obrigatória:** A função `produtoRequerOP()` foi totalmente reescrita. A exigência de OP deixou de ser atrelada ao sufixo do código do produto (E, J, TT) e passou a validar o campo `cc` (Centro de Custo), travando a tela apenas para os setores designados (ex: 10022, 10023, 10025, etc.).
- **Mensagem de Sincronização:** Alterada a mensagem de retorno na função `forceSyncOPs` para exibir que OPs, Colaboradores, Produtos e Recursos foram sincronizados com sucesso.
- **Cache PWA:** Versão no HTML foi forçada para 2.2.1 e `CACHE_NAME` do Service Worker elevado para v11 para garantir o update forçado imediato.
- **Rede / DNS:** Substituição do domínio (`interno.progeral.com.br`) pelo IP interno (`192.168.50.2`) nas chamadas de API e sincronização para mitigar falhas de resolução DNS na fábrica.
- **Formatação SQL em `produtos.js`:** Ajuste no encerramento de comentários para assegurar o carregamento do JSON.

## [2.2.0] — 2026-08-06

### Adicionado
- **CORS Preflight:** Suporte a requisições OPTIONS nos scripts PHP `proxy` e `get_ops` para habilitar chamadas customizadas.
- **Parser JSON Agressivo:** Implementado parser com resgate em regex para strings JSON que possam vir truncadas ou malformadas pelo Protheus.

### Alterado
- **Retorno de API Padronizado:** Padronização do retorno para ser idêntico ao repositório de referência APONTAMENTO-APK, eliminando falsos alertas de erro em requisições.
- **Atualização Local:** Atualizados colaboradores, OPs e versão do PWA. Versão do Android (versionCode) aumentada para 10.

## [2.1.0] — 2026-08-06

### Adicionado
- **Carregador Dinâmico e Offline-first:** Adicionado script avançado para carga estática offline dos arquivos `colaboradores.js`, `recursos.js`, garantindo disponibilidade sem rede inicial.
- **Botões de Sincronização:** Adicionado botão manual de atualização/sincronização de OPs direto na interface, movido do campo O.P para o header das telas de Apontamento e Parada.

### Alterado
- **URLs HTTPS:** URLs hardcoded passadas de HTTP para HTTPS para evitar bloqueio de Mixed Content no uso de fetch.
- **Documentação:** Atualizada a seção de regras de IA e documentação para prevenir erros de CORS/Mixed Content.
- **Versão:** Android versionCode elevado para 9.

### Corrigido
- Falha de conexão via TLS/SSL do SQL Server ODBC 18 resolvida no `get_ops.php` com o uso de `TrustServerCertificate=true` no PDO.
- Remoção de headers customizados problemáticos que geravam erro de preflight e falso aviso de "Sem Rede" ao enviar apontamento.

## [2.0.0] — 2026-08-06

### Adicionado
- **Banner Global de Rede:** Adicionado banner nativo e real-time de monitoramento da interface de hardware usando API de rede.

### Alterado
- **Estratégia Offline:** Substituição da Fetch API por um ping clássico de imagem ("Image Ping") para contornar falsos positivos de CORS e Fetch em servidores Apache.
- Alterado o método de ping offline para requisições GET em arquivos estáticos (evitando bloqueios de métodos HEAD).
- Substituídos ouvintes passivos por um "ping de batimento cardíaco" no Android WebView para robustez na detecção offline.
- **Versão Visual:** Atualizada a UI para a versão 2.0.0 e versionCode Android para 8.

### Corrigido
- Reversão para `window.addEventListener` (html5 nativos) para melhor funcionamento no tablet.
- Resolvido erro silencioso no ping de imagem removendo uma variável fora do escopo.

## [1.5.0] — 2026-08-06

### Adicionado
- Nova estratégia de Carga Dinâmica de OPs inserida.
- Melhoria no ícone do app e nas interfaces (UX) referentes aos erros de conexão.

### Alterado
- Substituição massiva das splash screens usando o novo logo atualizado em todas as densidades (mdpi a xxxhdpi).
- Configuração oficial do APK em modo "Web View Wrapper" em relação ao servidor remoto (para os ambientes onde isso é exigido).
- **Service Worker:** Forçado a atualizar agressivamente via `skipWaiting` para distribuir novos bundles sem depender da permissão do usuário. Versão do SW aumentada para v7 e UI para v1.5.0.

### Corrigido
- Correção de falsos positivos no servidor local: as chamadas de API foram convertidas para rotas absolutas (suporte a bundle Capacitor) e validação de JSON tornou-se mais rigorosa (mesmo com HTTP 200 OK).

### Documentação
- Atualizadas as orientações no `INDEX.md`, endpoints de testes, criação de guia de deploy e documentações finais de PWA. Adição de `AGENTS.md` (regras para IAs).

## [1.4.8] — 2026-08-05

### Adicionado
- **Build AppFlow Integrado:** Script `build.js` e diretório `.build/dist` adicionados para gerar um build PWA completo com ativos locais, empacotando os dados dinâmicos dentro do app para o Ionic Appflow.
- **Layout Ultra Compacto:** Otimizações avançadas de responsividade no layout para tablets em modo landscape para evitar barra de rolagem e otimizar uso de tela em chão de fábrica.

### Alterado
- **Empacotamento Local Capacitor:** A propriedade `server.url` foi removida do arquivo `capacitor.config.json`. O aplicativo agora opera offline-first (carregando os arquivos nativamente de dentro do dispositivo) em vez de funcionar como uma WebView de URL externa. Mudanças requerem compilação de novo APK.
- **Service Worker / PWA:** Correções para que o service worker permita execução do PWA de modo robusto offline e sem falhas de cache de assets locais.

## [1.4.7] — 2026-07-07

### Adicionado
- **OP Obrigatória por Tipo de Produto:** Produtos cujo código termina com `E`, `TT` ou `J` agora exigem O.P. obrigatória. Função `produtoRequerOP()` implementada em `app.js`.
- **Bloqueio de Campos quando OP Obrigatória:** Quando um produto exige OP e o campo está vazio, todos os campos de produção (recurso, datas, horas, quantidades, botão confirmar) são desabilitados via `toggleProdFieldsBlocked()`. Banner vermelho exibido: *"Preencha uma O.P. válida para liberar os demais campos"*.
- **Deploy Automático (Paramiko):** Script `deploy.py` que sobe apenas `app.js` e `main.css` via SFTP com backup local automático em `backups/`. Configuração via `api/.env`.
- **Wrapper PowerShell:** `deploy.ps1` — verifica Python/paramiko e chama `deploy.py`.

### Alterado
- **`assets/js/app.js`**: Validação em `confirmarProd()` bloqueia envio se OP obrigatória estiver vazia, com modal de erro.
- **`assets/css/main.css`**: Regras CSS para `input:disabled, button:disabled` (opacidade reduzida, ponteiro desabilitado, escala de cinza).

### Corrigido
- **Campos não eram bloqueados ao selecionar produto que exige OP sem OP preenchida:** `toggleProdFieldsBlocked()` agora é chamado em todos os caminhos de alteração de produto/OP (change, input, populate automático).

## [1.4.6] — 2026-06-03

### Adicionado
- **Assets Locais (Font Awesome):** CDN removido definitivamente. `all.min.css` baixado e salvo em `assets/css/fa/all.min.css`. 4 arquivos de fonte (woff2) salvos em `assets/fonts/fa-*.woff2`. Path corrigido para `../../fonts/`. `sw.js` atualizado para cachear assets locais em vez de CDN.

### Alterado
- **`assets/css/duvidas.css`:** Restaurado para proporções do backup v1.4.4 (CSS de responsividade compacta removido). Corrigida especificidade de seletores `.section` → `#screen-duvidas .section` e fallback de ícones escopado em `.fa-fallback`.

### Removido
- **CDN Font Awesome:** Links para `cdnjs.cloudflare.com/ajax/libs/font-awesome/...` removidos de `index.html` e `sw.js`.
- **Script `fa-fallback`:** Removido do `index.html` — não é mais necessário com FA local.
- **`content-visibility: auto`:** Removido de `.section` no `duvidas.css` (causava sobreposição de layout nos accordions).

### Corrigido
- **Ícones do Font Awesome não apareciam na tela de Dúvidas no APK:** Causado por regras de fallback sem escopo que sobrescreviam `font-family` com Arial. Escopadas sob `.fa-fallback`.
- **Cards da tela de Dúvidas sem espaçamento vertical:** Seletor `.section` sem prefixo `#screen-duvidas` perdia especificidade para `#screen-duvidas * { margin: 0 }`. Corrigido para `#screen-duvidas .section`.

### Performance
- **`will-change: transform`** adicionado em elementos animados (spinner moderno, screens activas, modal overlay) no `main.css`.
- **Google Fonts carregado de forma deferida:** Atributo `media="print" onload="this.media='all'"` no link do Google Fonts.
- **Guard POST no Service Worker:** `if (event.request.method !== 'GET') return;` no `sw.js` — evita processar requisições não-GET no fetch handler.

## [1.4.5] — 2026-06-03

### Adicionado
- **Responsividade Agressiva para Tablet Landscape:** Media query `(orientation: landscape) and (min-width: 900px)` completamente reescrita com valores mais compactos. Timeline oculta, padding de cards reduzido (`0.45rem 0.7rem`), inputs menores (`4px 7px`, fonte `0.72rem`), botões compactos (`5px 12px`), header reduzido (`1rem`), gaps de grid minimizados. Logo do header em `28px`.
- **Novo Ícone do App:** `icons/app-icon.jpg` (1024×1024) usado como fonte única para gerar todos os ícones do Android (mipmap-mdpi a xxxhdpi, incluindo foreground e round) e do PWA (icon-192.png, icon-512.png). Gerado via script PowerShell com `System.Drawing`.
- **Seção Ambientes Teste vs Produção:** Documentação em `INSTRUCAO_TRABALHO.html` explicando as duas URLs (`.../Apps-testes/` para teste, `.../apontamento/` para produção) e onde alterar a URL no `capacitor.config.json`.

### Alterado
- **Refatoração de diretórios:** `dist/` e `node_modules/` movidos para `.build/`. `capacitor.config.json` atualizado com `"webDir": ".build/dist"`. O `.build/` não precisa ser copiado para o servidor interno, mantendo a raiz limpa.
- **`INSTRUCAO_TRABALHO.html`:** Removido do `.gitignore` e adicionado ao repositório. Caminho local substituído por exemplo genérico. Adicionada seção 9 (Ambientes) e seção 10 (FAQ expandida). Referências `dist/` corrigidas para `.build/dist/`.

### Corrigido
- **Monitor de Conexão para APK (WebView):** O `navigator.onLine` do Android WebView é instável — muitas vezes não detecta perda de WiFi. Adicionado ping HTTP periódico a cada 5s (HEAD em `manifest.json` com timeout de 3s). Agora o sistema considera offline se o ping falhar **ou** `navigator.onLine` for `false`. Intervalo de verificação reduzido de 10s para 5s.
- **Compatibilidade Android (build.gradle):** `versionName` atualizado de `"1.0"` para `"1.4.5"`, `versionCode` incrementado para `2` para distribuição via MDM.

## [1.4.0] — 2026-06-02

### Adicionado
- **Capacitor + Ionic Appflow:** Projeto transformado em aplicação Android híbrida usando Capacitor. Criados `package.json`, `capacitor.config.json`, e plataforma `android/`. APK compilado via Ionic Appflow Cloud Build.
- **Configuração `capacitor.config.json`:** App aponta para URL interna `http://interno.progeral.com.br/Apps-testes/` com `cleartext: true` e `allowNavigation` para os domínios internos (`interno.progeral.com.br`, `192.168.8.21`).
- **Git Ignore:** Adicionado `.gitignore` ignorando `node_modules/`, `.opencode/`, `*.log`, `.DS_Store`, `Thumbs.db`, `.env`, `INSTRUCAO_TRABALHO.html`.
- **dist/index.html:** Página de placeholder (redirecionamento) criada para atender exigência do Ionic Appflow de ter um `webDir` existente no repositório.

### Alterado
- **Manifest.json corrigido:** Adicionados campos obrigatórios para PWABuilder — `lang`, `scope`, `orientation`, `categories`, `prefer_related_applications`. `start_url` alterado de relativo para absoluto. Descrição expandida.

## [2.1.1] — 2026-06-02

### Alterado
- **manifest.json:** Adicionados campos obrigatórios para compatibilidade com PWABuilder/Bubblewrap — `lang`, `scope`, `orientation`, `categories`, `prefer_related_applications`. Corrigido `start_url` de relativo (`./index.html`) para absoluto (`/index.html`). Descrição expandida para atender requisitos de geração de APK.

## [2.1.0] — 2026-05-29

### Adicionado
- **Idempotência (3 Camadas):** Implementado sistema de prevenção de apontamentos duplicados:
  - **Proxy PHP:** Idempotência via SHA-256 + file locking — bloqueia requisições idênticas no servidor e cacheia respostas por 15 min
  - **Frontend:** `Set` de submissões em andamento (`pendingSubmissions`) — impede reenvio no cliente enquanto uma requisição idêntica está sendo processada
  - **Frontend:** Retry automático desativado — impede reenvio acidental em erros de comunicação
  - Resposta incerta: em caso de falha de rede, o proxy assume que o Protheus pode ter processado e bloqueia reenvio do mesmo payload por 15 min

### Corrigido
- **Fallback de Comunicação no Proxy PHP:** Corrigido o erro 500 (Internal Server Error) no envio de apontamentos causado pela ausência da extensão `cURL` ativa no servidor `192.168.50.2`. Implementada detecção automática que recorre ao método nativo `file_get_contents` com stream context quando o cURL não está disponível, garantindo resiliência total de envio.

### Adicionado
- **Data na Tela de Confirmação:** Exibição da data selecionada pelo operador (formato simples ou intervalo de datas) nos resumos de confirmação antes do envio de apontamentos de produção e paradas.
- **Validação Tempo Real (Limite 30 Dias):** Implementada validação retroativa rigorosa de 30 dias para campos de data. Agora o sistema aplica a classe CSS `.user-interacted` e dispara a validação visual imediatamente no evento de `blur` (ao sair do campo) ou ao interagir com as setas de ajuste e o calendário nativo. Isso garante feedback instantâneo (borda vermelha e mensagem de erro) antes da tentativa de salvar.
- **Restrição Numérica Strict:** Os campos de **Matrícula** e **OP** foram atualizados para aceitar apenas caracteres numéricos. Foi implementado o atributo `inputmode="numeric"` para otimizar a experiência do operador em tablets e celulares, prevenindo erros de entrada de texto em campos críticos.
- **Sincronização de Dados (produtos.js):** Atualizada a lógica de integração no `app.js` para ser compatível com a nova estrutura de objetos em `produtos.js`. O sistema agora mapeia corretamente as descrições dos produtos através da nova hierarquia `window.APP_DB["produtos"]`, garantindo que o preenchimento automático das descrições funcione perfeitamente com os dados extraídos do ERP.
- **Validação Inteligente de Quantidade (UM):** O campo de **Quantidade Produzida** (`p-qtd`) agora valida e formata a entrada dinamicamente com base na Unidade de Medida (UM) do produto selecionado. Unidades inteiras como `PC` (peça) e `UN` (unidade) bloqueiam a digitação de pontos (`.`) e decimais, enquanto unidades decimais como `KG` (quilo) e `M` / `MT` (metro) liberam o uso do ponto. A vírgula (`,`) é bloqueada globalmente em todas as condições. O processamento interno alterna entre `parseFloat` e `parseInt` dinamicamente conforme necessário.
- **Suporte a Decimais no Peso (Zink):** O campo de **Peso (kg)** (`p-peso`) foi atualizado para usar `parseFloat` (em vez de `parseInt`). Isso permite lançar pesos fracionados (como `1.5` ou `1.769` kg), garantindo que os cálculos de quantidade de peças por peso (Zink) funcionem de forma precisa e arredondem corretamente para cima (`Math.ceil`), além de restringir a digitação de vírgulas e ativar o teclado decimal no mobile.
- **Validação de Matrícula (Comprimento Estrito):** A matrícula do operador agora exige exatamente 6 dígitos numéricos. O input HTML foi limitado com `maxlength="6"` e a validação em tempo real avisa se o tamanho estiver inválido, impedindo o salvamento.
- **Validação Cruzada de O.P.:** A Ordem de Produção (OP) é opcional, mas se o operador optar por preenchê-la, o sistema valida contra o banco local em `ops.js`. Se for inválida, o campo fica com borda vermelha e impede o teste ou a gravação com o erro "OP não encontrada".
- **Preenchimento Automático de Produto por OP:** Quando o operador digita uma O.P. válida (evento `input`), o sistema preenche e valida imediatamente o **Produto** e a **Descrição** correspondentes, aplicando a sinalização visual de sucesso (cor verde) e prevenindo erros de digitação de produtos associados a O.P.s.

### Corrigido (UI/UX)
- **Alinhamento de Layout (CSS Grid):** Refatorada a estrutura de grade em `main.css` para eliminar a confusão operacional no preenchimento de horários.
  - No **Desktop**: "Hora Inicial" alinhada sob "Data Inicial" (coluna 2) e "Hora Final" sob "Data Final" (coluna 3).
  - No **Mobile**: Campo "Turno" configurado como `span 2` (largura total), mantendo os pares de Data/Hora organizados e empilhados verticalmente de forma intuitiva.
- **Feedback Visual Instantâneo:** Corrigida a latência na exibição de erros; as mensagens de validação agora aparecem assim que o campo perde o foco.

### Alterado
- O `index.html` principal foi purgado de 5500 linhas para o seu esqueleto HTML raiz (1480 linhas).
- Documentação central (`INDEX.md`) reescrita totalmente para abranger a nova arquitetura LAMP.

### Removido
- Removido o comportamento em que variáveis globais estourariam erros por conflito de carregamento assíncrono padrão.
- Funções antigas de testes ("Testar Produção API" via hardcode), mantidas desativadas visando segurança da produção.

### Corrigido
- `TypeError` em `duvidas.js` corrigido: adicionado block listener condicional `if (prog)` para manipulação da barra de scroll.
