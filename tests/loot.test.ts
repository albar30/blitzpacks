// Unit tests for the BLITZPACKS loot math.
// Run: cd app && npm test   (node --test, no extra dependencies)
// These expectations MUST match programs/blitzpacks/src/lib.rs.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CARDS_PER_PACK,
  PACK_COST_DUST,
  RARITIES,
  chanceEpicOrBetterPerPack,
  chanceLegendaryOrBetterPerPack,
  expectedPackValue,
  packValue,
  rarityIndexForRoll,
  rollPack,
  tapScore,
} from "../app/src/lib/loot.ts";

test("rarity boundaries match the on-chain table (60/25/10/4/1)", () => {
  assert.equal(rarityIndexForRoll(0), 0);
  assert.equal(rarityIndexForRoll(59), 0);
  assert.equal(rarityIndexForRoll(60), 1);
  assert.equal(rarityIndexForRoll(84), 1);
  assert.equal(rarityIndexForRoll(85), 2);
  assert.equal(rarityIndexForRoll(94), 2);
  assert.equal(rarityIndexForRoll(95), 3);
  assert.equal(rarityIndexForRoll(98), 3);
  assert.equal(rarityIndexForRoll(99), 4);
});

test("rarity chances sum to 100 and dust values are ordered", () => {
  assert.equal(RARITIES.reduce((s, r) => s + r.chance, 0), 100);
  assert.deepEqual(RARITIES.map((r) => r.dustValue), [5, 15, 60, 250, 1000]);
});

test("rollPack consumes byte pairs 0-1, 2-3, 4-5 like callback_open_pack", () => {
  // u16 pairs: 5 -> Common, 70 -> Rare, 99 -> Mythic
  assert.deepEqual(rollPack([0, 5, 0, 70, 0, 99]), [0, 1, 4]);
  assert.equal(rollPack([0, 5, 0, 70, 0, 99]).length, CARDS_PER_PACK);
  assert.deepEqual(rollPack([0, 99, 0, 99, 0, 99]), [4, 4, 4]);
});

test("expected pack value is 98.25 dust (just under the 100 dust cost)", () => {
  // per card: .6*5 + .25*15 + .1*60 + .04*250 + .01*1000 = 32.75; x3 = 98.25
  assert.equal(expectedPackValue(), 98.25);
  assert.ok(expectedPackValue() < PACK_COST_DUST, "packs are slightly -EV: the house edge funds free/skill packs");
});

test("packValue sums the three cards", () => {
  assert.equal(packValue([0, 1, 4]), 5 + 15 + 1000);
});

test("per-pack odds: Epic+ ~38.6%, Legendary+ ~14.3%", () => {
  assert.ok(Math.abs(chanceEpicOrBetterPerPack() - (1 - Math.pow(0.85, 3))) < 1e-12);
  assert.ok(Math.abs(chanceLegendaryOrBetterPerPack() - (1 - Math.pow(0.95, 3))) < 1e-12);
  assert.ok(chanceEpicOrBetterPerPack() > 0.38 && chanceEpicOrBetterPerPack() < 0.4);
});

test("tapScore caps at 100 and scales 8 per hit", () => {
  assert.equal(tapScore(0), 0);
  assert.equal(tapScore(5), 40); // exactly the pack threshold
  assert.equal(tapScore(13), 100);
  assert.equal(tapScore(50), 100);
});

test("rarity distribution is roughly right over 100k simulated rolls", () => {
  const counts = [0, 0, 0, 0, 0];
  // u16 values (two bytes each), like rollPack consumes them.
  const bytes = new Uint8Array(200000);
  for (let off = 0; off < 200000; off += 50000) {
    crypto.getRandomValues(bytes.subarray(off, off + 50000));
  }
  for (let i = 0; i < 100000; i++) {
    const pair = ((bytes[2 * i] << 8) | bytes[2 * i + 1]) % 100;
    counts[rarityIndexForRoll(pair)] += 1;
  }
  const pct = counts.map((c) => c / 1000);
  assert.ok(pct[0] > 57 && pct[0] < 63, `Common ${pct[0]}%`);
  assert.ok(pct[1] > 22 && pct[1] < 28, `Rare ${pct[1]}%`);
  assert.ok(pct[2] > 8 && pct[2] < 12, `Epic ${pct[2]}%`);
  assert.ok(pct[3] > 2.5 && pct[3] < 5.5, `Legendary ${pct[3]}%`);
  assert.ok(pct[4] > 0.3 && pct[4] < 1.8, `Mythic ${pct[4]}%`);
});
