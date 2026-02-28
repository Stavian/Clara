#!/bin/bash
# ============================================================
# setup_n8n_lxc.sh — Create n8n LXC container on Proxmox
# Run as root on the Proxmox host:
#   bash /opt/clara/deploy/setup_n8n_lxc.sh
#
# Override defaults via env vars:
#   N8N_CT_ID=110 N8N_IP=192.168.178.131 bash setup_n8n_lxc.sh
# ============================================================
set -euo pipefail

# ─── Configurable defaults ────────────────────────────────────────────────────
CT_ID="${N8N_CT_ID:-103}"
CT_NAME="n8n"
CT_IP="${N8N_IP:-192.168.178.130}/24"
CT_GW="${N8N_GW:-192.168.178.1}"
CT_BRIDGE="vmbr0"
CT_RAM=2048
CT_CORES=2
CT_DISK="8"
CT_STORAGE="${CT_STORAGE:-local-lvm}"   # change to "local" if you use dir storage
N8N_PORT=5678
N8N_TIMEZONE="Europe/Berlin"
# ─────────────────────────────────────────────────────────────────────────────

CT_IP_PLAIN="$(echo "$CT_IP" | cut -d/ -f1)"

echo "╔══════════════════════════════════════════════╗"
echo "║   Clara × n8n LXC Setup                     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Container ID : $CT_ID"
echo "  Hostname     : $CT_NAME"
echo "  IP           : $CT_IP  (gateway: $CT_GW)"
echo "  Resources    : ${CT_CORES} cores, ${CT_RAM}MB RAM, ${CT_DISK}GB disk"
echo "  Storage      : $CT_STORAGE"
echo "  n8n port     : $N8N_PORT"
echo ""

# Guard: container ID must be free
if pct status "$CT_ID" &>/dev/null; then
    echo "ERROR: Container $CT_ID already exists."
    echo "       Set N8N_CT_ID=<free-id> and re-run."
    exit 1
fi

# ── Step 1: Debian 12 template ────────────────────────────────────────────────
echo "── Step 1: Debian 12 template ───────────────"
pveam update 2>/dev/null | tail -1

TEMPLATE="$(pveam available --section system 2>/dev/null \
    | grep 'debian-12-standard' \
    | awk '{print $2}' \
    | sort -V \
    | tail -1)"

if [ -z "$TEMPLATE" ]; then
    echo "ERROR: No debian-12-standard template found in Proxmox repo."
    exit 1
fi

TEMPLATE_PATH="/var/lib/vz/template/cache/$TEMPLATE"
if [ -f "$TEMPLATE_PATH" ]; then
    echo "Template already cached: $TEMPLATE"
else
    echo "Downloading $TEMPLATE ..."
    pveam download local "$TEMPLATE"
fi

# ── Step 2: Create LXC container ─────────────────────────────────────────────
echo ""
echo "── Step 2: Creating LXC container ───────────"
pct create "$CT_ID" "local:vztmpl/$TEMPLATE" \
    --hostname  "$CT_NAME" \
    --cores     "$CT_CORES" \
    --memory    "$CT_RAM" \
    --swap      512 \
    --rootfs    "${CT_STORAGE}:${CT_DISK}" \
    --net0      "name=eth0,bridge=${CT_BRIDGE},ip=${CT_IP},gw=${CT_GW}" \
    --unprivileged 1 \
    --features  nesting=1 \
    --onboot    1 \
    --start     1

echo "Container $CT_ID created and started — waiting 8 s for boot ..."
sleep 8

# ── Step 3: Install Node.js 20 + n8n ─────────────────────────────────────────
echo ""
echo "── Step 3: Installing Node.js 20 + n8n ──────"
pct exec "$CT_ID" -- bash -c "
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -q
apt-get install -y -q curl gnupg2 ca-certificates

# Node.js 20 LTS (nodesource)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo \"  node \$(node --version)  npm \$(npm --version)\"

# n8n
npm install -g n8n --loglevel=warn
echo \"  n8n \$(n8n --version)\"

# System user for n8n
useradd -r -s /bin/false -m -d /home/n8n n8n 2>/dev/null || true

# Data directory
mkdir -p /opt/n8n/data
chown -R n8n:n8n /opt/n8n

# systemd unit
cat > /etc/systemd/system/n8n.service << 'UNIT'
[Unit]
Description=n8n workflow automation
After=network.target

[Service]
Type=simple
User=n8n
Environment=HOME=/home/n8n
Environment=N8N_USER_FOLDER=/opt/n8n/data
Environment=N8N_PORT=${N8N_PORT}
Environment=N8N_HOST=0.0.0.0
Environment=N8N_PROTOCOL=http
Environment=GENERIC_TIMEZONE=${N8N_TIMEZONE}
Environment=N8N_SECURE_COOKIE=false
Environment=N8N_RUNNERS_ENABLED=true
ExecStart=/usr/bin/n8n start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable n8n
systemctl start n8n
echo 'n8n service started.'
"

# ── Step 4: Wait for n8n to be ready ─────────────────────────────────────────
echo ""
echo "── Step 4: Waiting for n8n to be ready ──────"
for i in $(seq 1 40); do
    STATUS=$(pct exec "$CT_ID" -- \
        curl -s -o /dev/null -w "%{http_code}" \
        "http://localhost:${N8N_PORT}/healthz" 2>/dev/null || echo "000")
    if [ "$STATUS" = "200" ]; then
        echo "  n8n is ready! (${i}s)"
        break
    fi
    printf "  Waiting... [%d/40]\r" "$i"
    sleep 2
done
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════╗"
echo "║   Setup complete!                            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  n8n UI : http://${CT_IP_PLAIN}:${N8N_PORT}"
echo ""
echo "  Next steps:"
echo "  1. Open http://${CT_IP_PLAIN}:${N8N_PORT} in your browser"
echo "  2. Create the owner account (email + password)"
echo "  3. Settings → n8n API → Create API key"
echo "  4. Add to /opt/clara/.env:"
echo "       N8N_ENABLED=true"
echo "       N8N_BASE_URL=http://${CT_IP_PLAIN}:${N8N_PORT}"
echo "       N8N_API_KEY=<paste-key-here>"
echo "  5. Restart Clara: systemctl restart clara"
echo ""
