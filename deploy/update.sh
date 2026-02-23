#!/bin/bash
# =============================================================
# Clara AI Assistant — Update Script
# Run on the VM after pushing changes from your PC:
#   ssh root@<VM_IP> 'bash /opt/clara/deploy/update.sh'
# Or interactively:
#   sudo /opt/clara/deploy/update.sh
# =============================================================

set -euo pipefail

CLARA_DIR="/opt/clara"

echo "[1/3] Pulling latest code from GitHub..."
git -C "$CLARA_DIR" pull

echo "[2/3] Updating Python dependencies..."
"$CLARA_DIR/venv/bin/pip" install -r "$CLARA_DIR/requirements.txt" -q

echo "[3/3] Restarting Clara..."
systemctl restart clara
sleep 2
systemctl status clara --no-pager -l

echo ""
echo "Done. Clara is updated and running."
