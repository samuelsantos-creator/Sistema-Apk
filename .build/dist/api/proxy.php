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
