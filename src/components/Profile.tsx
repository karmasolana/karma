"use client";
import React, { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { KARMA_MINT } from "@/utils/constants";
import { UserStake } from "@/utils/accounts";
import Collapsible from "./Collapsible";
import styles from "./Profile.module.css";

const APY = 0.075;

interface ProfileProps {
  karmaPrice: number;
  solPrice: number | null;
  claimYield: (currentSolValue: number) => Promise<void>;
  loading: boolean;
  currentSolValue: number;
  claimable: number;
  userStake: UserStake | null;
}

export default function Profile({ karmaPrice, solPrice, claimYield, loading, currentSolValue, claimable, userStake }: ProfileProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [karmaBal, setKarmaBal] = useState(0);

  useEffect(() => {
    if (!wallet.publicKey) return;
    try {
      const ata = getAssociatedTokenAddressSync(KARMA_MINT, wallet.publicKey);
      connection.getTokenAccountBalance(ata).then(b => setKarmaBal(Number(b.value.uiAmount || 0))).catch(() => setKarmaBal(0));
    } catch {}
  }, [wallet.publicKey, connection]);

  if (!wallet.connected) return null;

  const stakedSol = userStake ? userStake.solDeposited : 0;
  const dailyKarma = stakedSol > 0 && karmaPrice > 0 ? (stakedSol * APY / 365) / karmaPrice : 0;
  const weeklyKarma = stakedSol > 0 && karmaPrice > 0 ? (stakedSol * APY / 52) / karmaPrice : 0;
  const pnlPct = karmaPrice > 0 ? ((karmaPrice - 1) / 1) * 100 : 0;

  return (
    <div className={styles.wrap}>
      <Collapsible title="Profile" defaultOpen={true} accent>
        <div className={styles.address}>{wallet.publicKey!.toBase58().slice(0, 6)}...{wallet.publicKey!.toBase58().slice(-4)}</div>

        <div className={styles.row}><span>KARMA Holdings</span><span className={styles.bold}>{karmaBal.toFixed(4)} KARMA</span></div>
        <div className={styles.row}>
          <span>KARMA PnL</span>
          <span className={pnlPct >= 0 ? styles.green : styles.red}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</span>
        </div>

        <div className={styles.sub}>
          <Collapsible title="Minting Rate" defaultOpen={true}>
            {stakedSol > 0 ? (
              <>
                <div className={styles.row}><span>Daily</span><span className={styles.green}>+{dailyKarma.toFixed(6)} KARMA</span></div>
                <div className={styles.row}><span>Weekly</span><span className={styles.green}>+{weeklyKarma.toFixed(6)} KARMA</span></div>
                <div className={styles.row}><span>APY</span><span>{(APY * 100).toFixed(1)}%</span></div>
                <div className={styles.divider} />
                <div className={styles.row}><span>SOL Staked</span><span className={styles.bold}>{stakedSol.toFixed(4)} SOL</span></div>
                <div className={styles.row}><span>Claimable</span><span className={styles.green}>{claimable.toFixed(6)} KARMA</span></div>
                <button className={styles.claimBtn} onClick={() => claimYield(currentSolValue)} disabled={loading || claimable <= 0}>
                  {loading ? "..." : "Claim KARMA"}
                </button>
              </>
            ) : (
              <div className={styles.empty}>Stake SOL to start minting KARMA</div>
            )}
          </Collapsible>
        </div>
      </Collapsible>
    </div>
  );
}
