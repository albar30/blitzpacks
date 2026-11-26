# BLITZPACKS program — build & deploy (devnet only)

## Prereqs (one-time, on a machine with the toolchain)

- Rust 1.89.0, Solana CLI 3.1.9, Anchor 0.32.1, Node 24
- A **devnet-only** throwaway wallet funded from the devnet faucet
  (`solana airdrop 2 --url devnet`). Never use a mainnet wallet/key here.

## Build

```bash
cd programs/blitzpacks
anchor build
```

This generates the IDL at `target/idl/blitzpacks.json` — copy it to
`app/src/idl/blitzpacks.json` and set the real program id in `app/.env`:

```
VITE_PROGRAM_ID=<program id from `anchor deploy` output>
```

> ⚠️ The program was **not** compiled in the build VM for this repo
> (no Rust/Solana toolchain there). The code is complete and dependency-pinned;
> run `anchor build` once on a toolchain machine and fix any SDK-version
> drift it reports — the two version-sensitive spots are the
> `ephemeral-rollups-sdk` / `ephemeral-vrf-sdk` re-exports used in `lib.rs`
> (`vrf::consts`, `#[vrf]`, `#[vrf_callback]`).

## Deploy (devnet only)

```bash
solana config set --url devnet
anchor deploy --provider.cluster devnet
```

Then in the app:

```bash
cd ../../app
echo "VITE_PROGRAM_ID=<id>" > .env
npm run dev
```

Toggle **Live Devnet** in the header, connect Phantom (devnet), and the app
will: create your `Player` PDA → delegate it to the devnet ER
(`devnet-us`, validator `MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd`)
→ run taps/opens on the ER → commit the collection back to devnet.

## Program id placeholder

`Anchor.toml` ships with the placeholder id
`Blitz111111111111111111111111111111111111111`. Replace it with the real id
after the first deploy (`anchor keys sync` does this automatically) and
update `declare_id!` in `src/lib.rs` to match before rebuilding.

## Instructions

| Instruction | Layer | What it does |
|---|---|---|
| `initialize_player` | base | Create player PDA, 3 free packs |
| `earn_pack(score)` | ER / base | Skill score ≥ 40 earns +1 pack (60 s cooldown) |
| `buy_pack` | ER / base | 100 dust → +1 pack |
| `open_pack(on_er)` | ER / base | Spend 1 pack, request MagicBlock VRF randomness |
| `callback_open_pack` | base (VRF callback) | Verified random bytes → 3 card rolls |
| `delegate_player` | base | Delegate PDA to the ER validator |
| `commit_player` | ER | Sync ER state back to Solana |
| `undelegate_player` | ER | Commit + return PDA to base layer |

## Costs (devnet)

- ER transactions: 0 SOL in the current release; one delegation session
  ≈ 0.003 SOL from the deposit on undelegate; commits after the first
  ≈ 0.001 SOL each (see MagicBlock fee docs).
- VRF: free on the ephemeral queue, ~0.0008 SOL per request on the base queue.
