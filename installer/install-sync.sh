#!/bin/sh
# ==============================================================================
# Chef Cozinha — Universal Sync Agent Installer
# Compatível com: Linux (Ubuntu, Debian, CentOS, RHEL, Fedora, Alpine, Arch, Raspbian)
#                 macOS (Intel x86_64 e Apple Silicon arm64)
# Execução: curl -fsSL https://hub.chefcozinha.com.br/api/sync/installers/install.sh | sudo bash
# ==============================================================================

set -e

# Cores do terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Valores padrão (podem ser substituídos por argumentos ou variáveis de ambiente)
DEFAULT_HUB="https://hub.chefcozinha.com.br"
DEFAULT_KEY=""
DEFAULT_PORT="3000"

HUB_URL="${HUB_URL:-$DEFAULT_HUB}"
ACTIVATION_KEY="${CHEF_KEY:-$DEFAULT_KEY}"
LOCAL_PORT="${LOCAL_PORT:-$DEFAULT_PORT}"
DO_UNINSTALL=0
SILENT_MODE=0

# Parse argumentos CLI
while [ $# -gt 0 ]; do
  case "$1" in
    --hub|-h)
      HUB_URL="$2"
      shift 2
      ;;
    --key|-k)
      ACTIVATION_KEY="$2"
      shift 2
      ;;
    --port|-p)
      LOCAL_PORT="$2"
      shift 2
      ;;
    --uninstall|-u)
      DO_UNINSTALL=1
      shift
      ;;
    --silent|-s)
      SILENT_MODE=1
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# Banner de Apresentação
echo "${CYAN}====================================================================${NC}"
echo "${BOLD}   CHEF COZINHA - INSTALADOR UNIVERSAL SYNC AGENT${NC}"
echo "${CYAN}   Suporte: Linux (systemd/init) & macOS (Intel / Apple Silicon)${NC}"
echo "${CYAN}====================================================================${NC}"
echo ""

# Detecção de Sistema Operacional e Arquitetura
OS_NAME=$(uname -s)
ARCH=$(uname -m)

case "$ARCH" in
  x86_64|amd64)
    NODE_ARCH="x64"
    ;;
  aarch64|arm64)
    NODE_ARCH="arm64"
    ;;
  armv7l|armv6l)
    NODE_ARCH="armv7l"
    ;;
  *)
    NODE_ARCH="x64"
    ;;
esac

echo "[*] Sistema detectado: ${BOLD}$OS_NAME ($ARCH)${NC}"

# Determina caminhos de instalação
IS_ROOT=0
if [ "$(id -u)" -eq 0 ]; then
  IS_ROOT=1
fi

if [ "$OS_NAME" = "Darwin" ]; then
  # macOS
  if [ $IS_ROOT -eq 1 ]; then
    INSTALL_DIR="/Library/Application Support/ChefSync"
    BIN_DIR="/usr/local/bin"
  else
    INSTALL_DIR="$HOME/Library/Application Support/ChefSync"
    BIN_DIR="$HOME/.local/bin"
    [ ! -d "$BIN_DIR" ] && mkdir -p "$BIN_DIR"
  fi
  PLIST_DIR="$HOME/Library/LaunchAgents"
  [ $IS_ROOT -eq 1 ] && PLIST_DIR="/Library/LaunchDaemons"
  PLIST_FILE="$PLIST_DIR/com.chefcozinha.sync.plist"
else
  # Linux
  if [ $IS_ROOT -eq 1 ]; then
    INSTALL_DIR="/opt/chef-sync"
    BIN_DIR="/usr/local/bin"
  else
    INSTALL_DIR="$HOME/.chef-sync"
    BIN_DIR="$HOME/.local/bin"
    [ ! -d "$BIN_DIR" ] && mkdir -p "$BIN_DIR"
  fi
  SYSTEMD_FILE="/etc/systemd/system/chef-sync.service"
fi

# Tratamento de Desinstalação
if [ $DO_UNINSTALL -eq 1 ]; then
  echo "${YELLOW}[*] Desinstalando Chef Cozinha Sync...${NC}"
  if [ "$OS_NAME" = "Darwin" ]; then
    if [ -f "$PLIST_FILE" ]; then
      launchctl unload "$PLIST_FILE" 2>/dev/null || true
      rm -f "$PLIST_FILE"
    fi
  elif command -v systemctl >/dev/null 2>&1 && [ -f "$SYSTEMD_FILE" ]; then
    systemctl stop chef-sync 2>/dev/null || true
    systemctl disable chef-sync 2>/dev/null || true
    rm -f "$SYSTEMD_FILE"
    systemctl daemon-reload 2>/dev/null || true
  fi

  # Mata processos remanescentes
  pkill -f "sync-daemon.js" 2>/dev/null || true
  rm -f "$BIN_DIR/chef-sync"
  rm -rf "$INSTALL_DIR"

  echo "${GREEN}✅ Chef Cozinha Sync removido com sucesso.${NC}"
  exit 0
