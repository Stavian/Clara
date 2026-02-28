#!/bin/bash
# =============================================================
# Clara AI Assistant — VM Installation Script
# Tested on Ubuntu 22.04 LTS
# Run as root: sudo bash install.sh
#
# This installs Clara (the web app) ONLY.
# Ollama and Stable Diffusion Forge run on a separate GPU VM.
# Set OLLAMA_BASE_URL (and optionally SD_API_URL) in .env
# to point Clara at the GPU VM.
# =============================================================

set -euo pipefail

CLARA_DIR="/opt/clara"
CLARA_USER="clara"
DATA_DIR="$CLARA_DIR/data"
SERVICE_FILE="/etc/systemd/system/clara.service"

echo "=== Clara Installer ==="

# --- 1. System dependencies ---
echo "[1/8] Installing system dependencies..."
apt-get update -q
apt-get install -y -q \
    python3 python3-pip python3-venv \
    sqlite3 \
    git \
    curl \
    xclip xdotool \
    ffmpeg \
    openssh-server

# --- 2. Create system user ---
echo "[2/8] Creating system user '$CLARA_USER'..."
id "$CLARA_USER" &>/dev/null || useradd --system --shell /bin/false --home "$CLARA_DIR" "$CLARA_USER"

# --- 3. Data directories ---
echo "[3/8] Creating data directories at $DATA_DIR..."
mkdir -p \
    "$DATA_DIR/generated_images" \
    "$DATA_DIR/generated_audio" \
    "$DATA_DIR/uploads" \
    "$DATA_DIR/logs" \
    "$DATA_DIR/backups"
chown -R "$CLARA_USER:$CLARA_USER" "$DATA_DIR"

# --- 4. Clone or update repo ---
echo "[4/8] Setting up Clara at $CLARA_DIR..."
if [ -d "$CLARA_DIR/.git" ]; then
    echo "  Repository exists — pulling latest changes..."
    git -C "$CLARA_DIR" config core.fileMode false
    git -C "$CLARA_DIR" pull
else
    echo "  Cloning repository from GitHub..."
    git clone https://github.com/Stavian/Clara.git "$CLARA_DIR"
    git -C "$CLARA_DIR" config core.fileMode false
fi
git config --global --add safe.directory "$CLARA_DIR"

# --- 5. Python virtual environment ---
echo "[5/8] Creating Python virtual environment..."
python3 -m venv "$CLARA_DIR/venv"
"$CLARA_DIR/venv/bin/pip" install --upgrade pip -q
"$CLARA_DIR/venv/bin/pip" install -r "$CLARA_DIR/requirements.txt" -q

# --- 6. Environment file ---
echo "[6/8] Checking .env file..."
if [ ! -f "$CLARA_DIR/.env" ]; then
    cp "$CLARA_DIR/.env.example" "$CLARA_DIR/.env"
    echo ""
    echo "  *** ACTION REQUIRED ***"
    echo "  Edit $CLARA_DIR/.env before starting Clara:"
    echo "    nano $CLARA_DIR/.env"
    echo ""
    echo "  Required settings:"
    echo "    HOST=0.0.0.0"
    echo "    OLLAMA_BASE_URL=http://<GPU_VM_IP>:11434"
    echo "    WEB_PASSWORD=<strong password>"
    echo "    JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
    echo ""
    echo "  Optional (if SD Forge is running on the GPU VM):"
    echo "    SD_ENABLED=true"
    echo "    SD_API_URL=http://<GPU_VM_IP>:7860"
    echo ""
fi
chown "$CLARA_USER:$CLARA_USER" "$CLARA_DIR/.env"
chmod 600 "$CLARA_DIR/.env"

# --- 7. Systemd service ---
echo "[7/8] Installing systemd service..."
cp "$CLARA_DIR/deploy/clara.service" "$SERVICE_FILE"
chmod 644 "$SERVICE_FILE"
chown -R "$CLARA_USER:$CLARA_USER" "$CLARA_DIR"
systemctl daemon-reload
systemctl enable clara
echo "  Service installed and enabled for auto-start."

# --- 8. Backup cron job + SSH ---
echo "[8/8] Final setup..."

CRON_LINE="0 3 * * * $CLARA_DIR/deploy/backup.sh >> $DATA_DIR/logs/backup.log 2>&1"
chmod +x "$CLARA_DIR/deploy/backup.sh"
chmod +x "$CLARA_DIR/deploy/update.sh"
EXISTING_CRON=$(crontab -l 2>/dev/null || true)
if ! echo "$EXISTING_CRON" | grep -qF "backup.sh"; then
    (echo "$EXISTING_CRON"; echo "$CRON_LINE") | crontab -
fi
echo "  Backup cron job added (runs daily at 03:00)."

systemctl enable ssh
systemctl start ssh
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh
echo "  SSH configured."

VM_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "=== Installation complete ==="
echo ""
echo "Clara VM IP: $VM_IP"
echo ""
echo "NEXT STEPS:"
echo ""
echo "  1. Edit your .env:"
echo "     nano $CLARA_DIR/.env"
echo "     Set HOST=0.0.0.0, OLLAMA_BASE_URL, WEB_PASSWORD, JWT_SECRET"
echo ""
echo "  2. Start Clara:"
echo "     systemctl start clara"
echo "     journalctl -u clara -f"
echo ""
echo "  3. Access Clara from your PC:"
echo "     http://$VM_IP:8080"
echo ""
echo "  4. VS Code Remote SSH:"
echo "     - Install 'Remote - SSH' extension in VS Code"
echo "     - F1 → Remote-SSH: Connect to Host → root@$VM_IP"
echo "     - Open folder: $CLARA_DIR"
echo ""
echo "  5. Future updates (after git push on your PC):"
echo "     ssh root@$VM_IP '/opt/clara/deploy/update.sh'"
echo ""
