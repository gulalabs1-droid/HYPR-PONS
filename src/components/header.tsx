"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getEthereum, isRobinhoodChainId, robinhoodNetworkLabel, shortAddress } from "@/lib/wallet";

export function Header({ active = "discover" }: { active?: "discover" | "protocol" }) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function syncWallet() {
    const ethereum = getEthereum();
    if (!ethereum) return;
    try {
      const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
      const nextChainId = Number(await ethereum.request({ method: "eth_chainId" }));
      setChainId(Number.isFinite(nextChainId) ? nextChainId : null);
      if (!accounts[0]) {
        setWallet(null);
        return;
      }
      if (!isRobinhoodChainId(nextChainId)) {
        setWallet(null);
        setMessage(`Wallet connected on ${robinhoodNetworkLabel(nextChainId)}. Switch to Robinhood Chain (4663) or testnet (46630).`);
        return;
      }
      setWallet(accounts[0]);
      setMessage("");
    } catch {
      setWallet(null);
    }
  }

  useEffect(() => {
    void syncWallet();
    const ethereum = getEthereum();
    if (!ethereum?.on) return undefined;
    const onAccountsChanged = () => void syncWallet();
    const onChainChanged = () => void syncWallet();
    ethereum.on("accountsChanged", onAccountsChanged);
    ethereum.on("chainChanged", onChainChanged);
    return () => {
      ethereum.removeListener?.("accountsChanged", onAccountsChanged);
      ethereum.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  async function connect() {
    const ethereum = getEthereum();
    if (!ethereum) {
      setMessage("Install an EVM wallet to connect.");
      return;
    }
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const chainId = Number(await ethereum.request({ method: "eth_chainId" }));
      setChainId(chainId);
      if (!isRobinhoodChainId(chainId)) {
        setWallet(null);
        setMessage("Switch your wallet to Robinhood Chain (4663) or testnet (46630).");
        return;
      }
      setWallet(accounts[0] || null);
      setMessage("");
    } catch {
      setMessage("Wallet connection cancelled.");
    }
  }

  function disconnect() {
    setWallet(null);
    setChainId(null);
    setMessage("Disconnected from HYPR. Wallet permissions remain managed by your wallet.");
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="HYPR home"><span className="brand-mark">H</span><span>HYPR</span></Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link className={active === "discover" ? "active" : ""} href="/">Discover</Link>
          <Link href="/#following">Following</Link>
          <Link href="/#rooms">Rooms</Link>
          <Link className={active === "protocol" ? "active" : ""} href="/protocol">Protocol</Link>
        </nav>
        <div className="header-actions">
          {message && <span className="wallet-message">{message}</span>}
          <button className="wallet-button" onClick={wallet ? disconnect : connect}>{wallet ? shortAddress(wallet) : "Connect wallet"}<span className={wallet && chainId ? "status-dot" : "status-dot inactive"} /></button>
        </div>
      </div>
    </header>
  );
}
