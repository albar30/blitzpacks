# Vendored copy of ephemeral-rollups-sdk 0.6.6 (MIT, MagicBlock Labs).
#
# WHY IT IS VENDORED (not a registry dep):
# Upstream declares `anchor-lang = ">=0.28.0"` with no upper bound, so cargo
# resolves it to anchor-lang 1.2.2 — but this SDK's `src/solana_compat.rs`
# imports `anchor_lang::solana_program::sysvar::{rent::Rent, Sysvar}`, which
# do not exist in anchor-lang 1.x. The only change vs upstream 0.6.6 is in
# Cargo.toml: the anchor-lang bound is tightened to `>=0.28.0, <1.0.0`
# (see the PATCHED comment there). No source file was modified.
#
# The crate is pulled in via `[patch.crates-io]` in
# programs/blitzpacks/Cargo.toml. To update it, replace this directory with
# the new version from crates.io and re-apply the one-line Cargo.toml patch.
# Source: https://crates.io/crates/ephemeral-rollups-sdk/0.6.6
# Upstream: https://github.com/magicblock-labs/ephemeral-rollups-sdk
