"use client";
import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY, VersionedTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { PROGRAM_ID, KARMA_MINT, JITOSOL_MINT, findKarmaStatePDA, findUserStakePDA, findDeflateStatePDA, findDeflateUserStakePDA, findSupplyStatePDA, findSupplyUserStakePDA } from "@/utils/constants";
import { getSwapTransaction, getJitosolOutAmount, getJitosolToSolSwapTx } from "@/utils/jupiter";

function disc(name: string): Buffer {
  // Hardcoded discriminators
  const map: Record<string, number[]> = {
    deposit: [242,35,198,137,82,225,242,182],
    claim_yield: [49,74,111,7,186,22,61,165],
    withdraw: [183,18,70,156,148,109,161,34],
    swap_sol_to_karma: [192,38,94,240,4,78,213,102],
    swap_karma_to_sol: [86,220,74,230,132,48,98,247],
    deflate_deposit: [16,161,134,102,210,80,241,158],
    deflate_claim: [178,92,31,247,68,49,239,166],
    deflate_withdraw: [2,28,169,30,142,10,24,49],
    supply_deposit: [55,175,187,5,110,223,55,218],
    supply_claim: [115,195,13,16,12,189,174,113],
    supply_withdraw: [117,230,10,232,137,7,19,174],
  };
  return Buffer.from(map[name]);
}

// Confirm a transaction AND verify it succeeded on-chain. Throws if failed.
async function confirmAndVerify(connection: any, sig: string, label: string) {
  const result = await connection.confirmTransaction(sig, "confirmed");
  if (result.value.err) {
    throw new Error(`${label} failed on-chain: ${JSON.stringify(result.value.err)}`);
  }
}

