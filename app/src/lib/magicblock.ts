// MagicBlock live-mode client for BLITZPACKS.
// Endpoints + program ids are the public devnet values from the MagicBlock
// docs (verified 25 Nov 2026). Nothing here signs, pays, or deploys anything
// by itself — every live call is triggered by an explicit button in the UI
// and needs a connected wallet + a deployed program id (VITE_PROGRAM_ID).
//
// SDK usage was verified against the installed package:
//   @magicblock-labs/ephemeral-rollups-sdk@0.18.0
//   (exports used: DELEGATION_PROGRAM_ID, ConnectionMagicRouter,
//    createDelegateInstruction, createCommitInstruction,
//    delegationRecordPdaFromDelegatedAccount, getDelegationRecord)

export const DEVNET_RPC = "https://api.devnet.solana.com";
export const ER_ROUTER_HTTP = "https://devnet-router.magicblock.app";
export const ER_ROUTER_WS = "wss://devnet-router.magicblock.app";
export const ER_DEVNET = "https://devnet.magicblock.app";

/** Devnet ER validator (validator 2.0). SDK 0.18.x also reads 1.1.1 logs. */
export const ER_VALIDATOR_DEVNET_US = "MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd";
export const ER_VALIDATOR_DEVNET_EU = "MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e";
export const ER_VALIDATOR_DEVNET_AS = "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57";

export const DELEGATION_PROGRAM_ID = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
export const MAGIC_PROGRAM_ID = "Magic11111111111111111111111111111111111111";

/** MagicBlock VRF oracle queues (same address on mainnet and devnet). */
export const VRF_QUEUE_BASE = "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh";
export const VRF_QUEUE_ER = "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc";

/** Placeholder id shipped in Anchor.toml — replaced after `anchor deploy`. */
export const PROGRAM_ID_PLACEHOLDER = "Blitz111111111111111111111111111111111111111";

export function programIdFromEnv(): string | null {
  const id = (import.meta as unknown as { env?: Record<string, string | undefined> })
    .env?.VITE_PROGRAM_ID;
  if (id && id !== PROGRAM_ID_PLACEHOLDER) return id;
  return null;
}

export interface ChainStatus {
  devnetSlot: number | null;
  devnetOk: boolean;
  erSlot: number | null;
  erOk: boolean;
  vrfQueueExists: boolean;
  delegationProgramExists: boolean;
  checkedAt: string;
}

/**
 * Read-only health check: devnet RPC + ER router + VRF queue + delegation
 * program. No wallet, no signature, no SOL spent. Used by the header pill
 * and by scripts/check-devnet.mjs (same logic, node version).
 */
export async function getChainStatus(): Promise<ChainStatus> {
  const { Connection, PublicKey } = await import("@solana/web3.js");
  const out: ChainStatus = {
    devnetSlot: null,
    devnetOk: false,
    erSlot: null,
    erOk: false,
    vrfQueueExists: false,
    delegationProgramExists: false,
    checkedAt: new Date().toISOString(),
  };
  try {
    const devnet = new Connection(DEVNET_RPC, "confirmed");
    out.devnetSlot = await devnet.getSlot();
    out.devnetOk = true;
    const vrf = await devnet.getAccountInfo(new PublicKey(VRF_QUEUE_BASE));
    out.vrfQueueExists = vrf !== null;
    const del = await devnet.getAccountInfo(new PublicKey(DELEGATION_PROGRAM_ID));
    out.delegationProgramExists = del !== null;
  } catch {
    out.devnetOk = false;
  }
  try {
    // The Magic Router does not expose getSlot (it routes transactions);
    // read the slot from the ER endpoint itself.
    const er = new Connection(ER_DEVNET, "confirmed");
    out.erSlot = await er.getSlot();
    out.erOk = true;
  } catch {
    out.erOk = false;
  }
  return out;
}

/** Derive the Player PDA: seeds ["player", authority]. Mirrors lib.rs. */
export async function playerPda(programId: string, authority: string): Promise<string> {
  const { PublicKey } = await import("@solana/web3.js");
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), new PublicKey(authority).toBuffer()],
    new PublicKey(programId),
  );
  return pda.toBase58();
}

/**
 * Build a delegate instruction for the player PDA using the real ER SDK.
 * Returns the instruction + PDAs so the UI can show exactly what will be
 * sent before the user signs. Caller builds/sends the transaction.
 */
export async function buildDelegateIx(args: {
  payer: string;
  playerPda: string;
  validator?: string;
}): Promise<{ instruction: unknown; delegationRecord: string; delegationMetadata: string }> {
  const sdk = await import("@magicblock-labs/ephemeral-rollups-sdk");
  const { PublicKey } = await import("@solana/web3.js");
  const payer = new PublicKey(args.payer);
  const pda = new PublicKey(args.playerPda);
  const validator = new PublicKey(args.validator ?? ER_VALIDATOR_DEVNET_US);
  const delegationRecord = sdk.delegationRecordPdaFromDelegatedAccount(pda);
  const delegationMetadata = sdk.delegationMetadataPdaFromDelegatedAccount(pda);
  const ix = sdk.createDelegateInstruction(
    {
      payer,
      pda,
      validator,
      delegationRecord,
      delegationMetadata,
      programId: new PublicKey(DELEGATION_PROGRAM_ID),
    } as never,
  );
  return {
    instruction: ix,
    delegationRecord: delegationRecord.toBase58(),
    delegationMetadata: delegationMetadata.toBase58(),
  };
}

/** Lazy check that the ER SDK loads in this browser (used by the UI). */
export async function erSdkInfo(): Promise<{
  loaded: boolean;
  delegationProgramId: string;
  hasMagicRouter: boolean;
}> {
  try {
    const sdk = await import("@magicblock-labs/ephemeral-rollups-sdk");
    return {
      loaded: true,
      delegationProgramId: sdk.DELEGATION_PROGRAM_ID.toBase58(),
      hasMagicRouter: typeof sdk.ConnectionMagicRouter === "function",
    };
  } catch {
    return { loaded: false, delegationProgramId: DELEGATION_PROGRAM_ID, hasMagicRouter: false };
  }
}
