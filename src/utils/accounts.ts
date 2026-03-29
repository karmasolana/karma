import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { findKarmaStatePDA, findUserStakePDA } from "./constants";

export interface KarmaState {
  admin: PublicKey;
  karmaMint: PublicKey;
  vault: PublicKey;
  totalSolDeposited: number;
  totalJitosol: number;
  totalStakers: number;
  lpSol: number;
  lpKarma: number;
}

export interface UserStake {
  user: PublicKey;
  solDeposited: number;
  jitosolShare: number;
  solValueAtLastClaim: number;
}

export async function fetchKarmaState(conn: Connection): Promise<KarmaState | null> {
  const [pda] = findKarmaStatePDA();
  const info = await conn.getAccountInfo(pda);
  if (!info) return null;
  const d = Buffer.from(info.data);
  return {
    admin: new PublicKey(d.subarray(8, 40)),
    karmaMint: new PublicKey(d.subarray(40, 72)),
    vault: new PublicKey(d.subarray(104, 136)),
    totalSolDeposited: Number(d.readBigUInt64LE(136)) / LAMPORTS_PER_SOL,
    totalJitosol: Number(d.readBigUInt64LE(144)) / 1e9,
    totalStakers: Number(d.readBigUInt64LE(152)),
    lpSol: Number(d.readBigUInt64LE(160)) / LAMPORTS_PER_SOL,
    lpKarma: Number(d.readBigUInt64LE(168)) / 1e9,
  };
}

export async function fetchUserStake(conn: Connection, user: PublicKey): Promise<UserStake | null> {
  const [pda] = findUserStakePDA(user);
  const info = await conn.getAccountInfo(pda);
  if (!info) return null;
  const d = Buffer.from(info.data);
  return {
    user: new PublicKey(d.subarray(8, 40)),
    solDeposited: Number(d.readBigUInt64LE(40)) / LAMPORTS_PER_SOL,
    jitosolShare: Number(d.readBigUInt64LE(48)) / 1e9,
    solValueAtLastClaim: Number(d.readBigUInt64LE(56)) / LAMPORTS_PER_SOL,
  };
}

export async function fetchKarmaTotalSupply(conn: Connection): Promise<number> {
  try {
    const supply = await conn.getTokenSupply(new PublicKey("2U5JyFe5yY1ZDDdeKSduGpzuAZ1a69uYH5EdXdujJSr2"));
    return Number(supply.value.uiAmount || 0);
  } catch { return 0; }
}

export async function fetchKarmaHolders(conn: Connection): Promise<number> {
  try {
    const accounts = await conn.getProgramAccounts(
      new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      { filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: "2U5JyFe5yY1ZDDdeKSduGpzuAZ1a69uYH5EdXdujJSr2" } }] }
    );
    return accounts.filter(a => {
      const data = Buffer.from(a.account.data);
      const amount = Number(data.readBigUInt64LE(64));
      return amount > 0;
    }).length;
  } catch { return 0; }
}
