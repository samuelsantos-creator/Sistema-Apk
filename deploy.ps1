param(
  [switch]$FirstTime,
  [switch]$Help
)

if ($Help) {
  Write-Host @"
Uso: .\deploy.ps1 [--first-time]

  --first-time   Primeira implantacao (log diferenciado)
  --help         Mostra esta ajuda

Sobe apenas assets/js/app.js e assets/css/main.css.
Faz backup local dos arquivos remotos antes de sobrescrever.

Requer Python 3 com paramiko instalado.
"@ -ForegroundColor Cyan
  exit
}

Write-Host "Apontamento - Deploy Automatico" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Verifica Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host "[ERRO] Python nao encontrado. Instale Python 3.12+" -ForegroundColor Red
  exit 1
}

# Verifica paramiko
try {
  python -c "import paramiko" 2>$null
} catch {
  Write-Host "[!] Instalando paramiko..." -ForegroundColor Yellow
  python -m pip install paramiko
}

$args = @()
if ($FirstTime) { $args += "--first-time" }

python deploy.py $args

if ($LASTEXITCODE -eq 0) {
  Write-Host "`nDeploy concluido! Acesse: https://interno.progeral.com.br/apontamentodev/" -ForegroundColor Green
} else {
  Write-Host "`n[ERRO] Deploy falhou. Verifique as mensagens acima." -ForegroundColor Red
}
