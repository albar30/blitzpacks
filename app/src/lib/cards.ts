// The 30-critter BLITZPACKS set. Rarity index: 0 Common, 1 Rare, 2 Epic,
// 3 Legendary, 4 Mythic. Distribution: 12 / 8 / 5 / 3 / 2 = 30.

export interface Critter {
  id: number;
  name: string;
  emoji: string;
  rarity: number;
  element: string;
  power: number;
}

export const CRITTERS: Critter[] = [
  // Common (12)
  { id: 1, name: "Pip Squeak", emoji: "🐹", rarity: 0, element: "Spark", power: 12 },
  { id: 2, name: "Momo Slime", emoji: "🟢", rarity: 0, element: "Goo", power: 9 },
  { id: 3, name: "Tito Turtle", emoji: "🐢", rarity: 0, element: "Shell", power: 15 },
  { id: 4, name: "Bibo Bird", emoji: "🐦", rarity: 0, element: "Wind", power: 11 },
  { id: 5, name: "Nori Fish", emoji: "🐟", rarity: 0, element: "Aqua", power: 10 },
  { id: 6, name: "Kiko Crab", emoji: "🦀", rarity: 0, element: "Aqua", power: 14 },
  { id: 7, name: "Lulu Ladybug", emoji: "🐞", rarity: 0, element: "Leaf", power: 8 },
  { id: 8, name: "Pablo Penguin", emoji: "🐧", rarity: 0, element: "Frost", power: 13 },
  { id: 9, name: "Zuzu Bee", emoji: "🐝", rarity: 0, element: "Wind", power: 10 },
  { id: 10, name: "Rocco Raccoon", emoji: "🦝", rarity: 0, element: "Shadow", power: 16 },
  { id: 11, name: "Milo Monkey", emoji: "🐵", rarity: 0, element: "Leaf", power: 12 },
  { id: 12, name: "Dodo Duck", emoji: "🦆", rarity: 0, element: "Aqua", power: 9 },
  // Rare (8)
  { id: 13, name: "Volt Fox", emoji: "🦊", rarity: 1, element: "Spark", power: 34 },
  { id: 14, name: "Ember Cat", emoji: "🐱", rarity: 1, element: "Flame", power: 36 },
  { id: 15, name: "Frost Wolf", emoji: "🐺", rarity: 1, element: "Frost", power: 38 },
  { id: 16, name: "Aero Hawk", emoji: "🦅", rarity: 1, element: "Wind", power: 35 },
  { id: 17, name: "Coral Serpent", emoji: "🐍", rarity: 1, element: "Aqua", power: 33 },
  { id: 18, name: "Thorn Bear", emoji: "🐻", rarity: 1, element: "Leaf", power: 37 },
  { id: 19, name: "Bolt Bunny", emoji: "🐰", rarity: 1, element: "Spark", power: 32 },
  { id: 20, name: "Mystic Owl", emoji: "🦉", rarity: 1, element: "Shadow", power: 39 },
  // Epic (5)
  { id: 21, name: "Inferno Dragonet", emoji: "🐉", rarity: 2, element: "Flame", power: 68 },
  { id: 22, name: "Tide Leviathan", emoji: "🐋", rarity: 2, element: "Aqua", power: 71 },
  { id: 23, name: "Storm Griffin", emoji: "🦁", rarity: 2, element: "Wind", power: 66 },
  { id: 24, name: "Crystal Golem", emoji: "🗿", rarity: 2, element: "Stone", power: 73 },
  { id: 25, name: "Lunar Unicorn", emoji: "🦄", rarity: 2, element: "Moon", power: 70 },
  // Legendary (3)
  { id: 26, name: "Solar Phoenix", emoji: "🔥", rarity: 3, element: "Flame", power: 92 },
  { id: 27, name: "Void Kraken", emoji: "🦑", rarity: 3, element: "Shadow", power: 94 },
  { id: 28, name: "Titan Colossus", emoji: "🦍", rarity: 3, element: "Stone", power: 95 },
  // Mythic (2)
  { id: 29, name: "Celestia, the First Star", emoji: "🌟", rarity: 4, element: "Cosmos", power: 120 },
  { id: 30, name: "Ouroboros Prime", emoji: "🐲", rarity: 4, element: "Cosmos", power: 125 },
];

/** All critters of a rarity, for picking a random card of a rolled rarity. */
export function crittersOfRarity(rarity: number): Critter[] {
  return CRITTERS.filter((c) => c.rarity === rarity);
}

/** Pick a random critter of the given rarity using one random byte. */
export function pickCritter(rarity: number, randByte: number): Critter {
  const pool = crittersOfRarity(rarity);
  return pool[randByte % pool.length];
}
