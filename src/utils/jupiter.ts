import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const JUP_API = "https://lite-api.jup.ag/swap/v1";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const JITOSOL_MINT = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn";

export async function getJitosolRate(): Promise<number> {
  const res = await fetch(`${JUP_API}/quote?inputMint=${SOL_MINT}&outputMint=${JITOSOL_MINT}&amount=${LAMPORTS_PER_SOL}&slippageBps=50`);
  const data = await res.json();
  return LAMPORTS_PER_SOL / Number(data.outAmount);
}

export async function getSwapTransaction(userPubkey: string, solLamports: number): Promise<string> {
  // Get quote
  const quoteRes = await fetch(`${JUP_API}/quote?inputMint=${SOL_MINT}&outputMint=${JITOSOL_MINT}&amount=${solLamports}&slippageBps=100`);
  const quote = await quoteRes.json();

  // Get swap tx
  const swapRes = await fetch(`${JUP_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: userPubkey,
      wrapAndUnwrapSol: true,
    }),
  });
  const swap = await swapRes.json();
  return swap.swapTransaction;
}

export async function getJitosolOutAmount(solLamports: number): Promise<number> {
  const res = await fetch(`${JUP_API}/quote?inputMint=${SOL_MINT}&outputMint=${JITOSOL_MINT}&amount=${solLamports}&slippageBps=100`);
  const data = await res.json();
  return Number(data.otherAmountThreshold || data.outAmount);
}
