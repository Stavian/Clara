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
SD_DIR="/mnt/storage/stable-diffusion-webui-forge"
OLLAMA_MODELS_DIR="/mnt/storage/ollama"
SERVICE_FILE="/etc/systemd/system/clara.service"

echo "=== Clara Installer ==="

# --- 1. System dependencies ---
echo "[1/11] Installing system dependencies..."
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
echo "[2/11] Creating system user '$CLARA_USER'..."
id "$CLARA_USER" &>/dev/null || useradd --system --shell /bin/false --home "$CLARA_DIR" "$CLARA_USER"

# --- 3. Storage directories on HDD ---
echo "[3/11] Creating storage directories at $STORAGE_ROOT..."
mkdir -p \
    "$STORAGE_ROOT/images" \
    "$STORAGE_ROOT/audio" \
    "$STORAGE_ROOT/uploads" \
    "$STORAGE_ROOT/logs" \
    "$STORAGE_ROOT/backups"
chown -R "$CLARA_USER:$CLARA_USER" "$STORAGE_ROOT"

# --- 4. Clone or update repo ---
echo "[4/11] Setting up Clara at $CLARA_DIR..."
if [ -d "$CLARA_DIR/.git" ]; then
    echo "  Repository exists — pulling latest changes..."
    git -C "$CLARA_DIR" pull
else
    echo "  Cloning repository from GitHub..."
    git clone https://github.com/Stavian/Clara.git "$CLARA_DIR"
fi

# --- 5. Python virtual environment ---
echo "[5/11] Creating Python virtual environment..."
python3 -m venv "$CLARA_DIR/venv"
"$CLARA_DIR/venv/bin/pip" install --upgrade pip -q
"$CLARA_DIR/venv/bin/pip" install -r "$CLARA_DIR/requirements.txt" -q

# --- 6. Environment file ---
echo "[6/11] Checking .env file..."
if [ ! -f "$CLARA_DIR/.env" ]; then
    cp "$CLARA_DIR/.env.example" "$CLARA_DIR/.env"
    echo ""
    echo "  *** ACTION REQUIRED ***"
    echo "  Edit $CLARA_DIR/.env before starting Clara:"
    echo "    nano $CLARA_DIR/.env"
    echo "    - Set HOST=0.0.0.0"
    echo "    - Set WEB_PASSWORD"
    echo "    - Generate and set JWT_SECRET:"
    echo "      python3 -c \"import secrets; print(secrets.token_hex(32))\""
    echo ""
fi
chown "$CLARA_USER:$CLARA_USER" "$CLARA_DIR/.env"
chmod 600 "$CLARA_DIR/.env"

# --- 7. Systemd service ---
echo "[7/11] Installing systemd service..."
cp "$CLARA_DIR/deploy/clara.service" "$SERVICE_FILE"
chmod 644 "$SERVICE_FILE"
chown -R "$CLARA_USER:$CLARA_USER" "$CLARA_DIR"
systemctl daemon-reload
systemctl enable clara
echo "  Service installed and enabled for auto-start."

# --- 8. Backup cron job ---
echo "[8/11] Installing daily backup cron job..."
CRON_LINE="0 3 * * * $CLARA_DIR/deploy/backup.sh >> $STORAGE_ROOT/logs/backup.log 2>&1"
chmod +x "$CLARA_DIR/deploy/backup.sh"
chmod +x "$CLARA_DIR/deploy/update.sh"
(crontab -l 2>/dev/null | grep -qF "backup.sh") || \
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
echo "  Backup cron job added (runs daily at 03:00)."

# --- 9. Install Ollama + configure HDD model storage ---
echo "[9/11] Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh

# Store models on HDD to keep the SSD free
mkdir -p "$OLLAMA_MODELS_DIR"
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/storage.conf <<EOF
[Service]
Environment="OLLAMA_MODELS=$OLLAMA_MODELS_DIR"
EOF
systemctl daemon-reload
systemctl restart ollama

# Wait for Ollama to be ready
echo "  Waiting for Ollama to start..."
for i in $(seq 1 12); do
    sleep 5
    if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
        echo "  Ollama is ready."
        break
    fi
    echo "  Still waiting ($((i*5))s)..."
done

echo "  Pulling models (this will take a while — ~10 GB download)..."
ollama pull huihui_ai/qwen3-abliterated:14b
ollama pull nomic-embed-text
echo "  Ollama models ready."

# --- 10. Install Stable Diffusion Forge on HDD ---
echo "[10/11] Setting up Stable Diffusion Forge..."
if nvidia-smi &>/dev/null; then
    if [ ! -d "$SD_DIR" ]; then
        echo "  Cloning SD Forge repository (this is large — ~3 GB)..."
        git clone https://github.com/lllyasviel/stable-diffusion-webui-forge.git "$SD_DIR"
    else
        echo "  SD Forge already present at $SD_DIR."
    fi
    echo ""
    echo "  *** SD Forge first-run setup required ***"
    echo "  SD Forge installs its own Python venv on first launch."
    echo "  Run this once to complete setup (takes 10-20 min):"
    echo "    cd $SD_DIR && python3 launch.py --api --nowebui --exit"
    echo "  Then place your model files in:"
    echo "    $SD_DIR/models/Stable-diffusion/"
    echo ""
else
    echo "  WARNING: nvidia-smi not found — skipping SD Forge setup."
    echo "  Install NVIDIA drivers first: ubuntu-drivers install"
    echo "  Then re-run this script to install SD Forge."
fi

# --- 11. SSH for VS Code Remote ---
echo "[11/11] Configuring SSH for VS Code Remote access..."
systemctl enable ssh
systemctl start ssh

# Allow root login with SSH key (required for VS Code Remote)
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh

VM_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "=== Installation complete ==="
echo ""
echo "VM IP address: $VM_IP"
echo ""
echo "NEXT STEPS:"
echo ""
echo "  1. Edit your .env:"
echo "     nano $CLARA_DIR/.env"
echo "     (Set HOST=0.0.0.0, WEB_PASSWORD, JWT_SECRET)"
echo ""
echo "  2. Start Clara:"
echo "     systemctl start clara"
echo "     journalctl -u clara -f"
echo ""
echo "  3. Access Clara from your main PC:"
echo "     http://$VM_IP:8080"
echo ""
echo "  4. VS Code Remote SSH setup (on your Windows PC):"
echo "     - Install the 'Remote - SSH' extension in VS Code"
echo "     - Press F1 → 'Remote-SSH: Connect to Host'"
echo "     - Enter: root@$VM_IP"
echo "     - Open folder: $CLARA_DIR"
echo ""
echo "  5. Future code updates (after git push on your PC):"
echo "     ssh root@$VM_IP 'bash $CLARA_DIR/deploy/update.sh'"
echo "     or interactively: sudo $CLARA_DIR/deploy/update.sh"
