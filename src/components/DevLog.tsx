"use client";
import React, { useState, useEffect } from "react";
import Collapsible from "./Collapsible";
import styles from "./DevLog.module.css";

interface LogEntry { date: string; text: string; }

export default function DevLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    fetch("/karma/devlog.json")
      .then(r => r.json())
      .then(data => setEntries(data))
      .catch(() => {});
  }, []);

  return (
    <div className={styles.wrap}>
      <Collapsible title="Dev Log" defaultOpen={true} accent>
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
