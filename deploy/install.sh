#!/bin/bash
# =============================================================
# Clara AI Assistant — Proxmox VM Installation Script
# Tested on Ubuntu 22.04 LTS
# Run as root: sudo bash install.sh
# =============================================================

set -euo pipefail

CLARA_DIR="/opt/clara"
CLARA_USER="clara"
STORAGE_ROOT="/mnt/storage/clara"
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
    ffmpeg

# --- 2. Create system user ---
echo "[2/8] Creating system user '$CLARA_USER'..."
id "$CLARA_USER" &>/dev/null || useradd --system --shell /bin/false --home "$CLARA_DIR" "$CLARA_USER"

# --- 3. Storage directories on HDD ---
echo "[3/8] Creating storage directories at $STORAGE_ROOT..."
mkdir -p \
    "$STORAGE_ROOT/images" \
    "$STORAGE_ROOT/audio" \
    "$STORAGE_ROOT/uploads" \
    "$STORAGE_ROOT/logs" \
    "$STORAGE_ROOT/backups"
chown -R "$CLARA_USER:$CLARA_USER" "$STORAGE_ROOT"

# --- 4. Clone or update repo ---
echo "[4/8] Setting up Clara at $CLARA_DIR..."
if [ -d "$CLARA_DIR/.git" ]; then
    echo "  Repository exists — pulling latest changes..."
    git -C "$CLARA_DIR" pull
else
    echo "  Cloning repository..."
    # Replace with your actual repo URL if using git:
    # git clone https://github.com/yourusername/clara.git "$CLARA_DIR"
    # Or copy files manually:
    echo "  NOTE: Copy Clara files to $CLARA_DIR manually, then re-run this script."
    echo "  Example: rsync -av /path/to/clara/ $CLARA_DIR/"
fi

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
    echo "    - Set WEB_PASSWORD"
    echo "    - Generate and set JWT_SECRET:"
    echo "      python3 -c \"import secrets; print(secrets.token_hex(32))\""
    echo "    - Set DISCORD_BOT_TOKEN if needed"
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

# --- 8. Backup cron job ---
echo "[8/8] Installing daily backup cron job..."
CRON_LINE="0 3 * * * $CLARA_DIR/deploy/backup.sh >> $STORAGE_ROOT/logs/backup.log 2>&1"
chmod +x "$CLARA_DIR/deploy/backup.sh"
# Add to root's crontab if not already there
(crontab -l 2>/dev/null | grep -qF "backup.sh") || \
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
echo "  Backup cron job added (runs daily at 03:00)."

echo ""
echo "=== Installation complete ==="
echo ""
echo "IMPORTANT — Ollama setup:"
echo "  curl -fsSL https://ollama.com/install.sh | sh"
echo "  ollama pull huihui_ai/qwen3-abliterated:14b"
echo "  ollama pull nomic-embed-text"
echo ""
echo "IMPORTANT — GPU (GTX 3060) setup for Ollama:"
echo "  Ollama auto-detects NVIDIA GPUs after driver install."
echo "  Install NVIDIA drivers: sudo apt-get install nvidia-driver-535"
echo "  Verify: nvidia-smi"
echo ""
echo "IMPORTANT — Ollama model storage on HDD (optional, if models are large):"
echo "  Ollama stores models in ~/.ollama by default (SSD)."
echo "  To move to HDD:"
echo "    mkdir -p /mnt/storage/ollama"
echo "    systemctl stop ollama"
echo "    mv ~/.ollama /mnt/storage/ollama"
echo "    ln -s /mnt/storage/ollama ~/.ollama"
echo "    systemctl start ollama"
echo ""
echo "After editing .env, start Clara:"
echo "  sudo systemctl start clara"
echo "  sudo journalctl -u clara -f    # watch logs"
echo ""
echo "Access Clara from your main PC:"
echo "  http://<VM_IP>:8080"
echo "  (find VM IP: ip a | grep inet)"
