# Guia de Modificações — Prevenção de Apontamentos Duplicados

## O que será implementado

Três camadas de proteção para **garantir que nenhum apontamento duplicado seja enviado ao Protheus**, mesmo sem acesso a banco de dados:

1. **Proxy (PHP):** Idempotência via SHA-256 + file locking — bloqueia requisições idênticas no servidor
2. **Frontend (JS):** `Set` de submissões em andamento — bloqueia reenvio no cliente
3. **Frontend (JS):** Excluir Retry automático — impede reenvio acidental em erros


4. adicione as mudanças no Changelog.md e o decisions.md
---

## ARQUIVO 1: `api/proxy.php`

### Se o arquivo não existir, crie-o

Cole o conteúdo completo abaixo. Ele substitui o proxy simples (sem idempotência) por um proxy com todas as proteções.

```php
<?php
/**
 * Proxy PHP para API Protheus
 * Redireciona chamadas do front-end (PWA) para a API no servidor ERP.
 * Benefícios:
 * 1. Resolve problemas de Mixed Content (se o PHP rodar em HTTPS).
 * 2. Oculta o IP/Porta do ERP da inspeção no navegador.
 * 3. Permite CORS seguro (somente o mesmo domínio chama este proxy).
 * 4. Idempotência: bloqueia apontamentos duplicados via SHA-256 + file locking.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// ══════════════════════════════════════════════════════════════════
// CONFIGURAÇÕES DE IDEMPOTÊNCIA
// ══════════════════════════════════════════════════════════════════
// Tempo (segundos) que uma resposta em cache é considerada válida
const IDEMPOTENCY_TTL_SECONDS = 900; // 15 minutos
// Tempo máximo (segundos) que uma requisição espera por outra idêntica em andamento
const IDEMPOTENCY_WAIT_SECONDS = 18;

// ══════════════════════════════════════════════════════════════════
// FUNÇÕES DE IDEMPOTÊNCIA
// ══════════════════════════════════════════════════════════════════

/**
 * Normaliza um array para produzir hash consistente:
 * - Ordena chaves de arrays associativos recursivamente
 * - Mantém ordem de arrays indexados numericamente
 */
function normalizePayloadForHash($value)
{
    if (!is_array($value)) {
        return $value;
    }

    $isList = array_keys($value) === range(0, count($value) - 1);
    if (!$isList) {
        ksort($value);
    }

    foreach ($value as $key => $item) {
        $value[$key] = normalizePayloadForHash($item);
    }

    return $value;
}

/**
 * Retorna o diretório temporário para arquivos de lock/cache
 */
function idempotencyDir()
{
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'apontamentos_idempotency';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    return $dir;
}

/**
 * Limpa arquivos expirados (probabilístico — executa ~1 a cada 50 chamadas)
 */
function cleanupOldIdempotencyFiles($dir)
{
    if (!is_dir($dir) || mt_rand(1, 50) !== 1) {
        return;
    }

    $limit = time() - IDEMPOTENCY_TTL_SECONDS;
    foreach (glob($dir . DIRECTORY_SEPARATOR . '*.{json,lock}', GLOB_BRACE) ?: [] as $file) {
        if (@filemtime($file) < $limit) {
            @unlink($file);
        }
    }
}

/**
 * Lê resposta em cache se existir e não estiver expirada
 */
function readCachedIdempotencyResponse($cacheFile)
{
    if (!is_file($cacheFile)) {
        return null;
    }

    if (@filemtime($cacheFile) < (time() - IDEMPOTENCY_TTL_SECONDS)) {
        @unlink($cacheFile);
        return null;
    }

    $cached = json_decode((string) @file_get_contents($cacheFile), true);
    if (!is_array($cached) || !isset($cached['httpCode']) || !array_key_exists('response', $cached)) {
        return null;
    }

    return $cached;
}

// ══════════════════════════════════════════════════════════════════
// CORS PREFLIGHT
// ══════════════════════════════════════════════════════════════════
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ══════════════════════════════════════════════════════════════════
// CONFIGURAÇÕES DO ERP
// ══════════════════════════════════════════════════════════════════
$protheusUrl = 'http://192.168.8.21:20080'; // ALTERE PARA O SEU SERVIDOR

$tipo = $_GET['tipo'] ?? '';

$endpoint = '';
if ($tipo === 'producao') {
    $endpoint = '/apontamentodeproducao';
} elseif ($tipo === 'parada') {
    $endpoint = '/apontamentodehorasparadas';
} else {
    http_response_code(400);
    echo json_encode(['error' => 'Tipo de apontamento invalido. Use ?tipo=producao ou ?tipo=parada']);
    exit();
}

// ══════════════════════════════════════════════════════════════════
// RECEBER PAYLOAD
// ══════════════════════════════════════════════════════════════════
$inputJSON = file_get_contents('php://input');
$inputData = json_decode($inputJSON, true);

if (!$inputData) {
    http_response_code(400);
    echo json_encode(['error' => 'Payload JSON invalido.']);
    exit();
}

// ══════════════════════════════════════════════════════════════════
// GERAR FINGERPRINT SHA-256 (IDENTIFICADOR ÚNICO DO APONTAMENTO)
// ══════════════════════════════════════════════════════════════════
// A normalize remove diferenças de ordem de chaves que não alteram
// o significado dos dados. Dois apontamentos com os mesmos valores
// SEMPRE produzirão o mesmo hash.
$normalizedPayload = normalizePayloadForHash($inputData);
$fingerprintSource = $tipo . '|' . json_encode($normalizedPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$fingerprint = hash('sha256', $fingerprintSource);

$idemDir = idempotencyDir();
cleanupOldIdempotencyFiles($idemDir);
$lockFile = $idemDir . DIRECTORY_SEPARATOR . $fingerprint . '.lock';
$cacheFile = $idemDir . DIRECTORY_SEPARATOR . $fingerprint . '.json';

// ══════════════════════════════════════════════════════════════════
// VERIFICAR SE JÁ TEMOS RESPOSTA EM CACHE (DUPLICATA CONHECIDA)
// ══════════════════════════════════════════════════════════════════
$cached = readCachedIdempotencyResponse($cacheFile);
if ($cached !== null) {
    header('X-Idempotency-Status: cached');
    http_response_code((int) $cached['httpCode']);
    echo $cached['response'];
    exit();
}

// ══════════════════════════════════════════════════════════════════
// ADQUIRIR LOCK EXCLUSIVO (IMPEDE PROCESSAMENTO SIMULTÂNEO)
// ══════════════════════════════════════════════════════════════════
// Se outra requisição idêntica já está sendo processada, o lock
// não estará disponível (LOCK_NB = non-blocking).
$lockHandle = fopen($lockFile, 'c+');
if ($lockHandle === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Falha ao criar trava de idempotencia.']);
    exit();
}

$hasLock = flock($lockHandle, LOCK_EX | LOCK_NB);

if (!$hasLock) {
    // Outra requisição idêntica está em andamento.
    // Aguarda até IDEMPOTENCY_WAIT_SECONDS segundos pela resposta em cache.
    $deadline = time() + IDEMPOTENCY_WAIT_SECONDS;
    do {
        usleep(250000); // 250ms
        $cached = readCachedIdempotencyResponse($cacheFile);
        if ($cached !== null) {
            // A outra requisição já completou e temos resposta em cache
            header('X-Idempotency-Status: cached-after-wait');
            http_response_code((int) $cached['httpCode']);
            echo $cached['response'];
            fclose($lockHandle);
            exit();
        }
    } while (time() < $deadline);

    // Esgotou o tempo de espera — retorna 409 para evitar duplicidade
    header('X-Idempotency-Status: already-processing');
    http_response_code(409);
    echo json_encode([
        'status' => 'processing',
        'resultado' => 'Apontamento identico ja esta em processamento.',
        'problema' => 'Aguarde a conferencia do registro antes de qualquer nova tentativa.',
        'message' => 'Apontamento identico ja esta em processamento. Nao reenvie para evitar duplicidade.',
        'fingerprint' => $fingerprint
    ]);
    fclose($lockHandle);
    exit();
}

// ══════════════════════════════════════════════════════════════════
// ENVIAR AO PROTHEUS
// ══════════════════════════════════════════════════════════════════
// Tenta cURL primeiro; se não estiver disponível, usa file_get_contents
$response = false;
$httpCode = 0;
$curlError = '';

if (extension_loaded('curl')) {
    $ch = curl_init($protheusUrl . $endpoint);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $inputJSON);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Content-Length: ' . strlen($inputJSON)
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);
} else {
    // Fallback nativo (cURL ausente)
    $options = [
        'http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/json\r\n" .
                         "Content-Length: " . strlen($inputJSON) . "\r\n",
            'content' => $inputJSON,
            'timeout' => 15,
            'ignore_errors' => true
        ]
    ];
    $context  = stream_context_create($options);
    $response = @file_get_contents($protheusUrl . $endpoint, false, $context);

    if ($response !== false) {
        $httpCode = 500;
        if (isset($http_response_header) && is_array($http_response_header)) {
            if (preg_match('#HTTP/[0-9\.]+\s+([0-9]+)#', $http_response_header[0], $matches)) {
                $httpCode = intval($matches[1]);
            }
        }
    } else {
        $curlError = 'Falha ao realizar requisicao HTTP via file_get_contents. Verifique a conexao de rede com o Protheus.';
    }
}

// ══════════════════════════════════════════════════════════════════
// TRATAMENTO DE RESPOSTA INCERTA
// ══════════════════════════════════════════════════════════════════
// Se a comunicação falhou (timeout, DNS, etc.), a requisição PODE ter
// sido processada pelo Protheus mesmo sem recebermos resposta.
// Neste caso, cacheamos como "incerta" para bloquear reenvio.
if ($response === false) {
    $uncertainResponse = json_encode([
        'error' => 'Status do envio incerto',
        'resultado' => 'Nao foi possivel confirmar a resposta do ERP.',
        'problema' => 'A requisicao pode ter sido processada pelo Protheus. O reenvio identico foi bloqueado temporariamente para evitar duplicidade.',
        'details' => $curlError,
        'fingerprint' => $fingerprint
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    // Cacheia a resposta incerta para bloquear reenvio por 15 minutos
    @file_put_contents($cacheFile, json_encode([
        'createdAt' => time(),
        'httpCode' => 409,
        'response' => $uncertainResponse
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);

    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
    header('X-Idempotency-Status: uncertain-stored');
    http_response_code(409);
    echo $uncertainResponse;
    exit();
}

// ══════════════════════════════════════════════════════════════════
// RESPOSTA BEM-SUCEDIDA — CACHEIA E RETORNA
// ══════════════════════════════════════════════════════════════════
@file_put_contents($cacheFile, json_encode([
    'createdAt' => time(),
    'httpCode' => $httpCode,
    'response' => $response
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);

flock($lockHandle, LOCK_UN);
fclose($lockHandle);

header('X-Idempotency-Status: stored');
http_response_code($httpCode);
echo $response;
```

