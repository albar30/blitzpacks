# BLITZPACKS — Gacha Pack Arena (Solana Blitz v10)

> **Entertainment Finance on Solana, powered by MagicBlock.**
> Open collectible packs whose loot is decided by **MagicBlock VRF** (provably fair),
> play the fast skill game inside a **MagicBlock Ephemeral Rollup** (sub-50 ms, gasless),
> and commit your collection back to Solana devnet — the cards you win are assets you own.

- **Hackathon:** Solana Blitz v10 — Entertainment Finance (MagicBlock)
- **Deadline:** Friday 27 Nov 2026, 21:00 WIB (15:00 UTC)
- **Submit at:** https://build.magicblock.app/?stage=blitz#submit
- **Status:** MVP — demo mode fully playable in the browser, no wallet needed.
  Live devnet mode is wired up in code and needs a deployed program ID
  (see [SUBMIT.md](SUBMIT.md) and `programs/blitzpacks/README.md`).

## The game loop

```
  SKILL  →  PACKS  →  VRF LOOT  →  COLLECTION VALUE  →  LEADERBOARD
  (Blitz Tap, 15 s reaction game — earn packs)
  (open a pack: 3 cards, rarity rolled by MagicBlock VRF)
  (duplicates → dust → dust buys more packs)
```

| Rarity    | Chance | Dust value | Cards in set |
|-----------|--------|-----------:|--------------|
| Common    | 60%    | 5          | 12           |
| Rare      | 25%    | 15         | 8            |
| Epic      | 10%    | 60         | 5            |
| Legendary | 4%     | 250        | 3            |
| Mythic    | 1%     | 1,000      | 2            |

30 collectible "Blitz Critters". Expected pack value ≈ 98 dust; a pack costs 100 dust
(or 1 free pack — 3 free packs per day + packs earned by skill).

## Why MagicBlock (the hard requirement, met twice)

1. **MagicBlock VRF** — every pack open requests verifiable randomness from the
   on-chain VRF program (`open_pack` → oracle → `callback_open_pack`).
   The proof is verified on-chain before the loot is revealed, so neither the
   player, the dev, nor a validator can rig the pull. ER-queue requests are free.
2. **Ephemeral Rollups** — the player PDA is delegated to the devnet ER
   (`devnet-us`, validator `MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd`).
   Skill-game ticks and pack opens run at ~10–50 ms slots, gasless, on the ER;
   `commit` syncs the final collection state back to Solana base layer.
   The same program works on both layers thanks to the `#[ephemeral]` macro.

## Repo layout

```
solana-blitz-v10/
├── README.md                  ← you are here
├── SUBMIT.md                  ← step-by-step submission checklist for build.magicblock.app
├── ARCHITECTURE.md            ← design, accounts, VRF flow, ER lifecycle
├── app/                       ← playable web app (Vite + React + TS)
│   ├── src/lib/cards.ts       ← the 30-critter set + rarity table
│   ├── src/lib/loot.ts        ← pure rarity/dust math (unit-tested, shared with program logic)
│   ├── src/lib/magicblock.ts  ← ER/VRF endpoints, constants, live-mode client
│   ├── src/lib/store.ts       ← demo-mode persistence (localStorage)
│   └── src/App.tsx            ← the whole game UI
├── programs/blitzpacks/       ← Anchor program (Rust): player PDA, delegate/commit,
│   │                            VRF pack-open request + callback
│   ├── Anchor.toml  Cargo.toml  src/lib.rs
│   └── README.md              ← how to build / deploy to devnet
├── scripts/
│   └── check-devnet.mjs       ← read-only health check: devnet RPC + ER router + VRF queue
└── tests/
    └── loot.test.ts           ← `node --test` unit tests for the loot math
```

## Run the demo (2 minutes, no wallet, no SOL)

```bash
cd app
npm install
npm run dev        # → http://localhost:5173
```

- **Demo mode (default):** 3 free packs, Blitz Tap skill game, pack opening with
  simulated-VRF reveal (seed + SHA-256 shown, same rarity table as the program),
  collection, dust shop, local leaderboard. Everything runs locally.
- **Live mode:** toggle "Live Devnet" in the header, connect Phantom (devnet),
  paste the deployed program ID in `.env` (`VITE_PROGRAM_ID=...`).
  The app then delegates your player PDA to the ER and sends real transactions.
  Without a deployed program ID, live buttons explain exactly what is missing —
  nothing is faked as on-chain.

## Tests & checks

```bash
cd app
npm test                    # loot-math unit tests (node --test, no deps)
npm run build               # production build (tsc + vite)
node ../scripts/check-devnet.mjs   # read-only: devnet + ER router + VRF queue health
```

## What is verified vs. what is not (honest status, 25 Nov 2026)

| Item | Status |
|---|---|
| Loot math (rarity table, EV, dust) | ✅ unit-tested (`npm test`) |
| Demo mode end-to-end (tap → pack → reveal → collection → leaderboard) | ✅ runs in browser via `vite build` + preview smoke test |
| ER SDK imports (`createDelegateInstruction`, `ConnectionMagicRouter`, `DELEGATION_PROGRAM_ID`) | ✅ verified against installed `@magicblock-labs/ephemeral-rollups-sdk@0.18.0` |
| Devnet RPC + ER router + VRF queue reachable | ✅ checked live 25 Nov 2026 ~10:21 WIB by `scripts/check-devnet.mjs`: 8/8 OK (devnet slot 526,012,987; ER slot 1,160,095,316; VRF queue base 30.000 byte, ER queue 9.500 byte, delegation program ada) |
| Anchor program compiles (`anchor build`) | ⚠️ **NOT verified here** — this VM has no Rust/Solana toolchain. Code is complete and pinned; needs one `anchor build` + `anchor deploy --provider.cluster devnet` on a machine with the toolchain (see `programs/blitzpacks/README.md`) |
| Live on-chain pack open (delegate → VRF → callback → commit) | ⚠️ **NOT run end-to-end** — needs the deployed program + a funded devnet wallet |
| Mainnet | ❌ never — devnet only, by design |

## Links

- MagicBlock docs: https://docs.magicblock.gg
- VRF overview: https://docs.magicblock.gg/pages/verifiable-randomness-functions-vrfs/introduction/solana-vrf
- Ephemeral Rollups (Rust guide): https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/rust-program
- VRF program (audited, open source): https://github.com/magicblock-labs/solana-vrf
- Blitz submit: https://build.magicblock.app/?stage=blitz#submit
- Luma: https://luma.com/hedv5sgh

## License

MIT — free to fork, judge, and play.
