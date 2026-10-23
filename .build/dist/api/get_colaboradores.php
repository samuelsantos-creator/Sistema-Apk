<?php
/**
 * get_colaboradores.php
 * Conecta diretamente ao banco de dados SQL Server do Protheus12
 * e retorna a lista de colaboradores ativos com matrícula vinculada
 * no formato JSON esperado pelo app (chave = matrícula de 6 dígitos).
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Cache-Control');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$host = '192.168.8.12';
$dbName = 'Protheus12';
$user = 'samuel.inacio';
$pass = 'd)n.?jV4)afli?{nV%&Q';

try {
    // Suporte tanto ao driver nativo pdo_sqlsrv (produção Apache) quanto PDO_ODBC
    if (extension_loaded('pdo_sqlsrv')) {
        $dsn = "sqlsrv:Server=$host;Database=$dbName;TrustServerCertificate=true";
    } else {
        $dsn = "odbc:Driver={ODBC Driver 18 for SQL Server};Server=$host;Database=$dbName;TrustServerCertificate=yes;";
    }
    
    $pdo = new PDO($dsn, $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $sql = "
        SELECT 
            RTRIM(LTRIM(USR_CODIGO)) AS USUARIO,
            RTRIM(LTRIM(USR_NOME)) AS NOME,
            RTRIM(LTRIM(USR_CODFUNC)) AS MATRICULA 
        FROM SYS_USR, SYS_USR_VINCFUNC
        WHERE 
            SYS_USR.D_E_L_E_T_ = ''
            AND SYS_USR_VINCFUNC.USR_CODFUNC <> ''
            AND SYS_USR.USR_ID = SYS_USR_VINCFUNC.USR_ID
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute();

    $colaboradoresDictionary = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $rawMat = trim($row['MATRICULA']);
        if ($rawMat === '') continue;

        // Normalização rigorosa: 6 dígitos numéricos com zeros à esquerda
        $mat = str_pad($rawMat, 6, '0', STR_PAD_LEFT);

        // Desduplicação: salva no formato esperado pelo app
        $colaboradoresDictionary[$mat] = [
            "nome" => mb_strtoupper(trim($row['NOME']), 'UTF-8'),
            "usuarioProtheus" => trim($row['USUARIO'])
        ];
    }

    echo json_encode($colaboradoresDictionary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "error" => "Falha ao consultar colaboradores no Protheus.",
        "details" => $e->getMessage()
    ]);
}
?>
