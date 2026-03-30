"use client";
import React, { useState, useEffect, useRef } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { findKarmaStatePDA, PROGRAM_ID } from "@/utils/constants";
import Collapsible from "./Collapsible";
import styles from "./Trades.module.css";

interface Trade {
  sig: string;
  type: "LP Seed" | "Buy" | "Sell" | "Stake" | "Withdraw" | "Other";
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
        const valid = sigs.filter(s => !s.err).reverse(); // oldest first

        const entries: Trade[] = [];
        let lpSol = 0.25;
        let lpKarma = 0.25;

        // First entry: LP Seed
        entries.push({
          sig: valid.length > 0 ? valid[0].signature : "",
          type: "LP Seed",
          solAmount: 0.25,
          karmaAmount: 0.25,
          priceAfter: 1.0,
          priceImpact: 0,
          wallet: "Admin",
          timestamp: valid.length > 0 ? (valid[0].blockTime || 0) : 0,
        });

        // Parse each tx
        for (const s of valid) {
          try {
            const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
            if (!tx || !tx.meta) continue;
            const logs = tx.meta.logMessages || [];
            if (!logs.some(l => l.includes(PROGRAM_ID.toBase58()))) continue;

            const signer = tx.transaction.message.accountKeys[0].pubkey.toBase58();
            const signerIdx = 0;
            const solDelta = (tx.meta.postBalances[signerIdx] - tx.meta.preBalances[signerIdx]) / LAMPORTS_PER_SOL;
            const joined = logs.join("\n");

            // Skip init/seed txs
            if (joined.includes("CreateAccount") && joined.includes("karma_state")) continue;

            const priceBefore = lpKarma > 0 ? lpSol / lpKarma : 1;

            if (joined.includes("CreateAccount") && !joined.includes("karma_state")) {
              // Stake tx - doesn't affect LP
              continue;
            }

            // Detect swap: user SOL balance changed significantly and no CreateAccount
            if (Math.abs(solDelta) > 0.001 && !joined.includes("CreateAccount")) {
              if (solDelta < 0) {
                // Buy: user spent SOL, got KARMA
                const solIn = Math.abs(solDelta);
                const newSol = lpSol + solIn;
                const newKarma = (lpSol * lpKarma) / newSol;
                const karmaOut = lpKarma - newKarma;
                const priceAfter = newSol / newKarma;
                const impact = ((priceAfter - priceBefore) / priceBefore) * 100;
                entries.push({ sig: s.signature, type: "Buy", solAmount: solIn, karmaAmount: karmaOut, priceAfter, priceImpact: impact, wallet: signer, timestamp: s.blockTime || 0 });
                lpSol = newSol;
                lpKarma = newKarma;
              } else {
                // Sell: user got SOL, spent KARMA
                const solOut = solDelta;
                const newSol = lpSol - solOut;
                const newKarma = (lpSol * lpKarma) / newSol;
                const karmaIn = newKarma - lpKarma;
                const priceAfter = newSol / newKarma;
                const impact = ((priceAfter - priceBefore) / priceBefore) * 100;
                entries.push({ sig: s.signature, type: "Sell", solAmount: solOut, karmaAmount: karmaIn, priceAfter, priceImpact: impact, wallet: signer, timestamp: s.blockTime || 0 });
                lpSol = newSol;
                lpKarma = newKarma;
              }
            }
          } catch { continue; }
        }

        setTrades(entries);
      } catch (e) { console.error(e); }
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
      <Collapsible title="Trades" defaultOpen={false}>
        {loading ? <div className={styles.empty}>Loading trades...</div> :
          trades.length === 0 ? <div className={styles.empty}>No trades yet</div> :
          trades.map((t, i) => (
            <div key={i} className={styles.row}>
              <div className={styles.rowTop}>
                <span className={`${styles.badge} ${styles[`badge${t.type.replace(" ", "")}`]}`}>{t.type}</span>
                <span className={styles.wallet}>{t.wallet === "Admin" ? "Admin" : `${t.wallet.slice(0, 4)}...${t.wallet.slice(-4)}`}</span>
                <span className={styles.time}>{formatTime(t.timestamp)}</span>
              </div>
              <div className={styles.rowBottom}>
                <div className={styles.amounts}>
                  {t.type === "LP Seed" ? (
                    <span>{t.solAmount} SOL + {t.karmaAmount} KARMA</span>
                  ) : t.type === "Buy" ? (
                    <span>{t.solAmount.toFixed(4)} SOL → {t.karmaAmount.toFixed(4)} KARMA</span>
                  ) : (
                    <span>{t.karmaAmount.toFixed(4)} KARMA → {t.solAmount.toFixed(4)} SOL</span>
                  )}
                </div>
                <div className={styles.impact}>
                  <span className={styles.priceLabel}>{t.priceAfter.toFixed(4)} SOL</span>
                  {t.priceImpact !== 0 && (
                    <span className={t.priceImpact > 0 ? styles.impactUp : styles.impactDown}>
                      {t.priceImpact > 0 ? "+" : ""}{t.priceImpact.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
              {t.sig && t.type !== "LP Seed" && (
                <a href={`https://solscan.io/tx/${t.sig}`} target="_blank" rel="noopener noreferrer" className={styles.link}>View on Solscan ↗</a>
              )}
            </div>
          ))
        }
      </Collapsible>
    </div>
  );
}
