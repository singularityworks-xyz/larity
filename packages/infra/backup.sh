#!/usr/bin/env bash
set -euo pipefail

# Nightly Postgres backup to Cloudflare R2.
# - Dumps via pg_dump inside the running postgres container
# - Compresses and uploads to R2 (rclone remote: larity-r2)
# - Prunes local dumps older than BACKUP_LOCAL_RETENTION_DAYS
# - Prunes remote dumps older than BACKUP_REMOTE_RETENTION_DAYS
#
# Secrets are read from /root/.config/larity-backup/env (0600) on the VM:
#   POSTGRES_CONTAINER=<docker container name>
#   POSTGRES_USER=<db user>
#   POSTGRES_DB=<db name>
#   R2_BUCKET=<bucket name, e.g. larity-backups>
#
# The rclone remote "larity-r2" is configured in /root/.config/rclone/rclone.conf (0600).

ENV_FILE="/root/.config/larity-backup/env"
RETENTION_LOCAL_DAYS="${BACKUP_LOCAL_RETENTION_DAYS:-7}"
RETENTION_REMOTE_DAYS="${BACKUP_REMOTE_RETENTION_DAYS:-30}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${POSTGRES_CONTAINER:?POSTGRES_CONTAINER not set in $ENV_FILE}"
: "${POSTGRES_USER:?POSTGRES_USER not set in $ENV_FILE}"
: "${POSTGRES_DB:?POSTGRES_DB not set in $ENV_FILE}"
: "${R2_BUCKET:=larity-backups}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOCAL_DIR="/var/backups/larity"
DUMP_FILE="${LOCAL_DIR}/${POSTGRES_DB}-${TIMESTAMP}.sql.gz"

mkdir -p "$LOCAL_DIR"

docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip -9 > "$DUMP_FILE"

# Upload to R2
rclone copyto "$DUMP_FILE" "larity-r2:${R2_BUCKET}/$(basename "$DUMP_FILE")"

# Prune local dumps older than retention
find "$LOCAL_DIR" -name "${POSTGRES_DB}-*.sql.gz" -mtime +"$RETENTION_LOCAL_DAYS" -delete

# Prune remote dumps older than retention (rclone --min-age filter)
rclone delete "larity-r2:${R2_BUCKET}" --min-age "${RETENTION_REMOTE_DAYS}d"

echo "backup complete: $(basename "$DUMP_FILE")"
