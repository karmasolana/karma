"use client";
import React, { useState, useEffect, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { findKarmaStatePDA, PROGRAM_ID } from "@/utils/constants";
import Collapsible from "./Collapsible";
import styles from "./Transactions.module.css";

interface TxEntry { sig: string; timestamp: number; memo: string | null; }

export default function Transactions() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [allTxs, setAllTxs] = useState<TxEntry[]>([]);
  const [myTxs, setMyTxs] = useState<TxEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);

  const [ksPDA] = findKarmaStatePDA();

  // Load once on mount
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const load = async () => {
      setLoading(true);
      try {
        const sigs = await connection.getSignaturesForAddress(ksPDA, { limit: 8 });
        const entries: TxEntry[] = sigs
          .filter(s => !s.err)
          .slice(0, 4)
          .map(s => ({ sig: s.signature, timestamp: s.blockTime || 0, memo: s.memo }));
        setAllTxs(entries);
      } catch {}
      setLoading(false);
    };
    load();
  }, [connection, ksPDA]);

  // Load "mine" tab - wallet's txs with the program
  useEffect(() => {
    if (tab !== "mine" || !wallet.publicKey || myTxs.length > 0) return;
    const load = async () => {
      setLoading(true);
      try {
        const sigs = await connection.getSignaturesForAddress(wallet.publicKey!, { limit: 20 });
        // Filter to ones that involve our program (check if ksPDA is referenced)
        // Simple heuristic: just show wallet's recent txs (we can't filter by program without fetching each)
        const entries: TxEntry[] = sigs
          .filter(s => !s.err)
          .slice(0, 4)
          .map(s => ({ sig: s.signature, timestamp: s.blockTime || 0, memo: s.memo }));
        setMyTxs(entries);
      } catch {}
      setLoading(false);
    };
    load();
  }, [tab, wallet.publicKey, connection, myTxs.length]);

  const displayed = tab === "mine" ? myTxs : allTxs;

  const formatTime = (ts: number) => {
    if (!ts) return "";
    const diff = (Date.now() / 1000 - ts);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(ts * 1000).toLocaleDateString();
  };

  return (
    <div className={styles.wrap}>
      <Collapsible title="Transactions" defaultOpen={false}>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === "all" ? styles.tabActive : ""}`} onClick={() => setTab("all")}>All</button>
          {wallet.connected && <button className={`${styles.tab} ${tab === "mine" ? styles.tabActive : ""}`} onClick={() => setTab("mine")}>Mine</button>}
        </div>
        {loading ? <div className={styles.empty}>Loading...</div> :
          displayed.length === 0 ? <div className={styles.empty}>No transactions yet</div> :
          displayed.map((tx, i) => (
            <div key={i} className={styles.row}>
              <span className={styles.time}>{formatTime(tx.timestamp)}</span>
              <a href={`https://solscan.io/tx/${tx.sig}`} target="_blank" rel="noopener noreferrer" className={styles.link}>
                {tx.sig.slice(0, 16)}...{tx.sig.slice(-8)}
              </a>
            </div>
          ))
        }
      </Collapsible>
    </div>
  );
}
