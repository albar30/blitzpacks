//! BLITZPACKS — Gacha Pack Arena (Solana Blitz v10).
//!
//! A gacha pack opener where the loot is decided by MagicBlock VRF and the
//! skill game runs in a MagicBlock Ephemeral Rollup (ER):
//!
//! * `initialize_player` — create the player PDA (3 free packs).
//! * `earn_pack` — Blitz Tap score >= 25 earns +1 pack (1 per 5 min).
//! * `buy_pack` — spend 100 dust for a pack (duplicates recycle to dust).
//! * `open_pack` — spend 1 pack, request VRF randomness. The loot is rolled
//!   in `callback_open_pack` after the oracle's proof is verified on-chain.
//! * `delegate_player` / `commit_player` / `undelegate_player` — move the
//!   player PDA into an Ephemeral Rollup session and commit it back.
//!
//! Loot table (matches `rollPack` in the app, same u16 % 100 rolls):
//!   Common 60 / Rare 25 / Epic 10 / Legendary 4 / Mythic 1  (3 cards/pack)
//!
//! SDK versions (pinned by the build that worked):
//!   anchor-lang 0.32.x, ephemeral-rollups-sdk 0.6.6 (vendored, see
//!   vendor/ephemeral-rollups-sdk/VENDORED.md), ephemeral-vrf-sdk 0.4.1
//!   with the `anchor-compat` feature (keeps anchor-lang 0.32.x; the
//!   `anchor` feature would pull anchor-lang 1.x and break the rollups SDK).
//!
//! API notes (verified against the vendored SDK sources, NOT the docs):
//! * `#[vrf]` / `#[vrf_callback]` are STRUCT macros (they parse ItemStruct).
//!   They must sit on the `#[derive(Accounts)]` struct, never on the
//!   instruction fn — on a fn they fail with "expected `struct`".
//! * `#[vrf]` auto-adds `program_identity`, `vrf_program`, `slot_hashes`,
//!   `system_program` to the struct and generates `invoke_signed_vrf` —
//!   but it does NOT add `oracle_queue`: the struct MUST declare it.
//! * `ephemeral_rollups_sdk::anchor` exports only the attribute macros
//!   (`ephemeral`, `commit`, `action`, `delegate`) + the `DelegationProgram`
//!   / `MagicProgram` Id types. There are NO `commit_accounts` /
//!   `delegate_account` helpers there, and NO `vrf` module at all.
//!   VRF queue consts live in `ephemeral_vrf_sdk::consts`.
//! * Delegate/commit go through the `#[delegate]` / `#[commit]` struct
//!   macros: mark the delegated field with `del` in its `#[account(..)]`
//!   attr and call the generated `delegate_<field>(payer, seeds, config)`;
//!   commit uses `ephemeral_rollups_sdk::ephem::commit_accounts` /
//!   `commit_and_undelegate_accounts` (both take a `Vec<&AccountInfo>`).

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::{commit_accounts, commit_and_undelegate_accounts};
use ephemeral_vrf_sdk::anchor::{vrf, vrf_callback};
use ephemeral_vrf_sdk::consts::{DEFAULT_EPHEMERAL_QUEUE, DEFAULT_QUEUE};
use ephemeral_vrf_sdk::instructions::{
    create_request_high_priority_scoped_randomness_ix, RequestRandomnessParams,
};
use ephemeral_vrf_sdk::types::SerializableAccountMeta;

declare_id!("9pUtR3AZEYPRHhQrWVECT2c7Ye2YULz4sjWx9xNi6Z8E");

/// Rarity indices: 0 Common, 1 Rare, 2 Epic, 3 Legendary, 4 Mythic.
pub const RARITY_NAMES: [&str; 5] = ["Common", "Rare", "Epic", "Legendary", "Mythic"];
/// Dust value of one card of each rarity (matches the app's DUST_VALUE).
pub const DUST_VALUE: [u64; 5] = [10, 40, 150, 600, 2500];
/// Roll thresholds: roll < 60 Common, < 85 Rare, < 95 Epic, < 99 Legendary.
pub const RARITY_CUTOFFS: [u8; 4] = [60, 85, 95, 99];
/// Tap score needed to earn a pack.
pub const TAP_PACK_THRESHOLD: u16 = 25;
/// Cooldown between tap-earned packs (seconds).
pub const TAP_COOLDOWN_SECS: i64 = 300;
/// Dust price of one pack.
pub const PACK_COST_DUST: u64 = 100;
/// Free packs on player creation.
pub const FREE_PACKS: u16 = 3;

