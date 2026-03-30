"use client";
import React, { useState } from "react";

export default function Collapsible({ title, defaultOpen = true, accent = false, collapsible = true, tooltip, children }: {
  title: string; defaultOpen?: boolean; accent?: boolean; collapsible?: boolean; tooltip?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showTip, setShowTip] = useState(false);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: open ? "10px" : "0" }}>
        <span
          onMouseEnter={() => tooltip && setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}
          style={{ position: "relative", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.8px", color: accent ? "#8b5cf6" : "#666", cursor: tooltip ? "help" : "default" }}
        >
          {title}
          {showTip && tooltip && (
            <span style={{
              position: "absolute", bottom: "calc(100% + 8px)", left: "0",
              background: "#1a1a25", border: "1px solid #2a2a3a", borderRadius: "8px", padding: "8px 12px",
              fontSize: "11px", fontWeight: 400, color: "#bbb", lineHeight: "1.5", whiteSpace: "normal",
              width: "240px", zIndex: 100, textTransform: "none", letterSpacing: "0", boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              pointerEvents: "none",
            }}>
              {tooltip}
            </span>
          )}
        </span>
        {collapsible && (
          <button onClick={() => setOpen(!open)} style={{ padding: "4px", border: "none", background: "transparent", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent ? "#8b5cf6" : "#555"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><path d="M6 9l6 6 6-6"/></svg>
          </button>
        )}
      </div>
      {open && children}
    </div>
  );
}
