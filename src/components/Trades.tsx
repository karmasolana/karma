"use client";
import React, { useState, useEffect, useRef } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { findKarmaStatePDA, PROGRAM_ID } from "@/utils/constants";
import Collapsible from "./Collapsible";
import styles from "./Trades.module.css";

interface Trade {
  sig: string;
  type: "LP Seed" | "Buy" | "Sell";
  solAmount: number;
  karmaAmount: number;
  priceAfter: number;
  priceImpact: number;
  wallet: string;
  timestamp: number;
}

export default function Trades() {
  const { connection } = useConnection();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);
  const [ksPDA] = findKarmaStatePDA();

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const load = async () => {
      setLoading(true);
      try {
        const sigs = await connection.getSignaturesForAddress(ksPDA, { limit: 20 });
        const valid = sigs.filter(s => !s.err).reverse();
        const entries: Trade[] = [];
        let lpSol = 0.25, lpKarma = 0.25;

        entries.push({
          sig: "", type: "LP Seed", solAmount: 0.25, karmaAmount: 0.25,
          priceAfter: 1.0, priceImpact: 0, wallet: "Admin",
          timestamp: valid.length > 0 ? (valid[0].blockTime || 0) : 0,
        });

        for (const s of valid) {
          try {
            const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
            if (!tx || !tx.meta) continue;
            const logs = tx.meta.logMessages || [];
            if (!logs.some(l => l.includes(PROGRAM_ID.toBase58()))) continue;
            const signer = tx.transaction.message.accountKeys[0].pubkey.toBase58();
            const solDelta = (tx.meta.postBalances[0] - tx.meta.preBalances[0]) / LAMPORTS_PER_SOL;
            const joined = logs.join("\n");
            if (joined.includes("CreateAccount")) continue;
            const priceBefore = lpKarma > 0 ? lpSol / lpKarma : 1;

            if (Math.abs(solDelta) > 0.001) {
              if (solDelta < 0) {
                const solIn = Math.abs(solDelta);
                const newSol = lpSol + solIn;
                const newKarma = (lpSol * lpKarma) / newSol;
                const karmaOut = lpKarma - newKarma;
                const priceAfter = newSol / newKarma;
                const impact = ((priceAfter - priceBefore) / priceBefore) * 100;
                entries.push({ sig: s.signature, type: "Buy", solAmount: solIn, karmaAmount: karmaOut, priceAfter, priceImpact: impact, wallet: signer, timestamp: s.blockTime || 0 });
                lpSol = newSol; lpKarma = newKarma;
              } else {
                const solOut = solDelta;
                const newSol = lpSol - solOut;
                const newKarma = (lpSol * lpKarma) / newSol;
                const karmaIn = newKarma - lpKarma;
                const priceAfter = newSol / newKarma;
                const impact = ((priceAfter - priceBefore) / priceBefore) * 100;
                entries.push({ sig: s.signature, type: "Sell", solAmount: solOut, karmaAmount: karmaIn, priceAfter, priceImpact: impact, wallet: signer, timestamp: s.blockTime || 0 });
                lpSol = newSol; lpKarma = newKarma;
              }
            }
          } catch { continue; }
        }
        // Reverse so newest first
        setTrades(entries.reverse());
      } catch {}
      setLoading(false);
    };
    load();
  }, [connection, ksPDA]);

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
      <Collapsible title="Trades" tooltip="List of Orders through Karma AMM" defaultOpen={false}>
        {loading ? <div className={styles.empty}>Loading trades...</div> :
          trades.length === 0 ? <div className={styles.empty}>No trades yet</div> : (
          <div className={styles.scrollBox}>
            {trades.map((t, i) => (
              <div key={i} className={styles.row}>
                <div className={styles.rowTop}>
                  <span className={`${styles.badge} ${t.type === "LP Seed" ? styles.badgeSeed : t.type === "Buy" ? styles.badgeBuy : styles.badgeSell}`}>{t.type}</span>
                  <span className={styles.wallet}>{t.wallet === "Admin" ? "Admin" : `${t.wallet.slice(0, 4)}...${t.wallet.slice(-4)}`}</span>
                  <span className={styles.time}>{formatTime(t.timestamp)}</span>
                </div>
                <div className={styles.rowBottom}>
                  <div className={styles.amounts}>
                    {t.type === "LP Seed" ? `${t.solAmount} SOL + ${t.karmaAmount} KARMA` :
                     t.type === "Buy" ? `${t.solAmount.toFixed(4)} SOL → ${t.karmaAmount.toFixed(4)} KARMA` :
                     `${t.karmaAmount.toFixed(4)} KARMA → ${t.solAmount.toFixed(4)} SOL`}
                  </div>
                  <div className={styles.impact}>
                    <span className={styles.priceVal}>{t.priceAfter.toFixed(4)}</span>
                    {t.priceImpact !== 0 && (
                      <span className={t.priceImpact > 0 ? styles.impactUp : styles.impactDown}>
                        {t.priceImpact > 0 ? "+" : ""}{t.priceImpact.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
                {t.sig && <a href={`https://solscan.io/tx/${t.sig}`} target="_blank" rel="noopener noreferrer" className={styles.link}>Solscan ↗</a>}
              </div>
            ))}
          </div>
        )}
      </Collapsible>
    </div>
  );
}
