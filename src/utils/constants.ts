import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("CdVUE5ieijJbUeRLmRB1AsSTYyzdy2w4sg7QMCsUzBB5");
export const KARMA_MINT = new PublicKey("2U5JyFe5yY1ZDDdeKSduGpzuAZ1a69uYH5EdXdujJSr2");
export const JITOSOL_MINT = new PublicKey("J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn");
export const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const RPC_ENDPOINT = "https://mainnet.helius-rpc.com/?api-key=ba8baf7e-88d6-4512-bb03-175b0dc9ff33";
export const ADMIN_WALLET = "AhW1wsTktCbnP1mPFGSjYtX5KmN4LS1J1mTQ5kubMgYx";

export function findKarmaStatePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("karma_state")], PROGRAM_ID);
}

export function findUserStakePDA(user: PublicKey): [PublicKey, number] {
  const [ksPDA] = findKarmaStatePDA();
  return PublicKey.findProgramAddressSync([Buffer.from("user_stake"), user.toBuffer(), ksPDA.toBuffer()], PROGRAM_ID);
}

export function findDeflateStatePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("deflate_state")], PROGRAM_ID);
}

export function findDeflateUserStakePDA(user: PublicKey): [PublicKey, number] {
  const [dsPDA] = findDeflateStatePDA();
  return PublicKey.findProgramAddressSync([Buffer.from("deflate_stake"), user.toBuffer(), dsPDA.toBuffer()], PROGRAM_ID);
}

export function findSupplyStatePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("supply_state")], PROGRAM_ID);
}

export function findSupplyUserStakePDA(user: PublicKey): [PublicKey, number] {
  const [ssPDA] = findSupplyStatePDA();
  return PublicKey.findProgramAddressSync([Buffer.from("supply_stake"), user.toBuffer(), ssPDA.toBuffer()], PROGRAM_ID);
}
