"use client";
import React, { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { KARMA_MINT } from "@/utils/constants";
import { UserStake, DeflateUserStake } from "@/utils/accounts";
import Collapsible from "./Collapsible";
import styles from "./Profile.module.css";

const APY = 0.075;
const PROFILE_KEY = "karma-user-profiles";
const ACHIEVEMENTS = [
  { id: "first_swap", name: "First Swap", desc: "Complete your first swap", check: (s: any) => s.swaps > 0 },
  { id: "first_mint", name: "Minter", desc: "Stake SOL in the Mint pool", check: (s: any) => s.mintStaked > 0 },
  { id: "first_supply", name: "Supplier", desc: "Stake SOL in the Supply pool", check: (s: any) => s.supplyStaked > 0 },
  { id: "first_deflate", name: "Deflator", desc: "Stake KARMA in the Deflate pool", check: (s: any) => s.deflateStaked > 0 },
  { id: "holder", name: "Holder", desc: "Hold KARMA in your wallet", check: (s: any) => s.karmaBal > 0 },
  { id: "claim", name: "Yield Farmer", desc: "Claim yield from any pool", check: (s: any) => s.claims > 0 },
  { id: "big_holder", name: "Whale", desc: "Hold 1+ KARMA", check: (s: any) => s.karmaBal >= 1 },
  { id: "multi_pool", name: "Diversified", desc: "Stake in 2+ pools", check: (s: any) => (s.mintStaked > 0 ? 1 : 0) + (s.supplyStaked > 0 ? 1 : 0) + (s.deflateStaked > 0 ? 1 : 0) >= 2 },
];

interface ProfileProps {
  karmaPrice: number;
  solPrice: number | null;
  claimYield: (currentSolValue: number) => Promise<void>;
  loading: boolean;
  currentSolValue: number;
  claimable: number;
  userStake: UserStake | null;
  deflateUserStake?: DeflateUserStake | null;
  supplyUserStake?: DeflateUserStake | null;
}

function loadProfiles(): Record<string, { username: string; xHandle: string }> {
  try { const r = localStorage.getItem(PROFILE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
function saveProfiles(p: Record<string, { username: string; xHandle: string }>) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}

export default function Profile({ karmaPrice, solPrice, claimYield, loading, currentSolValue, claimable, userStake, deflateUserStake, supplyUserStake }: ProfileProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [karmaBal, setKarmaBal] = useState(0);
  const [tab, setTab] = useState<"stats" | "achievements">("stats");
  const [editOpen, setEditOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [xHandle, setXHandle] = useState("");

  const claimableKarma = karmaPrice > 0 ? claimable / karmaPrice : claimable;
  const pk = wallet.publicKey?.toBase58() || "";

  useEffect(() => {
    if (!wallet.publicKey) return;
    try {
      const ata = getAssociatedTokenAddressSync(KARMA_MINT, wallet.publicKey);
      connection.getTokenAccountBalance(ata).then(b => setKarmaBal(Number(b.value.uiAmount || 0))).catch(() => setKarmaBal(0));
    } catch {}
    // Load profile
    const profiles = loadProfiles();
    if (profiles[pk]) { setUsername(profiles[pk].username || ""); setXHandle(profiles[pk].xHandle || ""); }
  }, [wallet.publicKey, connection, pk]);

  const saveProfile = () => {
    const profiles = loadProfiles();
    profiles[pk] = { username, xHandle };
    saveProfiles(profiles);
    setEditOpen(false);
  };

  if (!wallet.connected) return null;

  const stakedSol = userStake ? userStake.solDeposited : 0;
  const dailyKarma = stakedSol > 0 && karmaPrice > 0 ? (stakedSol * APY / 365) / karmaPrice : 0;
  const weeklyKarma = stakedSol > 0 && karmaPrice > 0 ? (stakedSol * APY / 52) / karmaPrice : 0;
  const pnlPct = karmaPrice > 0 ? ((karmaPrice - 1) / 1) * 100 : 0;

  const supStaked = supplyUserStake ? supplyUserStake.karmaDeposited : 0; // sol_deposited field
  const defStaked = deflateUserStake ? deflateUserStake.karmaDeposited : 0;

  // Achievement state
  const achState = { karmaBal, mintStaked: stakedSol, supplyStaked: supStaked, deflateStaked: defStaked, swaps: 0, claims: 0 };

  return (
    <div className={styles.wrap}>
      <Collapsible title="Profile" defaultOpen={true} accent tooltip="Your wallet stats on Karma">
        <div className={styles.headerRow}>
          <div className={styles.addressRow}>
            {username && <span className={styles.username}>{username}</span>}
            <span className={styles.address}>{pk.slice(0, 6)}...{pk.slice(-4)}</span>
            {xHandle && <a href={`https://x.com/${xHandle.replace("@","")}`} target="_blank" rel="noopener noreferrer" className={styles.xLink}>@{xHandle.replace("@","")}</a>}
          </div>
          <button className={styles.editIcon} onClick={() => setEditOpen(!editOpen)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h1m4 0h13M3 6h1m4 0h13M3 18h1m4 0h13"/></svg>
          </button>
        </div>

        {editOpen && (
          <div className={styles.editForm}>
            <input className={styles.editInput} value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" maxLength={30} />
            <input className={styles.editInput} value={xHandle} onChange={e => setXHandle(e.target.value)} placeholder="X handle (e.g. @memetics)" maxLength={30} />
            <div className={styles.editActions}>
              <button className={styles.saveBtn} onClick={saveProfile}>Save</button>
              <button className={styles.cancelBtn} onClick={() => setEditOpen(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === "stats" ? styles.tabActive : ""}`} onClick={() => setTab("stats")}>Stats</button>
          <button className={`${styles.tab} ${tab === "achievements" ? styles.tabActive : ""}`} onClick={() => setTab("achievements")}>Achievements</button>
        </div>

        {tab === "stats" && (
          <>
            <div className={styles.row}><span>KARMA Holdings</span><span className={styles.bold}>{karmaBal.toFixed(4)} KARMA</span></div>
            <div className={styles.row}><span>KARMA PnL</span><span className={pnlPct >= 0 ? styles.green : styles.red}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</span></div>

            <div className={styles.sub}>
              <Collapsible title="Mint Pool" defaultOpen={true}>
                {stakedSol > 0 ? (<>
                  <div className={styles.row}><span>SOL Staked</span><span className={styles.bold}>{stakedSol.toFixed(4)} SOL</span></div>
                  <div className={styles.row}><span>Daily</span><span className={styles.green}>+{dailyKarma.toFixed(6)} KARMA</span></div>
                  <div className={styles.row}><span>Weekly</span><span className={styles.green}>+{weeklyKarma.toFixed(6)} KARMA</span></div>
                  <div className={styles.row}><span>Claimable</span><span className={styles.green}>{claimableKarma < 0.000001 && claimableKarma > 0 ? "<0.000001" : claimableKarma.toFixed(6)} KARMA</span></div>
                  <button className={styles.claimBtn} onClick={() => claimYield(currentSolValue)} disabled={loading || claimable <= 0}>{loading ? "..." : "Claim KARMA"}</button>
                </>) : <div className={styles.empty}>No mint stake</div>}
              </Collapsible>
            </div>

            <div className={styles.sub}>
              <Collapsible title="Supply Pool" defaultOpen={true}>
                {supStaked > 0 ? (<>
                  <div className={styles.row}><span>SOL Staked</span><span className={styles.bold}>{supStaked.toFixed(4)} SOL</span></div>
                  <div className={styles.row}><span>Purpose</span><span className={styles.muted}>Deepening LP liquidity</span></div>
                </>) : <div className={styles.empty}>No supply stake</div>}
              </Collapsible>
            </div>

            <div className={styles.sub}>
              <Collapsible title="Deflate Pool" defaultOpen={true}>
                {defStaked > 0 ? (<>
                  <div className={styles.row}><span>KARMA Staked</span><span className={styles.bold}>{defStaked.toFixed(4)} KARMA</span></div>
                  <div className={styles.row}><span>Purpose</span><span className={styles.muted}>Price appreciation</span></div>
                </>) : <div className={styles.empty}>No deflate stake</div>}
              </Collapsible>
            </div>
          </>
        )}

        {tab === "achievements" && (
          <div className={styles.achGrid}>
            {ACHIEVEMENTS.map(a => {
              const earned = a.check(achState);
              return (
                <div key={a.id} className={`${styles.achCard} ${earned ? styles.achEarned : styles.achLocked}`}>
                  <div className={styles.achIcon}>{earned ? "✦" : "○"}</div>
                  <div className={styles.achName}>{a.name}</div>
                  <div className={styles.achDesc}>{a.desc}</div>
                </div>
              );
            })}
          </div>
        )}
      </Collapsible>
    </div>
  );
}
