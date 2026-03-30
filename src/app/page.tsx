"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { fetchKarmaState, fetchUserStake, fetchKarmaTotalSupply, fetchKarmaHolders, KarmaState, UserStake } from "@/utils/accounts";
import { getJitosolRate } from "@/utils/jupiter";
import { useKarma } from "@/hooks/useKarma";
import { useSettings } from "@/contexts/Settings";
import PriceChart from "@/components/PriceChart";
import Transactions from "@/components/Transactions";
import Profile from "@/components/Profile";
import Collapsible from "@/components/Collapsible";
import styles from "./page.module.css";

const APY = 0.075;

export default function HomePage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { deposit, claimYield, withdraw, swapBuy, swapSell, loading, error, txSig, setError } = useKarma();
  const { currency, cycleCurrency } = useSettings();

  const [state, setState] = useState<KarmaState | null>(null);
  const [userStake, setUserStake] = useState<UserStake | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [jitoRate, setJitoRate] = useState(1.083);
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [totalSupply, setTotalSupply] = useState(0);
  const [holders, setHolders] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const [stakeAmt, setStakeAmt] = useState("0.1");
  const [swapAmt, setSwapAmt] = useState("0.01");
  const [swapDir, setSwapDir] = useState<"buy" | "sell">("buy");

  useEffect(() => {
    const h = (e: MouseEvent) => { if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const reload = useCallback(async () => {
    const s = await fetchKarmaState(connection); setState(s);
    const supply = await fetchKarmaTotalSupply(connection); setTotalSupply(supply);
    const h = await fetchKarmaHolders(connection); setHolders(h);
    if (wallet.publicKey) { const u = await fetchUserStake(connection, wallet.publicKey); setUserStake(u); }
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

  const fmt = (solVal: number, decimals = 4): string => {
    if (currency === "USDC" && solPrice) return `$${(solVal * solPrice).toFixed(decimals)}`;
    if (currency === "KARMA" && karmaPrice > 0) return `${(solVal / karmaPrice).toFixed(decimals)} KARMA`;
    return `${solVal.toFixed(decimals)} SOL`;
  };

  const stakeIn = parseFloat(stakeAmt) || 0;
  const weeklyYieldSol = stakeIn * APY / 52;

  const swapIn = parseFloat(swapAmt) || 0;
  let swapOut = 0;
  if (state && swapIn > 0) {
    if (swapDir === "buy") { const ns = state.lpSol + swapIn; swapOut = state.lpKarma - (state.lpSol * state.lpKarma) / ns; }
    else { const nk = state.lpKarma + swapIn; swapOut = state.lpSol - (state.lpSol * state.lpKarma) / nk; }
  }

  return (
    <>
      <header className={styles.header}>
        <div className={styles.logo}><span className={styles.logoK}>K</span><span className={styles.logoText}>Karma</span></div>
        <div className={styles.headerRight}>
          <WalletMultiButton className={styles.walletBtn} />
          <div className={styles.settingsWrap} ref={settingsRef}>
            <button className={styles.settingsBtn} onClick={() => setSettingsOpen(!settingsOpen)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            {settingsOpen && (
              <div className={styles.dropdown}>
                <div className={styles.dropLabel}>Display currency</div>
                {(["SOL","USDC","KARMA"] as const).map(c => (
                  <button key={c} className={`${styles.dropItem} ${currency === c ? styles.dropItemActive : ""}`} onClick={() => { cycleCurrency(); }}>{c === "SOL" ? "◎" : c === "USDC" ? "$" : "K"} {c}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {pageLoading ? <div className={styles.loading}>Loading...</div> : state ? (
        <>
          {/* ── PRICE CHART (first) ── */}
          <PriceChart karmaPrice={karmaPrice} solPrice={solPrice} />

          {/* ── SWAP ── */}
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
              {!wallet.connected ? <div className={styles.hint}>Connect wallet to swap</div> : (
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

          {/* ── TRANSACTIONS ── */}
          <Transactions />

          {/* ── MINT KARMA ── */}
          <div className={styles.panel}>
            <Collapsible title="Mint Karma" defaultOpen={true} accent>
              <div className={styles.desc}>Stake SOL to earn Karma</div>
              {!wallet.connected ? <div className={styles.hint}>Connect wallet to mint</div> : (
                <>
                  <div className={styles.inputRow}>
                    <input type="number" value={stakeAmt} onChange={e => setStakeAmt(e.target.value)} min="0.01" step="0.1" className={styles.input} />
                    <span className={styles.inputUnit}>SOL</span>
                  </div>
                  {stakeIn > 0 && <div className={styles.estimate}>≈ {(weeklyYieldSol / karmaPrice).toFixed(6)} KARMA / week</div>}
                  <button className={styles.btn} onClick={() => deposit(stakeIn)} disabled={loading || stakeIn <= 0}>
                    {loading ? "Processing..." : `Stake ${stakeAmt} SOL`}
                  </button>
                  <div className={styles.rentNote}>A small rent fee (~0.00145 SOL) is collected to create your stake account. This is fully returned when you withdraw.</div>
                </>
              )}
              {wallet.connected && userStake && (
                <div className={styles.subsection}>
                  <Collapsible title="Your Stake" defaultOpen={true}>
                    <div className={styles.posRow}><span>SOL deposited</span><span className={styles.bold}>{fmt(userStake.solDeposited)}</span></div>
                    <div className={styles.posRow}><span>Claimable yield</span><span className={styles.green}>{claimable.toFixed(6)} KARMA</span></div>
                    <div className={styles.btnRow}>
                      <button className={styles.btn} onClick={() => claimYield(currentSolValue)} disabled={loading || claimable <= 0}>Claim KARMA</button>
                      <button className={styles.btnSecondary} onClick={() => withdraw(userStake.jitosolShare)} disabled={loading}>Withdraw SOL</button>
                    </div>
                  </Collapsible>
                </div>
              )}
              <div className={styles.subsection}>
                <Collapsible title="Stats" defaultOpen={true}>
                  <div className={styles.posRow}><span>Total SOL staked</span><span className={styles.bold}>{fmt(state.totalSolDeposited, 2)}</span></div>
                  <div className={styles.posRow}><span>Total stakers</span><span className={styles.bold}>{state.totalStakers}</span></div>
                </Collapsible>
              </div>
            </Collapsible>
          </div>

          {/* ── TOKENOMICS ── */}
          <div className={styles.panel}>
            <Collapsible title="Karma Tokenomics" defaultOpen={true} accent>
              <div className={styles.posRow}><span>Total supply</span><span className={styles.bold}>{totalSupply.toFixed(4)} KARMA</span></div>
              <div className={styles.posRow}><span>KARMA price</span><span className={styles.bold}>{fmt(karmaPrice)}</span></div>
              <div className={styles.posRow}><span>Market cap</span><span className={styles.bold}>{fmt(totalSupply * karmaPrice, 2)}</span></div>
              <div className={styles.posRow}><span>Holders</span><span className={styles.bold}>{holders}</span></div>
              <div className={styles.divider} />
              <div className={styles.subLabel}>Liquidity Pool</div>
              <div className={styles.posRow}><span>SOL reserve</span><span>{fmt(state.lpSol)}</span></div>
              <div className={styles.posRow}><span>KARMA reserve</span><span>{state.lpKarma.toFixed(4)} KARMA</span></div>
            </Collapsible>
          </div>

          {/* ── PROFILE (last) ── */}
          <Profile karmaPrice={karmaPrice} solPrice={solPrice} />

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
