# Sistema de Apontamento Progeral

Aplicação focada em tablets de chão de fábrica para apontamento de produção e controle de paradas, integrada ao ERP Protheus.

## Arquitetura e Decisões Críticas (NÃO QUEBRE)

### 1. Capacitor (Build do APK)
A aplicação é empacotada usando Ionic Capacitor para Android. **É obrigatório que os arquivos sejam embutidos no APK** (via `.build/dist` no `capacitor.config.json`) em vez de configurar um `server.url` remoto.
**Por que?** Se o tablet ficar sem rede e o usuário abrir o app, um WebView remoto lançaria o erro `ERR_INTERNET_DISCONNECTED` e a aplicação não abriria. O empacotamento local garante que o aplicativo abrirá instantaneamente de forma offline, deixando o Service Worker trabalhar a favor da estabilidade.

### 2. URLs de Integração (`app.js`)
Como o APK roda localmente (`http://localhost` no WebView), o código client-side (`assets/js/app.js`) deve **obrigatóriamente usar URLs absolutas** (ex: `http://interno.progeral.com.br/...`) para se comunicar com as APIs PHP (`proxy.php` e `get_ops.php`). O uso de URLs relativas quebrará a comunicação.

### 3. Service Worker e Atualizações de Cache
O arquivo `sw.js` controla o cache da aplicação. Modificações de código requerem um aumento (bump) na constante `CACHE_NAME`. Além disso, o arquivo faz uso estrito das diretivas `self.skipWaiting()` e `self.clients.claim()` para forçar que tablets recebam novos layouts e regras JavaScript instantaneamente, sem ficarem "presos" em instâncias inativas (fantasmas).
**Importante:** Requisições não-GET (POST, PUT, DELETE) jamais devem ser interceptadas com respostas em cache.

### 4. Respostas do Protheus e o "Falso 200 OK"
O ERP Protheus, em suas respostas REST, muitas vezes envia erros de regras de negócio (ex: Saldo Insuficiente, Ordem não encontrada) encapsulados em respostas de status HTTP `200 OK`. 
A aplicação (`app.js`) possui um verificador rigoroso do payload JSON antes de confirmar a validação. Independentemente de `response.ok` ser verdadeiro, o JSON deve ser inspecionado buscando chaves de erro. Nunca remova essa verificação, sob pena de gerar confirmações de "sucesso falso" nos tablets.

### 5. O Backend PHP e a Idempotência
A integração com a rede interna do Protheus é terceirizada para o `api/proxy.php`. Este arquivo resolve problemas de Mixed Content e CORS. Ele também implementa **controle de idempotência via SHA-256 e file-locking**.
Nenhum apontamento com o mesmo Hash de payload é permitido ser processado em paralelo ou em sequência dentro do limite de tempo se estiver travado. Essa é a principal barreira contra apontamentos duplicados na base.

---
**Nota para Desenvolvedores e Agentes de IA:**
Consulte o arquivo `.agents/AGENTS.md` para visualizar as diretivas e comportamentos automáticos bloqueados neste projeto.

## Guia de Deploy e Atualiza��o (Passo a Passo)

Sempre que realizar uma altera��o visual (CSS) ou de l�gica (JS/PHP) na aplica��o, siga estritamente os passos abaixo para garantir que os tablets recebam a atualiza��o:

1. **Testes Locais / Commit**: 
   - Teste as altera��es no ambiente de desenvolvimento local.
   - Fa�a o commit das altera��es no Git (ex: git add . e git commit -m "feat: nova funcionalidade").
   - Envie para o GitHub: git push origin main.

2. **Atualizar o Servidor Apache (Back-end e PWA)**:
   - Copie os novos arquivos (ou fa�a um git pull) na pasta /var/www/Apps-testes/ do servidor interno.progeral.com.br. 
   - Isso garante que os arquivos PHP (proxy.php, get_ops.php) e as regras de fallback est�ticas sejam atualizadas na origem.

3. **Gerar APK no Appflow (Front-end)**:
   - Acesse o painel do Ionic Appflow.
   - V� na se��o de Builds e inicie um novo Build selecionando o �ltimo commit que voc� acabou de enviar para a branch main.
   - Escolha a stack do Android, e configure o Build Type como **Debug** ou Release conforme a necessidade da f�brica.
   - Aguarde o processo de empacotamento finalizar e baixe o arquivo .apk resultante.

4. **Atualizar os Tablets**:
   - Transfira o arquivo .apk baixado para os tablets operacionais.
   - **MUITO IMPORTANTE:** Para garantir que n�o haja conflitos com caches antigos, � recomendado **Desinstalar** o aplicativo antigo no tablet antes de instalar o novo APK gerado.
   - Ap�s a instala��o, o aplicativo j� estar� com todos os arquivos atualizados embutidos nativamente, pronto para uso offline e operante.

