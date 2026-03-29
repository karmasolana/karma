"use client";
import React, { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { fetchKarmaState, fetchUserStake, KarmaState, UserStake } from "@/utils/accounts";
import styles from "./page.module.css";

export default function HomePage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = useState<KarmaState | null>(null);
  const [userStake, setUserStake] = useState<UserStake | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKarmaState(connection).then(s => { setState(s); setLoading(false); }).catch(() => setLoading(false));
  }, [connection]);

  useEffect(() => {
    if (!wallet.publicKey) { setUserStake(null); return; }
    fetchUserStake(connection, wallet.publicKey).then(setUserStake).catch(() => {});
  }, [wallet.publicKey, connection]);

  const karmaPrice = state && state.lpKarma > 0 ? state.lpSol / state.lpKarma : 1;
  const karmaPriceUsd = karmaPrice * 82; // rough estimate

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
        <div className={styles.priceSub}>≈ ${karmaPriceUsd.toFixed(2)} USD</div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading protocol...</div>
      ) : state ? (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statVal}>{state.totalSolDeposited.toFixed(2)}</div>
              <div className={styles.statLabel}>SOL Staked</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statVal}>{state.totalStakers}</div>
              <div className={styles.statLabel}>Stakers</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statVal}>{state.lpSol.toFixed(2)}</div>
              <div className={styles.statLabel}>LP SOL</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statVal}>{state.lpKarma.toFixed(2)}</div>
              <div className={styles.statLabel}>LP KARMA</div>
            </div>
          </div>

          {wallet.connected && userStake && (
            <div className={styles.userCard}>
              <div className={styles.userTitle}>Your Stake</div>
              <div className={styles.userRow}>
                <span>SOL deposited</span>
                <span>{userStake.solDeposited.toFixed(4)} SOL</span>
              </div>
              <div className={styles.userRow}>
                <span>jitoSOL held</span>
                <span>{userStake.jitosolShare.toFixed(6)}</span>
              </div>
              <div className={styles.userRow}>
                <span>Baseline SOL value</span>
                <span>{userStake.solValueAtLastClaim.toFixed(4)} SOL</span>
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <div className={styles.actionCard}>
              <div className={styles.actionTitle}>Stake SOL</div>
              <div className={styles.actionDesc}>Deposit SOL to earn yield and mint KARMA</div>
              <div className={styles.comingSoon}>Coming soon</div>
            </div>
            <div className={styles.actionCard}>
              <div className={styles.actionTitle}>Swap</div>
              <div className={styles.actionDesc}>Trade KARMA ↔ SOL</div>
              <div className={styles.comingSoon}>Coming soon</div>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.loading}>Protocol not initialized</div>
      )}

      <footer className={styles.footer}>
        Karma — Sound money on Solana
      </footer>
    </>
  );
}
