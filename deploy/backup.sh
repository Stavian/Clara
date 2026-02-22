#!/bin/bash
# Daily Clara database backup — run via cron or systemd timer
# Cron example (runs at 03:00 every day):
#   0 3 * * * /opt/clara/deploy/backup.sh >> /mnt/storage/clara/logs/backup.log 2>&1

set -euo pipefail

DB_PATH="${DB_PATH:-/opt/clara/data/clara.db}"
BACKUP_DIR="${BACKUP_DIR:-/mnt/storage/clara/backups}"
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d_%H%M%S)
DEST="$BACKUP_DIR/clara_${DATE}.db"

# Use SQLite's online backup (safe while the app is running)
sqlite3 "$DB_PATH" ".backup '$DEST'"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup saved: $DEST ($(du -h "$DEST" | cut -f1))"

# Remove backups older than KEEP_DAYS
find "$BACKUP_DIR" -name "clara_*.db" -mtime +"$KEEP_DAYS" -delete
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaned up backups older than ${KEEP_DAYS} days"
