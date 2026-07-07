#!/usr/bin/env python3
"""
Deploy rapido - Apontamento
Sobe apenas assets/js/app.js e assets/css/main.css
Faz backup local dos arquivos atuais antes de sobrescrever.
"""
import os, sys, time, hashlib
from pathlib import Path
import paramiko

CONFIG = {
    "host": os.environ.get("DEPLOY_HOST", "192.168.50.2"),
    "port": int(os.environ.get("DEPLOY_PORT", "22")),
    "user": os.environ.get("DEPLOY_USER", "root"),
    "password": os.environ.get("DEPLOY_PASSWORD", "timepro"),
    "remote_dir": "/var/www/apontamentodev",
    "first_time": "--first-time" in sys.argv,
}

FILES = [
    "assets/js/app.js",
    "assets/css/main.css",
]

BASE = Path(__file__).parent.resolve()
BACKUP_DIR = BASE / "backups"
REMOTE_BASE = CONFIG["remote_dir"]

COLORS = True
def c(code, text):
    if not COLORS: return text
    codes = {"red": "31", "green": "32", "yellow": "33", "cyan": "36"}
    return f"\033[{codes.get(code,'0')}m{text}\033[0m"

def log(msg):     print(f"  {c('cyan', '-')} {msg}")
def success(msg): print(f"  {c('green', 'OK')} {msg}")
def warn(msg):    print(f"  {c('yellow', '!')} {msg}")
def error(msg):   print(f"  {c('red', 'XX')} {msg}")

def run_ssh(client, command, timeout=30):
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    ec = stdout.channel.recv_exit_status()
    return stdout.read().decode().strip(), stderr.read().decode().strip(), ec

def main():
    print("")
    print(f"  {c('cyan', '=' * 45)}")
    print(f"  {c('cyan', '  Apontamento - Deploy Rapido')}")
    print(f"  {c('cyan', f'  Host: {CONFIG["host"]}:{CONFIG["port"]}')}")
    print(f"  {c('cyan', '=' * 45)}")
    print("")

    timestamp = time.strftime("%Y%m%d_%H%M%S")

    # 1. Backup local dos arquivos remotos atuais
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    log("Conectando para backup remoto...")
    sys.stdout.flush()

    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(CONFIG["host"], port=CONFIG["port"],
                       username=CONFIG["user"], password=CONFIG["password"],
                       timeout=15, allow_agent=False, look_for_keys=False)
    except Exception as e:
        error(f"Falha na conexao: {e}")
        sys.exit(1)
    success("Conectado")

    sftp = client.open_sftp()
    try:
        for rel_path in FILES:
            remote_path = f"{REMOTE_BASE}/{rel_path}"
            backup_path = BACKUP_DIR / f"{rel_path.replace('/', '_')}.{timestamp}"
            try:
                with sftp.open(remote_path, "rb") as fr:
                    data = fr.read()
                backup_path.write_bytes(data)
                size = len(data)
                local_hash = hashlib.md5(data).hexdigest()
                log(f"Backup local: {backup_path.name} ({size:,} bytes, md5: {local_hash})")
            except FileNotFoundError:
                warn(f"Arquivo remoto nao existe: {remote_path}")
    finally:
        sftp.close()
    success("Backup local concluido")

    # 2. Upload dos arquivos locais
    log("Enviando arquivos...")
    sftp = client.open_sftp()
    try:
        for rel_path in FILES:
            local_path = BASE / rel_path
            remote_path = f"{REMOTE_BASE}/{rel_path}"
            if not local_path.exists():
                error(f"Arquivo local nao encontrado: {local_path}")
                continue
            data = local_path.read_bytes()
            sftp.put(local_path.as_posix(), remote_path)
            size = len(data)
            md5 = hashlib.md5(data).hexdigest()
            log(f"  {rel_path} ({size:,} bytes, md5: {md5})")
    finally:
        sftp.close()
    success("Upload concluido")

    # 3. Permissoes
    log("Ajustando permissoes...")
    for rel_path in FILES:
        remote_path = f"{REMOTE_BASE}/{rel_path}"
        out, err, code = run_ssh(client, f"chown www-data:www-data {remote_path} && chmod 755 {remote_path}")
    success("Permissoes OK")

    # 4. Verificacao
    log("Verificando...")
    out, err, code = run_ssh(client,
        "curl -s -o /dev/null -w '%{http_code}' --connect-timeout 10 "
        "http://localhost/apontamentodev/ 2>/dev/null || echo '000'")
    http_code = out.strip()
    if http_code in ("200", "302"):
        success(f"Sistema respondendo (HTTP {http_code})")
    else:
        warn(f"HTTP {http_code} - verifique manualmente")

    client.close()
    print("")
    print(f"  {c('green', '  DEPLOY CONCLUIDO')}")
    print(f"  {c('cyan', '-')} Acessar: https://interno.progeral.com.br/apontamentodev/")
    print(f"  {c('cyan', '-')} Backup local: {BACKUP_DIR}/")
    print("")

if __name__ == "__main__":
    main()
