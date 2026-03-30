"use client";
import React, { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { KARMA_MINT } from "@/utils/constants";
import { fetchUserStake, UserStake } from "@/utils/accounts";
import { getJitosolRate } from "@/utils/jupiter";
import Collapsible from "./Collapsible";
import styles from "./Profile.module.css";

const APY = 0.075;

export default function Profile({ karmaPrice, solPrice }: { karmaPrice: number; solPrice: number | null }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [solBal, setSolBal] = useState(0);
  const [karmaBal, setKarmaBal] = useState(0);
  const [stake, setStake] = useState<UserStake | null>(null);
  const [jitoRate, setJitoRate] = useState(1.083);

  useEffect(() => {
    if (!wallet.publicKey) return;
    connection.getBalance(wallet.publicKey).then(b => setSolBal(b / LAMPORTS_PER_SOL)).catch(() => {});
    fetchUserStake(connection, wallet.publicKey).then(setStake).catch(() => {});
    getJitosolRate().then(setJitoRate).catch(() => {});
    try {
      const ata = getAssociatedTokenAddressSync(KARMA_MINT, wallet.publicKey);
      connection.getTokenAccountBalance(ata).then(b => setKarmaBal(Number(b.value.uiAmount || 0))).catch(() => setKarmaBal(0));
    } catch {}
  }, [wallet.publicKey, connection]);

  if (!wallet.connected) return null;

  const currentVal = stake ? stake.jitosolShare * jitoRate : 0;
  const claimable = stake ? Math.max(0, currentVal - stake.solValueAtLastClaim) : 0;
  const stakedSol = stake ? stake.solDeposited : 0;

  // Minting rate: KARMA earned per day/week from staking
  const dailyYieldSol = stakedSol * APY / 365;
  const weeklyYieldSol = stakedSol * APY / 52;
  const dailyKarma = karmaPrice > 0 ? dailyYieldSol / karmaPrice : dailyYieldSol;
  const weeklyKarma = karmaPrice > 0 ? weeklyYieldSol / karmaPrice : weeklyYieldSol;

  // Total portfolio value in SOL
  const karmaValueSol = karmaBal * karmaPrice;
  const totalValueSol = solBal + karmaValueSol + stakedSol;
  const totalValueUsd = solPrice ? totalValueSol * solPrice : null;

  // PnL: value of KARMA holdings vs if held as SOL (KARMA should track SOL, so PnL = extra from price appreciation)
  const karmaPnlSol = karmaBal * (karmaPrice - 1); // vs inception price of 1 SOL/KARMA

  return (
    <div className={styles.wrap}>
      <Collapsible title="Profile" defaultOpen={true} accent>
        <div className={styles.address}>{wallet.publicKey!.toBase58().slice(0, 6)}...{wallet.publicKey!.toBase58().slice(-4)}</div>

        <Collapsible title="Holdings" defaultOpen={true}>
          <div className={styles.row}><span>SOL Balance</span><span className={styles.bold}>{solBal.toFixed(4)} SOL</span></div>
          <div className={styles.row}><span>KARMA Balance</span><span className={styles.bold}>{karmaBal.toFixed(4)} KARMA</span></div>
          <div className={styles.row}><span>KARMA Value</span><span>{karmaValueSol.toFixed(4)} SOL</span></div>
          <div className={styles.row}><span>SOL Staked</span><span>{stakedSol.toFixed(4)} SOL</span></div>
          <div className={styles.divider} />
          <div className={styles.row}><span>Total Value</span><span className={styles.accent}>{totalValueSol.toFixed(4)} SOL{totalValueUsd ? ` ($${totalValueUsd.toFixed(2)})` : ""}</span></div>
        </Collapsible>

        {stakedSol > 0 && (
          <div className={styles.sub}>
            <Collapsible title="Minting Rate" defaultOpen={true}>
              <div className={styles.row}><span>Daily</span><span className={styles.green}>+{dailyKarma.toFixed(6)} KARMA</span></div>
              <div className={styles.row}><span>Weekly</span><span className={styles.green}>+{weeklyKarma.toFixed(6)} KARMA</span></div>
              <div className={styles.row}><span>Claimable now</span><span className={styles.green}>{claimable.toFixed(6)} KARMA</span></div>
              <div className={styles.row}><span>APY</span><span>{(APY * 100).toFixed(1)}%</span></div>
            </Collapsible>
          </div>
        )}

        <div className={styles.sub}>
          <Collapsible title="PnL" defaultOpen={true}>
            <div className={styles.row}><span>KARMA vs inception</span><span className={karmaPnlSol >= 0 ? styles.green : styles.red}>{karmaPnlSol >= 0 ? "+" : ""}{karmaPnlSol.toFixed(6)} SOL</span></div>
            <div className={styles.row}><span>KARMA price change</span><span className={karmaPrice >= 1 ? styles.green : styles.red}>{((karmaPrice - 1) * 100).toFixed(2)}%</span></div>
          </Collapsible>
        </div>
      </Collapsible>
    </div>
  );
}
