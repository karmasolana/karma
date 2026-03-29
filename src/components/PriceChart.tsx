"use client";
import React, { useState, useEffect, useRef } from "react";
import styles from "./PriceChart.module.css";

interface PricePoint { time: string; price: number; }

// Genesis: program initialized at this time with 1:1 ratio
const GENESIS_TIME = "2026-03-29T21:00:00Z";
const GENESIS_PRICE = 1.0;

export default function PriceChart({ karmaPrice, solPrice }: { karmaPrice: number; solPrice: number | null }) {
  const [mode, setMode] = useState<"SOL" | "USD">("SOL");
  const [history, setHistory] = useState<PricePoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const key = "karma-price-history";
    let stored: PricePoint[] = [];
    try {
      const raw = localStorage.getItem(key);
      if (raw) stored = JSON.parse(raw);
    } catch {}

    // Ensure genesis point exists
    if (stored.length === 0 || stored[0].price !== GENESIS_PRICE) {
      stored = [{ time: GENESIS_TIME, price: GENESIS_PRICE }, ...stored.filter(p => p.time !== GENESIS_TIME)];
    }

    const now = new Date().toISOString();
    const last = stored[stored.length - 1];
    if (!last || new Date(now).getTime() - new Date(last.time).getTime() > 60 * 1000) {
      stored.push({ time: now, price: karmaPrice });
      if (stored.length > 500) stored = stored.slice(-500);
    } else {
      // Update latest point
      stored[stored.length - 1] = { time: now, price: karmaPrice };
    }

    try { localStorage.setItem(key, JSON.stringify(stored)); } catch {}
    setHistory(stored);
  }, [karmaPrice]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 1) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const prices = history.map(p => mode === "USD" && solPrice ? p.price * solPrice : p.price);
    const min = Math.min(...prices) * 0.95;
    const max = Math.max(...prices) * 1.05;
    const range = max - min || 0.01;
    const pad = 4;

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "#1e1e2a";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad + ((h - pad * 2) * i / 4);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Price line
    ctx.strokeStyle = "#8b5cf6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const pts = prices.length === 1 ? [prices[0], prices[0]] : prices;
    for (let i = 0; i < pts.length; i++) {
      const x = pts.length === 1 ? (i === 0 ? 0 : w) : (i / (pts.length - 1)) * w;
      const y = h - pad - ((pts[i] - min) / range) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(139,92,246,0.12)");
    grad.addColorStop(1, "rgba(139,92,246,0)");
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // Labels
    ctx.fillStyle = "#8b5cf6";
    ctx.font = "600 11px Inter,system-ui,sans-serif";
    ctx.textAlign = "right";
    const cur = pts[pts.length - 1];
    ctx.fillText(mode === "USD" ? `$${cur.toFixed(2)}` : `${cur.toFixed(4)} SOL`, w - 6, 14);
    ctx.fillStyle = "#444";
    ctx.textAlign = "left";
    const first = pts[0];
    ctx.fillText(mode === "USD" ? `$${first.toFixed(2)}` : `${first.toFixed(4)}`, 6, h - 6);

    // % change
    const pctChange = ((cur - first) / first * 100);
    ctx.fillStyle = pctChange >= 0 ? "#22c55e" : "#f87171";
    ctx.textAlign = "right";
    ctx.fillText(`${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%`, w - 6, h - 6);
  }, [history, mode, solPrice]);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.title}>Price</span>
        <div className={styles.toggle}>
          <button className={`${styles.toggleBtn} ${mode === "SOL" ? styles.toggleActive : ""}`} onClick={() => setMode("SOL")}>SOL</button>
          <button className={`${styles.toggleBtn} ${mode === "USD" ? styles.toggleActive : ""}`} onClick={() => setMode("USD")}>USD</button>
        </div>
      </div>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
