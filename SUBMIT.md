# SUBMIT — Solana Blitz v10 (BLITZPACKS)

> ⚠️ **JANGAN submit sebelum membaca bagian "Yang belum siap".**
> Deadline: **Jumat 27 Nov 2026, 21:00 WIB** (15:00 UTC).
> Submit di: https://build.magicblock.app/?stage=blitz#submit

## 0. Yang sudah siap hari ini (25 Nov)

- [x] Repo lengkap di `~/workspace/hackathons/solana-blitz-v10/`
- [x] App demo jalan penuh (build + preview teruji, `npm test` 8/8 lolos)
- [x] Cek devnet live 8/8 lolos (25 Nov 10:21 WIB — lihat `scripts/check-devnet.mjs`)
- [x] README + arsitektur + program Anchor lengkap
- [x] **Program Anchor BERHASIL COMPILE** (`anchor build` exit 0, 25 Nov 04:13 WIB,
  Anchor 0.32.1 di Simular Box; IDL lengkap 9 instruksi)
- [x] **Program ID (devnet): `9pUtR3AZEYPRHhQrWVECT2c7Ye2YULz4sjWx9xNi6Z8E`**
- [x] **App di-rebuild dengan `VITE_PROGRAM_ID` terisi** (25 Nov 04:15 WIB,
  `dist/` siap upload)
- [ ] **Program BELUM ter-deploy ke devnet** — wallet deployer throwaway
  sudah dibuat (`HTptHwj12b3JAH7te6rXPhXhFPACeVKM4cQhvzTxoJPr`), tapi
  faucet devnet rate-limit, saldo 0 SOL; retry otomatis tiap 5 menit
  jalan di box (log `/workspace/airdrop-retry.log`)
- [ ] **Demo publik BELUM di-host** (butuh login GitHub albar30 — lihat langkah 2)
- [ ] **Repo BELUM di-push ke GitHub** (butuh login browser user — lihat langkah 5)

Detail lengkap: `deploy-log-2026-11-25.md`.

## 1. Deploy program ke devnet (wajib untuk mode live)

SUDAH: compile selesai di Simular Box "main" (`/workspace/blitzpacks-ws/`,
Rust 1.89, Solana CLI 3.1.9, Anchor 0.32.1). `.so` 328.920 byte +
IDL lengkap sudah jadi. Program ID: `9pUtR3AZEYPRHhQrWVECT2c7Ye2YULz4sjWx9xNi6Z8E`.

TINGGAL (setelah wallet deployer punya ≥ 5 SOL devnet — retry airdrop
otomatis sedang jalan; kalau tetap gagal, coba web faucet
https://faucet.solana.com dengan alamat
`HTptHwj12b3JAH7te6rXPhXhFPACeVKM4cQhvzTxoJPr`):

```bash
# di Simular Box "main":
cd /workspace/blitzpacks-ws
solana program deploy --program-id /workspace/blitzpacks-keypair-backup.json \
  programs/blitzpacks/target/deploy/blitzpacks.so \
  --url https://api.devnet.solana.com
solana program show 9pUtR3AZEYPRHhQrWVECT2c7Ye2YULz4sjWx9xNi6Z8E \
  --url https://api.devnet.solana.com
```

`app/.env` sudah berisi `VITE_PROGRAM_ID` yang benar dan `app/dist/`
sudah di-rebuild — tidak perlu `anchor keys sync` / rebuild program lagi
(program id sudah final sejak awal).

## 2. Host demo publik (gratis, ~5 menit, BUTUH LOGIN USER)

`app/dist/` sudah jadi (build 25 Nov 04:15 WIB, program id terisi).
Config sudah ada: `netlify.toml` + `app/vercel.json`.

Pilih satu (dari browser, login GitHub **albar30**):

- **Netlify Drop (paling gampang):** buka https://app.netlify.com/drop →
  drag-and-drop folder `app/dist/` → dapat URL `https://<nama>.netlify.app`.
- **Atau Netlify dari repo:** setelah repo ter-push, connect repo di Netlify
  (base `app`, build `npm run build`, publish `app/dist`).
- **Atau Vercel:** import repo di vercel.com (config `app/vercel.json` ada).