### O que mudou no proxy (resumo)

| Item | Versão antiga (proxy_bkp.php) | Nova versão (proxy.php) |
|---|---|---|
| Comunicação | Só cURL (79 linhas) | cURL + fallback file_get_contents (248 linhas) |
| Idempotência | Nenhuma | SHA-256 fingerprint + file locking + cache de 15 min |
| Falha de rede | Retorna 502 | Retorna 409 e BLOQUEIA reenvio idêntico por 15 min |
| Concorrência | Nenhuma | Lock exclusivo impede 2 requisições idênticas simultâneas |

---

## ARQUIVO 2: `assets/js/app.js`

### 2.1 Adicionar `pendingSubmissions` Set

Localize a declaração do objeto `state` (início do arquivo, ~linha 38-43) e **adicione logo abaixo**:

```js
const pendingSubmissions = new Set();
```

### 2.2 Adicionar funções de fingerprint da submissão

Logo após a linha acima, adicione:

```js
function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
}

function getSubmissionKey(type, record) {
    const keyPayload = type === 'producao'
      ? {
        matricula: record.matricula,
        op: record.op,
        produto: record.produto,
        recursoCod: record.recursoCod,
        dIni: record.dIni,
        hIni: record.hIni,
        dFim: record.dFim,
        hFim: record.hFim,
        qtd: record.qtd,
        ret: record.ret,
        setup: record.setup,
        rnc: record.rnc,
        cestos: record.cestos,
        shiftKey: record.shiftKey
      }
      : {
        matricula: record.matricula,
        motCod: record.motCod,
        op: record.op,
        produto: record.produto,
        recursoCod: record.recursoCod,
        dIni: record.dIni,
        hIni: record.hIni,
        dFim: record.dFim,
        hFim: record.hFim,
        shiftKey: record.shiftKey
      };

    return type + '|' + stableStringify(keyPayload);
};
```

