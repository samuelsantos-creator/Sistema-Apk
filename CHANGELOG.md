# Changelog

Toda mudança notável neste projeto será documentada neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adota o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

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
- **Seção Ambientes Teste vs Produção:** Documentação em `INSTRUCAO_TRABALHO.html` explicando as duas URLs (`.../apontamentodev/` para teste, `.../apontamento/` para produção) e onde alterar a URL no `capacitor.config.json`.

### Alterado
- **Refatoração de diretórios:** `dist/` e `node_modules/` movidos para `.build/`. `capacitor.config.json` atualizado com `"webDir": ".build/dist"`. O `.build/` não precisa ser copiado para o servidor interno, mantendo a raiz limpa.
- **`INSTRUCAO_TRABALHO.html`:** Removido do `.gitignore` e adicionado ao repositório. Caminho local substituído por exemplo genérico. Adicionada seção 9 (Ambientes) e seção 10 (FAQ expandida). Referências `dist/` corrigidas para `.build/dist/`.

### Corrigido
- **Monitor de Conexão para APK (WebView):** O `navigator.onLine` do Android WebView é instável — muitas vezes não detecta perda de WiFi. Adicionado ping HTTP periódico a cada 5s (HEAD em `manifest.json` com timeout de 3s). Agora o sistema considera offline se o ping falhar **ou** `navigator.onLine` for `false`. Intervalo de verificação reduzido de 10s para 5s.
- **Compatibilidade Android (build.gradle):** `versionName` atualizado de `"1.0"` para `"1.4.5"`, `versionCode` incrementado para `2` para distribuição via MDM.

## [1.4.0] — 2026-06-02

### Adicionado
- **Capacitor + Ionic Appflow:** Projeto transformado em aplicação Android híbrida usando Capacitor. Criados `package.json`, `capacitor.config.json`, e plataforma `android/`. APK compilado via Ionic Appflow Cloud Build.
- **Configuração `capacitor.config.json`:** App aponta para URL interna `https://interno.progeral.com.br/apontamentodev/` com `cleartext: true` e `allowNavigation` para os domínios internos (`interno.progeral.com.br`, `192.168.8.21`).
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
