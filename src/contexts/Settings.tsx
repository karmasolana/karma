"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

type Currency = "SOL" | "USDC" | "KARMA";

interface SettingsContextType {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  cycleCurrency: () => void;
}

const SettingsContext = createContext<SettingsContextType>({
  currency: "SOL", setCurrency: () => {}, cycleCurrency: () => {},
});

export function useSettings() { return useContext(SettingsContext); }

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("SOL");

  useEffect(() => {
    try { const c = localStorage.getItem("karma-currency"); if (c === "USDC" || c === "KARMA") setCurrencyState(c); } catch {}
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c); try { localStorage.setItem("karma-currency", c); } catch {}
  }, []);

  const cycleCurrency = useCallback(() => {
    setCurrencyState(p => {
      const next = p === "SOL" ? "USDC" : p === "USDC" ? "KARMA" : "SOL";
      try { localStorage.setItem("karma-currency", next); } catch {}
      return next;
    });
  }, []);

  return <SettingsContext.Provider value={{ currency, setCurrency, cycleCurrency }}>{children}</SettingsContext.Provider>;
}
