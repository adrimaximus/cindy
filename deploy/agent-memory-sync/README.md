# Agent Memory Sync — spark → Mac (rsync lane)

Deploy 2026-11-15. Jalur otomatis supaya catatan memory goclaw (`memory/*.md`)
yang ditulis agent di spark (Cindy/clara) sampai ke MacBook dalam ±15 detik,
**tanpa syncthing** — folder Spark sengaja tidak disync (risk conflict
±2.800 file kode beda antar mesin saat itu; keputusan Ko Adri 2026-11-15).

## Topologi

```
Cindy spark menulis catatan           MacBook (LaunchAgent tiap 15 dtk)
/home/adrimx/goclaw/memory/*.md  →  rsync pull via Tailscale SSH  →  ~/Spark-Sync/goclaw/memory/
      (workdir, satu tempat saja)                                    (dibaca Cindy Mac & goose)
```

- Sumber kebenaran catatan: `/home/adrimx/goclaw/memory/` di spark (git-tracked).
- Spark punya 2 checkout goclaw: workdir `/home/adrimx/goclaw` (tempat menulis)
  dan clone `/home/adrimx/Spark-Sync/goclaw` (pasangan syncthing, TIDAK aktif —
  bukan tempat menulis catatan).
- Lane ini **satu arah** (spark → Mac). Catatan dari sisi Mac balik ke spark
  lewat git commit + push, bukan lane.
- Append-only: TANPA `--delete` — catatan tidak pernah dihapus oleh lane.

## File

| File | Terpasang di Mac |
|---|---|
| `agent-memory-sync.sh` | `~/.local/bin/agent-memory-sync.sh` (chmod +x) |
| `com.betterworks.agent-memory-sync.plist` | `~/Library/LaunchAgents/` (loaded) |

Key SSH: `~/.ssh/id_ed25519` di Mac (user `betterworks`), sudah authorized di
spark (`adrimx@100.78.200.32`, Tailscale). Log failure-only:
`~/Library/Logs/agent-memory-sync.log`.

## Instal / update / stop (di Mac)

```bash
# instal / update
cp agent-memory-sync.sh ~/.local/bin/ && chmod +x ~/.local/bin/agent-memory-sync.sh
cp com.betterworks.agent-memory-sync.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.betterworks.agent-memory-sync.plist 2>/dev/null
launchctl load -w ~/Library/LaunchAgents/com.betterworks.agent-memory-sync.plist

# stop
launchctl unload ~/Library/LaunchAgents/com.betterworks.agent-memory-sync.plist
```

Interval: ubah `StartInterval` di plist lalu load ulang.

## Verifikasi terakhir

- E2E 2026-11-15: catatan baru di workdir spark sampai di Mac otomatis
  (file `memory/2026-11-15-agent-memory-sync-rsync-lane.md`, 1.586 byte),
  diverifikasi via polling SSH.
- Runbook lengkap + protokol penulisan catatan: repo goclaw,
  `memory/2026-11-15-agent-memory-sync-rsync-lane.md`.
