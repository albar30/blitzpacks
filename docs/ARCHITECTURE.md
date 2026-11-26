# BLITZPACKS — arsitektur

## Ringkasan satu paragraf

Pemain main skill game **Blitz Tap** (reaksi 15 detik) untuk mendapat pack.
Pack dibuka → program Anchor minta randomness ke **MagicBlock VRF** → oracle
mengembalikan 32 byte acak + proof yang diverifikasi on-chain → callback
mengubah byte itu menjadi 3 kartu (Common 60 / Rare 25 / Epic 10 /
Legendary 4 / Mythic 1). State pemain (pack, dust, koleksi) tinggal di PDA
`["player", authority]` yang di-**delegate ke Ephemeral Rollup** supaya tap
dan open jalan di ~10–50 ms tanpa gas; `commit` menyinkronkan kembali ke
Solana devnet. Duplikat di-recycle jadi dust, dust membeli pack baru
(EV pack ≈ 98 dust vs harga 100 — house edge ~2%).

## Diagram alir

```
                         ┌────────────────────────────┐
                         │  Solana devnet (base)      │
                         │  - Player PDA dibuat       │
                         │  - VRF queue (base)        │
                         │  - Delegation program      │
                         └──────▲───────────────▲─────┘
                                │ delegate      │ commit / undelegate
                                │               │
                         ┌──────┴───────────────┴─────┐
                         │  Ephemeral Rollup (devnet) │
                         │  - earn_pack (tap score)   │
                         │  - open_pack (VRF request, │
                         │    ER queue = FREE)        │
                         │  - commit_player           │
                         └──────────────┬─────────────┘
                                        │ VRF request
                                        ▼
                         ┌────────────────────────────┐
                         │  MagicBlock VRF oracle     │
                         │  proof (RFC 9381) → verify │
                         │  → callback_open_pack      │
                         └────────────────────────────┘
```

## Akun (program `blitzpacks`)

| Akun | Seeds / isi | Keterangan |
|---|---|---|
| `Player` PDA | `["player", authority]` | authority, packs (u16), dust (u64), rarity_counts [u16;5], collection_value (u64), total_opens, total_taps, best_tap_score, last_tap_claim (i64), pending_open (bool), bump |
| Delegation record/metadata | dibuat CPI delegation program | hanya saat delegate |
| VRF queue | `Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh` (base) / `5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc` (ER) | antrian oracle resmi MagicBlock |

## Instruksi

| Instruksi | Layer | Aturan penting |
|---|---|---|
| `initialize_player` | base | PDA baru, 3 free pack |
| `earn_pack(score)` | ER/base | score 0–100; ≥ 40 & cooldown 60 dtk → +1 pack |
| `buy_pack` | ER/base | dust ≥ 100 → −100 dust, +1 pack |
| `open_pack(on_er)` | ER/base | packs > 0, tidak ada open pending; minta VRF, `pending_open = true` |
| `callback_open_pack(randomness)` | VRF callback | hanya signer identitas VRF program (`#[vrf_callback]`); 3 roll dari byte 0–5 (u16 mod 100); `pending_open = false` |
| `delegate_player` | base | PDA → validator devnet-us |
| `commit_player` | ER | sinkron state ke base |
| `undelegate_player` | ER | commit + kembalikan PDA ke base |

## Kenapa angka-angkanya begitu

- **Rarity 60/25/10/4/1** — gacha standar; peluang ≥ Epic per pack ≈ 38,6%,
  ≥ Legendary ≈ 14,3% (diuji di `tests/loot.test.ts`).
- **Dust [5, 15, 60, 250, 1000]** — EV pack = 3 × 32,75 = 98,25 dust,
  sedikit di bawah harga pack 100 dust. Pack gratis harian + pack skill
  yang mensubsidi pemain, bukan inflasi dust tanpa batas.
- **Roll dari u16, bukan 1 byte** — `byte % 100` bias karena 256 bukan
  kelipatan 100; pasangan byte sebagai u16 mod 100 hampir uniform
  (bias < 0,06%). Ditemukan saat pengujian distribusi 100k roll.
- **Cooldown 60 dtk + threshold 40** — mencegah farm pack dari tap game
  tanpa server; skor diverifikasi on-chain seadanya (MVP: skor dari client,
  dibatasi cooldown; produksi: sesi tap terverifikasi).

## Mode demo vs live (aplikasi)

- **Demo (default):** semua state di `localStorage`; "VRF" disimulasikan
  dengan `crypto.getRandomValues` + hash SHA-256 yang ditampilkan —
  memakai fungsi `rollPack` yang SAMA dengan logika callback on-chain.
  Tidak ada yang berpura-pura on-chain: panel MagicBlock menunjukkan
  status live (slot devnet/ER, akun VRF queue) sebagai data baca saja.
- **Live:** butuh Phantom (devnet) + `VITE_PROGRAM_ID` hasil deploy.
  Tombol delegate/commit/open hanya aktif bila keduanya ada; tanpa itu
  mereka menjelaskan apa yang kurang, bukan mengirim transaksi palsu.

## Yang sengaja TIDAK ada di MVP (jalur lanjut)

- Mint NFT per kartu (saat ini koleksi = ledger rarity di PDA; Metaplex
  Core/Token-2022 bisa dipasang di `callback_open_pack`).
- Marketplace antar pemain (order book sederhana di atas collection_value).
- Private Ephemeral Rollups untuk pack opening rahasia (jumlah pack lawan
  disembunyikan) — ekstensi alami dari stack yang sama.
- Verifikasi skor tap oleh server/session key agar `earn_pack` trustless.
