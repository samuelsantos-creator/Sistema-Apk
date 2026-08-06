# Regras de Negócio e Arquitetura - Sistema de Apontamento Progeral

**ATENÇÃO AGENTES E DESENVOLVEDORES:** Este projeto possui nuances arquiteturais muito específicas relacionadas a funcionamento offline e proxy reverso. Leia atentamente as regras abaixo ANTES de propor ou executar qualquer modificação na estrutura.

## 1. Estrutura do Capacitor (App Android)
- **NUNCA transforme o Capacitor em um "Web View Wrapper" (server.url)**: O aplicativo deve **sempre** embutir os arquivos HTML/JS/CSS localmente (`webDir: ".build/dist"` sem apontamento de servidor).
- *Motivo:* Se o tablet estiver sem internet no momento exato em que abrir o app, um Web View Wrapper irá gerar o erro nativo do Android (`ERR_INTERNET_DISCONNECTED`) e impedir o acesso, mesmo que exista um Service Worker configurado. Mantendo os arquivos locais, o app sempre abrirá a interface.

## 2. PWA e Service Worker
- **Ciclo de Vida do Service Worker (`sw.js`)**: Modificações no Service Worker *devem sempre* possuir `self.skipWaiting()` na instalação e `self.clients.claim()` na ativação, forçando o tablet a aplicar a atualização assim que possível.
- **Cache de Requisições**: O Service Worker *nunca* deve fazer cache de requisições POST. Se falhar, o Service Worker deve deixar a requisição falhar nativamente no navegador para que a aplicação (app.js) trate o erro. NUNCA crie mocks de sucesso no SW para chamadas POST.

## 3. APIs e Comunicação com ERP (Protheus)
- **URLs Absolutas**: Como o app via Capacitor roda localmente (ex: `http://localhost`), as chamadas no `app.js` (como `URL_PRODUCAO`) devem apontar para a **URL Absoluta** do servidor da Progeral. 
- **CORS e Protocolo**: Se o servidor utilizar HTTPS, os links absolutos no `app.js` devem OBRIGATORIAMENTE utilizar `https://` para evitar bloqueios de "Mixed Content" pelo navegador. Além disso, não injete cabeçalhos customizados (como `Cache-Control`) nas chamadas `fetch` sem configurar o `proxy.php` antes, pois isso gera bloqueio de preflight CORS.
- **ATENÇÃO MÁXIMA**: Nunca altere, modifique ou "conserte" o objeto `API_CONFIG` ou qualquer lógica de apontamento do sistema a menos que o usuário solicite EXPLICITAMENTE. Ater-se estritamente à tarefa requisitada.
- **Validação de JSON em Falsos 200 OK**: A API REST do ERP Protheus retorna frequentemente HTTP Status Code `200 OK` mesmo em caso de falha de regra de negócio (ex: Saldo Insuficiente). O `app.js` deve **obrigatoriamente** inspecionar o conteúdo JSON (ex: flags `erro` ou mensagens como `resultado: "Problema"`) para determinar se a resposta foi realmente bem-sucedida, independentemente do `response.ok` nativo do fetch.

## 4. Tratamento Offline e Filas
- **Filas de Apontamento Offline**: NUNCA reimplemente filas offline automáticas de submissão ou tente "esconder" falhas de rede dizendo ao operador que a requisição foi um sucesso e jogando-a numa fila de background. Falhas de rede devem ser obrigatoriamente reportadas na tela com o erro "Sem conexão" para que o operador decida quando tentar reenviar, garantindo a integridade dos dados no banco.
- **Proxy Idempotente**: O `proxy.php` faz um controle de idempotência. Não o remova e garanta que, em caso de timeout de comunicação interna (`proxy.php` -> ERP), o erro 409 seja propagado para bloquear reenvios automáticos.
