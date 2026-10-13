"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getEthereum, isRobinhoodChainId, robinhoodNetworkLabel, shortAddress, switchToRobinhoodTestnet } from "@/lib/wallet";

export function Header({ active }: { active?: "discover" | "protocol" }) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [wrongChain, setWrongChain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [needsWallet, setNeedsWallet] = useState(false);

  async function syncWallet() {
    const ethereum = getEthereum();
    if (!ethereum) return;
    try {
      const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
      const nextChainId = Number(await ethereum.request({ method: "eth_chainId" }));
      if (!accounts[0]) {
        setWallet(null);
        setWrongChain(false);
        return;
      }
      if (!isRobinhoodChainId(nextChainId)) {
        setWallet(null);
        setWrongChain(true);
        setMessage(`Your wallet is on ${robinhoodNetworkLabel(nextChainId)}. Switch to Robinhood Chain testnet (46630) to use HYPR.`);
        return;
      }
      setWallet(accounts[0]);
      setWrongChain(false);
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
      setNeedsWallet(true);
      setMessage("No browser wallet found. Install an EVM wallet such as MetaMask or Rabby, then reload this page.");
      return;
    }
    setBusy(true);
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      let chainId = Number(await ethereum.request({ method: "eth_chainId" }));
      if (!isRobinhoodChainId(chainId) && await switchToRobinhoodTestnet(ethereum)) chainId = Number(await ethereum.request({ method: "eth_chainId" }));
      if (!isRobinhoodChainId(chainId)) {
        setWallet(null);
        setWrongChain(true);
        setMessage("Switch your wallet to Robinhood Chain testnet (46630) to continue.");
        return;
      }
      setWallet(accounts[0] || null);
      setWrongChain(false);
      setMessage("");
    } catch {
      setMessage("Wallet connection cancelled.");
    } finally {
      setBusy(false);
    }
  }

  async function switchNetwork() {
    const ethereum = getEthereum();
    if (!ethereum) return;
    setBusy(true);
    try {
      if (await switchToRobinhoodTestnet(ethereum)) await syncWallet();
      else setMessage("The network switch was cancelled. Choose Robinhood Chain testnet (46630) in your wallet.");
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    setWallet(null);
    setMessage("Disconnected from HYPR. Wallet permissions remain managed by your wallet.");
  }

  const buttonLabel = busy ? "Check your wallet…" : wallet ? shortAddress(wallet) : wrongChain ? "Switch network" : "Connect wallet";

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="HYPR home"><span className="brand-mark">H</span><span>HYPR</span></Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link className={active === "discover" ? "active" : ""} aria-current={active === "discover" ? "page" : undefined} href="/">Discover</Link>
          <Link href="/#launch">Create</Link>
          <Link href="/#discover">Rooms</Link>
          <Link className={active === "protocol" ? "active" : ""} aria-current={active === "protocol" ? "page" : undefined} href="/protocol">Protocol</Link>
        </nav>
        <div className="header-actions">
          <button
            className={`wallet-button${wrongChain && !wallet ? " is-warning" : ""}${wallet ? " is-connected" : ""}`}
            onClick={wallet ? disconnect : wrongChain ? switchNetwork : connect}
            disabled={busy}
            title={wallet ? "Disconnect from HYPR" : undefined}
          >
            <span className={wallet ? "status-dot" : "status-dot inactive"} aria-hidden="true" />
            {buttonLabel}
          </button>
        </div>
      </div>
      {message && (
        <div className="wallet-banner" role="status">
          <span>
            {message}
            {needsWallet && <> <a href="https://metamask.io/download" target="_blank" rel="noreferrer">Get MetaMask ↗</a></>}
          </span>
          <button type="button" onClick={() => { setMessage(""); setNeedsWallet(false); }} aria-label="Dismiss wallet message">×</button>
        </div>
      )}
    </header>
  );
}