Tanpa hosting pun submit tetap bisa (lampirkan repo), tapi demo live
jauh lebih kuat di mata juri.

## 3. Uji live sekali (devnet, wallet sekali pakai)

1. Buka URL demo → toggle **Live Devnet** → Connect Phantom (pastikan
   Phantom di jaringan **Devnet**, wallet sekali pakai berisi devnet SOL).
2. Klik **Delegate player PDA → ER** → approve di Phantom.
3. Main Blitz Tap, buka 1 pack, klik **Commit → devnet**.
4. Cek transaksi di explorer.solana.com (cluster devnet) — simpan
   signature-nya untuk form submit.

## 4. Isi form submit (build.magicblock.app)

| Field | Isi |
|---|---|
| Project name | **BLITZPACKS — Gacha Pack Arena** |
| Tagline | Gacha pack opener yang adil: loot diputuskan MagicBlock VRF, sesi jalan di Ephemeral Rollup, koleksi dimiliki di Solana devnet. |
| Description | Entertainment Finance: skill game Blitz Tap menghasilkan pack; pack dibuka dengan MagicBlock VRF (proof terverifikasi on-chain, 30 kartu, 5 rarity); state pemain di-delegate ke Ephemeral Rollup (gasless, ~10–50 ms) lalu di-commit kembali ke devnet; duplikat jadi dust, dust beli pack; leaderboard berdasarkan collection value. |
| MagicBlock stack used | **MagicBlock VRF** (request + callback on-chain) **dan Ephemeral Rollups** (delegate / commit / undelegate player PDA) |
| Live demo URL | URL Vercel/Netlify dari langkah 2 |
| Repository | URL repo (GitHub — push dulu; lihat langkah 5) |
| Video (opsional, disarankan) | Rekam 60–90 dtk: tap game → buka pack → kartu Legendary/Mythic muncul → leaderboard. |
| Program ID (devnet) | `9pUtR3AZEYPRHhQrWVECT2c7Ye2YULz4sjWx9xNi6Z8E` (belum ter-deploy — deploy tertunda faucet, lihat §0) |
| Notes for judges | Demo mode jalan tanpa wallet; live mode butuh Phantom devnet + program id. Semua klaim di README ditandai mana yang terverifikasi dan mana yang belum. Program sudah compile (Anchor 0.32.1) + IDL lengkap; deploy ke devnet menyusul setelah faucet devnet memberi SOL. |

## 5. Push repo ke GitHub (sebelum submit)

```bash
cd ~/workspace/hackathons/solana-blitz-v10
git init && git add . && git commit -m "BLITZPACKS — Solana Blitz v10 entry"
gh repo create blitzpacks --public --source=. --push
# atau buat repo manual di github.com lalu: git remote add origin <url> && git push -u origin main
```

Periksa: tidak ada file `.env`, keypair, atau seed di repo
(`.gitignore` sudah menutupinya — verifikasi dengan `git status`).

## 6. Checklist akhir sebelum klik Submit

- [ ] Program ter-deploy di devnet, program id di `.env` + form
- [ ] Demo publik bisa dibuka tanpa login
- [ ] Satu transaksi live (delegate/open/commit) berhasil + signature tercatat
- [ ] Repo publik, README terbaca
- [ ] Tidak ada mainnet, tidak ada pembayaran, tidak ada KYC

## Yang butuh user (tidak bisa dilakukan agen)

1. **Push repo ke GitHub** — `gh` tidak login di VM; buat repo + push lewat
   browser yang login sebagai **albar30** (lihat langkah 5).
2. **Hosting demo** — Netlify Drop (`app/dist/`) atau Vercel dari repo
   (butuh login GitHub albar30).
3. **Klik Submit final** di build.magicblock.app (butuh login builder
   MagicBlock — kemungkinan profil + grup Telegram Builders).
4. **(Opsional)** Rekam video demo 60–90 detik.

Yang SUDAH dikerjakan agen (tidak butuh user lagi): compile program di
Simular Box, program keypair + IDL, `app/.env` + rebuild app, wallet
deployer throwaway devnet. Satu-satunya blocker teknis saat ini adalah
faucet devnet yang rate-limit (retry otomatis jalan).
