#!/bin/bash
# =============================================================
# Clara AI Assistant — Update Script (Node)
# Run on the VM after pushing changes from your PC:
#   ssh root@<VM_IP> 'bash /opt/clara/deploy/update.sh'
# =============================================================

set -euo pipefail

CLARA_DIR="/opt/clara"

echo "[1/4] Pulling latest code from GitHub..."
git -C "$CLARA_DIR" pull

echo "[2/4] Installing Node dependencies..."
cd "$CLARA_DIR"
npm ci

echo "[3/4] Building..."
npm run build

echo "[4/4] Restarting Clara..."
chown -R clara:clara "$CLARA_DIR/node_modules" "$CLARA_DIR/dist" 2>/dev/null || true
systemctl restart clara
sleep 2
systemctl status clara --no-pager -l

echo ""
echo "Done. Clara is updated and running."
