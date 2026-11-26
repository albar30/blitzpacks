import { useEffect, useRef, useState } from "react";
import { CRITTERS, pickCritter } from "./lib/cards";
import {
  CARDS_PER_PACK,
  PACK_COST_DUST,
  RARITIES,
  TAP_COOLDOWN_SECS,
  TAP_PACK_THRESHOLD,
  expectedPackValue,
  packValue,
  rollPack,
  tapScore,
} from "./lib/loot";
import {
  DEVNET_RPC,
  ER_ROUTER_HTTP,
  ER_VALIDATOR_DEVNET_US,
  VRF_QUEUE_BASE,
  VRF_QUEUE_ER,
  erSdkInfo,
  getChainStatus,
  programIdFromEnv,
  type ChainStatus,
} from "./lib/magicblock";
import {
  collectionValue,
  defaultState,
  loadState,
  localLeaderboard,
  saveState,
  type DemoState,
} from "./lib/store";

interface Orb {
  id: number;
  x: number;
  y: number;
  bonus: boolean;
}

interface LogEntry {
  t: string;
  msg: string;
}

interface RevealedCard {
  id: number;
  name: string;
  emoji: string;
  rarity: number;
  element: string;
  power: number;
  isNew: boolean;
}

function now(): string {
  return new Date().toLocaleTimeString("id-ID", { hour12: false });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

export default function App() {
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [state, setState] = useState<DemoState>(() => loadState());
  const [status, setStatus] = useState<ChainStatus | null>(null);
  const [sdk, setSdk] = useState<{ loaded: boolean; hasMagicRouter: boolean } | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([
    { t: now(), msg: "Welcome to BLITZPACKS — demo mode: 3 free packs, no wallet needed." },
  ]);
  const [revealed, setRevealed] = useState<RevealedCard[]>([]);
  const [opening, setOpening] = useState(false);
  const [lastSeed, setLastSeed] = useState("");
  const [tapRunning, setTapRunning] = useState(false);
  const [tapLeft, setTapLeft] = useState(15);
  const [tapHits, setTapHits] = useState(0);
  const [orb, setOrb] = useState<Orb | null>(null);
  const [delegated, setDelegated] = useState(false);
  const tapTimer = useRef<number | null>(null);
  const orbTimer = useRef<number | null>(null);
  const orbId = useRef(0);

  const programId = programIdFromEnv();
  const value = collectionValue(state, RARITIES.map((r) => r.dustValue));
  const ownedCount = Object.values(state.owned).reduce((a, b) => a + b, 0);
  const distinctCount = Object.keys(state.owned).length;

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    getChainStatus().then(setStatus).catch(() => undefined);
    erSdkInfo().then(setSdk).catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      if (tapTimer.current) window.clearInterval(tapTimer.current);
      if (orbTimer.current) window.clearInterval(orbTimer.current);
    };
  }, []);

  function pushLog(msg: string) {
    setLog((l) => [{ t: now(), msg }, ...l].slice(0, 30));
  }

  // --- Wallet (live mode only, Phantom, devnet) ---
  async function connectWallet() {
    const w = (window as unknown as { solana?: { isPhantom?: boolean; connect: () => Promise<{ publicKey: { toBase58: () => string } }> } }).solana;
    if (!w?.isPhantom) {
      pushLog("Phantom not found — install Phantom and switch it to devnet, then retry.");
      return;
    }
    try {
      const res = await w.connect();
      setWallet(res.publicKey.toBase58());
      pushLog(`Wallet connected (devnet): ${res.publicKey.toBase58().slice(0, 8)}… — no transaction sent.`);
    } catch {
      pushLog("Wallet connection cancelled.");
    }
  }

  // --- Blitz Tap skill game ---
  function spawnOrb() {
    orbId.current += 1;
    setOrb({
      id: orbId.current,
      x: 6 + Math.random() * 82,
      y: 10 + Math.random() * 68,
      bonus: Math.random() < 0.2,
    });
  }

  function startTap() {
    if (tapRunning) return;
    const cooldownLeft = TAP_COOLDOWN_SECS - Math.floor((Date.now() - state.lastTapClaimAt) / 1000);
    if (state.lastTapClaimAt > 0 && cooldownLeft > 0) {
      pushLog(`Tap reward on cooldown — ${cooldownLeft}s left (60 s anti-farm rule).`);
    }
    setTapRunning(true);
    setTapHits(0);
    setTapLeft(15);
    setRevealed([]);
    spawnOrb();
    orbTimer.current = window.setInterval(spawnOrb, 750);
    tapTimer.current = window.setInterval(() => {
      setTapLeft((t) => {
        if (t <= 1) {
          endTap();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  function endTap() {
    if (tapTimer.current) window.clearInterval(tapTimer.current);
    if (orbTimer.current) window.clearInterval(orbTimer.current);
    setTapRunning(false);
    setOrb(null);
    setTapHits((hits) => {
      const score = tapScore(hits);
      const cooldownLeft = TAP_COOLDOWN_SECS - Math.floor((Date.now() - state.lastTapClaimAt) / 1000);
      const canEarn = score >= TAP_PACK_THRESHOLD && (state.lastTapClaimAt === 0 || cooldownLeft <= 0);
      setState((s) => ({
        ...s,
        totalTaps: s.totalTaps + 1,
        bestTap: Math.max(s.bestTap, score),
        packs: canEarn ? s.packs + 1 : s.packs,
        lastTapClaimAt: canEarn ? Date.now() : s.lastTapClaimAt,
      }));
      pushLog(
        canEarn
          ? `Blitz Tap: ${hits} hits → score ${score} ≥ ${TAP_PACK_THRESHOLD} — +1 pack earned!`
          : `Blitz Tap: ${hits} hits → score ${score}. Need ≥ ${TAP_PACK_THRESHOLD} for a pack${state.lastTapClaimAt > 0 && cooldownLeft > 0 ? ` (cooldown ${cooldownLeft}s)` : ""}.`,
      );
      return hits;
    });
  }

  function hitOrb() {
    if (!tapRunning || !orb) return;
    setTapHits((h) => h + (orb.bonus ? 2 : 1));
    spawnOrb();
  }

  // --- Pack opening (demo: simulated VRF; live: real program call — gated) ---
  async function openPack() {
    if (opening) return;
    if (state.packs <= 0) {
      pushLog("No packs left — earn one in Blitz Tap or buy one with 100 dust.");
      return;
    }
    if (mode === "live") {
      pushLog(
        programId
          ? "Live open would send open_pack(on_er=true) via the ER router — wire your wallet + program ID first (see SUBMIT.md)."
          : "Live mode needs a deployed program id (VITE_PROGRAM_ID). Stay in demo mode to play, or deploy first — see programs/blitzpacks/README.md.",
      );
      if (!programId) return;
      return; // live tx path is implemented in magicblock.ts helpers; not auto-sent
    }
    setOpening(true);
    setRevealed([]);
    // Simulated VRF: 32 fresh random bytes, hashed for the audit trail.
    // The on-chain program consumes real VRF bytes the same way (rollPack).
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const seedHex = await sha256Hex(bytes);
    setLastSeed(seedHex);
    pushLog(`VRF request → fulfilled (demo): seed ${seedHex.slice(0, 16)}… — rolling 3 cards…`);
    const rarities = rollPack(bytes);
    const cards: RevealedCard[] = rarities.map((rarity, i) => {
      const c = pickCritter(rarity, bytes[6 + i]);
      return { ...c, isNew: !(state.owned[c.id] > 0) };
    });
    setState((s) => {
      const owned = { ...s.owned };
      const counts = [...s.rarityCounts];
      cards.forEach((c) => {
        owned[c.id] = (owned[c.id] ?? 0) + 1;
        counts[c.rarity] += 1;
      });
      return { ...s, packs: s.packs - 1, owned, rarityCounts: counts, totalOpens: s.totalOpens + 1 };
    });
    for (let i = 0; i < cards.length; i++) {
      await new Promise((r) => setTimeout(r, 450));
      setRevealed((prev) => [...prev, cards[i]]);
    }
    const names = cards.map((c) => `${c.emoji} ${c.name} (${RARITIES[c.rarity].name})`).join(", ");
    pushLog(`Pack opened — ${names}. Pack value ${packValue(rarities)} dust (EV ≈ ${expectedPackValue().toFixed(0)}).`);
    setOpening(false);
  }

  function buyPack() {
    if (state.dust < PACK_COST_DUST) {
      pushLog(`Need ${PACK_COST_DUST} dust for a pack — you have ${state.dust}. Recycle duplicates below.`);
      return;
    }
    setState((s) => ({ ...s, dust: s.dust - PACK_COST_DUST, packs: s.packs + 1 }));
    pushLog(`Bought 1 pack for ${PACK_COST_DUST} dust.`);
  }

  function recycleDuplicates() {
    let gained = 0;
    let recycled = 0;
    const owned = { ...state.owned };
    for (const [idStr, count] of Object.entries(owned)) {
      if (count > 1) {
        const id = Number(idStr);
        const critter = CRITTERS.find((c) => c.id === id);
        if (!critter) continue;
        const extra = count - 1;
        gained += extra * RARITIES[critter.rarity].dustValue;
        recycled += extra;
        owned[id] = 1;
      }
    }
    if (recycled === 0) {
      pushLog("No duplicates to recycle — every card you own is unique so far.");
      return;
    }
    setState((s) => ({ ...s, owned, dust: s.dust + gained }));
    pushLog(`Recycled ${recycled} duplicate card(s) → +${gained} dust.`);
  }

  function resetDemo() {
    const fresh = defaultState();
    setState(fresh);
    setRevealed([]);
    setLog([{ t: now(), msg: "Demo reset — 3 free packs restored." }]);
  }

  const liveBlocked = mode === "live" && !programId;

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>⚡ BLITZPACKS</h1>
          <p className="sub">Gacha Pack Arena — Entertainment Finance on Solana · Solana Blitz v10</p>
        </div>
        <div className="header-right">
          <div className={`pill ${status?.devnetOk && status?.erOk ? "ok" : "warn"}`}>
            {status
              ? status.devnetOk && status.erOk
                ? `● devnet slot ${status.devnetSlot?.toLocaleString()} · ER slot ${status.erSlot?.toLocaleString()}`
                : "● chain status: partial / offline"
              : "○ checking devnet + ER…"}
          </div>
          <div className="mode-toggle">
            <button className={mode === "demo" ? "active" : ""} onClick={() => setMode("demo")}>Demo</button>
            <button className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>Live Devnet</button>
          </div>
        </div>
      </header>

      {mode === "live" && (
        <div className="banner">
          {wallet ? (
            <>Wallet: <code>{wallet.slice(0, 8)}…{wallet.slice(-4)}</code> · devnet only. </>
          ) : (
            <>Live mode needs a Phantom wallet on <b>devnet</b>. <button onClick={connectWallet}>Connect Phantom</button> </>
          )}
          {liveBlocked
            ? <>No program deployed yet (<code>VITE_PROGRAM_ID</code> unset) — live buttons will explain, nothing is faked on-chain. See <code>programs/blitzpacks/README.md</code>.</>
            : <>Program: <code>{programId}</code></>}
          {delegated && <> · Player PDA delegated to ER.</>}
        </div>
      )}

      <section className="stats">
        <div className="stat"><span>📦 Packs</span><b>{state.packs}</b></div>
        <div className="stat"><span>✨ Dust</span><b>{state.dust}</b></div>
        <div className="stat"><span>🃏 Cards</span><b>{ownedCount} ({distinctCount}/30)</b></div>
        <div className="stat"><span>💰 Collection value</span><b>{value.toLocaleString()} dust</b></div>
        <div className="stat"><span>🎯 Best Tap</span><b>{state.bestTap}</b></div>
        <div className="stat"><span>📈 Opens</span><b>{state.totalOpens}</b></div>
      </section>

      <main className="grid">
        <section className="card">
          <h2>🎯 Blitz Tap — skill earns packs</h2>
          <p>15 seconds. Tap the golden orbs — score ≥ {TAP_PACK_THRESHOLD} earns +1 pack (60 s cooldown, same rule as the on-chain program).</p>
          <div className="tap-row">
            <button onClick={startTap} disabled={tapRunning}>{tapRunning ? `⏱ ${tapLeft}s left` : "Start Blitz Tap"}</button>
            <span className="hits">Hits: <b>{tapHits}</b> · score <b>{tapScore(tapHits)}</b></span>
          </div>
          <div className="arena" onClick={hitOrb}>
            {orb && tapRunning ? (
              <button
                className={`orb ${orb.bonus ? "bonus" : ""}`}
                style={{ left: `${orb.x}%`, top: `${orb.y}%` }}
                onClick={(e) => { e.stopPropagation(); hitOrb(); }}
                aria-label="tap orb"
              >{orb.bonus ? "💎" : "⚡"}</button>
            ) : (
              <span className="arena-hint">{tapRunning ? "Tap the orbs!" : "Press Start — orbs appear here"}</span>
            )}
          </div>
        </section>

        <section className="card">
          <h2>📦 Open a pack — MagicBlock VRF decides the loot</h2>
          <p>3 cards per pack. Rarity: Common 60% · Rare 25% · Epic 10% · Legendary 4% · Mythic 1%. Expected value ≈ {expectedPackValue().toFixed(0)} dust.</p>
          <div className="tap-row">
            <button className="primary" onClick={openPack} disabled={opening || state.packs <= 0}>
              {opening ? "Rolling…" : `Open Pack (${state.packs} left)`}
            </button>
            <button onClick={buyPack} disabled={state.dust < PACK_COST_DUST}>Buy pack — {PACK_COST_DUST} dust</button>
          </div>
          {lastSeed && <p className="seed">Last VRF seed (SHA-256): <code>{lastSeed.slice(0, 32)}…</code></p>}
          <div className="reveal">
            {revealed.map((c) => (
              <div key={`${c.id}-${c.power}-${revealed.indexOf(c)}`} className="flip-card" style={{ borderColor: RARITIES[c.rarity].color, boxShadow: RARITIES[c.rarity].glow }}>
                <div className="flip-emoji">{c.emoji}</div>
                <div className="flip-name">{c.name}</div>
                <div className="flip-rarity" style={{ color: RARITIES[c.rarity].color }}>{RARITIES[c.rarity].name}</div>
                <div className="flip-meta">{c.element} · PWR {c.power} · {RARITIES[c.rarity].dustValue} dust</div>
                {c.isNew && <div className="new-badge">NEW!</div>}
              </div>
            ))}
            {revealed.length === 0 && !opening && <p className="muted">Your pulls will appear here.</p>}
          </div>
        </section>

        <section className="card">
          <h2>🃏 Collection</h2>
          <p>{distinctCount}/30 critters · duplicates recycle into dust at card value.</p>
          <div className="rarity-bars">
            {RARITIES.map((r) => (
              <div key={r.index} className="rarity-row">
                <span style={{ color: r.color }}>{r.name}</span>
                <div className="bar"><div style={{ width: `${Math.min(100, (state.rarityCounts[r.index] / 12) * 100)}%`, background: r.color }} /></div>
                <b>{state.rarityCounts[r.index]}</b>
              </div>
            ))}
          </div>
          <div className="collection-grid">
            {CRITTERS.filter((c) => state.owned[c.id] > 0).map((c) => (
              <div key={c.id} className="mini-card" style={{ borderColor: RARITIES[c.rarity].color }}>
                <span>{c.emoji}</span><small>{c.name}</small><b>×{state.owned[c.id]}</b>
              </div>
            ))}
            {distinctCount === 0 && <p className="muted">No cards yet — open your first pack!</p>}
          </div>
          <button onClick={recycleDuplicates}>♻️ Recycle duplicates → dust</button>{" "}
          <button className="ghost" onClick={resetDemo}>Reset demo</button>
        </section>

        <section className="card">
          <h2>🏆 Leaderboard — collection value</h2>
          <ol className="board">
            {localLeaderboard(value, state.packs).map((row, i) => (
              <li key={row.name} className={row.you ? "you" : ""}>
                <span>#{i + 1} {row.name}{row.you ? " (you)" : ""}</span>
                <b>{row.value.toLocaleString()} dust</b>
              </li>
            ))}
          </ol>
          <h2>🧙 MagicBlock wiring</h2>
          <table className="wiring">
            <tbody>
              <tr><td>Base RPC</td><td><code>{DEVNET_RPC}</code></td></tr>
              <tr><td>ER router</td><td><code>{ER_ROUTER_HTTP}</code></td></tr>
              <tr><td>ER validator (devnet-us)</td><td><code>{ER_VALIDATOR_DEVNET_US}</code></td></tr>
              <tr><td>VRF queue (base)</td><td><code>{VRF_QUEUE_BASE}</code></td></tr>
              <tr><td>VRF queue (ER, free)</td><td><code>{VRF_QUEUE_ER}</code></td></tr>
              <tr><td>ER SDK</td><td>{sdk ? (sdk.loaded ? `loaded ✓ (MagicRouter ${sdk.hasMagicRouter ? "✓" : "✗"})` : "failed to load") : "loading…"}</td></tr>
              <tr><td>VRF queue on-chain</td><td>{status ? (status.vrfQueueExists ? "account exists ✓" : "not found") : "…"}</td></tr>
              <tr><td>Delegation program</td><td>{status ? (status.delegationProgramExists ? "account exists ✓" : "not found") : "…"}</td></tr>
            </tbody>
          </table>
          <div className="tap-row">
            <button disabled={mode !== "live" || !wallet || !programId} onClick={() => { setDelegated(true); pushLog("Delegate: would send delegate_player via the ER SDK (needs live program — see SUBMIT.md)."); }}>
              Delegate player PDA → ER
            </button>
            <button disabled={mode !== "live" || !delegated} onClick={() => pushLog("Commit: would send commit_player to sync ER state back to devnet.")}>
              Commit → devnet
            </button>
          </div>
          <p className="muted">Live buttons are intentionally gated: they only arm when a wallet is connected and a program is deployed. Demo mode never pretends to be on-chain.</p>
        </section>
      </main>

      <section className="card log-card">
        <h2>📜 Session log</h2>
        <ul className="log">
          {log.map((e, i) => (<li key={i}><span>{e.t}</span> {e.msg}</li>))}
        </ul>
      </section>

      <footer>
        BLITZPACKS · Solana Blitz v10 · MagicBlock VRF + Ephemeral Rollups · devnet only ·
        Docs: docs.magicblock.gg · Submit: build.magicblock.app/?stage=blitz#submit
      </footer>
    </div>
  );
}
