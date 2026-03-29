"use client";
import React, { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PROGRAM_ID, findKarmaStatePDA } from "@/utils/constants";
import Collapsible from "./Collapsible";
import styles from "./Transactions.module.css";

interface TxEntry { sig: string; type: string; wallet: string; timestamp: number; }

function classifyTx(logs: string[]): string {
  const joined = logs.join(" ");
  if (joined.includes("swap_sol_to_karma") || (joined.includes("Transfer") && joined.includes("Instruction: Transfer") && logs.length > 8)) return "Swap";
  if (joined.includes("withdraw")) return "Withdraw";
  if (joined.includes("claim_yield") || joined.includes("MintTo")) return "Claim";
  if (joined.includes("CreateAccount") || joined.includes("deposit")) return "Stake";
  return "Tx";
}

export default function Transactions() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [allTxs, setAllTxs] = useState<TxEntry[]>([]);
  const [myTxs, setMyTxs] = useState<TxEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const [ksPDA] = findKarmaStatePDA();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const sigs = await connection.getSignaturesForAddress(ksPDA, { limit: 10 });
        const entries: TxEntry[] = [];
        for (const s of sigs) {
          try {
            const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
            if (!tx || !tx.meta) continue;
            const logs = tx.meta.logMessages || [];
            const programUsed = logs.some(l => l.includes(PROGRAM_ID.toBase58()));
            if (!programUsed) continue;
            const signer = tx.transaction.message.accountKeys[0].pubkey.toBase58();
            entries.push({ sig: s.signature, type: classifyTx(logs), wallet: signer, timestamp: s.blockTime || 0 });
          } catch { continue; }
        }
        setAllTxs(entries.slice(0, 4));
      } catch {}
      setLoading(false);
    };
    load();
  }, [connection, ksPDA]);

  useEffect(() => {
    if (!wallet.publicKey || allTxs.length === 0) { setMyTxs([]); return; }
    const mine = allTxs.filter(t => t.wallet === wallet.publicKey!.toBase58());
    setMyTxs(mine.slice(0, 4));
  }, [wallet.publicKey, allTxs]);

  const displayed = tab === "mine" ? myTxs : allTxs;

  const typeColor = (t: string) => {
    if (t === "Stake") return "#8b5cf6";
    if (t === "Claim") return "#22c55e";
    if (t === "Withdraw") return "#f59e0b";
    if (t === "Swap") return "#3b82f6";
    return "#888";
  };

  const formatTime = (ts: number) => {
    if (!ts) return "";
    const diff = (Date.now() / 1000 - ts);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className={styles.wrap}>
      <Collapsible title="Transactions" defaultOpen={false}>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === "all" ? styles.tabActive : ""}`} onClick={() => setTab("all")}>All</button>
          {wallet.connected && <button className={`${styles.tab} ${tab === "mine" ? styles.tabActive : ""}`} onClick={() => setTab("mine")}>Mine</button>}
        </div>
        {loading ? <div className={styles.empty}>Loading...</div> :
          displayed.length === 0 ? <div className={styles.empty}>No transactions</div> :
          displayed.map((tx, i) => (
            <div key={i} className={styles.row}>
              <div className={styles.rowLeft}>
                <span className={styles.badge} style={{ color: typeColor(tx.type), borderColor: typeColor(tx.type) }}>{tx.type}</span>
                <span className={styles.wallet}>{tx.wallet.slice(0, 4)}...{tx.wallet.slice(-4)}</span>
              </div>
              <div className={styles.rowRight}>
                <span className={styles.time}>{formatTime(tx.timestamp)}</span>
                <a href={`https://solscan.io/tx/${tx.sig}`} target="_blank" rel="noopener noreferrer" className={styles.link}>
                  {tx.sig.slice(0, 8)}...
                </a>
              </div>
            </div>
          ))
        }
      </Collapsible>
    </div>
  );
}
