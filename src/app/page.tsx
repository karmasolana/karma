"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { fetchKarmaState, fetchUserStake, fetchKarmaTotalSupply, fetchKarmaHolders, fetchDeflateState, fetchDeflateUserStake, fetchSupplyState, fetchSupplyUserStake, KarmaState, UserStake, DeflateState, DeflateUserStake, SupplyState } from "@/utils/accounts";
import { getJitosolRate } from "@/utils/jupiter";
import { useKarma, useDeflatePool, useSupplyPool } from "@/hooks/useKarma";
import { useSettings } from "@/contexts/Settings";
import PriceChart from "@/components/PriceChart";
import Trades from "@/components/Trades";
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

  const [stakeAmt, setStakeAmt] = useState("0.1");
  const [deflateAmt, setDeflateAmt] = useState("0.1");
  const [supplyAmt, setSupplyAmt] = useState("0.1");
  const [swapAmt, setSwapAmt] = useState("0.01");
  const [swapDir, setSwapDir] = useState<"buy" | "sell">("buy");
  const [activeTab, setActiveTab] = useState<"swap" | "mint" | "supply" | "deflate">("swap");

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

  // Karma minted stat: total supply minus initial LP seed (0.25)
  const totalKarmaMinted = Math.max(0, totalSupply - 0.25);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.logo}><span className={styles.logoK}>K</span><span className={styles.logoText}>Karma</span></div>
        {state && <div className={styles.headerPrice}>{karmaPrice.toFixed(4)} SOL<span className={styles.headerSlash}>/</span><span className={styles.headerKarma}>KARMA</span></div>}
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
          </div>

          {/* ── MAIN PANEL (Swap + Pool Tabs) ── */}
          <div className={styles.panel}>
            <div className={styles.mainTabs}>
              <button className={`${styles.mainTab} ${activeTab === "swap" ? styles.mainTabActive : ""}`} onClick={() => setActiveTab("swap")} title="Swap between Sol and Karma for no fees">Swap</button>
              <button className={`${styles.mainTab} ${activeTab === "mint" ? styles.mainTabActive : ""}`} onClick={() => setActiveTab("mint")} title="Stake Sol to mint Karma rewards, withdraw at any time for no fees">Mint</button>
              <button className={`${styles.mainTab} ${activeTab === "supply" ? styles.mainTabActive : ""}`} onClick={() => setActiveTab("supply")} title="Stake Sol to donate liquidity to Karma">Supply</button>
              <button className={`${styles.mainTab} ${activeTab === "deflate" ? styles.mainTabActive : ""}`} onClick={() => setActiveTab("deflate")} title="Stake Karma to deflate Karma supply">Deflate</button>
            </div>

            {/* ── SWAP TAB ── */}
            {activeTab === "swap" && (
              <>
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
                    <div className={styles.swapLabel}>{swapDir === "buy" ? "You pay" : "You sell"}</div>
                    <div className={styles.swapBox}>
                      <input type="number" value={swapAmt} onChange={e => setSwapAmt(e.target.value)} min="0.001" step="0.01" className={styles.swapInput} />
                      <span className={styles.swapBadge}>{swapDir === "buy" ? "SOL" : "KARMA"}</span>
                    </div>
                    <button className={styles.swapArrowBtn} onClick={() => setSwapDir(swapDir === "buy" ? "sell" : "buy")}>⇅</button>
                    <div className={styles.swapLabel}>You receive</div>
                    <div className={`${styles.swapBox} ${styles.swapBoxOut}`}>
                      <span className={styles.swapOutAmt}>{swapOut > 0 ? swapOut.toFixed(6) : "0.000000"}</span>
                      <span className={`${styles.swapBadge} ${styles.swapBadgeOut}`}>{swapDir === "buy" ? "KARMA" : "SOL"}</span>
                    </div>
                    {swapOut > 0 && state && (
                      <div className={styles.swapRate}>
                        1 KARMA = {karmaPrice.toFixed(4)} SOL
                        {(() => {
                          const pa = swapDir === "buy" ? (state.lpSol + swapIn) / (state.lpKarma - swapOut) : (state.lpSol - swapOut) / (state.lpKarma + swapIn);
                          const impact = ((pa - karmaPrice) / karmaPrice * 100);
                          return <span className={impact > 0 ? styles.impactUp : styles.impactDown}> · Impact: {impact > 0 ? "+" : ""}{impact.toFixed(2)}%</span>;
                        })()}
                      </div>
                    )}
                    <button className={styles.btn} onClick={() => swapDir === "buy" ? swapBuy(swapIn) : swapSell(swapIn)} disabled={anyLoading || swapIn <= 0}>
                      {anyLoading ? "Processing..." : swapDir === "buy" ? "Buy KARMA" : "Sell KARMA"}
                    </button>
                  </>
                )}
              </>
            )}

            {/* ── MINT TAB ── */}
            {activeTab === "mint" && (
              <>
                <div className={styles.desc}>Stake SOL to earn Karma. Yield goes to you as KARMA + SOL added to LP.</div>
                {!wallet.connected ? <div className={styles.hint}>Connect wallet to mint</div> : (
                  <>
                    <div className={styles.inputRow}>
                      <input type="number" value={stakeAmt} onChange={e => setStakeAmt(e.target.value)} min="0.01" step="0.1" className={styles.input} />
                      <span className={styles.inputUnit}>SOL</span>
                    </div>
                    {stakeIn > 0 && <div className={styles.estimate}>≈ {(weeklyYieldSol / karmaPrice).toFixed(6)} KARMA / week</div>}
                    <button className={styles.btn} onClick={() => deposit(stakeIn)} disabled={anyLoading || stakeIn <= 0}>
                      {anyLoading ? "Processing..." : `Stake ${stakeAmt} SOL`}
                    </button>
                    <div className={styles.rentNote}>A small rent fee (~0.00145 SOL) is collected to create your stake account. This is fully returned when you withdraw.</div>
                  </>
                )}
                {wallet.connected && userStake && (
                  <div className={styles.subsection}>
                    <Collapsible title="Your Stake" defaultOpen={true}>
                      <div className={styles.posRow}><span>SOL deposited</span><span className={styles.bold}>{fmt(userStake.solDeposited)}</span></div>
                      <div className={styles.posRow}><span>Claimable yield</span><span className={styles.green}>{claimableKarma < 0.000001 ? "<0.000001" : claimableKarma.toFixed(6)} KARMA</span></div>
                      <div className={styles.btnRow}>
                        <button className={styles.btn} onClick={() => claimYield(currentSolValue)} disabled={anyLoading || claimable <= 0}>Claim KARMA</button>
                        <button className={styles.btnSecondary} onClick={() => withdraw(userStake.jitosolShare, currentSolValue)} disabled={anyLoading}>Withdraw SOL</button>
                      </div>
                    </Collapsible>
                  </div>
                )}
              </>
            )}

            {/* ── SUPPLY TAB ── */}
            {activeTab === "supply" && (
              <>
                {!wallet.connected ? <div className={styles.hint}>Connect wallet to supply</div> : (
                  <>
                    <div className={styles.inputRow}>
                      <input type="number" value={supplyAmt} onChange={e => setSupplyAmt(e.target.value)} min="0.01" step="0.1" className={styles.input} />
                      <span className={styles.inputUnit}>SOL</span>
                    </div>
                    <button className={styles.btn} onClick={() => supplyDeposit(supplyIn)} disabled={anyLoading || supplyIn <= 0}>
                      {anyLoading ? "Processing..." : `Stake ${supplyAmt} SOL`}
                    </button>
                    <div className={styles.rentNote}>A small rent fee (~0.00145 SOL) is collected to open your position. This is fully returned when you close it.</div>
                  </>
                )}
                {wallet.connected && supplyUserStake && (
                  <div className={styles.subsection}>
                    <Collapsible title="Your Supply Stake" defaultOpen={true}>
                      <div className={styles.posRow}><span>SOL deposited</span><span className={styles.bold}>{fmt(supplyUserStake.karmaDeposited)}</span></div>
                      <div className={styles.posRow}><span>Yield earned (to LP)</span><span className={styles.green}>{fmt(supClaimable)}</span></div>
                      <div className={styles.btnRowHalf}>
                        <button className={styles.btnSmall} onClick={() => supplyClaim(supCurrentSolValue)} disabled={anyLoading || supClaimable <= 0}>Supply</button>
                        <button className={styles.btnSecondarySmall} onClick={() => supplyWithdraw(supplyUserStake.jitosolShare, supCurrentSolValue)} disabled={anyLoading}>Withdraw SOL</button>
                      </div>
                    </Collapsible>
                  </div>
                )}
              </>
            )}

            {/* ── DEFLATE TAB ── */}
            {activeTab === "deflate" && (
              <>
                {!wallet.connected ? <div className={styles.hint}>Connect wallet to deflate</div> : (
                  <>
                    <div className={styles.inputRow}>
                      <input type="number" value={deflateAmt} onChange={e => setDeflateAmt(e.target.value)} min="0.01" step="0.1" className={styles.input} />
                      <span className={styles.inputUnit}>KARMA</span>
                    </div>
                    <button className={styles.btn} onClick={() => deflateDeposit(deflateIn)} disabled={anyLoading || deflateIn <= 0}>
                      {anyLoading ? "Processing..." : `Stake ${deflateAmt} KARMA`}
                    </button>
                    <div className={styles.rentNote}>A small rent fee (~0.00145 SOL) is collected to open your position. This is fully returned when you close it.</div>
                  </>
                )}
                {wallet.connected && deflateUserStake && (
                  <div className={styles.subsection}>
                    <Collapsible title="Your Deflate Stake" defaultOpen={true}>
                      <div className={styles.posRow}><span>KARMA deposited</span><span className={styles.bold}>{deflateUserStake.karmaDeposited.toFixed(4)} KARMA</span></div>
                      <div className={styles.posRow}><span>Yield earned (to LP)</span><span className={styles.green}>{fmt(defClaimable)}</span></div>
                      <div className={styles.btnRowHalf}>
                        <button className={styles.btnSmall} onClick={() => deflateClaim(defCurrentSolValue)} disabled={anyLoading || defClaimable <= 0}>Deflate</button>
                        <button className={styles.btnSecondarySmall} onClick={() => deflateWithdraw(deflateUserStake.jitosolShare, deflateUserStake.karmaDeposited, defCurrentSolValue)} disabled={anyLoading}>Withdraw KARMA</button>
                      </div>
                    </Collapsible>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── divider ── */}
          <div className={styles.sectionDivider} />

          {/* ── TOKENOMICS ── */}
          <div className={styles.panel}>
            <Collapsible title="Karma Tokenomics" defaultOpen={true} accent tooltip="Live Karma token economics">
              <div className={styles.posRow}><span>Total supply</span><span className={styles.bold}>{totalSupply.toFixed(4)} KARMA</span></div>
              <div className={styles.posRow}><span>KARMA price</span><span className={styles.bold}>{fmt(karmaPrice)}</span></div>
              <div className={styles.posRow}><span>Market cap</span><span className={styles.bold}>{fmt(totalSupply * karmaPrice, 2)}</span></div>
              <div className={styles.posRow}><span>Holders</span><span className={styles.bold}>{holders}</span></div>
              <div className={styles.subsection}>
                <Collapsible title="Mint Pool" defaultOpen={true}>
                  <div className={styles.posRow}><span>Total SOL staked</span><span>{fmt(state.totalSolDeposited, 2)}</span></div>
                  <div className={styles.posRow}><span>Stakers</span><span>{state.totalStakers}</span></div>
                  <div className={styles.posRow}><span>Karma minted</span><span className={styles.green}>{totalKarmaMinted.toFixed(4)} KARMA</span></div>
                </Collapsible>
              </div>
              {deflateState && (
                <div className={styles.subsection}>
                  <Collapsible title="Deflation Pool" defaultOpen={true}>
                    <div className={styles.posRow}><span>Total KARMA staked</span><span>{deflateState.totalKarmaDeposited.toFixed(4)} KARMA</span></div>
                    <div className={styles.posRow}><span>Stakers</span><span>{deflateState.totalStakers}</span></div>
                    <div className={styles.posRow}><span>Supply reduced</span><span className={styles.green}>{deflateSupplyReduced.toFixed(4)} KARMA</span></div>
                  </Collapsible>
                </div>
              )}
              {supplyState && (
                <div className={styles.subsection}>
                  <Collapsible title="Supply Pool" defaultOpen={true}>
                    <div className={styles.posRow}><span>Total SOL staked</span><span>{fmt(supplyState.totalSolDeposited)}</span></div>
                    <div className={styles.posRow}><span>Stakers</span><span>{supplyState.totalStakers}</span></div>
                    <div className={styles.posRow}><span>LP added</span><span className={styles.green}>{fmt(supplyState.totalYieldDonated)} + {supplyState.totalKarmaMinted.toFixed(4)} KARMA</span></div>
                  </Collapsible>
                </div>
              )}
              <div className={styles.subsection}>
                <Collapsible title="Liquidity Pool" defaultOpen={true}>
                  <div className={styles.posRow}><span>SOL reserve</span><span>{fmt(state.lpSol)}</span></div>
                  <div className={styles.posRow}><span>KARMA reserve</span><span>{state.lpKarma.toFixed(4)} KARMA</span></div>
                </Collapsible>
              </div>
              <div className={styles.subsection}>
                <Collapsible title="Supply Distribution" defaultOpen={true}>
                  {(() => {
                    const lpK = state.lpKarma;
                    const stakedK = deflateState ? deflateState.totalKarmaDeposited : 0;
                    const holdersK = Math.max(0, totalSupply - lpK - stakedK);
                    const lpPct = totalSupply > 0 ? (lpK / totalSupply * 100) : 0;
                    const holdersPct = totalSupply > 0 ? (holdersK / totalSupply * 100) : 0;
                    const stakedPct = totalSupply > 0 ? (stakedK / totalSupply * 100) : 0;
                    return (<>
                      <div className={styles.posRow}><span>In holder wallets</span><span>{holdersK.toFixed(4)} KARMA <span className={styles.pct}>({holdersPct.toFixed(1)}%)</span></span></div>
                      <div className={styles.posRow}><span>In liquidity pool</span><span>{lpK.toFixed(4)} KARMA <span className={styles.pct}>({lpPct.toFixed(1)}%)</span></span></div>
                      <div className={styles.posRow}><span>Karma staked</span><span>{stakedK.toFixed(4)} KARMA <span className={styles.pct}>({stakedPct.toFixed(1)}%)</span></span></div>
                      {totalSupply > 0 && (
                        <div className={styles.bar}>
                          <div className={styles.barFillHolders} style={{ width: `${holdersPct}%` }} />
                          <div className={styles.barFillLP} style={{ width: `${lpPct}%` }} />
                          <div className={styles.barFillStaked} style={{ width: `${stakedPct}%` }} />
                        </div>
                      )}
                      <div className={styles.legend}><span><span className={styles.dotHolders} /> Holders</span><span><span className={styles.dotLP} /> LP</span><span><span className={styles.dotStaked} /> Staked</span></div>
                    </>);
                  })()}
                </Collapsible>
              </div>
            </Collapsible>
          </div>

          {/* ── GRAPH ── */}
          <PriceChart karmaPrice={karmaPrice} solPrice={solPrice} />

          {/* ── TRADES ── */}
          <Trades />

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