export function useKarma() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const [ksPDA] = findKarmaStatePDA();

  // ── DEPOSIT: SOL → jitoSOL → vault ──
  const deposit = useCallback(async (solAmount: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    setLoading(true); setError(null); setTxSig(null);
    try {
      const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
      const userJitoAta = getAssociatedTokenAddressSync(JITOSOL_MINT, wallet.publicKey);

      // Check jitoSOL balance before swap
      let balBefore = BigInt(0);
      try {
        const bal = await connection.getTokenAccountBalance(userJitoAta);
        balBefore = BigInt(bal.value.amount);
      } catch {} // ATA might not exist yet

      // Step 1: Swap SOL → jitoSOL via Jupiter
      const swapTxBase64 = await getSwapTransaction(wallet.publicKey.toBase58(), lamports);
      const swapTxBuf = Buffer.from(swapTxBase64, "base64");
      let swapTx: VersionedTransaction;
      try { swapTx = VersionedTransaction.deserialize(swapTxBuf); } catch { throw new Error("Failed to deserialize Jupiter swap"); }
      const signedSwap = await wallet.signTransaction(swapTx);
      const swapSig = await connection.sendRawTransaction(signedSwap.serialize());
      await confirmAndVerify(connection, swapSig, "Jupiter swap");

      // Step 2: Read actual jitoSOL balance after swap
      await new Promise(r => setTimeout(r, 2000)); // brief delay for state to settle
      const balAfter = await connection.getTokenAccountBalance(userJitoAta);
      const jitReceived = BigInt(balAfter.value.amount) - balBefore;
      if (jitReceived <= BigInt(0)) throw new Error("No jitoSOL received from swap");

      // Step 3: Deposit jitoSOL to vault
      const vaultAta = getAssociatedTokenAddressSync(JITOSOL_MINT, ksPDA, true);
      const [userStakePDA] = findUserStakePDA(wallet.publicKey);

      const solBuf = Buffer.alloc(8); solBuf.writeBigUInt64LE(BigInt(lamports));
      const jitBuf = Buffer.alloc(8); jitBuf.writeBigUInt64LE(jitReceived);

      const depositTx = new Transaction().add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ksPDA, isSigner: false, isWritable: true },
          { pubkey: userJitoAta, isSigner: false, isWritable: true },
          { pubkey: vaultAta, isSigner: false, isWritable: true },
          { pubkey: userStakePDA, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("deposit"), solBuf, jitBuf]),
      });

      const sig = await wallet.sendTransaction(depositTx, connection, { skipPreflight: true });
      await connection.confirmTransaction(sig, "confirmed");
      setTxSig(sig);
    } catch (e: any) {
      const msg = e?.message || "Deposit failed";
      // Check if swap succeeded but deposit failed
      if (msg.includes("User rejected")) { setError("Transaction cancelled"); }
      else { setError(`Deposit step failed: ${msg.slice(0, 200)}`); }
    }
    setLoading(false);
  }, [wallet, connection, ksPDA]);

  // ── CLAIM YIELD: mint KARMA, add SOL to LP ──
  const claimYield = useCallback(async (currentSolValue: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    setLoading(true); setError(null); setTxSig(null);
    try {
      const [userStakePDA] = findUserStakePDA(wallet.publicKey);
      const userKarmaAta = getAssociatedTokenAddressSync(KARMA_MINT, wallet.publicKey);

      const valueBuf = Buffer.alloc(8);
      valueBuf.writeBigUInt64LE(BigInt(Math.floor(currentSolValue * LAMPORTS_PER_SOL)));

      const tx = new Transaction();
      // Create user KARMA ATA if needed
      tx.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, userKarmaAta, wallet.publicKey, KARMA_MINT));
      tx.add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ksPDA, isSigner: false, isWritable: true },
          { pubkey: userStakePDA, isSigner: false, isWritable: true },
          { pubkey: KARMA_MINT, isSigner: false, isWritable: true },
          { pubkey: userKarmaAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("claim_yield"), valueBuf]),
      });

      const sig = await wallet.sendTransaction(tx, connection, { skipPreflight: true });
      await connection.confirmTransaction(sig, "confirmed");
      setTxSig(sig);
    } catch (e: any) { setError(e.message || "Claim failed"); }
    setLoading(false);
  }, [wallet, connection, ksPDA]);

  // ── WITHDRAW: auto-claims yield, then returns jitoSOL → SOL ──
  const withdraw = useCallback(async (jitosolShare: number, currentSolValue: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    setLoading(true); setError(null); setTxSig(null);
    try {
      const [userStakePDA] = findUserStakePDA(wallet.publicKey);
      const userJitoAta = getAssociatedTokenAddressSync(JITOSOL_MINT, wallet.publicKey);
      const vaultAta = getAssociatedTokenAddressSync(JITOSOL_MINT, ksPDA, true);
      const userKarmaAta = getAssociatedTokenAddressSync(KARMA_MINT, wallet.publicKey);

      const valueBuf = Buffer.alloc(8);
      valueBuf.writeBigUInt64LE(BigInt(Math.floor(currentSolValue * LAMPORTS_PER_SOL)));

      // Step 1: Withdraw jitoSOL (auto-claims yield first)
      const tx = new Transaction();
      tx.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, userJitoAta, wallet.publicKey, JITOSOL_MINT));
      tx.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, userKarmaAta, wallet.publicKey, KARMA_MINT));
      tx.add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ksPDA, isSigner: false, isWritable: true },
          { pubkey: userStakePDA, isSigner: false, isWritable: true },
          { pubkey: vaultAta, isSigner: false, isWritable: true },
          { pubkey: userJitoAta, isSigner: false, isWritable: true },
          { pubkey: KARMA_MINT, isSigner: false, isWritable: true },
          { pubkey: userKarmaAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("withdraw"), valueBuf]),
      });

      const sig1 = await wallet.sendTransaction(tx, connection, { skipPreflight: true });
      await confirmAndVerify(connection, sig1, "Withdraw");

      // Step 2: Swap jitoSOL → SOL via Jupiter
      const jitoLamports = Math.floor(jitosolShare * 1e9);
      const swapTxBase64 = await getJitosolToSolSwapTx(wallet.publicKey.toBase58(), jitoLamports);
      const swapTx = VersionedTransaction.deserialize(Buffer.from(swapTxBase64, "base64"));
      const signedSwap = await wallet.signTransaction(swapTx);
      const sig2 = await connection.sendRawTransaction(signedSwap.serialize());
      await confirmAndVerify(connection, sig2, "Jupiter swap");

      setTxSig(sig2);
    } catch (e: any) { setError(e.message || "Withdraw failed"); }
    setLoading(false);
  }, [wallet, connection, ksPDA]);

  // ── SWAP SOL → KARMA (buy) ──
  const swapBuy = useCallback(async (solAmount: number) => {
    if (!wallet.publicKey) return;
    setLoading(true); setError(null); setTxSig(null);
    try {
      const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
      const lpKarmaAta = getAssociatedTokenAddressSync(KARMA_MINT, ksPDA, true);
      const userKarmaAta = getAssociatedTokenAddressSync(KARMA_MINT, wallet.publicKey);

      const solBuf = Buffer.alloc(8); solBuf.writeBigUInt64LE(BigInt(lamports));

      const tx = new Transaction();
      tx.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, userKarmaAta, wallet.publicKey, KARMA_MINT));
      tx.add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ksPDA, isSigner: false, isWritable: true },
          { pubkey: lpKarmaAta, isSigner: false, isWritable: true },
          { pubkey: userKarmaAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("swap_sol_to_karma"), solBuf]),
      });

      const sig = await wallet.sendTransaction(tx, connection, { skipPreflight: true });
      await confirmAndVerify(connection, sig, "KARMA buy");
      setTxSig(sig);
    } catch (e: any) { setError(e.message || "Swap failed"); }
    setLoading(false);
  }, [wallet, connection, ksPDA]);

  // ── SWAP KARMA → SOL (sell) ──
  const swapSell = useCallback(async (karmaAmount: number) => {
    if (!wallet.publicKey) return;
    setLoading(true); setError(null); setTxSig(null);
    try {
      const karmaLamports = Math.floor(karmaAmount * 1e9);
      const userKarmaAta = getAssociatedTokenAddressSync(KARMA_MINT, wallet.publicKey);
      const lpKarmaAta = getAssociatedTokenAddressSync(KARMA_MINT, ksPDA, true);

      const karmaBuf = Buffer.alloc(8); karmaBuf.writeBigUInt64LE(BigInt(karmaLamports));

      const tx = new Transaction().add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ksPDA, isSigner: false, isWritable: true },
          { pubkey: userKarmaAta, isSigner: false, isWritable: true },
          { pubkey: lpKarmaAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("swap_karma_to_sol"), karmaBuf]),
      });

      const sig = await wallet.sendTransaction(tx, connection, { skipPreflight: true });
      await confirmAndVerify(connection, sig, "KARMA sell");
      setTxSig(sig);
    } catch (e: any) { setError(e.message || "Swap failed"); }
    setLoading(false);
  }, [wallet, connection, ksPDA]);

  return { deposit, claimYield, withdraw, swapBuy, swapSell, loading, error, txSig, setError };
}

