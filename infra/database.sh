#!/bin/sh
set -eu
# Run from repository root; Compose resolves secret paths relative to infra/.
compose() { docker compose --env-file infra/.env -f infra/compose.yaml "$@"; }
mode=${1:-}
archive=${2:-}
[ -n "$archive" ] || { echo 'Usage: sh infra/database.sh backup archive.dump | restore archive.dump hyp_restore_unique_name' >&2; exit 2; }
umask 077
case "$mode" in
  backup)
    [ ! -e "$archive" ] || { echo 'Archive exists; choose a versioned filename' >&2; exit 1; }
    mkdir -p "$(dirname "$archive")"
    partial="$archive.$$.partial"
    trap 'rm -f "$partial"' EXIT HUP INT TERM
    compose exec -T db sh -c 'exec pg_dump -U postgres -d "$HYP_BACKUP_DB" --format=custom --no-owner --no-privileges' > "$partial"
    ln "$partial" "$archive"
    rm "$partial"
    echo 'Backup completed'
    ;;
  restore)
    [ -f "$archive" ] || { echo 'Archive missing' >&2; exit 1; }
    target=${3:-}
    case "$target" in hyp_restore_*) ;; *) echo 'Use a separate new hyp_restore_ database name' >&2; exit 2;; esac
    case "$target" in *[!a-z0-9_]*|'') echo 'Invalid target database name' >&2; exit 2;; esac
    # createdb refuses an existing database: never clean/drop/overwrite a live database.
    compose exec -T db createdb -U postgres -O huoyoupu "$target"
    compose exec -T db pg_restore -U huoyoupu --dbname="$target" --exit-on-error --single-transaction --no-owner --no-privileges < "$archive"
    echo 'Restore completed into a separate database; verify it before switching the application'
    ;;
  *) echo 'Unknown mode' >&2; exit 2;;
esac