pub fn rarity_index_for_roll(roll: u8) -> usize {
    if roll < RARITY_CUTOFFS[0] {
        0
    } else if roll < RARITY_CUTOFFS[1] {
        1
    } else if roll < RARITY_CUTOFFS[2] {
        2
    } else if roll < RARITY_CUTOFFS[3] {
        3
    } else {
        4
    }
}

#[account]
pub struct Player {
    pub authority: Pubkey,
    pub packs: u16,
    pub dust: u64,
    pub total_opens: u64,
    pub total_taps: u64,
    pub best_tap_score: u16,
    pub last_tap_claim: i64,
    pub pending_open: bool,
    pub rarity_counts: [u64; 5],
    pub collection_value: u64,
}

impl Player {
    pub const SPACE: usize = 8 + 32 + 2 + 8 + 8 + 8 + 2 + 8 + 1 + (8 * 5) + 8;
}

#[ephemeral]
#[program]
pub mod blitzpacks {
    use super::*;

    /// Create the player PDA (seeds: ["player", authority]) with 3 free packs.
    pub fn initialize_player(ctx: Context<InitializePlayer>) -> Result<()> {
        let player = &mut ctx.accounts.player;
        player.authority = ctx.accounts.authority.key();
        player.packs = FREE_PACKS;
        player.dust = 0;
        player.total_opens = 0;
        player.total_taps = 0;
        player.best_tap_score = 0;
        player.last_tap_claim = 0;
        player.pending_open = false;
        player.rarity_counts = [0; 5];
        player.collection_value = 0;
        emit!(PlayerInitialized {
            authority: player.authority,
            free_packs: FREE_PACKS,
        });
        Ok(())
    }

    /// Skill game: a Blitz Tap score earns +1 pack (capped by threshold +
    /// cooldown so the faucet can't be farmed in one session).
    /// Runs on the ER for real-time feedback; also valid on the base layer.
    pub fn earn_pack(ctx: Context<Play>, score: u16) -> Result<()> {
        let player = &mut ctx.accounts.player;
        require!(score <= 100, BlitzError::ScoreOutOfRange);
        let now = Clock::get()?.unix_timestamp;
        player.total_taps = player.total_taps.checked_add(1).unwrap();
        if score > player.best_tap_score {
            player.best_tap_score = score;
        }
        if score >= TAP_PACK_THRESHOLD
            && now - player.last_tap_claim >= TAP_COOLDOWN_SECS
        {
            player.packs = player.packs.checked_add(1).unwrap();
            player.last_tap_claim = now;
            emit!(PackEarned {
                authority: player.authority,
                score,
            });
        }
        Ok(())
    }

    /// Buy a pack with dust (duplicates recycle into dust in the app).
    pub fn buy_pack(ctx: Context<Play>) -> Result<()> {
        let player = &mut ctx.accounts.player;
        require!(player.dust >= PACK_COST_DUST, BlitzError::NotEnoughDust);
        player.dust -= PACK_COST_DUST;
        player.packs = player.packs.checked_add(1).unwrap();
        Ok(())
    }