// ── Separate hooks for Deflate and Supply pools ──

export function useDeflatePool() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const [ksPDA] = findKarmaStatePDA();
  const [dsPDA] = findDeflateStatePDA();

  // Deflate Deposit: KARMA → sell to LP for SOL → Jupiter SOL→jitoSOL → deflate vault
  const deflateDeposit = useCallback(async (karmaAmount: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    setLoading(true); setError(null); setTxSig(null);
    try {
      const karmaLamports = Math.floor(karmaAmount * 1e9);
      const userKarmaAta = getAssociatedTokenAddressSync(KARMA_MINT, wallet.publicKey);
      const lpKarmaAta = getAssociatedTokenAddressSync(KARMA_MINT, ksPDA, true);
      const userJitoAta = getAssociatedTokenAddressSync(JITOSOL_MINT, wallet.publicKey);

      // Step 1: Record balances before sell
      const solBefore = await connection.getBalance(wallet.publicKey);
      let jitoBefore = BigInt(0);
      try { const b = await connection.getTokenAccountBalance(userJitoAta); jitoBefore = BigInt(b.value.amount); } catch {}

      // Step 2: Sell KARMA for SOL via our LP
      const karmaBuf = Buffer.alloc(8); karmaBuf.writeBigUInt64LE(BigInt(karmaLamports));
      const sellTx = new Transaction().add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ksPDA, isSigner: false, isWritable: true },
          { pubkey: userKarmaAta, isSigner: false, isWritable: true },
          { pubkey: lpKarmaAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("swap_karma_to_sol"), karmaBuf]),
      });
      const sellSig = await wallet.sendTransaction(sellTx, connection, { skipPreflight: true });
      await confirmAndVerify(connection, sellSig, "KARMA sell");
      // Verify tx actually succeeded on-chain

      // Step 3: Check how much SOL we got
      await new Promise(r => setTimeout(r, 2000));
      const solAfter = await connection.getBalance(wallet.publicKey);
      const solReceived = solAfter - solBefore;
      if (solReceived <= 0) throw new Error("KARMA sell did not return SOL. Transaction may have failed.");
      const solForSwap = solReceived - 20000; // leave buffer for fees
      if (solForSwap < 5000) throw new Error("SOL received from KARMA sell too small for Jupiter swap");

      // Step 4: Swap SOL → jitoSOL via Jupiter
      const swapTxBase64 = await getSwapTransaction(wallet.publicKey.toBase58(), solForSwap);
      const swapTx = VersionedTransaction.deserialize(Buffer.from(swapTxBase64, "base64"));
      const signedSwap = await wallet.signTransaction(swapTx);
      const swapSig = await connection.sendRawTransaction(signedSwap.serialize());
      await confirmAndVerify(connection, swapSig, "Jupiter swap");

      // Step 5: Read actual jitoSOL received
      await new Promise(r => setTimeout(r, 2000));
      const jitoAfter = await connection.getTokenAccountBalance(userJitoAta);
      const jitReceived = BigInt(jitoAfter.value.amount) - jitoBefore;
      if (jitReceived <= BigInt(0)) throw new Error("No jitoSOL received from Jupiter swap");

      // Step 6: Deposit jitoSOL into deflate vault
      const deflateVault = getAssociatedTokenAddressSync(JITOSOL_MINT, dsPDA, true);
      const [duPDA] = findDeflateUserStakePDA(wallet.publicKey);
      const kBuf = Buffer.alloc(8); kBuf.writeBigUInt64LE(BigInt(karmaLamports));
      const sBuf = Buffer.alloc(8); sBuf.writeBigUInt64LE(BigInt(solForSwap));
      const jBuf = Buffer.alloc(8); jBuf.writeBigUInt64LE(jitReceived);

      const depositTx = new Transaction();
      depositTx.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, userJitoAta, wallet.publicKey, JITOSOL_MINT));
      depositTx.add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ksPDA, isSigner: false, isWritable: false },
          { pubkey: dsPDA, isSigner: false, isWritable: true },
          { pubkey: userJitoAta, isSigner: false, isWritable: true },
          { pubkey: deflateVault, isSigner: false, isWritable: true },
          { pubkey: duPDA, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("deflate_deposit"), kBuf, sBuf, jBuf]),
      });
      const sig = await wallet.sendTransaction(depositTx, connection, { skipPreflight: true });
      await connection.confirmTransaction(sig, "confirmed");
      setTxSig(sig);
    } catch (e: any) { setError(e.message || "Deflate deposit failed"); }
    setLoading(false);
  }, [wallet, connection, ksPDA, dsPDA]);

  // Deflate Claim: yield → SOL added to LP
  const deflateClaim = useCallback(async (currentSolValue: number) => {
    if (!wallet.publicKey) return;
    setLoading(true); setError(null); setTxSig(null);
    try {
      const [duPDA] = findDeflateUserStakePDA(wallet.publicKey);
      const valueBuf = Buffer.alloc(8);
      valueBuf.writeBigUInt64LE(BigInt(Math.floor(currentSolValue * LAMPORTS_PER_SOL)));
      const tx = new Transaction().add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: ksPDA, isSigner: false, isWritable: true },
          { pubkey: dsPDA, isSigner: false, isWritable: true },
          { pubkey: duPDA, isSigner: false, isWritable: true },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("deflate_claim"), valueBuf]),
      });
      const sig = await wallet.sendTransaction(tx, connection, { skipPreflight: true });
      await connection.confirmTransaction(sig, "confirmed");
      setTxSig(sig);
    } catch (e: any) { setError(e.message || "Deflate claim failed"); }
    setLoading(false);
  }, [wallet, connection, ksPDA, dsPDA]);

  // Deflate Withdraw: auto-claims yield, jitoSOL → SOL (Jupiter) → buy KARMA from LP
  const deflateWithdraw = useCallback(async (jitosolShare: number, karmaDeposited: number, currentSolValue: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    setLoading(true); setError(null); setTxSig(null);
    try {
      const [duPDA] = findDeflateUserStakePDA(wallet.publicKey);
      const userJitoAta = getAssociatedTokenAddressSync(JITOSOL_MINT, wallet.publicKey);
      const deflateVault = getAssociatedTokenAddressSync(JITOSOL_MINT, dsPDA, true);

      const valueBuf = Buffer.alloc(8);
      valueBuf.writeBigUInt64LE(BigInt(Math.floor(currentSolValue * LAMPORTS_PER_SOL)));

      // Step 1: Withdraw jitoSOL (auto-claims yield to LP)
      const tx1 = new Transaction();
      tx1.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, userJitoAta, wallet.publicKey, JITOSOL_MINT));
      tx1.add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ksPDA, isSigner: false, isWritable: true },
          { pubkey: dsPDA, isSigner: false, isWritable: true },
          { pubkey: duPDA, isSigner: false, isWritable: true },
          { pubkey: deflateVault, isSigner: false, isWritable: true },
          { pubkey: userJitoAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("deflate_withdraw"), valueBuf]),
      });
      const sig1 = await wallet.sendTransaction(tx1, connection, { skipPreflight: true });
      await confirmAndVerify(connection, sig1, "Withdraw");

      // Step 2: Record SOL before Jupiter swap
      const solBeforeSwap = await connection.getBalance(wallet.publicKey);

      // Swap jitoSOL → SOL via Jupiter
      const jitoLamports = Math.floor(jitosolShare * 1e9);
      const swapTxBase64 = await getJitosolToSolSwapTx(wallet.publicKey.toBase58(), jitoLamports);
      const swapTx = VersionedTransaction.deserialize(Buffer.from(swapTxBase64, "base64"));
      const signedSwap = await wallet.signTransaction(swapTx);
      const swapSig = await connection.sendRawTransaction(signedSwap.serialize());
      await confirmAndVerify(connection, swapSig, "Jupiter swap");

      // Step 3: Buy back exactly karmaDeposited KARMA (not all SOL received)
      await new Promise(r => setTimeout(r, 2000));
      const userKarmaAta = getAssociatedTokenAddressSync(KARMA_MINT, wallet.publicKey);
      const lpKarmaAta = getAssociatedTokenAddressSync(KARMA_MINT, ksPDA, true);

      // Fetch current LP state to calculate exact SOL needed for karmaDeposited
      const { fetchKarmaState } = await import("@/utils/accounts");
      const ksState = await fetchKarmaState(connection);
      if (!ksState) throw new Error("Could not fetch LP state");

      // AMM math: SOL needed to buy K karma = (lp_sol * K) / (lp_karma - K)
      const karmaWant = karmaDeposited;
      if (karmaWant >= ksState.lpKarma) throw new Error("Not enough KARMA in LP");
      const solNeeded = (ksState.lpSol * karmaWant) / (ksState.lpKarma - karmaWant);
      const solForBuy = Math.ceil(solNeeded * LAMPORTS_PER_SOL) + 5000; // tiny buffer for rounding

      const solBuf = Buffer.alloc(8); solBuf.writeBigUInt64LE(BigInt(solForBuy));
      const buyTx = new Transaction();
      buyTx.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, userKarmaAta, wallet.publicKey, KARMA_MINT));
      buyTx.add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ksPDA, isSigner: false, isWritable: true },
          { pubkey: lpKarmaAta, isSigner: false, isWritable: true },
          { pubkey: userKarmaAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("swap_sol_to_karma"), solBuf]),
      });
      const sig3 = await wallet.sendTransaction(buyTx, connection, { skipPreflight: true });
      await confirmAndVerify(connection, sig3, "KARMA buyback");
      setTxSig(sig3);
    } catch (e: any) { setError(e.message || "Deflate withdraw failed"); }
    setLoading(false);
  }, [wallet, connection, ksPDA, dsPDA]);

  return { deflateDeposit, deflateClaim, deflateWithdraw, loading, error, txSig, setError };
}

