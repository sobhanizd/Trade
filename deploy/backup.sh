#!/usr/bin/env sh
# Nightly PostgreSQL backup with 14-day retention. Example cron (host):
#   15 3 * * * cd /opt/cryptopilot && ./deploy/backup.sh >> backups/backup.log 2>&1
set -eu
mkdir -p backups
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T db pg_dump -U cryptopilot -Fc cryptopilot > "backups/cryptopilot-$STAMP.dump"
find backups -name 'cryptopilot-*.dump' -mtime +14 -delete
echo "backup ok: backups/cryptopilot-$STAMP.dump"
