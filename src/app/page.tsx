"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { fetchKarmaState, fetchUserStake, KarmaState, UserStake } from "@/utils/accounts";
import { getJitosolRate } from "@/utils/jupiter";
import { useKarma } from "@/hooks/useKarma";
import styles from "./page.module.css";

export default function HomePage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { deposit, claimYield, withdraw, swapBuy, swapSell, loading, error, txSig, setError } = useKarma();

  const [state, setState] = useState<KarmaState | null>(null);
  const [userStake, setUserStake] = useState<UserStake | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [jitoRate, setJitoRate] = useState(1.083);

  // Inputs
  const [stakeAmt, setStakeAmt] = useState("0.1");
  const [swapAmt, setSwapAmt] = useState("0.01");
  const [swapDir, setSwapDir] = useState<"buy" | "sell">("buy");

  const reload = useCallback(async () => {
    const s = await fetchKarmaState(connection);
    setState(s);
    if (wallet.publicKey) {
      const u = await fetchUserStake(connection, wallet.publicKey);
      setUserStake(u);
    }
  }, [connection, wallet.publicKey]);

  useEffect(() => {
    reload().then(() => setPageLoading(false)).catch(() => setPageLoading(false));
    getJitosolRate().then(setJitoRate).catch(() => {});
  }, [reload]);

  // Reload after tx
  useEffect(() => { if (txSig) setTimeout(reload, 2000); }, [txSig, reload]);

  const karmaPrice = state && state.lpKarma > 0 ? state.lpSol / state.lpKarma : 1;

  // Claimable yield
  const currentSolValue = userStake ? userStake.jitosolShare * jitoRate : 0;
  const claimable = userStake ? Math.max(0, currentSolValue - userStake.solValueAtLastClaim) : 0;

  // Swap output estimate
  const swapIn = parseFloat(swapAmt) || 0;
  let swapOut = 0;
  if (state && swapIn > 0) {
    if (swapDir === "buy") {
      const ns = state.lpSol + swapIn;
      const nk = (state.lpSol * state.lpKarma) / ns;
      swapOut = state.lpKarma - nk;
    } else {
      const nk = state.lpKarma + swapIn;
      const ns = (state.lpSol * state.lpKarma) / nk;
      swapOut = state.lpSol - ns;
    }
  }

  return (
    <>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoK}>K</span>
          <span className={styles.logoText}>Karma</span>
        </div>
        <WalletMultiButton className={styles.walletBtn} />
      </header>

      <div className={styles.hero}>
        <div className={styles.priceLabel}>KARMA Price</div>
        <div className={styles.price}>{karmaPrice.toFixed(4)} SOL</div>
      </div>

      {pageLoading ? <div className={styles.loading}>Loading...</div> : state ? (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}><div className={styles.statVal}>{state.totalSolDeposited.toFixed(2)}</div><div className={styles.statLabel}>SOL Staked</div></div>
            <div className={styles.statCard}><div className={styles.statVal}>{state.totalStakers}</div><div className={styles.statLabel}>Stakers</div></div>
            <div className={styles.statCard}><div className={styles.statVal}>{state.lpSol.toFixed(4)}</div><div className={styles.statLabel}>LP SOL</div></div>
            <div className={styles.statCard}><div className={styles.statVal}>{state.lpKarma.toFixed(4)}</div><div className={styles.statLabel}>LP KARMA</div></div>
          </div>

          {/* STAKE SECTION */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Stake SOL</div>
            <div className={styles.cardDesc}>Your SOL earns ~7.5% APY. Claim yield to mint KARMA.</div>
            {!wallet.connected ? (
              <div className={styles.hint}>Connect wallet to stake</div>
            ) : (
              <>
                <div className={styles.inputRow}>
                  <input type="number" value={stakeAmt} onChange={e => setStakeAmt(e.target.value)} min="0.01" step="0.1" className={styles.input} />
                  <span className={styles.inputUnit}>SOL</span>
                </div>
                <button className={styles.btn} onClick={() => deposit(parseFloat(stakeAmt) || 0)} disabled={loading || (parseFloat(stakeAmt) || 0) <= 0}>
                  {loading ? "Processing..." : `Stake ${stakeAmt} SOL`}
                </button>
              </>
            )}
          </div>

          {/* USER STAKE + CLAIM */}
          {wallet.connected && userStake && (
            <div className={styles.card}>
              <div className={styles.cardTitle}>Your Position</div>
              <div className={styles.row}><span>SOL deposited</span><span className={styles.bold}>{userStake.solDeposited.toFixed(4)} SOL</span></div>
              <div className={styles.row}><span>jitoSOL held</span><span>{userStake.jitosolShare.toFixed(6)}</span></div>
              <div className={styles.row}><span>Current SOL value</span><span className={styles.green}>{currentSolValue.toFixed(4)} SOL</span></div>
              <div className={styles.row}><span>Claimable yield</span><span className={styles.green}>{claimable.toFixed(6)} SOL</span></div>
              <div className={styles.btnRow}>
                <button className={styles.btn} onClick={() => claimYield(currentSolValue)} disabled={loading || claimable <= 0}>
                  {loading ? "..." : `Claim ${claimable.toFixed(4)} SOL → KARMA`}
                </button>
                <button className={styles.btnSecondary} onClick={withdraw} disabled={loading}>
                  {loading ? "..." : "Withdraw"}
                </button>
              </div>
            </div>
          )}

          {/* SWAP SECTION */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Swap</div>
            <div className={styles.swapToggle}>
              <button className={`${styles.swapTab} ${swapDir === "buy" ? styles.swapTabActive : ""}`} onClick={() => setSwapDir("buy")}>Buy KARMA</button>
              <button className={`${styles.swapTab} ${swapDir === "sell" ? styles.swapTabActive : ""}`} onClick={() => setSwapDir("sell")}>Sell KARMA</button>
            </div>
            {!wallet.connected ? (
              <div className={styles.hint}>Connect wallet to swap</div>
            ) : (
              <>
                <div className={styles.inputRow}>
                  <input type="number" value={swapAmt} onChange={e => setSwapAmt(e.target.value)} min="0.001" step="0.01" className={styles.input} />
                  <span className={styles.inputUnit}>{swapDir === "buy" ? "SOL" : "KARMA"}</span>
                </div>
                {swapOut > 0 && (
                  <div className={styles.swapPreview}>You get ≈ {swapOut.toFixed(6)} {swapDir === "buy" ? "KARMA" : "SOL"}</div>
                )}
                <button className={styles.btn} onClick={() => swapDir === "buy" ? swapBuy(swapIn) : swapSell(swapIn)} disabled={loading || swapIn <= 0}>
                  {loading ? "Processing..." : swapDir === "buy" ? `Buy KARMA with ${swapAmt} SOL` : `Sell ${swapAmt} KARMA`}
                </button>
              </>
            )}
          </div>

          {error && <div className={styles.error}>{error} <button className={styles.dismiss} onClick={() => setError(null)}>✕</button></div>}
          {txSig && <div className={styles.success}>TX: {txSig.slice(0, 20)}... ✓</div>}
        </>
      ) : (
        <div className={styles.loading}>Protocol not initialized</div>
      )}

      <footer className={styles.footer}>Karma — Sound money on Solana</footer>
    </>
  );
}
