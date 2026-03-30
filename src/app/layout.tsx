import type { Metadata } from "next";
import WalletContextProvider from "@/components/WalletProvider";
import { SettingsProvider } from "@/contexts/Settings";
import "./globals.css";

export const metadata: Metadata = {
  title: "Karma — Sound Money on Solana",
  description: "Stake SOL, earn yield, mint KARMA. Backed by Solana.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <WalletContextProvider>
          <SettingsProvider>
            <div style={{ maxWidth: 520, margin: "0 auto", minHeight: "100vh", padding: "0 16px" }}>
              {children}
            </div>
          </SettingsProvider>
        </WalletContextProvider>
      </body>
    </html>
  );
}