### 2.3 Proteger submissão de PRODUÇÃO

Encontre o bloco onde a produção é confirmada (antes do `enviarParaAPI`). Deve ser algo como:

```js
showModal('confirm', 'Confirmar Registro?', htmlConfirm, async () => {
    // ... monta recProd ...
    const apiRes = await enviarParaAPI(recProd, 'producao');
```

Substitua para que fique assim:

```js
showModal('confirm', 'Confirmar Registro?', htmlConfirm, async () => {
      const prodDesc = db.produtos[prod] ? db.produtos[prod].descricao : '';
      const recProd = { matricula, op, produto: prod, desc: prodDesc, recursoCod: rCod, recurso: db.recursos[rCod] || '', dIni, hIni, dFim, hFim, qtd, ret, setup, rnc, cestos, shiftKey: turnoInfo[0], peso };
      const submissionKey = getSubmissionKey('producao', recProd);
      if (pendingSubmissions.has(submissionKey)) {
        showModal('aviso', 'Envio em Andamento', 'Este apontamento ja esta sendo enviado. Aguarde a resposta antes de qualquer acao.');
        return;
      }
      pendingSubmissions.add(submissionKey);

      // Bloquear botão e mostrar overlay
      const btnConfirm = document.getElementById('p-btn-confirmar');
      const originalBtnHtml = btnConfirm.innerHTML;
      btnConfirm.disabled = true;
      btnConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

      const overlay = document.getElementById('fullLoadingOverlay');
      overlay.classList.add('active');

      const apiRes = await enviarParaAPI(recProd, 'producao');
      pendingSubmissions.delete(submissionKey);
      // ... resto do código (overlay, success/error) ...
```