fi

# Interação se a chave não foi informada
if [ $SILENT_MODE -eq 0 ] && [ -z "$ACTIVATION_KEY" ]; then
  echo "Servidor Hub Cloud: ${BOLD}$HUB_URL${NC}"
  printf "Digite a Chave de Ativação do Restaurante (ou Enter para pular): "
  read -r INPUT_KEY
  if [ -n "$INPUT_KEY" ]; then
    ACTIVATION_KEY="$INPUT_KEY"
  fi
  echo ""
fi

# 1. Verificação e Instalação do Node.js Runtime
echo "[*] Verificando runtime Node.js..."
NODE_BIN=""

if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v 2>/dev/null || echo "")
  echo "${GREEN}[OK] Node.js detectado no sistema: $NODE_VER (${NC}$(command -v node)${GREEN})${NC}"
  NODE_BIN=$(command -v node)
elif [ -x "$INSTALL_DIR/bin/node" ]; then
  NODE_BIN="$INSTALL_DIR/bin/node"
  echo "${GREEN}[OK] Node.js portátil local detectado: $($NODE_BIN -v)${NC}"
else
  echo "${YELLOW}[!] Node.js não encontrado. Tentando instalar automaticamente...${NC}"
  
  if [ $IS_ROOT -eq 1 ] && command -v apt-get >/dev/null 2>&1; then
    echo "[*] Instalando Node.js via apt-get..."
    apt-get update -qq && apt-get install -y -qq nodejs curl || true
  elif [ $IS_ROOT -eq 1 ] && command -v dnf >/dev/null 2>&1; then
    echo "[*] Instalando Node.js via dnf..."
    dnf install -y -q nodejs curl || true
  elif [ $IS_ROOT -eq 1 ] && command -v yum >/dev/null 2>&1; then
    echo "[*] Instalando Node.js via yum..."
    yum install -y -q nodejs curl || true
  elif [ $IS_ROOT -eq 1 ] && command -v apk >/dev/null 2>&1; then
    echo "[*] Instalando Node.js via apk (Alpine)..."
    apk add --no-cache nodejs curl || true
  elif [ "$OS_NAME" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    echo "[*] Instalando Node.js via Homebrew..."
    brew install node || true
  fi

  if command -v node >/dev/null 2>&1; then
    NODE_BIN=$(command -v node)
    echo "${GREEN}[OK] Node.js instalado com sucesso: $(node -v)${NC}"
  else
    # Fallback universal: Baixa binário oficial standalone do nodejs.org
    echo "${YELLOW}[*] Baixando binário oficial standalone do Node.js LTS...${NC}"
    mkdir -p "$INSTALL_DIR/bin"
    NODE_LTS_VERSION="v20.18.0"
    
    if [ "$OS_NAME" = "Darwin" ]; then
      NODE_TAR="node-${NODE_LTS_VERSION}-darwin-${NODE_ARCH}.tar.gz"
    else
      NODE_TAR="node-${NODE_LTS_VERSION}-linux-${NODE_ARCH}.tar.gz"
    fi
    
    TEMP_DIR=$(mktemp -d)
    TAR_URL="https://nodejs.org/dist/${NODE_LTS_VERSION}/${NODE_TAR}"
    
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "$TAR_URL" -o "$TEMP_DIR/$NODE_TAR" || true
    elif command -v wget >/dev/null 2>&1; then
      wget -q "$TAR_URL" -O "$TEMP_DIR/$NODE_TAR" || true
    fi

    if [ -f "$TEMP_DIR/$NODE_TAR" ]; then
      tar -xzf "$TEMP_DIR/$NODE_TAR" -C "$TEMP_DIR"
      EXTRACTED_DIR=$(find "$TEMP_DIR" -maxdepth 1 -type d -name "node-*" | head -n 1)
      if [ -n "$EXTRACTED_DIR" ] && [ -f "$EXTRACTED_DIR/bin/node" ]; then
        cp "$EXTRACTED_DIR/bin/node" "$INSTALL_DIR/bin/node"
        chmod +x "$INSTALL_DIR/bin/node"
        NODE_BIN="$INSTALL_DIR/bin/node"
        echo "${GREEN}[OK] Node.js standalone configurado em: $NODE_BIN ($($NODE_BIN -v))${NC}"
      fi
      rm -rf "$TEMP_DIR"
    fi
  fi
fi

if [ -z "$NODE_BIN" ]; then
  echo "${RED}[ERRO] Não foi possível encontrar ou instalar o Node.js automaticamente.${NC}"
  echo "Por favor instale o Node.js (v16+) manualmente e execute este instalador novamente."
  exit 1
fi

# 2. Cria diretórios de trabalho
mkdir -p "$INSTALL_DIR/logs"

# 3. Baixa ou copia sync-daemon.js
echo "[*] Baixando arquivos do agente de sincronização..."
DAEMON_FILE="$INSTALL_DIR/sync-daemon.js"

# Se o script está sendo executado a partir do repositório local
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../sync-daemon.js" ]; then
  cp "$SCRIPT_DIR/../sync-daemon.js" "$DAEMON_FILE"
elif [ -f "$SCRIPT_DIR/sync-daemon.js" ]; then
  cp "$SCRIPT_DIR/sync-daemon.js" "$DAEMON_FILE"
else
  # Baixa diretamente do Hub
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$HUB_URL/api/sync/installers/sync-daemon.js" -o "$DAEMON_FILE"
  else
    wget -q "$HUB_URL/api/sync/installers/sync-daemon.js" -O "$DAEMON_FILE"
  fi
fi

if [ ! -f "$DAEMON_FILE" ]; then
  echo "${RED}[ERRO] Falha ao extrair sync-daemon.js.${NC}"
  exit 1
fi

# 4. Grava sync_config.json
echo "[*] Gravando configurações em $INSTALL_DIR/sync_config.json..."
IS_ACT=false
if [ -n "$ACTIVATION_KEY" ]; then
  IS_ACT=true
fi

cat <<EOF > "$INSTALL_DIR/sync_config.json"
{
  "cloud_url": "$HUB_URL",
  "local_port": $LOCAL_PORT,
  "poll_interval_seconds": 10,
  "activation_key": "$ACTIVATION_KEY",
  "is_activated": $IS_ACT,
  "auto_start": true
}
EOF

# 5. Configuração do Serviço em Segundo Plano (Systemd no Linux ou LaunchAgent no macOS)
echo "[*] Configurando inicialização como serviço permanente..."

if [ "$OS_NAME" = "Darwin" ]; then
  # macOS LaunchAgent
  mkdir -p "$PLIST_DIR"
  cat <<EOF > "$PLIST_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.chefcozinha.sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$DAEMON_FILE</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$INSTALL_DIR/logs/sync.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_DIR/logs/sync.err.log</string>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>
EOF

  launchctl unload "$PLIST_FILE" 2>/dev/null || true
  launchctl load -w "$PLIST_FILE"
  echo "${GREEN}[OK] LaunchAgent do macOS carregado ($PLIST_FILE)${NC}"

elif command -v systemctl >/dev/null 2>&1 && [ $IS_ROOT -eq 1 ]; then
  # Linux Systemd
  CURRENT_USER=$(id -un)
  cat <<EOF > "$SYSTEMD_FILE"
[Unit]
Description=Chef Cozinha Sync Agent
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_BIN $DAEMON_FILE
Restart=always
RestartSec=10
StandardOutput=append:$INSTALL_DIR/logs/sync.log
StandardError=append:$INSTALL_DIR/logs/sync.err.log
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable chef-sync
  systemctl restart chef-sync
  echo "${GREEN}[OK] Serviço systemd configurado e ativo (systemctl status chef-sync)${NC}"

else
  # Fallback: Crontab @reboot
  echo "[*] Configurando auto-start via Crontab..."
  (crontab -l 2>/dev/null | grep -v "sync-daemon.js" ; echo "@reboot nohup $NODE_BIN $DAEMON_FILE > $INSTALL_DIR/logs/sync.log 2>&1 &") | crontab - || true
  
  # Inicia processo em background
  pkill -f "sync-daemon.js" 2>/dev/null || true
  nohup "$NODE_BIN" "$DAEMON_FILE" > "$INSTALL_DIR/logs/sync.log" 2>&1 &
  echo "${GREEN}[OK] Processo em background iniciado com sucesso via crontab/nohup.${NC}"
fi

# 6. Cria utilitário de gerenciamento global: chef-sync
echo "[*] Criando comando CLI global 'chef-sync'..."
CLI_SCRIPT="$BIN_DIR/chef-sync"

cat <<'EOF' > "$CLI_SCRIPT"
#!/bin/sh
INSTALL_DIR="__INSTALL_DIR__"
NODE_BIN="__NODE_BIN__"
OS_NAME="__OS_NAME__"
PLIST_FILE="__PLIST_FILE__"

case "$1" in
  status)
    "$NODE_BIN" "$INSTALL_DIR/sync-daemon.js" --status
    ;;
  test)
    "$NODE_BIN" "$INSTALL_DIR/sync-daemon.js" --test
    ;;
  logs)
    if [ -f "$INSTALL_DIR/logs/sync.log" ]; then
      tail -n 50 -f "$INSTALL_DIR/logs/sync.log"
    elif [ -f "$INSTALL_DIR/sync.log" ]; then
      tail -n 50 -f "$INSTALL_DIR/sync.log"
    else
      echo "Nenhum arquivo de log encontrado ainda."
    fi
    ;;
  restart)
    echo "Reiniciando Chef Cozinha Sync..."
    if [ "$OS_NAME" = "Darwin" ]; then
      launchctl unload "$PLIST_FILE" 2>/dev/null || true
      launchctl load -w "$PLIST_FILE"
    elif command -v systemctl >/dev/null 2>&1; then
      systemctl restart chef-sync
    else
      pkill -f "sync-daemon.js" 2>/dev/null || true
      nohup "$NODE_BIN" "$INSTALL_DIR/sync-daemon.js" > "$INSTALL_DIR/logs/sync.log" 2>&1 &
    fi
    echo "Serviço reiniciado com sucesso."
    ;;
  stop)
    echo "Parando Chef Cozinha Sync..."
    if [ "$OS_NAME" = "Darwin" ]; then
      launchctl unload "$PLIST_FILE" 2>/dev/null || true
    elif command -v systemctl >/dev/null 2>&1; then
      systemctl stop chef-sync
    else
      pkill -f "sync-daemon.js" 2>/dev/null || true
    fi
    echo "Serviço parado."
    ;;
  start)
    echo "Iniciando Chef Cozinha Sync..."
    if [ "$OS_NAME" = "Darwin" ]; then
      launchctl load -w "$PLIST_FILE"
    elif command -v systemctl >/dev/null 2>&1; then
      systemctl start chef-sync
    else
      nohup "$NODE_BIN" "$INSTALL_DIR/sync-daemon.js" > "$INSTALL_DIR/logs/sync.log" 2>&1 &
    fi
    echo "Serviço iniciado."
    ;;
  uninstall)
    sh -c "$(curl -fsSL https://hub.chefcozinha.com.br/api/sync/installers/install.sh 2>/dev/null || cat $INSTALL_DIR/install.sh)" -- --uninstall
    ;;
  *)
    echo "Uso: chef-sync {status|logs|restart|start|stop|test|uninstall}"
    exit 1
    ;;
