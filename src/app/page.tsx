"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { fetchKarmaState, fetchUserStake, fetchKarmaTotalSupply, fetchKarmaHolders, fetchDeflateState, fetchDeflateUserStake, fetchSupplyState, fetchSupplyUserStake, KarmaState, UserStake, DeflateState, DeflateUserStake, SupplyState } from "@/utils/accounts";
import { KARMA_MINT } from "@/utils/constants";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getJitosolRate } from "@/utils/jupiter";
import { useKarma, useDeflatePool, useSupplyPool } from "@/hooks/useKarma";
import { useSettings } from "@/contexts/Settings";
import PriceChart from "@/components/PriceChart";
import Profile from "@/components/Profile";
import DevLog from "@/components/DevLog";
import Collapsible from "@/components/Collapsible";
import styles from "./page.module.css";

const APY = 0.075;

export default function HomePage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { deposit, claimYield, withdraw, swapBuy, swapSell, loading, error, txSig, setError } = useKarma();
  const { deflateDeposit, deflateClaim, deflateWithdraw, loading: dLoading, error: dError, txSig: dTxSig, setError: dSetError } = useDeflatePool();
  const { supplyDeposit, supplyClaim, supplyWithdraw, loading: sLoading, error: sError, txSig: sTxSig, setError: sSetError } = useSupplyPool();
  const { currency, cycleCurrency } = useSettings();

  const [state, setState] = useState<KarmaState | null>(null);
  const [userStake, setUserStake] = useState<UserStake | null>(null);
  const [deflateState, setDeflateState] = useState<DeflateState | null>(null);
  const [deflateUserStake, setDeflateUserStake] = useState<DeflateUserStake | null>(null);
  const [supplyState, setSupplyState] = useState<SupplyState | null>(null);
  const [supplyUserStake, setSupplyUserStake] = useState<DeflateUserStake | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [jitoRate, setJitoRate] = useState(1.083);
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [totalSupply, setTotalSupply] = useState(0);
  const [holders, setHolders] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [welcomeHover, setWelcomeHover] = useState(false);
  const [showSwap, setShowSwap] = useState(true);
  const [lastTx, setLastTx] = useState<{ sig: string; time: number; type: string; amount: string; wallet: string } | null>(null);
  const [tokPage, setTokPage] = useState(0);
  const tokPages = ["General", "Mint Pool", "Deflation Pool", "Supply Pool", "Liquidity Pool", "Distribution", "Chart"];

  const [stakeAmt, setStakeAmt] = useState("0.1");
  const [deflateAmt, setDeflateAmt] = useState("0.1");
  const [supplyAmt, setSupplyAmt] = useState("0.1");
  const [swapAmt, setSwapAmt] = useState("0.01");
  const [swapDir, setSwapDir] = useState<"buy" | "sell">("buy");
  const [activeTab, setActiveTab] = useState<"swap" | "mint" | "supply" | "deflate">("swap");
  const [solBalance, setSolBalance] = useState(0);
  const [karmaBalance, setKarmaBalance] = useState(0);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const reload = useCallback(async () => {
    const s = await fetchKarmaState(connection); setState(s);
    const supply = await fetchKarmaTotalSupply(connection); setTotalSupply(supply);
    const h = await fetchKarmaHolders(connection); setHolders(h);
    const ds = await fetchDeflateState(connection); setDeflateState(ds);
    const ss = await fetchSupplyState(connection); setSupplyState(ss);
    if (wallet.publicKey) {
      const u = await fetchUserStake(connection, wallet.publicKey); setUserStake(u);
      const du = await fetchDeflateUserStake(connection, wallet.publicKey); setDeflateUserStake(du);
      const su = await fetchSupplyUserStake(connection, wallet.publicKey); setSupplyUserStake(su);
      // Fetch balances
      try {
        const sol = await connection.getBalance(wallet.publicKey);
        setSolBalance(sol / 1e9);
      } catch {}
      try {
        const karmaAta = getAssociatedTokenAddressSync(KARMA_MINT, wallet.publicKey);
        const bal = await connection.getTokenAccountBalance(karmaAta);
        setKarmaBalance(parseFloat(bal.value.uiAmountString || "0"));
      } catch { setKarmaBalance(0); }
      // Fetch last tx with details
      try {
        const sigs = await connection.getSignaturesForAddress(wallet.publicKey, { limit: 1 });
        if (sigs.length > 0) {
          const sig = sigs[0];
          const memo = sig.memo || "";
          let type = "Unknown";
          if (memo.includes("swap") || memo.includes("Swap")) type = "Swap";
          // Try to determine type from recent program interactions
          try {
            const txInfo = await connection.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
            if (txInfo?.meta?.logMessages) {
              const logs = txInfo.meta.logMessages.join(" ");
              if (logs.includes("CdVUE5ieijJbUeRLmRB1AsSTYyzdy2w4sg7QMCsUzBB5")) {
                const pre = txInfo.meta.preBalances[0] || 0;
                const post = txInfo.meta.postBalances[0] || 0;
                const diff = (post - pre) / 1e9;
                const absDiff = Math.abs(diff).toFixed(4);
                // Check token changes
                const preTokens = txInfo.meta.preTokenBalances || [];
                const postTokens = txInfo.meta.postTokenBalances || [];
                let karmaChange = 0;
                for (const pt of postTokens) {
                  if (pt.owner === wallet.publicKey.toBase58()) {
                    const pre = preTokens.find((p: any) => p.accountIndex === pt.accountIndex);
                    const preAmt = pre ? parseFloat(pre.uiTokenAmount?.uiAmountString || "0") : 0;
                    const postAmt = parseFloat(pt.uiTokenAmount?.uiAmountString || "0");
                    karmaChange = postAmt - preAmt;
                  }
                }
                if (karmaChange > 0.0001) { type = "Buy KARMA"; }
                else if (karmaChange < -0.0001) { type = "Sell KARMA"; }
                else if (diff < -0.01) { type = "Deposit"; }
                else if (diff > 0.01) { type = "Withdraw"; }
                else { type = "Karma"; }
                setLastTx({ sig: sig.signature, time: sig.blockTime || 0, type, amount: `${diff > 0 ? "+" : ""}${diff.toFixed(4)} SOL`, wallet: wallet.publicKey.toBase58() });
              } else {
                setLastTx({ sig: sig.signature, time: sig.blockTime || 0, type: "Transaction", amount: "", wallet: wallet.publicKey.toBase58() });
              }
            } else {
              setLastTx({ sig: sig.signature, time: sig.blockTime || 0, type: "Transaction", amount: "", wallet: wallet.publicKey.toBase58() });
            }
          } catch {
            setLastTx({ sig: sig.signature, time: sig.blockTime || 0, type: "Transaction", amount: "", wallet: wallet.publicKey.toBase58() });
          }
        }
      } catch {}
    }
  }, [connection, wallet.publicKey]);

  const fetchPrices = useCallback(() => {
    getJitosolRate().then(setJitoRate).catch(() => {});
    fetch("https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000000&slippageBps=50")
      .then(r => r.json()).then(d => { if (d.outAmount) setSolPrice(Number(d.outAmount) / 1e6); }).catch(() => {});
  }, []);

  useEffect(() => {
    reload().then(() => setPageLoading(false)).catch(() => setPageLoading(false));
    fetchPrices();
    const interval = setInterval(() => { reload(); fetchPrices(); }, 30000);
    return () => clearInterval(interval);
  }, [reload, fetchPrices]);

  useEffect(() => { if (txSig || dTxSig || sTxSig) setTimeout(() => { reload(); fetchPrices(); }, 2000); }, [txSig, dTxSig, sTxSig, reload, fetchPrices]);

  const karmaPrice = state && state.lpKarma > 0 ? state.lpSol / state.lpKarma : 1;
  const currentSolValue = userStake ? userStake.jitosolShare * jitoRate : 0;
  const claimable = userStake ? Math.max(0, currentSolValue - userStake.solValueAtLastClaim) : 0;
  const claimableKarma = karmaPrice > 0 ? claimable / karmaPrice : claimable;
  const defCurrentSolValue = deflateUserStake ? deflateUserStake.jitosolShare * jitoRate : 0;
  const defClaimable = deflateUserStake ? Math.max(0, defCurrentSolValue - deflateUserStake.solValueAtLastClaim) : 0;
  const supCurrentSolValue = supplyUserStake ? supplyUserStake.jitosolShare * jitoRate : 0;
  const supClaimable = supplyUserStake ? Math.max(0, supCurrentSolValue - supplyUserStake.solValueAtLastClaim) : 0;

  const fmt = (solVal: number, decimals = 4): string => {
    if (currency === "USDC" && solPrice) return `$${(solVal * solPrice).toFixed(decimals)}`;
    if (currency === "KARMA" && karmaPrice > 0) return `${(solVal / karmaPrice).toFixed(decimals)} KARMA`;
    return `${solVal.toFixed(decimals)} SOL`;
  };

  const stakeIn = parseFloat(stakeAmt) || 0;
  const weeklyYieldSol = stakeIn * APY / 52;
  const deflateIn = parseFloat(deflateAmt) || 0;
  const supplyIn = parseFloat(supplyAmt) || 0;
  const swapIn = parseFloat(swapAmt) || 0;
  let swapOut = 0;
  if (state && swapIn > 0) {
    if (swapDir === "buy") { const ns = state.lpSol + swapIn; swapOut = state.lpKarma - (state.lpSol * state.lpKarma) / ns; }
    else { const nk = state.lpKarma + swapIn; swapOut = state.lpSol - (state.lpSol * state.lpKarma) / nk; }
  }

  const anyLoading = loading || dLoading || sLoading;
  const anyError = error || dError || sError;
  const clearErrors = () => { setError(null); dSetError(null); sSetError(null); };
  const deflateSupplyReduced = deflateState && karmaPrice > 0 ? deflateState.totalYieldDonated / karmaPrice : 0;
  const totalKarmaMinted = Math.max(0, totalSupply - 0.25);

  const fmtTime = (ts: number) => {
    if (!ts) return "";
    const d = Date.now() / 1000 - ts;
    if (d < 60) return "just now";
    if (d < 3600) return `${Math.floor(d / 60)}m ago`;
    if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
    return `${Math.floor(d / 86400)}d ago`;
  };

  return (
    <>
      <header className={styles.header}>
        <div className={styles.logo}><span className={styles.logoK}>K</span><span className={styles.logoText}>Karma</span></div>
        {state && <div className={styles.headerPrice}>{karmaPrice.toFixed(4)} SOL<span className={styles.headerSlash}>/</span><span className={styles.headerKarma}>KARMA</span></div>}
        <div className={styles.headerRight}>
          {wallet.connected && <span className={styles.headerKarmaBalance}>{karmaBalance.toFixed(2)} K</span>}
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
          {/* ── TOOLBAR ── */}
          <div className={styles.toolbar}>
            <div className={`${styles.welcomeChip} ${welcomeHover ? styles.welcomeChipHover : ""}`}
              onMouseEnter={() => setWelcomeHover(true)} onMouseLeave={() => setWelcomeHover(false)}>
              <svg className={styles.welcomeIcon} width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="6" width="18" height="12" rx="2" fill="#8b5cf630" stroke="#8b5cf6" strokeWidth="1.5"/>
                <line x1="12" y1="18" x2="12" y2="22" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="9" y1="22" x2="15" y2="22" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round"/>
                <text x="12" y="13.5" textAnchor="middle" fill="#8b5cf6" fontSize="5" fontWeight="700">WELCOME</text>
              </svg>
              {welcomeHover && (
                <div className={styles.welcomeTooltip}>
                  <div className={styles.welcomeTooltipTitle}>Welcome to Karma</div>
                  <p>Karma is a store of value token built on Solana and backed 1:1 by SOL. Karma can be minted and deflated by staking Sol. Sol can be withdrawn any time with no additional fees. You can buy and sell Karma using our Swap built with our own Liquidity Pools.</p>
                </div>
              )}
            </div>
            <button className={`${styles.kCoinBtn} ${showSwap ? styles.kCoinActive : ""}`} onClick={() => setShowSwap(!showSwap)} title="Toggle swap panel">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill={showSwap ? "#8b5cf640" : "#8b5cf620"} stroke="#8b5cf6" strokeWidth="1.5"/>
                <text x="12" y="16" textAnchor="middle" fill="#8b5cf6" fontSize="11" fontWeight="800">K</text>
              </svg>
            </button>
          </div>

          {/* ── SWAP PANEL (toggled by K coin) ── */}
          {showSwap && (<>
            <div className={styles.panel}>
              <div className={styles.mainTabs}>
                <button className={`${styles.mainTab} ${activeTab === "swap" ? styles.mainTabActive : ""}`} onClick={() => setActiveTab("swap")} title="Swap between Sol and Karma for no fees">Swap</button>
                <button className={`${styles.mainTab} ${activeTab === "mint" ? styles.mainTabActive : ""}`} onClick={() => setActiveTab("mint")} title="Stake Sol to mint Karma rewards, withdraw at any time for no fees">Mint</button>
                <button className={`${styles.mainTab} ${activeTab === "supply" ? styles.mainTabActive : ""}`} onClick={() => setActiveTab("supply")} title="Stake Sol to donate liquidity to Karma">Supply</button>
                <button className={`${styles.mainTab} ${activeTab === "deflate" ? styles.mainTabActive : ""}`} onClick={() => setActiveTab("deflate")} title="Stake Karma to deflate Karma supply">Deflate</button>
              </div>

              {activeTab === "swap" && (<>
                <div className={styles.priceRow}>
                  <span className={styles.priceBig}>{karmaPrice.toFixed(4)} SOL</span>
                  <span className={styles.priceSlash}>/</span>
                  <span className={styles.priceToken}>KARMA</span>
                </div>
                <div className={styles.swapToggle}>
                  <button className={`${styles.swapTab} ${swapDir === "buy" ? styles.swapTabActive : ""}`} onClick={() => setSwapDir("buy")}>Buy</button>
                  <button className={`${styles.swapTab} ${swapDir === "sell" ? styles.swapTabActive : ""}`} onClick={() => setSwapDir("sell")}>Sell</button>
                </div>
                {!wallet.connected ? <div className={styles.hint}>Connect wallet to swap</div> : (<>
                  <div className={styles.swapLabel}>{swapDir === "buy" ? "You pay" : "You sell"}</div>
                  <div className={styles.swapBox}>
                    <input type="number" value={swapAmt} onChange={e => setSwapAmt(e.target.value)} min="0.001" step="0.01" className={styles.swapInput} />
                    <div className={styles.swapBalArea}>
                      <button className={styles.swapHalf} onClick={() => setSwapAmt(((swapDir === "buy" ? solBalance : karmaBalance) / 2).toFixed(6))}>½</button>
                      <span className={styles.swapBal} onClick={() => setSwapAmt((swapDir === "buy" ? Math.max(0, solBalance - 0.01) : karmaBalance).toFixed(6))}>{(swapDir === "buy" ? solBalance : karmaBalance).toFixed(4)}</span>
                      <span className={styles.swapBadge}>{swapDir === "buy" ? "SOL" : "KARMA"}</span>
                    </div>
                  </div>
                  <button className={styles.swapArrowBtn} onClick={() => setSwapDir(swapDir === "buy" ? "sell" : "buy")}>⇅</button>
                  <div className={styles.swapLabel}>You receive</div>
                  <div className={`${styles.swapBox} ${styles.swapBoxOut}`}>
                    <span className={styles.swapOutAmt}>{swapOut > 0 ? swapOut.toFixed(6) : "0.000000"}</span>
                    <div className={styles.swapBalArea}>
                      <span className={styles.swapBal}>{(swapDir === "buy" ? karmaBalance : solBalance).toFixed(4)}</span>
                      <span className={`${styles.swapBadge} ${styles.swapBadgeOut}`}>{swapDir === "buy" ? "KARMA" : "SOL"}</span>
                    </div>
                  </div>
                  {swapOut > 0 && state && (
                    <div className={styles.swapRate}>
                      1 KARMA = {karmaPrice.toFixed(4)} SOL
                      {(() => { const pa = swapDir === "buy" ? (state.lpSol + swapIn) / (state.lpKarma - swapOut) : (state.lpSol - swapOut) / (state.lpKarma + swapIn); const impact = ((pa - karmaPrice) / karmaPrice * 100); return <span className={impact > 0 ? styles.impactUp : styles.impactDown}> · Impact: {impact > 0 ? "+" : ""}{impact.toFixed(2)}%</span>; })()}
                    </div>
                  )}
                  <button className={styles.btn} onClick={() => swapDir === "buy" ? swapBuy(swapIn) : swapSell(swapIn)} disabled={anyLoading || swapIn <= 0}>
                    {anyLoading ? "Processing..." : swapDir === "buy" ? "Buy KARMA" : "Sell KARMA"}
                  </button>
                </>)}
              </>)}

              {activeTab === "mint" && (<>
                <div className={styles.desc}>Stake SOL to earn Karma. Yield goes to you as KARMA + SOL added to LP.</div>
                {!wallet.connected ? <div className={styles.hint}>Connect wallet to mint</div> : (<>
                  <div className={styles.inputRow}>
                    <input type="number" value={stakeAmt} onChange={e => setStakeAmt(e.target.value)} min="0.01" step="0.1" className={styles.input} />
                    <span className={styles.inputUnit}>SOL</span>
                  </div>
                  {stakeIn > 0 && <div className={styles.estimate}>≈ {(weeklyYieldSol / karmaPrice).toFixed(6)} KARMA / week</div>}
                  <button className={styles.btn} onClick={() => deposit(stakeIn)} disabled={anyLoading || stakeIn <= 0}>{anyLoading ? "Processing..." : `Stake ${stakeAmt} SOL`}</button>
                  <div className={styles.rentNote}>A small rent fee (~0.00145 SOL) is collected to create your stake account. This is fully returned when you withdraw.</div>
                </>)}
                {wallet.connected && userStake && (
                  <div className={styles.subsection}><Collapsible title="Your Stake" defaultOpen={true}>
                    <div className={styles.posRow}><span>SOL deposited</span><span className={styles.bold}>{fmt(userStake.solDeposited)}</span></div>
                    <div className={styles.posRow}><span>Claimable yield</span><span className={styles.green}>{claimableKarma < 0.000001 ? "<0.000001" : claimableKarma.toFixed(6)} KARMA</span></div>
                    <div className={styles.btnRow}>
                      <button className={styles.btn} onClick={() => claimYield(currentSolValue)} disabled={anyLoading || claimable <= 0}>Claim KARMA</button>
                      <button className={styles.btnSecondary} onClick={() => withdraw(userStake.jitosolShare, currentSolValue)} disabled={anyLoading}>Withdraw SOL</button>
                    </div>
                  </Collapsible></div>
                )}
              </>)}

              {activeTab === "supply" && (<>
                {!wallet.connected ? <div className={styles.hint}>Connect wallet to supply</div> : (<>
                  <div className={styles.inputRow}>
                    <input type="number" value={supplyAmt} onChange={e => setSupplyAmt(e.target.value)} min="0.01" step="0.1" className={styles.input} />
                    <span className={styles.inputUnit}>SOL</span>
                  </div>
                  <button className={styles.btn} onClick={() => supplyDeposit(supplyIn)} disabled={anyLoading || supplyIn <= 0}>{anyLoading ? "Processing..." : `Stake ${supplyAmt} SOL`}</button>
                  <div className={styles.rentNote}>A small rent fee (~0.00145 SOL) is collected to open your position. This is fully returned when you close it.</div>
                </>)}
                {wallet.connected && supplyUserStake && (
                  <div className={styles.subsection}><Collapsible title="Your Supply Stake" defaultOpen={true}>
                    <div className={styles.posRow}><span>SOL deposited</span><span className={styles.bold}>{fmt(supplyUserStake.karmaDeposited)}</span></div>
                    <div className={styles.posRow}><span>Yield earned (to LP)</span><span className={styles.green}>{fmt(supClaimable)}</span></div>
                    <div className={styles.btnRowHalf}>
                      <button className={styles.btnSmall} onClick={() => supplyClaim(supCurrentSolValue)} disabled={anyLoading || supClaimable <= 0}>Supply</button>
                      <button className={styles.btnSecondarySmall} onClick={() => supplyWithdraw(supplyUserStake.jitosolShare, supCurrentSolValue)} disabled={anyLoading}>Withdraw SOL</button>
                    </div>
                  </Collapsible></div>
                )}
              </>)}

              {activeTab === "deflate" && (<>
                {!wallet.connected ? <div className={styles.hint}>Connect wallet to deflate</div> : (<>
                  <div className={styles.inputRow}>
                    <input type="number" value={deflateAmt} onChange={e => setDeflateAmt(e.target.value)} min="0.01" step="0.1" className={styles.input} />
                    <span className={styles.inputUnit}>KARMA</span>
                  </div>
                  <button className={styles.btn} onClick={() => deflateDeposit(deflateIn)} disabled={anyLoading || deflateIn <= 0}>{anyLoading ? "Processing..." : `Stake ${deflateAmt} KARMA`}</button>
                  <div className={styles.rentNote}>A small rent fee (~0.00145 SOL) is collected to open your position. This is fully returned when you close it.</div>
                </>)}
                {wallet.connected && deflateUserStake && (
                  <div className={styles.subsection}><Collapsible title="Your Deflate Stake" defaultOpen={true}>
                    <div className={styles.posRow}><span>KARMA deposited</span><span className={styles.bold}>{deflateUserStake.karmaDeposited.toFixed(4)} KARMA</span></div>
                    <div className={styles.posRow}><span>Yield earned (to LP)</span><span className={styles.green}>{fmt(defClaimable)}</span></div>
                    <div className={styles.btnRowHalf}>
                      <button className={styles.btnSmall} onClick={() => deflateClaim(defCurrentSolValue)} disabled={anyLoading || defClaimable <= 0}>Deflate</button>
                      <button className={styles.btnSecondarySmall} onClick={() => deflateWithdraw(deflateUserStake.jitosolShare, deflateUserStake.karmaDeposited, defCurrentSolValue)} disabled={anyLoading}>Withdraw KARMA</button>
                    </div>
                  </Collapsible></div>
                )}
              </>)}
            </div>

            {/* ── LAST TX BAR ── */}
            {wallet.connected && lastTx && (
              <div className={styles.lastTxBar}>
                <div className={styles.lastTxTop}>
                  <a href={`https://solscan.io/tx/${lastTx.sig}`} target="_blank" rel="noopener noreferrer" className={styles.lastTxLink}>Last TX: {lastTx.sig.slice(0, 20)}...{lastTx.sig.slice(-8)} ↗</a>
                  <span className={styles.lastTxTime}>{fmtTime(lastTx.time)}</span>
                </div>
                <div className={styles.lastTxDetails}>
                  <span className={styles.lastTxType}>{lastTx.type}</span>
                  {lastTx.amount && <span className={styles.lastTxAmount}>{lastTx.amount}</span>}
                  <span className={styles.lastTxWallet}>{lastTx.wallet.slice(0, 4)}...{lastTx.wallet.slice(-4)}</span>
                </div>
              </div>
            )}
          </>)}

          {/* ── divider ── */}
          <div className={styles.sectionDivider} />

          {/* ── TOKENOMICS CAROUSEL ── */}
          <div className={styles.panel}>
            <div className={styles.tokCarousel}>
              <div className={styles.tokNav + " " + styles.tokNavLeft} onClick={() => setTokPage((tokPage - 1 + tokPages.length) % tokPages.length)}>
                <span className={styles.tokArrow}>‹</span>
              </div>
              <div className={styles.tokContent}>
                <div className={styles.tokHeader}>{tokPages[tokPage]}</div>
                <div className={styles.tokDots}>{tokPages.map((_, i) => <span key={i} className={`${styles.tokDot} ${i === tokPage ? styles.tokDotActive : ""}`} />)}</div>

                {tokPage === 0 && (<>
                  <div className={styles.posRow}><span>Total supply</span><span className={styles.bold}>{totalSupply.toFixed(4)} KARMA</span></div>
                  <div className={styles.posRow}><span>KARMA price</span><span className={styles.bold}>{fmt(karmaPrice)}</span></div>
                  <div className={styles.posRow}><span>Market cap</span><span className={styles.bold}>{fmt(totalSupply * karmaPrice, 2)}</span></div>
                  <div className={styles.posRow}><span>Holders</span><span className={styles.bold}>{holders}</span></div>
                  {(() => {
                    const mintSolStaked = state.totalSolDeposited;
                    const mintRateDaily = mintSolStaked > 0 && karmaPrice > 0 ? (mintSolStaked * APY / 365) / karmaPrice : 0;
                    const defSolStaked = deflateState ? deflateState.totalSolDeposited : 0;
                    const defRateDaily = defSolStaked * APY / 365;
                    const defRateKarma = karmaPrice > 0 ? defRateDaily / karmaPrice : 0;
                    const supSolStaked = supplyState ? supplyState.totalSolDeposited : 0;
                    const supSolRate = supSolStaked * APY / 365;
                    const supKarmaRate = karmaPrice > 0 ? supSolRate / karmaPrice : 0;
                    return (<>
                      <div className={styles.posRow}><span>Karma mint rate</span><span className={styles.green}>+{mintRateDaily.toFixed(6)} / day</span></div>
                      <div className={styles.posRow}><span>Karma deflation rate</span><span className={styles.green}>+{defRateKarma.toFixed(6)} / day</span></div>
                      <div className={styles.posRow}><span>SOL liquidity supply rate</span><span className={styles.green}>+{supSolRate.toFixed(6)} / day</span></div>
                      <div className={styles.posRow}><span>KARMA liquidity supply rate</span><span className={styles.green}>+{supKarmaRate.toFixed(6)} / day</span></div>
                    </>);
                  })()}
                </>)}

                {tokPage === 1 && (<>
                  <div className={styles.posRow}><span>Total SOL staked</span><span>{fmt(state.totalSolDeposited, 2)}</span></div>
                  <div className={styles.posRow}><span>Stakers</span><span>{state.totalStakers}</span></div>
                  <div className={styles.posRow}><span>Karma minted</span><span className={styles.green}>{totalKarmaMinted.toFixed(4)} KARMA</span></div>
                  <div className={styles.posRow}><span>APY</span><span className={styles.bold}>{(APY * 100).toFixed(1)}%</span></div>
                  <div className={styles.posRow}><span>Yield source</span><span>jitoSOL staking</span></div>
                </>)}

                {tokPage === 2 && deflateState && (<>
                  <div className={styles.posRow}><span>Total KARMA staked</span><span>{deflateState.totalKarmaDeposited.toFixed(4)} KARMA</span></div>
                  <div className={styles.posRow}><span>Stakers</span><span>{deflateState.totalStakers}</span></div>
                  <div className={styles.posRow}><span>Supply reduced</span><span className={styles.green}>{deflateSupplyReduced.toFixed(4)} KARMA</span></div>
                  <div className={styles.posRow}><span>Mechanism</span><span>Buy + Burn</span></div>
                </>)}

                {tokPage === 3 && supplyState && (<>
                  <div className={styles.posRow}><span>Total SOL staked</span><span>{fmt(supplyState.totalSolDeposited)}</span></div>
                  <div className={styles.posRow}><span>Stakers</span><span>{supplyState.totalStakers}</span></div>
                  <div className={styles.posRow}><span>LP added</span><span className={styles.green}>{fmt(supplyState.totalYieldDonated)} + {supplyState.totalKarmaMinted.toFixed(4)} KARMA</span></div>
                  <div className={styles.posRow}><span>Purpose</span><span>Deepen LP liquidity</span></div>
                </>)}

                {tokPage === 4 && (<>
                  <div className={styles.posRow}><span>SOL reserve</span><span>{fmt(state.lpSol)}</span></div>
                  <div className={styles.posRow}><span>KARMA reserve</span><span>{state.lpKarma.toFixed(4)} KARMA</span></div>
                  <div className={styles.posRow}><span>k (constant)</span><span className={styles.mono}>{(state.lpSol * state.lpKarma).toFixed(4)}</span></div>
                  <div className={styles.posRow}><span>Price</span><span className={styles.bold}>{karmaPrice.toFixed(6)} SOL/KARMA</span></div>
                </>)}

                {tokPage === 5 && (() => {
                  const lpK = state.lpKarma;
                  const stakedK = deflateState ? deflateState.totalKarmaDeposited : 0;
                  const holdersK = Math.max(0, totalSupply - lpK);
                  const lpOnlyK = Math.max(0, lpK - stakedK);
                  const lpPct = totalSupply > 0 ? (lpOnlyK / totalSupply * 100) : 0;
                  const holdersPct = totalSupply > 0 ? (holdersK / totalSupply * 100) : 0;
                  const stakedPct = totalSupply > 0 ? (stakedK / totalSupply * 100) : 0;
                  return (<>
                    <div className={styles.posRow}><span>In holder wallets</span><span>{holdersK.toFixed(4)} KARMA <span className={styles.pct}>({holdersPct.toFixed(1)}%)</span></span></div>
                    <div className={styles.posRow}><span>In liquidity pool</span><span>{lpOnlyK.toFixed(4)} KARMA <span className={styles.pct}>({lpPct.toFixed(1)}%)</span></span></div>
                    <div className={styles.posRow}><span>Karma staked</span><span>{stakedK.toFixed(4)} KARMA <span className={styles.pct}>({stakedPct.toFixed(1)}%)</span></span></div>
                    {totalSupply > 0 && (<div className={styles.bar}><div className={styles.barFillHolders} style={{ width: `${holdersPct}%` }} /><div className={styles.barFillLP} style={{ width: `${lpPct}%` }} /><div className={styles.barFillStaked} style={{ width: `${stakedPct}%` }} /></div>)}
                    <div className={styles.legend}><span><span className={styles.dotHolders} /> Holders</span><span><span className={styles.dotLP} /> LP</span><span><span className={styles.dotStaked} /> Staked</span></div>
                  </>);
                })()}

                {tokPage === 6 && (
                  <PriceChart karmaPrice={karmaPrice} solPrice={solPrice} />
                )}
              </div>
              <div className={styles.tokNav + " " + styles.tokNavRight} onClick={() => setTokPage((tokPage + 1) % tokPages.length)}>
                <span className={styles.tokArrow}>›</span>
              </div>
            </div>
          </div>

          {/* ── divider ── */}
          <div className={styles.sectionDivider} />

          {/* ── PROFILE ── */}
          <Profile karmaPrice={karmaPrice} solPrice={solPrice} claimYield={claimYield} loading={anyLoading} currentSolValue={currentSolValue} claimable={claimable} userStake={userStake} deflateUserStake={deflateUserStake} supplyUserStake={supplyUserStake} />

          {/* ── divider ── */}
          <div className={styles.sectionDivider} />

          {/* ── DEV LOG ── */}
          <DevLog />

          {anyError && <div className={styles.error}>{anyError} <button className={styles.dismiss} onClick={clearErrors}>✕</button></div>}
          {(txSig || dTxSig || sTxSig) && <div className={styles.success}>TX: {(txSig || dTxSig || sTxSig)!.slice(0, 20)}... ✓</div>}
        </>
      ) : (
        <div className={styles.loading}>Protocol not initialized</div>
      )}
      <footer className={styles.footer}>Karma — Sound money on Solana</footer>
    </>
  );
}
