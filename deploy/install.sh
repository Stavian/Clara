#!/bin/bash
# =============================================================
# Clara AI Assistant — Proxmox VM Installation Script (Node)
# Tested on Ubuntu 22.04 LTS
# Run as root: sudo bash install.sh
# =============================================================

set -euo pipefail

CLARA_DIR="/opt/clara"
CLARA_USER="clara"
STORAGE_ROOT="/mnt/storage/clara"
SD_DIR="/mnt/storage/stable-diffusion-webui-forge"
OLLAMA_MODELS_DIR="/mnt/storage/ollama"
SERVICE_FILE="/etc/systemd/system/clara.service"
NODE_MAJOR=22

echo "=== Clara Installer (Node) ==="

# --- 1. System dependencies ---
echo "[1/11] Installing system dependencies..."
apt-get update -q
apt-get install -y -q \
    ca-certificates gnupg \
    sqlite3 \
    git \
    curl \
    build-essential python3 \
    ffmpeg \
    openssh-server

# --- 2. Node.js (NodeSource) ---
echo "[2/11] Installing Node.js ${NODE_MAJOR}.x..."
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt "$NODE_MAJOR" ]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y -q nodejs
fi
node -v && npm -v

# --- 3. Create system user ---
echo "[3/11] Creating system user '$CLARA_USER'..."
id "$CLARA_USER" &>/dev/null || useradd --system --shell /bin/false --home "$CLARA_DIR" "$CLARA_USER"

# --- 4. Storage directories on HDD ---
echo "[4/11] Creating storage directories at $STORAGE_ROOT..."
mkdir -p \
    "$STORAGE_ROOT/images" \
    "$STORAGE_ROOT/audio" \
    "$STORAGE_ROOT/uploads" \
    "$STORAGE_ROOT/logs" \
    "$STORAGE_ROOT/backups"
chown -R "$CLARA_USER:$CLARA_USER" "$STORAGE_ROOT"

# --- 5. Clone or update repo ---
echo "[5/11] Setting up Clara at $CLARA_DIR..."
if [ -d "$CLARA_DIR/.git" ]; then
    echo "  Repository exists — pulling latest changes..."
    git -C "$CLARA_DIR" pull
else
    echo "  Cloning repository from GitHub..."
    git clone https://github.com/Stavian/Clara.git "$CLARA_DIR"
fi

# --- 6. Node dependencies + build ---
echo "[6/11] Installing dependencies and building..."
cd "$CLARA_DIR"
npm ci
npm run build

# --- 7. Environment file ---
echo "[7/11] Checking .env file..."
if [ ! -f "$CLARA_DIR/.env" ]; then
    cp "$CLARA_DIR/.env.example" "$CLARA_DIR/.env"
    echo ""
    echo "  *** ACTION REQUIRED ***"
    echo "  Edit $CLARA_DIR/.env before starting Clara:"
    echo "    nano $CLARA_DIR/.env"
    echo "    - Set HOST=0.0.0.0"
    echo "    - Set WEB_PASSWORD"
    echo "    - Generate and set JWT_SECRET:"
    echo "      node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    echo ""
fi
chown "$CLARA_USER:$CLARA_USER" "$CLARA_DIR/.env"
chmod 600 "$CLARA_DIR/.env"

# --- 8. Systemd service ---
echo "[8/11] Installing systemd service..."
cp "$CLARA_DIR/deploy/clara.service" "$SERVICE_FILE"
chmod 644 "$SERVICE_FILE"
chown -R "$CLARA_USER:$CLARA_USER" "$CLARA_DIR"
systemctl daemon-reload
systemctl enable clara
echo "  Service installed and enabled for auto-start."

# --- 9. Backup cron job ---
echo "[9/11] Installing daily backup cron job..."
CRON_LINE="0 3 * * * $CLARA_DIR/deploy/backup.sh >> $STORAGE_ROOT/logs/backup.log 2>&1"
chmod +x "$CLARA_DIR/deploy/backup.sh"
chmod +x "$CLARA_DIR/deploy/update.sh"
EXISTING_CRON=$(crontab -l 2>/dev/null || true)
if ! echo "$EXISTING_CRON" | grep -qF "backup.sh"; then
    (echo "$EXISTING_CRON"; echo "$CRON_LINE") | crontab -
fi
echo "  Backup cron job added (runs daily at 03:00)."

# --- 10. Install Ollama + configure HDD model storage ---
echo "[10/11] Installing Ollama..."
if ! command -v ollama >/dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
fi

mkdir -p "$OLLAMA_MODELS_DIR"
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/storage.conf <<CONF
[Service]
Environment="OLLAMA_MODELS=$OLLAMA_MODELS_DIR"
CONF
systemctl daemon-reload
systemctl restart ollama

echo "  Waiting for Ollama to start..."
for i in $(seq 1 12); do
    sleep 5
    if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
        echo "  Ollama is ready."
        break
    fi
    echo "  Still waiting ($((i*5))s)..."
done

echo "  Pulling models (this will take a while)..."
ollama pull huihui_ai/qwen3-abliterated:14b
ollama pull nomic-embed-text
echo "  Ollama models ready."

# --- 11. SSH for VS Code Remote ---
echo "[11/11] Configuring SSH..."
systemctl enable ssh
systemctl start ssh
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh

VM_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "=== Installation complete ==="
echo ""
echo "VM IP address: $VM_IP"
echo ""
echo "NEXT STEPS:"
echo "  1. Edit .env:  nano $CLARA_DIR/.env  (HOST=0.0.0.0, WEB_PASSWORD, JWT_SECRET)"
echo "  2. Start:      systemctl start clara && journalctl -u clara -f"
echo "  3. Access:     http://$VM_IP:8080"
echo "  4. Updates:    ssh root@$VM_IP 'bash $CLARA_DIR/deploy/update.sh'"
