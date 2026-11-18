# Coding Loop Fast-Path Plan（draft / 未评审）

> Status: **draft proposal** — belum direview, belum ada keputusan produk.
> Latar diskusi: model sama (mis. GLM 5.3) di harness berbeda menghasilkan ketajaman
> coding berbeda. Faktor penentunya bukan model, melainkan **friction per iterasi**
> (jumlah gerbang + lapisan translasi per tool call) dan kepadatan feedback loop.
> Dokumen ini mengusulkan cara menurunkan friction di Cindy **tanpa menurunkan batas
> keamanan yang sudah diputuskan**.

## 1. Temuan现状（apa yang sudah ada — jangan diusulkan ulang）

Audit cepat atas `packages/maker-core`:

| Sudah ada | Lokasi | Catatan |
| --- | --- | --- |
| 5 state `PermissionMode` (ask/default/acceptEdits/plan/auto/bypassPermissions) | `types/common.ts` | Codex hanya subset ask/auto/bypass |
| Auto-Review Core harness-agnostic + tier lokal + retry budget + cache in-process | `agents/shared/auto-review*.ts`, `claude-code/auto-review-policy.ts` | Cache hanya hidup satu proses |
| Project trust authority (status/scope/revision/stale) — **khusus Pi** | `types/pi-project-trust.ts` | Belum generik untuk semua harness |
| Translator & normalizer lapisan | `claude-code/jsonl-tool-id-normalize.ts`, `mcp-server-tools.ts`, `capability-routing.ts` | Tiap lapisan = titik latency/failure |
| Serialisasi perubahan permission mid-session | `session.ts` (permissionModeChangeChain) | Perlu dipastikan tidak memblok turn lama |
| Project memory persisten, analisis struktur/simbol, test loop terkait | module memory maker-core dkk. | Konfirmasi maintainer 2026-11-18: sudah dimiliki Cindy — sengaja tidak diusulkan ulang |

Kesimpulan: masalahnya **bukan** "tidak ada trusted mode". Masalahnya: posture default
tetap ask-per-action untuk user lokal, trust bersifat per-sesi / per-harness, dan
beberapa hop (review model call, normalizer) menambah latency di setiap iterasi.

## 2. Proposal

### P1 — Read-Only Fast Lane（prioritas pertama, risiko terkecil）

Klasifikasi kanonik tool **read-only** lintas harness di maker-core
(Read/Grep/Glob/LS/git status·diff·log, dan padanannya di Codex/Pi):

- Dalam scope project yang sudah disetujui user → **tidak ada approval UI, tidak ada
  auto-review model call**. Baca tidak bisa mengubah apa pun; batas privasi sudah
  ditentukan oleh scope yang user setujui sendiri.
- Deny-list tetap berlaku **termasuk di bypassPermissions**: path kredensial & file
  sensitif (mengikuti `credentials-and-local-storage.md`) tetap ditolak.
- Plugin sandbox `.cindy` **tidak ikut** fast lane ini — ghost capability slot tetap.

### P2 — Generalisasi Project Trust ke semua harness

Naikkan pola `pi-project-trust` (status/scope/revision/revocation) menjadi
**trust profile per project** untuk semua harness:

- User menyetujui satu kali per repo: scope (working-dir / repo-root) + profile
  permission (mis. `acceptEdits` + auto-run test).
- Sesi baru di project yang sama otomatis memakai profile; revision berubah →
  status `stale`, minta persetujuan ulang (semantik sama dengan Pi trust).
- Subagent mewarisi profile → paralelisme tidak melipatgandakan gerbang.
- Satu tombol revoke, audit history tetap jalan (trust authority pattern).

### P3 — Auto-Review bertingkat + cache persisten

- Tier 0 (lokal, nol biaya, nol latency model): perluas cakupan
  `classifyLocalAutoReviewTier` supaya kasus jelas selesai tanpa model call.
- Tier 1 (model) hanya untuk kasus ambigu.
- Cache keputusan **persisten lintas sesi**, key: `(scopeKey project, tool,
  fingerprint arg)` — hari ini hanya in-process.
- Ceiling per turn: review tidak boleh mendominasi waktu loop.

### P4 — Hop audit & latency budget (instrumentation-first, tanpa behavior change)

- Dekomposisi latency per tool call: harness SDK → translator → MCP → eksekusi →
  normalisasi hasil. Emit p50/p95 per hop (lihat pola `docs/benchmarks`).
- Budget eksplisit: read path overhead < target ms di atas harness mentah;
  write path < target ms.
- Jaminan **error passthrough**: stderr/stdout mentah sampai ke model melalui
  semua lapisan normalizer (bug class: error "diperhalus" sampai model tidak bisa
  self-correct).

## 3. Batas yang TIDAK dilonggarkan（红线）

- Plugin sandbox & capability slot: tetap.
- Tugas dari IM: disiplin konfirmasi `im-permission-confirmation.md` tetap.
- Kredensial: deny-list berlaku bahkan di bypassPermissions; nilai input-handoff
  tidak masuk model.
- Remote/device-link: fast lane hanya berlaku untuk scope yang disetujui **lokal**
  di mesin itu.

## 4. Metrik keberhasilan

| Metrik | Target arah |
| --- | --- |
| Approval UI per coding task (user lokal, project trusted) | 0 untuk read; 1–3 total |
| p50/p95 overhead tool call vs harness mentah | diukur (P4), lalu turun tiap rilis |
| % permission request selesai di Tier 0 | naik monoton |
| time-to-first-edit sesi coding di repo trusted | mendekati sesi CLI |

## 5. Urutan & risiko

1. **P4 dulu** (instrumentasi, tanpa behavior change) → baseline jujur.
2. **P1** (read fast lane) — perubahan smallest-blast-radius.
3. **P2** pilot di belakang UI ala Pi-trust.
4. **P3** menyusul sesuai hasil baseline P4.

Risiko utama: fast lane yang salah klasifikasi (tool "read" yang ternyata menulis)
→ mitigasi: klasifikasi dideklarasikan eksplisit per tool di capability routing,
bukan inferensi nama; default deny untuk tool tak terklasifikasi.

## 6. Jika diterima: dokumen yang ikut disentuh

`docs/dev-rules/agent-capabilities.md` (klasifikasi read-only), `engineering-conventions.md`
(budget latency), UI approval desktop (trust profile editor). Semua perubahan lewat
PR biasa + DCO.
