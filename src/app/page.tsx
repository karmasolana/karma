"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { fetchKarmaState, fetchUserStake, fetchKarmaTotalSupply, KarmaState, UserStake } from "@/utils/accounts";
import { getJitosolRate } from "@/utils/jupiter";
import { useKarma } from "@/hooks/useKarma";
import PriceChart from "@/components/PriceChart";
import Collapsible from "@/components/Collapsible";
import styles from "./page.module.css";

export default function HomePage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { deposit, claimYield, withdraw, swapBuy, swapSell, loading, error, txSig, setError } = useKarma();

  const [state, setState] = useState<KarmaState | null>(null);
  const [userStake, setUserStake] = useState<UserStake | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [jitoRate, setJitoRate] = useState(1.083);
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [totalSupply, setTotalSupply] = useState(0);

  const [stakeAmt, setStakeAmt] = useState("0.1");
  const [swapAmt, setSwapAmt] = useState("0.01");
  const [swapDir, setSwapDir] = useState<"buy" | "sell">("buy");

  const reload = useCallback(async () => {
    const s = await fetchKarmaState(connection);
    setState(s);
    const supply = await fetchKarmaTotalSupply(connection);
    setTotalSupply(supply);
    if (wallet.publicKey) {
      const u = await fetchUserStake(connection, wallet.publicKey);
      setUserStake(u);
    }
  }, [connection, wallet.publicKey]);

  useEffect(() => {
    reload().then(() => setPageLoading(false)).catch(() => setPageLoading(false));
    getJitosolRate().then(setJitoRate).catch(() => {});
    fetch("https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000000&slippageBps=50")
      .then(r => r.json()).then(d => { if (d.outAmount) setSolPrice(Number(d.outAmount) / 1e6); }).catch(() => {});
  }, [reload]);

  useEffect(() => { if (txSig) setTimeout(reload, 2000); }, [txSig, reload]);

  const karmaPrice = state && state.lpKarma > 0 ? state.lpSol / state.lpKarma : 1;
  const currentSolValue = userStake ? userStake.jitosolShare * jitoRate : 0;
  const claimable = userStake ? Math.max(0, currentSolValue - userStake.solValueAtLastClaim) : 0;
  // Show claimable as KARMA (1:1 with SOL at protocol level in lamports)
  const claimableKarma = claimable;

  const swapIn = parseFloat(swapAmt) || 0;
  let swapOut = 0;
  if (state && swapIn > 0) {
    if (swapDir === "buy") {
      const ns = state.lpSol + swapIn;
      swapOut = state.lpKarma - (state.lpSol * state.lpKarma) / ns;
    } else {
      const nk = state.lpKarma + swapIn;
      swapOut = state.lpSol - (state.lpSol * state.lpKarma) / nk;
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

      {pageLoading ? <div className={styles.loading}>Loading...</div> : state ? (
        <>
          {/* ── SWAP PANEL ── */}
          <div className={styles.panel}>
            <Collapsible title="Swap" defaultOpen={true} accent>
              <div className={styles.priceRow}>
                <span className={styles.priceBig}>{karmaPrice.toFixed(4)} SOL</span>
                <span className={styles.priceSlash}>/</span>
                <span className={styles.priceToken}>KARMA</span>
              </div>

              <div className={styles.swapToggle}>
                <button className={`${styles.swapTab} ${swapDir === "buy" ? styles.swapTabActive : ""}`} onClick={() => setSwapDir("buy")}>Buy</button>
                <button className={`${styles.swapTab} ${swapDir === "sell" ? styles.swapTabActive : ""}`} onClick={() => setSwapDir("sell")}>Sell</button>
              </div>

              {!wallet.connected ? (
                <div className={styles.hint}>Connect wallet to swap</div>
              ) : (
                <>
                  <div className={styles.inputRow}>
                    <input type="number" value={swapAmt} onChange={e => setSwapAmt(e.target.value)} min="0.001" step="0.01" className={styles.input} />
                    <span className={styles.inputUnit}>{swapDir === "buy" ? "SOL" : "KARMA"}</span>
                  </div>
                  {swapOut > 0 && <div className={styles.swapPreview}>→ {swapOut.toFixed(6)} {swapDir === "buy" ? "KARMA" : "SOL"}</div>}
                  <button className={styles.btn} onClick={() => swapDir === "buy" ? swapBuy(swapIn) : swapSell(swapIn)} disabled={loading || swapIn <= 0}>
                    {loading ? "Processing..." : swapDir === "buy" ? "Buy KARMA" : "Sell KARMA"}
                  </button>
                </>
              )}
            </Collapsible>
          </div>

          {/* ── PRICE CHART ── */}
          <PriceChart karmaPrice={karmaPrice} solPrice={solPrice} />

          {/* ── MINT KARMA PANEL ── */}
          <div className={styles.panel}>
            <Collapsible title="Mint Karma" defaultOpen={true} accent>
              <div className={styles.desc}>Stake SOL to earn Karma</div>

              {!wallet.connected ? (
                <div className={styles.hint}>Connect wallet to mint</div>
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

              {/* YOUR STAKE subsection */}
              {wallet.connected && userStake && (
                <div className={styles.subsection}>
                  <Collapsible title="Your Stake" defaultOpen={true}>
                    <div className={styles.posRow}><span>SOL deposited</span><span className={styles.bold}>{userStake.solDeposited.toFixed(4)} SOL</span></div>
                    <div className={styles.posRow}><span>Claimable yield</span><span className={styles.green}>{claimableKarma.toFixed(6)} KARMA</span></div>
                    <div className={styles.btnRow}>
                      <button className={styles.btn} onClick={() => claimYield(currentSolValue)} disabled={loading || claimable <= 0}>
                        {loading ? "..." : "Claim KARMA"}
                      </button>
                      <button className={styles.btnSecondary} onClick={() => withdraw(userStake.jitosolShare)} disabled={loading}>
                        Withdraw SOL
                      </button>
                    </div>
                  </Collapsible>
                </div>
              )}

              {/* STATS subsection */}
              <div className={styles.subsection}>
                <Collapsible title="Stats" defaultOpen={true}>
                  <div className={styles.posRow}><span>Total SOL staked</span><span className={styles.bold}>{state.totalSolDeposited.toFixed(2)} SOL</span></div>
                  <div className={styles.posRow}><span>Total stakers</span><span className={styles.bold}>{state.totalStakers}</span></div>
                </Collapsible>
              </div>
            </Collapsible>
          </div>

          {/* ── TOKENOMICS PANEL ── */}
          <div className={styles.panel}>
            <Collapsible title="Karma Tokenomics" defaultOpen={true} accent>
              <div className={styles.posRow}><span>Total KARMA supply</span><span className={styles.bold}>{totalSupply.toFixed(4)}</span></div>
              <div className={styles.posRow}><span>KARMA price</span><span className={styles.bold}>{karmaPrice.toFixed(4)} SOL</span></div>
              <div className={styles.posRow}><span>Market cap</span><span className={styles.bold}>{(totalSupply * karmaPrice).toFixed(4)} SOL</span></div>
              <div className={styles.divider} />
              <div className={styles.subLabel}>Liquidity Pool</div>
              <div className={styles.posRow}><span>SOL reserve</span><span>{state.lpSol.toFixed(4)} SOL</span></div>
              <div className={styles.posRow}><span>KARMA reserve</span><span>{state.lpKarma.toFixed(4)} KARMA</span></div>
              <div className={styles.posRow}><span>k constant</span><span>{(state.lpSol * state.lpKarma).toFixed(6)}</span></div>
            </Collapsible>
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