export function useSupplyPool() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const [ksPDA] = findKarmaStatePDA();
  const [ssPDA] = findSupplyStatePDA();

  // Supply Deposit: SOL → Jupiter SOL→jitoSOL → supply vault
  const supplyDeposit = useCallback(async (solAmount: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    setLoading(true); setError(null); setTxSig(null);
    try {
      const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
      const userJitoAta = getAssociatedTokenAddressSync(JITOSOL_MINT, wallet.publicKey);
      let jitoBefore = BigInt(0);
      try { const b = await connection.getTokenAccountBalance(userJitoAta); jitoBefore = BigInt(b.value.amount); } catch {}

      // Step 1: Jupiter swap SOL → jitoSOL
      const swapTxBase64 = await getSwapTransaction(wallet.publicKey.toBase58(), lamports);
      const swapTx = VersionedTransaction.deserialize(Buffer.from(swapTxBase64, "base64"));
      const signedSwap = await wallet.signTransaction(swapTx);
      const swapSig = await connection.sendRawTransaction(signedSwap.serialize());
      await confirmAndVerify(connection, swapSig, "Jupiter swap");

      // Step 2: Read actual jitoSOL
      await new Promise(r => setTimeout(r, 2000));
      const jitoAfter = await connection.getTokenAccountBalance(userJitoAta);
      const jitReceived = BigInt(jitoAfter.value.amount) - jitoBefore;
      if (jitReceived <= BigInt(0)) throw new Error("No jitoSOL received");

      // Step 3: Deposit to supply vault
      const supplyVault = getAssociatedTokenAddressSync(JITOSOL_MINT, ssPDA, true);
      const [suPDA] = findSupplyUserStakePDA(wallet.publicKey);
      const solBuf = Buffer.alloc(8); solBuf.writeBigUInt64LE(BigInt(lamports));
      const jitBuf = Buffer.alloc(8); jitBuf.writeBigUInt64LE(jitReceived);

      const depositTx = new Transaction();
      depositTx.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, userJitoAta, wallet.publicKey, JITOSOL_MINT));
      depositTx.add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ksPDA, isSigner: false, isWritable: false },
          { pubkey: ssPDA, isSigner: false, isWritable: true },
          { pubkey: userJitoAta, isSigner: false, isWritable: true },
          { pubkey: supplyVault, isSigner: false, isWritable: true },
          { pubkey: suPDA, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("supply_deposit"), solBuf, jitBuf]),
      });
      const sig = await wallet.sendTransaction(depositTx, connection, { skipPreflight: true });
      await connection.confirmTransaction(sig, "confirmed");
      setTxSig(sig);
    } catch (e: any) { setError(e.message || "Supply deposit failed"); }
    setLoading(false);
  }, [wallet, connection, ksPDA, ssPDA]);

  // Supply Claim: yield → SOL + KARMA added to LP
  const supplyClaim = useCallback(async (currentSolValue: number) => {
    if (!wallet.publicKey) return;
    setLoading(true); setError(null); setTxSig(null);
    try {
      const [suPDA] = findSupplyUserStakePDA(wallet.publicKey);
      const lpKarmaAta = getAssociatedTokenAddressSync(KARMA_MINT, ksPDA, true);
      const valueBuf = Buffer.alloc(8);
      valueBuf.writeBigUInt64LE(BigInt(Math.floor(currentSolValue * LAMPORTS_PER_SOL)));
      const tx = new Transaction().add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: ksPDA, isSigner: false, isWritable: true },
          { pubkey: ssPDA, isSigner: false, isWritable: true },
          { pubkey: suPDA, isSigner: false, isWritable: true },
          { pubkey: KARMA_MINT, isSigner: false, isWritable: true },
          { pubkey: lpKarmaAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("supply_claim"), valueBuf]),
      });
      const sig = await wallet.sendTransaction(tx, connection, { skipPreflight: true });
      await connection.confirmTransaction(sig, "confirmed");
      setTxSig(sig);
    } catch (e: any) { setError(e.message || "Supply claim failed"); }
    setLoading(false);
  }, [wallet, connection, ksPDA, ssPDA]);

  // Supply Withdraw: auto-claims yield, jitoSOL → SOL (Jupiter)
  const supplyWithdraw = useCallback(async (jitosolShare: number, currentSolValue: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    setLoading(true); setError(null); setTxSig(null);
    try {
      const [suPDA] = findSupplyUserStakePDA(wallet.publicKey);
      const userJitoAta = getAssociatedTokenAddressSync(JITOSOL_MINT, wallet.publicKey);
      const supplyVault = getAssociatedTokenAddressSync(JITOSOL_MINT, ssPDA, true);
      const lpKarmaAta = getAssociatedTokenAddressSync(KARMA_MINT, ksPDA, true);

      const valueBuf = Buffer.alloc(8);
      valueBuf.writeBigUInt64LE(BigInt(Math.floor(currentSolValue * LAMPORTS_PER_SOL)));

      // Step 1: Withdraw jitoSOL (auto-claims yield to LP)
      const tx1 = new Transaction();
      tx1.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, userJitoAta, wallet.publicKey, JITOSOL_MINT));
      tx1.add({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ksPDA, isSigner: false, isWritable: true },
          { pubkey: ssPDA, isSigner: false, isWritable: true },
          { pubkey: suPDA, isSigner: false, isWritable: true },
          { pubkey: supplyVault, isSigner: false, isWritable: true },
          { pubkey: userJitoAta, isSigner: false, isWritable: true },
          { pubkey: KARMA_MINT, isSigner: false, isWritable: true },
          { pubkey: lpKarmaAta, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc("supply_withdraw"), valueBuf]),
      });
      const sig1 = await wallet.sendTransaction(tx1, connection, { skipPreflight: true });
      await confirmAndVerify(connection, sig1, "Withdraw");

      // Step 2: Swap jitoSOL → SOL
      const jitoLamports = Math.floor(jitosolShare * 1e9);
      const swapTxBase64 = await getJitosolToSolSwapTx(wallet.publicKey.toBase58(), jitoLamports);
      const swapTx = VersionedTransaction.deserialize(Buffer.from(swapTxBase64, "base64"));
      const signedSwap = await wallet.signTransaction(swapTx);
      const sig2 = await connection.sendRawTransaction(signedSwap.serialize());
      await confirmAndVerify(connection, sig2, "Jupiter swap");
      setTxSig(sig2);
    } catch (e: any) { setError(e.message || "Supply withdraw failed"); }
    setLoading(false);
  }, [wallet, connection, ksPDA, ssPDA]);

  return { supplyDeposit, supplyClaim, supplyWithdraw, loading, error, txSig, setError };
}
