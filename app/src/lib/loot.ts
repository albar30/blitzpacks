// BLITZPACKS loot math — pure functions, no dependencies.
// This table MUST match programs/blitzpacks/src/lib.rs exactly:
//   roll 0-59 Common, 60-84 Rare, 85-94 Epic, 95-98 Legendary, 99 Mythic.
// Written in erasable TypeScript so `node --test` can import it directly.

export const PACK_COST_DUST = 100;
export const TAP_PACK_THRESHOLD = 40;
export const TAP_COOLDOWN_SECS = 60;
export const FREE_PACKS_ON_START = 3;
export const CARDS_PER_PACK = 3;

export type RarityName = "Common" | "Rare" | "Epic" | "Legendary" | "Mythic";

export interface Rarity {
  index: number;
  name: RarityName;
  chance: number; // percent
  dustValue: number;
  color: string;
  glow: string;
}

export const RARITIES: Rarity[] = [
  { index: 0, name: "Common", chance: 60, dustValue: 5, color: "#9aa3b2", glow: "none" },
  { index: 1, name: "Rare", chance: 25, dustValue: 15, color: "#38bdf8", glow: "0 0 12px #38bdf866" },
  { index: 2, name: "Epic", chance: 10, dustValue: 60, color: "#c084fc", glow: "0 0 14px #c084fc88" },
  { index: 3, name: "Legendary", chance: 4, dustValue: 250, color: "#fbbf24", glow: "0 0 16px #fbbf24aa" },
  { index: 4, name: "Mythic", chance: 1, dustValue: 1000, color: "#f472b6", glow: "0 0 18px #f472b6aa" },
];

/** Map a 0-99 roll to a rarity index. Mirrors `rarity_index_for_roll` in lib.rs. */
export function rarityIndexForRoll(roll: number): number {
  const r = Math.floor(roll) % 100;
  if (r < 60) return 0;
  if (r < 85) return 1;
  if (r < 95) return 2;
  if (r < 99) return 3;
  return 4;
}

/**
 * Roll one pack from random bytes (e.g. MagicBlock VRF output, 32 bytes).
 * Uses byte pairs 0-1, 2-3, 4-5 as big-endian u16 values mod 100 — same as
 * `callback_open_pack` in lib.rs. (A single byte mod 100 would bias the
 * rolls, because 256 is not a multiple of 100.)
 */
export function rollPack(randomBytes: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < CARDS_PER_PACK; i++) {
    const pair = (((randomBytes[2 * i] ?? 0) << 8) | (randomBytes[2 * i + 1] ?? 0)) % 100;
    out.push(rarityIndexForRoll(pair));
  }
  return out;
}

/** Expected dust value of one pack: 3 * (0.60*5 + 0.25*15 + 0.10*60 + 0.04*250 + 0.01*1000) = 98.25. */
export function expectedPackValue(): number {
  const perCard = RARITIES.reduce((s, r) => s + (r.chance / 100) * r.dustValue, 0);
  return CARDS_PER_PACK * perCard;
}

/** Dust value of a set of pulled rarities. */
export function packValue(rarities: number[]): number {
  return rarities.reduce((s, r) => s + RARITIES[r].dustValue, 0);
}

/** Probability of pulling at least one Epic-or-better in a 3-card pack. */
export function chanceEpicOrBetterPerPack(): number {
  return 1 - Math.pow(0.85, CARDS_PER_PACK);
}

/** Probability of pulling at least one Legendary-or-better in a pack. */
export function chanceLegendaryOrBetterPerPack(): number {
  return 1 - Math.pow(0.95, CARDS_PER_PACK);
}

/** Tap-game score (0-100) from hits in a 15 s round. Matches the app's game. */
export function tapScore(hits: number): number {
  return Math.min(100, Math.max(0, hits * 8));
}
