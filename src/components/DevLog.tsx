"use client";
import React, { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ADMIN_WALLET } from "@/utils/constants";
import Collapsible from "./Collapsible";
import styles from "./DevLog.module.css";

interface LogEntry { date: string; text: string; }

const STORAGE_KEY = "karma-devlog";

function loadEntries(): LogEntry[] {
  // Try localStorage first (has admin posts), fallback to static
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveEntries(entries: LogEntry[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch {}
}

export default function DevLog() {
  const wallet = useWallet();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postText, setPostText] = useState("");

  const isAdmin = wallet.publicKey?.toBase58() === ADMIN_WALLET;

  useEffect(() => {
    // Load from static file first, then overlay localStorage
    fetch("/karma/devlog.json")
      .then(r => r.json())
      .then(staticEntries => {
        const localEntries = loadEntries();
        // Merge: local entries take priority (they include admin posts)
        if (localEntries.length > staticEntries.length) {
          setEntries(localEntries);
        } else {
          setEntries(staticEntries);
          saveEntries(staticEntries);
        }
        setLoaded(true);
      })
      .catch(() => {
        setEntries(loadEntries());
        setLoaded(true);
      });
  }, []);

  const handlePost = () => {
    if (!postText.trim()) return;
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const newEntry: LogEntry = { date: dateStr, text: postText.trim() };
    const updated = [newEntry, ...entries];
    setEntries(updated);
    saveEntries(updated);
    setPostText("");
    setPosting(false);
  };

  if (!loaded) return null;

  return (
    <div className={styles.wrap}>
      <Collapsible title="Dev Log" defaultOpen={true} accent>
        {isAdmin && (
          <div className={styles.adminArea}>
            {!posting ? (
              <button className={styles.newPostBtn} onClick={() => setPosting(true)}>+ New post</button>
            ) : (
              <div className={styles.postForm}>
                <textarea
                  className={styles.postInput}
                  value={postText}
                  onChange={e => setPostText(e.target.value)}
                  placeholder="Write a dev log entry..."
                  rows={3}
                />
                <div className={styles.postActions}>
                  <button className={styles.postBtn} onClick={handlePost} disabled={!postText.trim()}>Post</button>
                  <button className={styles.cancelBtn} onClick={() => { setPosting(false); setPostText(""); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
        {entries.length === 0 ? (
          <div className={styles.empty}>No updates yet</div>
        ) : (
          entries.map((e, i) => (
            <div key={i} className={styles.entry}>
              <div className={styles.date}>{e.date}</div>
              <div className={styles.text}>{e.text}</div>
            </div>
          ))
        )}
      </Collapsible>
    </div>
  );
}
