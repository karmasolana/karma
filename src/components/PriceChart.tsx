"use client";
import React, { useState, useEffect, useRef } from "react";
import styles from "./PriceChart.module.css";

interface PricePoint { time: string; price: number; }

export default function PriceChart({ karmaPrice, solPrice }: { karmaPrice: number; solPrice: number | null }) {
  const [mode, setMode] = useState<"SOL" | "USD">("SOL");
  const [history, setHistory] = useState<PricePoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Build price history from localStorage + current
  useEffect(() => {
    const key = "karma-price-history";
    let stored: PricePoint[] = [];
    try {
      const raw = localStorage.getItem(key);
      if (raw) stored = JSON.parse(raw);
    } catch {}

    const now = new Date().toISOString();
    const latest: PricePoint = { time: now, price: karmaPrice };

    // Only add if last point is >5 min old
    if (stored.length === 0 || new Date(now).getTime() - new Date(stored[stored.length - 1].time).getTime() > 5 * 60 * 1000) {
      stored.push(latest);
      if (stored.length > 500) stored = stored.slice(-500);
      try { localStorage.setItem(key, JSON.stringify(stored)); } catch {}
    }

    setHistory(stored);
  }, [karmaPrice]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const prices = history.map(p => mode === "USD" && solPrice ? p.price * solPrice : p.price);
    const min = Math.min(...prices) * 0.98;
    const max = Math.max(...prices) * 1.02;
    const range = max - min || 1;

    // Background
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = "#222230";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = h - (h * i / 4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Price line
    ctx.strokeStyle = "#8b5cf6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < prices.length; i++) {
      const x = (i / (prices.length - 1)) * w;
      const y = h - ((prices[i] - min) / range) * (h - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(139, 92, 246, 0.15)");
    grad.addColorStop(1, "rgba(139, 92, 246, 0)");
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Current price label
    const lastPrice = prices[prices.length - 1];
    ctx.fillStyle = "#8b5cf6";
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(
      mode === "USD" ? `$${lastPrice.toFixed(2)}` : `${lastPrice.toFixed(4)} SOL`,
      w - 4, 14
    );
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
      {history.length < 2 ? (
        <div className={styles.empty}>Price chart builds as data is collected</div>
      ) : (
        <canvas ref={canvasRef} className={styles.canvas} />
      )}
    </div>
  );
}
