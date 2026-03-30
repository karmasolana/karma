"use client";
import React, { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ADMIN_WALLET } from "@/utils/constants";
import Collapsible from "./Collapsible";
import styles from "./DevLog.module.css";

interface Reaction { up: string[]; down: string[]; }
interface LogEntry { id: string; date: string; title: string; text: string; reactions: Reaction; }

const STORAGE_KEY = "karma-devlog-v2";

function loadEntries(): LogEntry[] {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch {}
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState("");
  const [postText, setPostText] = useState("");

  const isAdmin = wallet.publicKey?.toBase58() === ADMIN_WALLET;
  const userKey = wallet.publicKey?.toBase58() || "";

  useEffect(() => {
    const local = loadEntries();
    if (local.length > 0) { setEntries(local); setLoaded(true); return; }
    fetch("/karma/devlog.json").then(r => r.json()).then(data => {
      const migrated = data.map((e: any, i: number) => ({
        id: `static-${i}`, date: e.date, title: e.title || "", text: e.text,
        reactions: { up: [], down: [] },
      }));
      setEntries(migrated);
      saveEntries(migrated);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const handlePost = () => {
    if (!postText.trim()) return;
    const id = `post-${Date.now()}`;
    const dateStr = new Date().toISOString().split("T")[0];
    const newEntry: LogEntry = { id, date: dateStr, title: postTitle.trim() || "Update", text: postText.trim(), reactions: { up: [], down: [] } };
    const updated = [newEntry, ...entries];
    setEntries(updated); saveEntries(updated);
    setPostText(""); setPostTitle(""); setPosting(false);
  };

  const handleEdit = (entry: LogEntry) => {
    setEditingId(entry.id); setPostTitle(entry.title); setPostText(entry.text); setPosting(false);
  };

  const handleUpdate = () => {
    if (!editingId || !postText.trim()) return;
    const updated = entries.map(e => e.id === editingId ? { ...e, title: postTitle.trim() || e.title, text: postText.trim() } : e);
    setEntries(updated); saveEntries(updated);
    setEditingId(null); setPostTitle(""); setPostText("");
  };

  const handleReact = (id: string, type: "up" | "down") => {
    if (!userKey) return;
    const updated = entries.map(e => {
      if (e.id !== id) return e;
      const r = { ...e.reactions, up: [...e.reactions.up], down: [...e.reactions.down] };
      if (type === "up") {
        r.down = r.down.filter(k => k !== userKey);
        if (r.up.includes(userKey)) r.up = r.up.filter(k => k !== userKey);
        else r.up.push(userKey);
      } else {
        r.up = r.up.filter(k => k !== userKey);
        if (r.down.includes(userKey)) r.down = r.down.filter(k => k !== userKey);
        else r.down.push(userKey);
      }
      return { ...e, reactions: r };
    });
    setEntries(updated); saveEntries(updated);
  };

  if (!loaded) return null;

  return (
    <div className={styles.wrap}>
      <Collapsible title="Dev Log" tooltip="Built in Karma Status Feed" defaultOpen={true} accent>
        {isAdmin && !editingId && (
          <div className={styles.adminArea}>
            {!posting ? (
              <button className={styles.newPostBtn} onClick={() => setPosting(true)}>+ New post</button>
            ) : (
              <div className={styles.postForm}>
                <input className={styles.titleInput} value={postTitle} onChange={e => setPostTitle(e.target.value)} placeholder="Post title..." maxLength={100} />
                <textarea className={styles.postInput} value={postText} onChange={e => setPostText(e.target.value)} placeholder="Write a dev log entry..." rows={4} />
                <div className={styles.postActions}>
                  <button className={styles.postBtn} onClick={handlePost} disabled={!postText.trim()}>Post</button>
                  <button className={styles.cancelBtn} onClick={() => { setPosting(false); setPostTitle(""); setPostText(""); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {editingId && (
          <div className={styles.adminArea}>
            <div className={styles.postForm}>
              <div className={styles.editLabel}>Editing post</div>
              <input className={styles.titleInput} value={postTitle} onChange={e => setPostTitle(e.target.value)} placeholder="Post title..." maxLength={100} />
              <textarea className={styles.postInput} value={postText} onChange={e => setPostText(e.target.value)} rows={4} />
              <div className={styles.postActions}>
                <button className={styles.postBtn} onClick={handleUpdate}>Save</button>
                <button className={styles.cancelBtn} onClick={() => { setEditingId(null); setPostTitle(""); setPostText(""); }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {entries.length === 0 ? (
          <div className={styles.empty}>No updates yet</div>
        ) : (
          entries.map(e => {
            const userVote = e.reactions.up.includes(userKey) ? "up" : e.reactions.down.includes(userKey) ? "down" : null;
            return (
              <div key={e.id} className={styles.entry}>
                <div className={styles.entryHeader}>
                  <div>
                    {e.title && <div className={styles.entryTitle}>{e.title}</div>}
                    <div className={styles.date}>{e.date}</div>
                  </div>
                  {isAdmin && !editingId && (
                    <button className={styles.editBtn} onClick={() => handleEdit(e)}>Edit</button>
                  )}
                </div>
                <div className={styles.text}>{e.text}</div>
                <div className={styles.reactions}>
                  <button className={`${styles.reactBtn} ${userVote === "up" ? styles.reactActive : ""}`} onClick={() => handleReact(e.id, "up")}>
                    👍 {e.reactions.up.length > 0 && <span>{e.reactions.up.length}</span>}
                  </button>
                  <button className={`${styles.reactBtn} ${userVote === "down" ? styles.reactActive : ""}`} onClick={() => handleReact(e.id, "down")}>
                    👎 {e.reactions.down.length > 0 && <span>{e.reactions.down.length}</span>}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </Collapsible>
    </div>
  );
}