esac
EOF

# Substitui placeholders no script CLI
sed -i.bak "s|__INSTALL_DIR__|$INSTALL_DIR|g" "$CLI_SCRIPT" 2>/dev/null || sed -i "" "s|__INSTALL_DIR__|$INSTALL_DIR|g" "$CLI_SCRIPT" 2>/dev/null || true
sed -i.bak "s|__NODE_BIN__|$NODE_BIN|g" "$CLI_SCRIPT" 2>/dev/null || sed -i "" "s|__NODE_BIN__|$NODE_BIN|g" "$CLI_SCRIPT" 2>/dev/null || true
sed -i.bak "s|__OS_NAME__|$OS_NAME|g" "$CLI_SCRIPT" 2>/dev/null || sed -i "" "s|__OS_NAME__|$OS_NAME|g" "$CLI_SCRIPT" 2>/dev/null || true
sed -i.bak "s|__PLIST_FILE__|$PLIST_FILE|g" "$CLI_SCRIPT" 2>/dev/null || sed -i "" "s|__PLIST_FILE__|$PLIST_FILE|g" "$CLI_SCRIPT" 2>/dev/null || true
rm -f "${CLI_SCRIPT}.bak"
chmod +x "$CLI_SCRIPT"

# 7. Executa teste de conectividade
echo ""
echo "[*] Testando conectividade com o Hub Cloud..."
"$NODE_BIN" "$DAEMON_FILE" --test || true

# Mensagem final de sucesso
echo ""
echo "${GREEN}====================================================================${NC}"
echo "${BOLD}${GREEN}  ✅ AGENTE CHEF COZINHA SYNC INSTALADO COM SUCESSO!${NC}"
echo "${GREEN}====================================================================${NC}"
echo "  • Diretório de Instalação : ${BOLD}$INSTALL_DIR${NC}"
echo "  • Hub Central             : ${BOLD}$HUB_URL${NC}"
if [ -n "$ACTIVATION_KEY" ]; then
  echo "  • Chave de Ativação       : ${BOLD}$ACTIVATION_KEY${NC}"
fi
echo "  • Utilitário de Controle  : ${CYAN}chef-sync status | logs | restart${NC}"
echo "${GREEN}====================================================================${NC}"
echo ""