### 2.4 Proteger submissão de PARADA

Mesmo padrão. Encontre o bloco da parada:

```js
showModal('confirm', 'Confirmar Parada?', htmlConfirm, async () => {
    // ...
    const apiRes = await enviarParaAPI(recStop, 'parada');
```

Substitua para:

```js
showModal('confirm', 'Confirmar Parada?', htmlConfirm, async () => {
      const recStop = { matricula, motCod, motDesc: db.motivos[motCod] || '', op, produto: prodPar, recursoCod: rCod, dIni, hIni, dFim, hFim, shiftKey: turnoInfo[0] };
      const submissionKey = getSubmissionKey('parada', recStop);
      if (pendingSubmissions.has(submissionKey)) {
        showModal('aviso', 'Envio em Andamento', 'Esta parada ja esta sendo enviada. Aguarde a resposta antes de qualquer acao.');
        return;
      }
      pendingSubmissions.add(submissionKey);

      // Bloquear botão e mostrar overlay
      const activeBtn = document.querySelector('.screen.active .btn-primary');
      const originalBtnHtml = activeBtn ? activeBtn.innerHTML : '';
      if (activeBtn) {
        activeBtn.disabled = true;
        activeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
      }

      const overlay = document.getElementById('fullLoadingOverlay');
      overlay.classList.add('active');

      const apiRes = await enviarParaAPI(recStop, 'parada');
      pendingSubmissions.delete(submissionKey);
      // ... resto do código ...
```

