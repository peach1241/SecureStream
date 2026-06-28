import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SWRProvider } from "./swr-provider";
import { Navbar } from "@/components/Navbar";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  ),
  title: "SecureStream | Stellar AMM Protocol",
  description: "A decentralized liquidity & swap protocol built on the Stellar Blockchain using Soroban Smart Contracts. Instant SST ↔ XLM swaps and liquidity provision.",
  openGraph: {
    title: "SecureStream",
    description: "Secure liquidity and token swaps on Stellar Testnet",
    url: "https://secure-stream.vercel.app",
    siteName: "SecureStream",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SecureStream",
    description: "Secure liquidity and token swaps on Stellar Testnet",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ErrorBoundary>
          <SWRProvider>
            <Navbar />
            {children}
          </SWRProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
