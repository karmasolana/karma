"use client";
import React, { useState, useEffect, useRef } from "react";
import Collapsible from "./Collapsible";
import styles from "./PriceChart.module.css";

interface PricePoint { time: number; price: number; }

const STORAGE_KEY = "karma-price-history-v3";
const INCEPTION_TIME = 1743284400000;
const INCEPTION_PRICE = 1.0;

function loadHistory(): PricePoint[] {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch {}
  return [{ time: INCEPTION_TIME, price: INCEPTION_PRICE }];
}
function saveHistory(h: PricePoint[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(-500))); } catch {}
}

export default function PriceChart({ karmaPrice, solPrice }: { karmaPrice: number; solPrice: number | null }) {
  const [mode, setMode] = useState<"SOL" | "USD">("SOL");
  const [history, setHistory] = useState<PricePoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPrice = useRef(0);

  // Only add data point when price actually changes
  useEffect(() => {
    const h = loadHistory();
    const priceChanged = Math.abs(karmaPrice - lastPrice.current) > 0.0001;
    const last = h[h.length - 1];
    const timeDiff = Date.now() - (last?.time || 0);

    if (priceChanged || timeDiff > 300000) { // price changed OR 5 min elapsed
      h.push({ time: Date.now(), price: karmaPrice });
      saveHistory(h);
      lastPrice.current = karmaPrice;
    }
    setHistory(h);
  }, [karmaPrice]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const prices = history.map(p => mode === "USD" && solPrice ? p.price * solPrice : p.price);
    const min = Math.min(...prices) * 0.95;
    const max = Math.max(...prices) * 1.05;
    const range = max - min || 1;

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#222230"; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) { const y = h - (h * i / 4); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    ctx.strokeStyle = "#8b5cf6"; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < prices.length; i++) {
      const x = (i / (prices.length - 1)) * w;
      const y = h - ((prices[i] - min) / range) * (h - 12) - 6;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(139,92,246,0.15)"); grad.addColorStop(1, "rgba(139,92,246,0)");
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

    ctx.fillStyle = "#8b5cf6"; ctx.font = "600 10px Inter,system-ui"; ctx.textAlign = "right";
    const lp = prices[prices.length - 1];
    ctx.fillText(mode === "USD" ? `$${lp.toFixed(2)}` : `${lp.toFixed(4)} SOL`, w - 4, 12);
    ctx.fillStyle = "#444"; ctx.textAlign = "left";
    ctx.fillText(mode === "USD" ? `$${prices[0].toFixed(2)}` : `${prices[0].toFixed(4)}`, 4, 12);
  }, [history, mode, solPrice]);

  const title = "Graph";

  return (
    <div className={styles.wrap}>
      <Collapsible title={title} defaultOpen={true} accent>
        <div className={styles.controls}>
          <button className={`${styles.modeBtn} ${mode === "SOL" ? styles.modeBtnActive : ""}`} onClick={() => setMode("SOL")}>SOL</button>
          <button className={`${styles.modeBtn} ${mode === "USD" ? styles.modeBtnActive : ""}`} onClick={() => setMode("USD")}>USD</button>
        </div>
        {history.length < 2 ? <div className={styles.empty}>Collecting data...</div> : <canvas ref={canvasRef} className={styles.canvas} />}
      </Collapsible>
    </div>
  );
}
