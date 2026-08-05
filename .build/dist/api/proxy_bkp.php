<?php
/**
 * Proxy PHP para API Protheus
 * Redireciona chamadas do front-end (PWA) para a API no servidor ERP.
 * Benefícios:
 * 1. Resolve problemas de Mixed Content (se o PHP rodar em HTTPS).
 * 2. Oculta o IP/Porta do ERP da inspeção no navegador.
 * 3. Permite CORS seguro (somente o mesmo domínio chama este proxy).
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *'); // Ajuste em PRD se necessário para restringir
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Preflight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Configuração do ERP Protheus
$protheusUrl = 'http://192.168.8.21:20080';

// Tipo de apontamento recebido via query string
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

// Ler payload JSON do corpo da requisição
$inputJSON = file_get_contents('php://input');
$inputData = json_decode($inputJSON, true);

if (!$inputData) {
    http_response_code(400);
    echo json_encode(['error' => 'Payload JSON invalido.']);
    exit();
}

// Inicializar cURL
$ch = curl_init($protheusUrl . $endpoint);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $inputJSON);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Content-Length: ' . strlen($inputJSON)
]);
// Timeout de 15 segundos igual ao frontend anterior
curl_setopt($ch, CURLOPT_TIMEOUT, 15);

// Executar e obter resposta
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);

curl_close($ch);

if ($response === false) {
    http_response_code(502); // Bad Gateway
    echo json_encode([
        'error' => 'Falha ao conectar no ERP Protheus',
        'details' => $curlError
    ]);
    exit();
}

// Retornar a exata resposta do Protheus
http_response_code($httpCode);
echo $response;
