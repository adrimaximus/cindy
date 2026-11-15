#!/bin/bash
# agent-memory-sync — tarik catatan memory goclaw dari spark (workdir Cindy) via Tailscale SSH.
# Jalur: adrimx@100.78.200.32:~/goclaw/memory/ → ~/Spark-Sync/goclaw/memory/
# Dijalankan LaunchAgent tiap 15 detik. Append-only (TANPA --delete).
# Syncthing TIDAK dipakai — folder Spark stay paused/sync mati, kode tidak ikut pindah.
set -u
SPARK_HOST=adrimx@100.78.200.32
SRC="$SPARK_HOST:goclaw/memory/"
DST="$HOME/Spark-Sync/goclaw/memory/"
LOG="$HOME/Library/Logs/agent-memory-sync.log"
LOCK="/tmp/agent-memory-sync.lck"

# Interval pendek: skip kalau run sebelumnya masih hidup
mkdir "$LOCK" 2>/dev/null || exit 0
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

mkdir -p "$DST"
if ! rsync -rlptu -e "ssh -i $HOME/.ssh/id_ed25519 -o BatchMode=yes -o ConnectTimeout=6" "$SRC" "$DST" >/dev/null 2>>"$LOG"; then
  echo "$(date '+%F %T') pull failed (spark offline?)" >> "$LOG"
fi
