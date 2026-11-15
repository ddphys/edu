#!/bin/sh
# Ночная копия базы edu; хранятся последние 14
set -e
pg_dump edu | gzip > /var/backups/edu/edu-$(date +%F).sql.gz
ls -1t /var/backups/edu/edu-*.sql.gz | tail -n +15 | xargs -r rm --
