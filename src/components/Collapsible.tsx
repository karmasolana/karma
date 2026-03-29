"use client";
import React, { useState } from "react";

export default function Collapsible({ title, defaultOpen = true, accent = false, children }: { title: string; defaultOpen?: boolean; accent?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
        padding: "0", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", marginBottom: open ? "10px" : "0",
      }}>
        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.8px", color: accent ? "#8b5cf6" : "#666" }}>{title}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent ? "#8b5cf6" : "#555"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && children}
    </div>
  );
}