### 2.5 Desativar retry automático (produção)

No bloco de **erro** da produção, localize o `if (false && ...)` ou a lógica de retry. Deve ficar assim:

```js
} else {
    window._retryProd = 0;
    title = buildFriendlyErrorTitle(apiRes);
    modalType = 'erro';
    msg = buildFriendlyErrorHTML(apiRes);
    showModal(modalType, title, msg);
    return;        // <--- ESSE return É CRÍTICO

    if (false && window._retryProd >= 3) { // retries desativados para evitar duplicidade
      // ... (esse bloco NUNCA executa)
    } else {
      // ...
    }
}
```

A linha `return;` antes do `if (false && ...)` é essencial — ela faz com que o modal de erro seja exibido mas o **retry nunca seja oferecido**.

### 2.6 Desativar retry automático (parada)

Mesma coisa no bloco de erro da parada:

```js
} else {
    window._retryParada = 0;
    title = buildFriendlyErrorTitle(apiRes);
    modalType = 'erro';
    msg = buildFriendlyErrorHTML(apiRes);
    showModal(modalType, title, msg);
    return;

    if (false && window._retryParada >= 3) {
      // ... (NUNCA executa)
    } else {
      // ...
    }
}
```

---

## Como testar

### Teste 1: Cliente bloqueia reenvio em andamento
1. Abra o DevTools (F12) e vá em Network > throttle: "Slow 3G"
2. Preencha um apontamento e confirme
3. Enquanto está "Enviando...", tente confirmar o MESMO apontamento novamente
4. **Esperado:** Modal amarelo "Este apontamento ja esta sendo enviado"

### Teste 2: Proxy bloqueia duplicata idêntica
1. Envie um apontamento com sucesso
2. Imediatamente reenvie o MESMO apontamento (mesma matrícula, OP, produto, horário, etc.)
3. **Esperado:** Erro 409 com "Apontamento identico ja esta em processamento"

### Teste 3: Falha de rede não gera duplicata
1. Desligue o servidor Protheus ou desconecte o cabo de rede
2. Envie um apontamento (vai falhar)
3. Religue o servidor
4. Reenvie o MESMO apontamento dentro de 15 minutos
5. **Esperado:** Erro 409 "Status do envio incerto — reenvio bloqueado"

### Teste 4: Retry não ocorre automaticamente
1. Envie um apontamento que vai falhar (ex: servidor lento)
2. **Esperado:** Modal de erro aparece, mas **não** oferece botão "Tentar novamente"

---

## Explicação do funcionamento (para entender e manter)

### Como a fingerprint SHA-256 funciona sem banco de dados

```
Payload recebido:
  { "operador": "123", "ordem": "456", "turno": "D1", ... }

  ↓ normalizePayloadForHash() — ordena as chaves
  ↓ "producao|" + json_encode(payload)
  ↓ hash('sha256', ...)

  → "a1b2c3d4e5f6..." (fingerprint de 64 caracteres hex)

  → Usada como nome de arquivo:  a1b2c3d4e5f6....lock
                                  a1b2c3d4e5f6....json
```

O **sistema de arquivos do servidor** funciona como um "banco de dados" improvisado:
- Se o arquivo `.json` existe → apontamento já foi processado → retorna resposta em cache
- Se o arquivo `.lock` está travado → outro processo está processando o mesmo → aguarda ou bloqueia

### Limpeza automática

Arquivos expiram após 15 minutos (IDEMPOTENCY_TTL_SECONDS) e são limpos probabilisticamente (~1 a cada 50 requisições).

### Segurança com "resposta incerta"

Quando a comunicação com o Protheus falha (timeout/DNS), o proxy **assume que pode ter sido processado** e bloqueia o reenvio do mesmo payload por 15 minutos. Isso é propositalmente pessimista para evitar duplicidade a qualquer custo.