    /// Open a pack: spend 1 pack, request VRF randomness. The loot is decided
    /// in `callback_open_pack` after the oracle's proof is verified on-chain.
    /// `on_er` selects the VRF queue: ephemeral queue inside a rollup,
    /// base queue on Solana. ER-queue requests are free; base-layer requests
    /// cost ~0.0008 SOL (paid by the payer, see docs pricing).
    /// The caller passes the queue account; the program checks it matches
    /// the expected queue for `on_er`.
    pub fn open_pack(ctx: Context<OpenPack>, on_er: bool) -> Result<()> {
        let player = &mut ctx.accounts.player;
        require!(!player.pending_open, BlitzError::OpenAlreadyPending);
        require!(player.packs > 0, BlitzError::NoPacksLeft);
        let expected_queue = if on_er {
            DEFAULT_EPHEMERAL_QUEUE
        } else {
            DEFAULT_QUEUE
        };
        require!(
            ctx.accounts.oracle_queue.key() == expected_queue,
            BlitzError::WrongQueue
        );
        player.packs -= 1;
        player.pending_open = true;
        player.total_opens = player.total_opens.checked_add(1).unwrap();

        // Unpredictable seed: player key + open counter (never fully
        // player-chosen, so the outcome can't be ground out in advance).
        let mut seed = [0u8; 32];
        seed[..8].copy_from_slice(&player.total_opens.to_le_bytes());
        seed[8..].copy_from_slice(&player.authority.to_bytes()[..24]);

        let ix = create_request_high_priority_scoped_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            // Discriminator of `callback_open_pack` (Anchor ix discriminator).
            callback_discriminator: crate::instruction::CallbackOpenPack::DISCRIMINATOR
                .to_vec(),
            caller_seed: seed,
            accounts_metas: Some(vec![SerializableAccountMeta {
                pubkey: ctx.accounts.player.key(),
                is_signer: false,
                is_writable: true,
            }]),
            ..Default::default()
        });
        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        Ok(())
    }

    /// VRF callback — ONLY the VRF program (scoped identity) can call this.
    /// Consumes the verified random bytes, rolls 3 cards, updates the
    /// collection. This is where fairness happens: the bytes were proven
    /// on-chain before this instruction ran.
    pub fn callback_open_pack(
        ctx: Context<CallbackOpenPack>,
        randomness: [u8; 32],
    ) -> Result<()> {
        let player = &mut ctx.accounts.player;
        require!(player.pending_open, BlitzError::NoOpenPending);
        player.pending_open = false;

        // Three independent rolls from the first six random bytes, read as
        // three big-endian u16 values mod 100 (same as `rollPack` in the app).
        // A single byte mod 100 would bias the rolls (256 % 100 != 0).
        let mut rarities = [0usize; 3];
        for i in 0..3 {
            let pair = u16::from_be_bytes([randomness[2 * i], randomness[2 * i + 1]]);
            let roll = (pair % 100) as u8;
            let rarity = rarity_index_for_roll(roll);
            rarities[i] = rarity;
            player.rarity_counts[rarity] =
                player.rarity_counts[rarity].checked_add(1).unwrap();
            player.collection_value = player
                .collection_value
                .checked_add(DUST_VALUE[rarity])
                .unwrap();
        }
        emit!(PackOpened {
            authority: player.authority,
            rarities: [rarities[0] as u8, rarities[1] as u8, rarities[2] as u8],
            collection_value: player.collection_value,
        });
        Ok(())
    }

    /// Delegate the player PDA to an Ephemeral Rollup (base layer only).
    /// After this, `earn_pack` / `open_pack(on_er=true)` run on the ER.
    pub fn delegate_player(ctx: Context<DelegatePlayer>) -> Result<()> {
        let authority_key = ctx.accounts.authority.key();
        let seeds: &[&[u8]] = &[b"player", authority_key.as_ref()];
        ctx.accounts.delegate_player(
            &ctx.accounts.payer,
            seeds,
            DelegateConfig {
                commit_frequency_ms: 0, // manual commits via `commit_player`
                validator: Some(ctx.accounts.validator.key()),
            },
        )?;
        Ok(())
    }

    /// Commit ER state back to the Solana base layer (called on the ER).
    pub fn commit_player(ctx: Context<CommitPlayer>) -> Result<()> {
        commit_accounts(
            &ctx.accounts.payer.to_account_info(),
            vec![&ctx.accounts.player.to_account_info()],
            &ctx.accounts.magic_context.to_account_info(),
            &ctx.accounts.magic_program.to_account_info(),
        )?;
        Ok(())
    }

    /// Commit + undelegate: finalise the session and return the PDA to the
    /// base layer (called on the ER).
    pub fn undelegate_player(ctx: Context<UndelegatePlayer>) -> Result<()> {
        // Commit first, then the delegation program releases the account.
        // (The ER validator performs the undelegate via CPI on commit.)
        commit_and_undelegate_accounts(
            &ctx.accounts.payer.to_account_info(),
            vec![&ctx.accounts.player.to_account_info()],
            &ctx.accounts.magic_context.to_account_info(),
            &ctx.accounts.magic_program.to_account_info(),
        )?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializePlayer<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = Player::SPACE,
        seeds = [b"player", authority.key().as_ref()],
        bump
    )]
    pub player: Account<'info, Player>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Play<'info> {
    #[account(mut, has_one = authority)]
    pub player: Account<'info, Player>,
    pub authority: Signer<'info>,
}

