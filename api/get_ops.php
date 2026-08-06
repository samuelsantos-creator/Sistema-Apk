<?php
/**
 * get_ops.php
 * Conecta diretamente ao banco de dados SQL Server do Protheus12
 * e retorna a lista de OPs abertas e pendentes no formato JSON esperado pelo app.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

// Configurações de Conexão (Fornecidas pelo usuário)
$host = '192.168.8.12';
$dbName = 'Protheus12';
$user = 'samuel.inacio';
$pass = 'd)n.?jV4)afli?{nV%&Q';

try {
    // Tenta conectar usando o driver pdo_sqlsrv (padrão Windows/Microsoft)
    // ODBC Driver 18 exige TrustServerCertificate=true para certificados auto-assinados
    $dsn = "sqlsrv:Server=$host;Database=$dbName;TrustServerCertificate=true";
    $pdo = new PDO($dsn, $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Query extraindo os campos crus, sem formatação JSON no SQL
    // Deixamos a formatação JSON para o PHP usando json_encode() para evitar erros de escape de aspas
    $sql = "
        SELECT 
            RTRIM(LTRIM(C2_OP)) AS OP, 
            RTRIM(LTRIM(C2_PRODUTO)) AS PRODUTO
        FROM SC2010
        WHERE 
            ((C2_DATRF = '') OR (C2_QUANT < C2_QUJE))
            AND SC2010.D_E_L_E_T_ = ''
            AND C2_EMISSAO >= '20250101'
            AND C2_OBS NOT IN ('PRODUCAO AUTOMATICA', 'PRODUCAO AUTOMATICA - WS')
            AND C2_PRODUTO NOT LIKE ('MANUTENCAO')
        GROUP BY C2_OP, C2_PRODUTO
        ORDER BY C2_OP ASC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute();

    $opsDictionary = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Formato esperado pelo JS: "000123": {"produto": "PC123"}
        $opsDictionary[$row['OP']] = [
            "produto" => $row['PRODUTO']
        ];
    }

    // Retorna o JSON limpo e seguro
    echo json_encode($opsDictionary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

} catch (PDOException $e) {
    // Falha de Conexão ou Query
    http_response_code(500);
    echo json_encode([
        "error" => "Falha ao conectar no banco de dados.",
        "details" => $e->getMessage()
    ]);
}
?>
