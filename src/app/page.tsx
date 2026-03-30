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

  useEffect(() => {
    reload().then(() => setPageLoading(false)).catch(() => setPageLoading(false));
    getJitosolRate().then(setJitoRate).catch(() => {});
    fetch("https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000000&slippageBps=50")
      .then(r => r.json()).then(d => { if (d.outAmount) setSolPrice(Number(d.outAmount) / 1e6); }).catch(() => {});
  }, [reload]);

  useEffect(() => { if (txSig || dTxSig || sTxSig) setTimeout(reload, 2000); }, [txSig, dTxSig, sTxSig, reload]);

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
          {/* ── TOOLBAR ROW ── */}
          <div className={styles.toolbar}>
            <div
              className={`${styles.welcomeChip} ${welcomeHover ? styles.welcomeChipHover : ""}`}
              onMouseEnter={() => setWelcomeHover(true)}
              onMouseLeave={() => setWelcomeHover(false)}
            >
              <span className={styles.welcomeChipText}>Welcome to Karma</span>
              {welcomeHover && (
                <div className={styles.welcomeTooltip}>
                  <div className={styles.welcomeTooltipTitle}>Welcome to Karma</div>
                  <p>Karma is a store of value token built on Solana and backed 1:1 by SOL. Karma can be minted and deflated by staking Sol. Sol can be withdrawn any time with no additional fees. You can buy and sell Karma using our Swap built with our own Liquidity Pools.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── SWAP (non-collapsible) ── */}
          <div className={styles.panel}>
            <Collapsible title="Swap" defaultOpen={true} accent collapsible={false} tooltip="Swap between Sol and Karma using our own Liquidity and AMM for no fees">
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
                  <button className={styles.btn} onClick={() => swapDir === "buy" ? swapBuy(swapIn) : swapSell(swapIn)} disabled={anyLoading || swapIn <= 0}>
                    {anyLoading ? "Processing..." : swapDir === "buy" ? "Buy KARMA" : "Sell KARMA"}
                  </button>
                </>
              )}
            </Collapsible>
          </div>

          {/* ── MINT KARMA ── */}
          <div className={styles.panel}>
            <Collapsible title="Mint Karma" defaultOpen={true} accent tooltip="Sol is swapped to jitoSol. When a user claims their Karma staking rewards, the jitoSol APY is converted into Sol. The sol is added into our Sol liquidity pool and an equivalent amount of Karma is minted from the protocol and sent to your wallet. If you were to immediately swap your Karma rewards for Sol you would obtain the 7.5% APY that jitoSol provides">
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
                      <button className={styles.btnSecondary} onClick={() => withdraw(userStake.jitosolShare)} disabled={anyLoading}>Withdraw SOL</button>
                    </div>
                  </Collapsible>
                </div>
              )}
            </Collapsible>
          </div>

          {/* ── SUPPLY KARMA (above deflate) ── */}
          <div className={styles.panel}>
            <Collapsible title="Supply Karma" defaultOpen={true} accent tooltip="Stake SOL to deepen liquidity on both sides of the pool. Yield adds SOL + equal KARMA to LP for better swaps.">
              <div className={styles.desc}>Stake SOL to deepen liquidity. Yield adds SOL + equal KARMA to LP — better swaps for everyone.</div>
              {!wallet.connected ? <div className={styles.hint}>Connect wallet to supply</div> : (
                <>
                  <div className={styles.inputRow}>
                    <input type="number" value={supplyAmt} onChange={e => setSupplyAmt(e.target.value)} min="0.01" step="0.1" className={styles.input} />
                    <span className={styles.inputUnit}>SOL</span>
                  </div>
                  <button className={styles.btn} onClick={() => supplyDeposit(supplyIn)} disabled={anyLoading || supplyIn <= 0}>
                    {anyLoading ? "Processing..." : `Stake ${supplyAmt} SOL`}
                  </button>
                  <div className={styles.rentNote}>Your SOL is converted to jitoSOL. Yield deepens LP liquidity on both sides. Withdraw your full SOL anytime.</div>
                </>
              )}
              {wallet.connected && supplyUserStake && (
                <div className={styles.subsection}>
                  <Collapsible title="Your Supply Stake" defaultOpen={true}>
                    <div className={styles.posRow}><span>SOL deposited</span><span className={styles.bold}>{fmt(supplyUserStake.karmaDeposited)}</span></div>
                    <div className={styles.posRow}><span>Yield earned (to LP)</span><span className={styles.green}>{fmt(supClaimable)}</span></div>
                    <div className={styles.btnRow}>
                      <button className={styles.btn} onClick={() => supplyClaim(supCurrentSolValue)} disabled={anyLoading || supClaimable <= 0}>Donate Yield to LP</button>
                      <button className={styles.btnSecondary} onClick={() => supplyWithdraw(supplyUserStake.jitosolShare)} disabled={anyLoading}>Withdraw SOL</button>
                    </div>
                  </Collapsible>
                </div>
              )}
            </Collapsible>
          </div>

          {/* ── DEFLATE KARMA ── */}
          <div className={styles.panel}>
            <Collapsible title="Deflate Karma" defaultOpen={true} accent tooltip="Stake KARMA to increase its price. Your KARMA is sold for SOL, earns yield, and the yield SOL is donated to the LP — pure price appreciation for all holders.">
              <div className={styles.desc}>Stake KARMA to increase its price. Yield SOL is added to LP — pure price appreciation for all holders.</div>
              {!wallet.connected ? <div className={styles.hint}>Connect wallet to deflate</div> : (
                <>
                  <div className={styles.inputRow}>
                    <input type="number" value={deflateAmt} onChange={e => setDeflateAmt(e.target.value)} min="0.01" step="0.1" className={styles.input} />
                    <span className={styles.inputUnit}>KARMA</span>
                  </div>
                  <button className={styles.btn} onClick={() => deflateDeposit(deflateIn)} disabled={anyLoading || deflateIn <= 0}>
                    {anyLoading ? "Processing..." : `Stake ${deflateAmt} KARMA`}
                  </button>
                  <div className={styles.rentNote}>Your KARMA is sold for SOL, converted to jitoSOL, and earns yield. You can withdraw your full KARMA amount anytime.</div>
                </>
              )}
              {wallet.connected && deflateUserStake && (
                <div className={styles.subsection}>
                  <Collapsible title="Your Deflate Stake" defaultOpen={true}>
                    <div className={styles.posRow}><span>KARMA deposited</span><span className={styles.bold}>{deflateUserStake.karmaDeposited.toFixed(4)} KARMA</span></div>
                    <div className={styles.posRow}><span>Yield earned (to LP)</span><span className={styles.green}>{fmt(defClaimable)}</span></div>
                    <div className={styles.btnRow}>
                      <button className={styles.btn} onClick={() => deflateClaim(defCurrentSolValue)} disabled={anyLoading || defClaimable <= 0}>Donate Yield to LP</button>
                      <button className={styles.btnSecondary} onClick={() => deflateWithdraw(deflateUserStake.jitosolShare, deflateUserStake.karmaDeposited)} disabled={anyLoading}>Withdraw KARMA</button>
                    </div>
                  </Collapsible>
                </div>
              )}
            </Collapsible>
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
                  <div className={styles.posRow}><span>jitoSOL in vault</span><span>{state.totalJitosol.toFixed(6)}</span></div>
                </Collapsible>
              </div>
              {deflateState && (
                <div className={styles.subsection}>
                  <Collapsible title="Deflate Pool" defaultOpen={true}>
                    <div className={styles.posRow}><span>Total KARMA staked</span><span>{deflateState.totalKarmaDeposited.toFixed(4)} KARMA</span></div>
                    <div className={styles.posRow}><span>Stakers</span><span>{deflateState.totalStakers}</span></div>
                    <div className={styles.posRow}><span>Total yield donated</span><span className={styles.green}>{fmt(deflateState.totalYieldDonated)}</span></div>
                  </Collapsible>
                </div>
              )}
              {supplyState && (
                <div className={styles.subsection}>
                  <Collapsible title="Supply Pool" defaultOpen={true}>
                    <div className={styles.posRow}><span>Total SOL staked</span><span>{fmt(supplyState.totalSolDeposited)}</span></div>
                    <div className={styles.posRow}><span>Stakers</span><span>{supplyState.totalStakers}</span></div>
                    <div className={styles.posRow}><span>Total yield donated</span><span className={styles.green}>{fmt(supplyState.totalYieldDonated)}</span></div>
                    <div className={styles.posRow}><span>KARMA minted to LP</span><span>{supplyState.totalKarmaMinted.toFixed(4)} KARMA</span></div>
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
                    const lpKarma = state.lpKarma;
                    const holdersKarma = Math.max(0, totalSupply - lpKarma);
                    const lpPct = totalSupply > 0 ? (lpKarma / totalSupply * 100) : 0;
                    const holdersPct = totalSupply > 0 ? (holdersKarma / totalSupply * 100) : 0;
                    return (<>
                      <div className={styles.posRow}><span>In holder wallets</span><span>{holdersKarma.toFixed(4)} KARMA <span className={styles.pct}>({holdersPct.toFixed(1)}%)</span></span></div>
                      <div className={styles.posRow}><span>In liquidity pool</span><span>{lpKarma.toFixed(4)} KARMA <span className={styles.pct}>({lpPct.toFixed(1)}%)</span></span></div>
                      {totalSupply > 0 && (
                        <div className={styles.bar}><div className={styles.barFillHolders} style={{ width: `${holdersPct}%` }} /><div className={styles.barFillLP} style={{ width: `${lpPct}%` }} /></div>
                      )}
                      <div className={styles.legend}><span><span className={styles.dotHolders} /> Holders</span><span><span className={styles.dotLP} /> LP</span></div>
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
          <Profile karmaPrice={karmaPrice} solPrice={solPrice} claimYield={claimYield} loading={anyLoading} currentSolValue={currentSolValue} claimable={claimable} userStake={userStake} />

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