/// `#[vrf]` is a STRUCT macro: it auto-adds `program_identity`,
/// `vrf_program`, `slot_hashes` and `system_program`, and generates
/// `invoke_signed_vrf`. The `oracle_queue` field MUST be declared here —
/// the macro reads it but does not create it.
#[vrf]
#[derive(Accounts)]
pub struct OpenPack<'info> {
    #[account(mut, has_one = authority)]
    pub player: Account<'info, Player>,
    pub authority: Signer<'info>,
    /// Pays the VRF request fee on the base layer (free on the ER queue).
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: VRF oracle queue — base queue or ephemeral queue, must match
    /// the `on_er` flag (checked in `open_pack`).
    pub oracle_queue: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// `#[vrf_callback]` is a STRUCT macro: it inserts the scoped VRF identity
/// PDA as a signer (`vrf_program_identity`) so only the VRF program —
/// bound to this program id — can invoke the callback.
#[vrf_callback]
#[derive(Accounts)]
pub struct CallbackOpenPack<'info> {
    #[account(mut)]
    pub player: Account<'info, Player>,
}

/// `#[delegate]` is a STRUCT macro: the `del` marker on `player` makes it
/// auto-add `buffer_player`, `delegation_record_player`,
/// `delegation_metadata_player` (with the right seeds) plus
/// `owner_program`, `delegation_program`, `system_program`, and generates
/// the `delegate_player(payer, seeds, config)` method used above.
#[delegate]
#[derive(Accounts)]
pub struct DelegatePlayer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, has_one = authority, del)]
    pub player: Account<'info, Player>,
    pub authority: Signer<'info>,
    /// The ER validator this session runs on (devnet-us for 0.20.x SDKs,
    /// any devnet validator for 0.18.x).
    /// CHECK: validated by the delegation program.
    pub validator: UncheckedAccount<'info>,
}

/// `#[commit]` is a STRUCT macro: it auto-adds `magic_program`
/// (Program<MagicProgram>) and `magic_context` (address = MAGIC_CONTEXT_ID).
#[commit]
#[derive(Accounts)]
pub struct CommitPlayer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub player: Account<'info, Player>,
}

#[commit]
#[derive(Accounts)]
pub struct UndelegatePlayer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub player: Account<'info, Player>,
}

// ---------------------------------------------------------------------------
// Events & errors
// ---------------------------------------------------------------------------

#[event]
pub struct PlayerInitialized {
    pub authority: Pubkey,
    pub free_packs: u16,
}

#[event]
pub struct PackEarned {
    pub authority: Pubkey,
    pub score: u16,
}

#[event]
pub struct PackOpened {
    pub authority: Pubkey,
    pub rarities: [u8; 3],
    pub collection_value: u64,
}

#[error_code]
pub enum BlitzError {
    #[msg("No packs left — earn one in Blitz Tap or buy one with dust.")]
    NoPacksLeft,
    #[msg("A pack open is already waiting for its VRF callback.")]
    OpenAlreadyPending,
    #[msg("No pack open is pending — nothing for the VRF callback to settle.")]
    NoOpenPending,
    #[msg("Not enough dust — a pack costs 100 dust.")]
    NotEnoughDust,
    #[msg("Tap score must be between 0 and 100.")]
    ScoreOutOfRange,
    #[msg("Wrong VRF oracle queue for this request (base vs ephemeral).")]
    WrongQueue,
}
