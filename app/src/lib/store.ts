// Demo-mode state for BLITZPACKS (localStorage). Live mode replaces this
// with on-chain Player PDA reads; demo mode is fully playable offline.
import { FREE_PACKS_ON_START } from "./loot";

export interface DemoState {
  packs: number;
  dust: number;
  rarityCounts: number[]; // [Common, Rare, Epic, Legendary, Mythic]
  owned: Record<number, number>; // critter id -> copies owned
  totalOpens: number;
  totalTaps: number;
  bestTap: number;
  lastTapClaimAt: number; // ms epoch, enforces the 60 s cooldown
  freePacksClaimedToday: string; // YYYY-MM-DD of the last daily claim
}

const KEY = "blitzpacks-demo-v1";

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function defaultState(): DemoState {
  return {
    packs: FREE_PACKS_ON_START,
    dust: 0,
    rarityCounts: [0, 0, 0, 0, 0],
    owned: {},
    totalOpens: 0,
    totalTaps: 0,
    bestTap: 0,
    lastTapClaimAt: 0,
    freePacksClaimedToday: todayStr(),
  };
}

export function loadState(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as DemoState;
    // Daily reset: a new day tops the player back up to 3 free packs.
    if (parsed.freePacksClaimedToday !== todayStr()) {
      parsed.packs += FREE_PACKS_ON_START;
      parsed.freePacksClaimedToday = todayStr();
    }
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

export function saveState(s: DemoState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage full / private mode — game still works for the session.
  }
}

/** Collection value in dust = sum over rarities of count * dust value. */
export function collectionValue(s: DemoState, dustValues: number[]): number {
  return s.rarityCounts.reduce((sum, count, i) => sum + count * dustValues[i], 0);
}

/** Seeded local leaderboard: the player vs 4 bots (demo only). */
export interface LeaderRow {
  name: string;
  value: number;
  packs: number;
  you: boolean;
}

export function localLeaderboard(youValue: number, youPacks: number): LeaderRow[] {
  const rows: LeaderRow[] = [
    { name: "You", value: youValue, packs: youPacks, you: true },
    { name: "NovaWhale", value: 1840, packs: 12, you: false },
    { name: "GachaGoblin", value: 960, packs: 9, you: false },
    { name: "SolSniper", value: 540, packs: 6, you: false },
    { name: "DustDevil", value: 210, packs: 4, you: false },
  ];
  return rows.sort((a, b) => b.value - a.value);
}
