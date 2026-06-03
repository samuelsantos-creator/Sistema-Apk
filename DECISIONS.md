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
**Contexto:** O PWABuilder/Bubblewrap não conseguia gerar APK funcional porque a URL do app (`https://interno.progeral.com.br/apontamentodev/`) é interna (acessível apenas na rede da Progeral). O Bubblewrap precisa acessar a URL publicamente para gerar o Trusted Web Activity (TWA). O Ionic Appflow, por outro lado, compila o APK na nuvem a partir do código fonte e permite configurar uma URL interna no WebView.

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
4. Manter `dist/index.html` como placeholder de redirecionamento no repositório (exigência do Ionic Appflow).

**Consequências:**
- **Positivas:** Fluxo claro de deploy; MDM atualiza apenas quando necessário.
- **Negativas:** Requer disciplina para versionar corretamente.
