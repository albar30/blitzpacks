// BLITZPACKS — read-only devnet health check.
// Checks: Solana devnet RPC, MagicBlock ER router, VRF queue account,
// Delegation program account. No wallet, no signature, no SOL spent.
// Run: node scripts/check-devnet.mjs
// Uses @solana/web3.js from app/node_modules.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "app");
const { Connection, PublicKey } = require(path.join(appDir, "node_modules", "@solana", "web3.js"));

const DEVNET_RPC = "https://api.devnet.solana.com";
const ER_ROUTER_HTTP = "https://devnet-router.magicblock.app";
const VRF_QUEUE_BASE = "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh";
const VRF_QUEUE_ER = "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc";
const DELEGATION_PROGRAM_ID = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
const ER_VALIDATOR_DEVNET_US = "MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd";

const rows = [];
function row(check, ok, detail) {
  rows.push({ check, status: ok ? "OK " : "FAIL", detail });
}

const devnet = new Connection(DEVNET_RPC, "confirmed");
try {
  const slot = await devnet.getSlot();
  row("Solana devnet RPC", true, `slot ${slot.toLocaleString()}`);
} catch (e) {
  row("Solana devnet RPC", false, String(e.message ?? e).slice(0, 100));
}

try {
  // @solana/web3.js 1.99 dropped Connection.getHealth — use raw JSON-RPC.
  const res = await fetch(DEVNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
  });
  const json = await res.json();
  row("Solana devnet health", json.result === "ok", `getHealth -> ${json.result ?? JSON.stringify(json.error)}`);
} catch (e) {
  row("Solana devnet health", false, String(e.message ?? e).slice(0, 100));
}

try {
  // The Magic Router does NOT expose getSlot (it routes transactions only);
  // the ER itself does. Check the ER slot + router reachability separately.
  const er = new Connection("https://devnet.magicblock.app", "confirmed");
  const slot = await er.getSlot();
  row("MagicBlock ER (devnet)", true, `slot ${slot.toLocaleString()}`);
} catch (e) {
  row("MagicBlock ER (devnet)", false, String(e.message ?? e).slice(0, 100));
}

try {
  const res = await fetch(ER_ROUTER_HTTP, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
  });
  // Any HTTP 200 JSON-RPC answer (even "Method not found") = router is up.
  const json = await res.json();
  row("MagicBlock ER router (devnet)", res.status === 200 && !!json, `HTTP ${res.status}, ${json.error ? "method not exposed (expected — router only routes txs)" : "ok"}`);
} catch (e) {
  row("MagicBlock ER router (devnet)", false, String(e.message ?? e).slice(0, 100));
}

for (const [name, addr] of [
  ["VRF queue (base)", VRF_QUEUE_BASE],
  ["VRF queue (ER)", VRF_QUEUE_ER],
  ["Delegation program", DELEGATION_PROGRAM_ID],
  ["ER validator devnet-us", ER_VALIDATOR_DEVNET_US],
]) {
  try {
    const info = await devnet.getAccountInfo(new PublicKey(addr));
    row(`${name} account`, info !== null, info ? `${info.data.length} bytes, owner ${info.owner.toBase58().slice(0, 12)}…` : "account not found");
  } catch (e) {
    row(`${name} account`, false, String(e.message ?? e).slice(0, 100));
  }
}

console.log("\nBLITZPACKS devnet health check — " + new Date().toISOString());
console.table(rows);
const failed = rows.filter((r) => r.status === "FAIL").length;
console.log(failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
