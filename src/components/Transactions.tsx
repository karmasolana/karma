"use client";
import React, { useState, useEffect, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { findKarmaStatePDA, PROGRAM_ID } from "@/utils/constants";
import Collapsible from "./Collapsible";
import styles from "./Transactions.module.css";

interface TxEntry { sig: string; type: string; amount: string; wallet: string; timestamp: number; }

function classifyTx(logs: string[], preBalances: number[], postBalances: number[]): { type: string; amount: string } {
  const joined = logs.join("\n");
  const signerDelta = (postBalances[0] - preBalances[0]) / LAMPORTS_PER_SOL;

  if (joined.includes("CreateAccount") && joined.includes("Transfer")) {
    // Stake: user loses SOL + jitoSOL transferred
    return { type: "Stake", amount: `${Math.abs(signerDelta).toFixed(4)} SOL` };
  }
  if (joined.includes("MintTo") && !joined.includes("CreateAccount")) {
    return { type: "Mint", amount: "" };
  }
  // Swap buy: user sends SOL, gets KARMA
  if (signerDelta < -0.001 && !joined.includes("CreateAccount")) {
    return { type: "Buy", amount: `${Math.abs(signerDelta).toFixed(4)} SOL` };
  }
  // Swap sell or withdraw: user gains SOL
  if (signerDelta > 0.001) {
    if (joined.includes("CloseAccount")) {
      return { type: "Withdraw", amount: `+${signerDelta.toFixed(4)} SOL` };
    }
    return { type: "Sell", amount: `+${signerDelta.toFixed(4)} SOL` };
  }
  return { type: "Tx", amount: "" };
}

const typeColors: Record<string, string> = {
  Stake: "#8b5cf6", Buy: "#3b82f6", Sell: "#f59e0b", Withdraw: "#f59e0b",
  Mint: "#22c55e", Tx: "#888",
};

export default function Transactions() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [allTxs, setAllTxs] = useState<TxEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);

  const [ksPDA] = findKarmaStatePDA();

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const load = async () => {
      setLoading(true);
      try {
        const sigs = await connection.getSignaturesForAddress(ksPDA, { limit: 8 });
        const valid = sigs.filter(s => !s.err).slice(0, 6);
        const entries: TxEntry[] = [];

        for (const s of valid) {
          try {
            const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
            if (!tx || !tx.meta) continue;
            const logs = tx.meta.logMessages || [];
            if (!logs.some(l => l.includes(PROGRAM_ID.toBase58()))) continue;
            const signer = tx.transaction.message.accountKeys[0].pubkey.toBase58();
            const { type, amount } = classifyTx(logs, tx.meta.preBalances, tx.meta.postBalances);
            entries.push({ sig: s.signature, type, amount, wallet: signer, timestamp: s.blockTime || 0 });
          } catch { continue; }
        }
        setAllTxs(entries.slice(0, 4));
      } catch {}
      setLoading(false);
    };
    load();
  }, [connection, ksPDA]);

  const myWallet = wallet.publicKey?.toBase58();
  const displayed = tab === "mine" ? allTxs.filter(t => t.wallet === myWallet) : allTxs;

  const formatTime = (ts: number) => {
    if (!ts) return "";
    const diff = Date.now() / 1000 - ts;
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
          displayed.map((tx, i) => {
            const isYou = myWallet && tx.wallet === myWallet;
            return (
              <div key={i} className={styles.row}>
                <div className={styles.rowLeft}>
                  <span className={styles.badge} style={{ color: typeColors[tx.type] || "#888", borderColor: typeColors[tx.type] || "#888" }}>{tx.type}</span>
                  <span className={styles.wallet}>
                    {tx.wallet.slice(0, 4)}...{tx.wallet.slice(-4)}
                    {isYou && tab === "all" && <span className={styles.youTag}>You</span>}
                  </span>
                </div>
                <div className={styles.rowRight}>
                  {tx.amount && <span className={styles.amount}>{tx.amount}</span>}
                  <span className={styles.time}>{formatTime(tx.timestamp)}</span>
                  <a href={`https://solscan.io/tx/${tx.sig}`} target="_blank" rel="noopener noreferrer" className={styles.link}>↗</a>
                </div>
              </div>
            );
          })
        }
      </Collapsible>
    </div>
  );
}
