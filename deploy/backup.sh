#!/usr/bin/env bash
# Nightly backup of ALL application data (applications, documents, staff, access log).
# Usage:  deploy/backup.sh            (cron: 30 2 * * * /home/ubuntu/anchoria/deploy/backup.sh)
# Optional off-server copy: set OCI_BUCKET (needs the `oci` CLI configured) — recommended.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${BACKUP_DIR:-$HOME/anchoria-backups}"
mkdir -p "$DEST"
FILE="$DEST/anchoria-$(date +%F-%H%M).tar.gz"
tar czf "$FILE" -C data .
chmod 600 "$FILE"
if [ -n "${OCI_BUCKET:-}" ] && command -v oci >/dev/null; then
  oci os object put --bucket-name "$OCI_BUCKET" --file "$FILE" --force >/dev/null
fi
find "$DEST" -name 'anchoria-*.tar.gz' -mtime +14 -delete   # keep 14 days locally
echo "Backup written: $FILE"
