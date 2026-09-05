"use client";

import Link from "next/link";
import { useState } from "react";
import { getEthereum, ROBINHOOD_CHAIN_ID, shortAddress } from "@/lib/wallet";

export function Header() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function connect() {
    const ethereum = getEthereum();
    if (!ethereum) {
      setMessage("Install an EVM wallet to connect.");
      return;
    }
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const chainId = Number(await ethereum.request({ method: "eth_chainId" }));
      if (chainId !== ROBINHOOD_CHAIN_ID) {
        setMessage("Switch your wallet to Robinhood Chain (4663).");
        return;
      }
      setWallet(accounts[0] || null);
      setMessage("");
    } catch {
      setMessage("Wallet connection cancelled.");
    }
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="HYPR home"><span className="brand-mark">H</span><span>HYPR</span></Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link className="active" href="/">Discover</Link>
          <Link href="/#following">Following</Link>
          <Link href="/#rooms">Rooms</Link>
        </nav>
        <div className="header-actions">
          {message && <span className="wallet-message">{message}</span>}
          <button className="wallet-button" onClick={connect}>{wallet ? shortAddress(wallet) : "Connect wallet"}<span className="status-dot" /></button>
        </div>
      </div>
    </header>
  );
}
