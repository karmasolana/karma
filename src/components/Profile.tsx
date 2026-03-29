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

export default function Profile() {
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
  const totalValue = solBal + karmaBal + (stake ? stake.solDeposited : 0);

  return (
    <div className={styles.wrap}>
      <Collapsible title="Profile" defaultOpen={true} accent>
        <div className={styles.address}>{wallet.publicKey!.toBase58().slice(0, 6)}...{wallet.publicKey!.toBase58().slice(-4)}</div>
        <div className={styles.grid}>
          <div className={styles.stat}><div className={styles.val}>{solBal.toFixed(4)}</div><div className={styles.label}>SOL Balance</div></div>
          <div className={styles.stat}><div className={styles.val}>{karmaBal.toFixed(4)}</div><div className={styles.label}>KARMA Balance</div></div>
          <div className={styles.stat}><div className={styles.val}>{stake ? stake.solDeposited.toFixed(4) : "0"}</div><div className={styles.label}>SOL Staked</div></div>
          <div className={styles.stat}><div className={styles.val}>{claimable.toFixed(6)}</div><div className={styles.label}>Claimable KARMA</div></div>
        </div>
      </Collapsible>
    </div>
  );
}
