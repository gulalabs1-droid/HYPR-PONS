"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getEthereum, ROBINHOOD_TESTNET_CHAIN_ID, shortAddress, switchToRobinhoodTestnet } from "@/lib/wallet";
import { discoverWallets, OPEN_WALLET_EVENT, setWalletSessionDisconnected, walletErrorMessage } from "@/lib/wallet-discovery";
import { useWalletStatus } from "@/lib/use-wallet-status";
import { WalletPicker } from "./wallet-picker";

export function Header({ active }: { active?: "discover" | "protocol" | "following" }) {
  const wallet = useWalletStatus();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrongChain = Boolean(wallet.account && wallet.chainId !== ROBINHOOD_TESTNET_CHAIN_ID);

  useEffect(() => {
    discoverWallets();
    const open = () => { setMenuOpen(false); setPickerOpen(true); };
    window.addEventListener(OPEN_WALLET_EVENT, open);
    return () => window.removeEventListener(OPEN_WALLET_EVENT, open);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function outside(event: PointerEvent) { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setMenuOpen(false); }
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [menuOpen]);

  async function connect() {
    setPickerOpen(false); setBusy(true); setMessage("");
    const ethereum = getEthereum();
    try {
      if (!ethereum) { setPickerOpen(true); return; }
      const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
      if (!accounts[0]) throw new Error("No account was returned. Unlock your wallet and try again.");
      setWalletSessionDisconnected(false);
      if (Number(await ethereum.request({ method: "eth_chainId" })) !== ROBINHOOD_TESTNET_CHAIN_ID && !await switchToRobinhoodTestnet(ethereum)) {
        setMessage("Your wallet is connected, but not on HYPR’s testnet. Open your wallet to finish switching; no trade was sent.");
      }
      await wallet.refresh();
    } catch (error) { setMessage(walletErrorMessage(error)); }
    finally { setBusy(false); }
  }

  async function switchNetwork() {
    const ethereum = getEthereum();
    if (!ethereum) { setPickerOpen(true); return; }
    setBusy(true); setMessage("");
    try {
      if (!await switchToRobinhoodTestnet(ethereum)) setMessage("The switch did not finish. Open your wallet and choose Robinhood Chain testnet (46630). If it cannot add this network, choose a compatible EVM wallet.");
      await wallet.refresh();
    } catch (error) { setMessage(walletErrorMessage(error)); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    setMenuOpen(false); setWalletSessionDisconnected(true);
    await fetch("/api/community/session", { method: "DELETE" }).catch(() => undefined);
    setMessage("Disconnected from HYPR. To revoke the site’s wallet permission too, use your wallet’s connected-sites settings.");
  }

  return <header className="site-header">
    <div className="header-inner">
      <Link href="/" className="brand" aria-label="HYPR home"><span className="brand-mark">H</span><span>HYPR</span></Link>
      <nav className="main-nav" aria-label="Main navigation">
        <Link className={active === "discover" ? "active" : ""} aria-current={active === "discover" ? "page" : undefined} href="/">Discover</Link>
        <Link className={active === "following" ? "active" : ""} aria-current={active === "following" ? "page" : undefined} href="/following">Following</Link>
        <Link href="/#launch">Create</Link>
        <Link className={active === "protocol" ? "active" : ""} aria-current={active === "protocol" ? "page" : undefined} href="/protocol">How it works</Link>
      </nav>
      <div className="header-actions" ref={menuRef}>
        <button className={`wallet-button${wrongChain ? " is-warning" : wallet.account ? " is-connected" : ""}`} onClick={() => wallet.account ? setMenuOpen(!menuOpen) : setPickerOpen(true)} disabled={busy} aria-expanded={wallet.account ? menuOpen : undefined} aria-controls={wallet.account ? "wallet-account-panel" : undefined} aria-label={wallet.account ? `Wallet ${shortAddress(wallet.account)}${wrongChain ? ", switch to testnet needed" : ""}` : undefined}>
          <span className={wallet.account && !wrongChain ? "status-dot" : "status-dot inactive"} aria-hidden="true" />
          {busy ? "Check your wallet…" : wallet.account ? `${shortAddress(wallet.account)} ▾` : "Connect wallet"}
        </button>
        {menuOpen && wallet.account && <div className="wallet-account-panel" id="wallet-account-panel">
          <strong>Your wallet</strong><p className="wallet-full-address">{wallet.account}</p>
          <p className={wrongChain ? "wallet-network-warning" : "accounting-copy"}>{wrongChain ? "Switch to Robinhood testnet to create or trade." : "Robinhood Chain testnet · free test assets"}</p>
          {wrongChain && <button className="primary-button" onClick={() => void switchNetwork()} disabled={busy}>Switch to testnet</button>}
          <a className="secondary-button" href="https://faucet.testnet.chain.robinhood.com" target="_blank" rel="noreferrer">Get free test ETH ↗</a>
          <button className="secondary-button" onClick={() => { setMenuOpen(false); setPickerOpen(true); }}>Choose another wallet</button>
          <button className="claim-link" onClick={() => void disconnect()}>Disconnect from HYPR</button>
        </div>}
      </div>
    </div>
    {wrongChain && !message && <div className="wallet-banner"><span>Wallet connected · switch to Robinhood testnet before creating or trading.</span><button className="wallet-switch" onClick={() => void switchNetwork()} disabled={busy}>Switch to testnet</button></div>}
    {message && <div className="wallet-banner" role="status"><span>{message}</span><button onClick={() => setMessage("")} aria-label="Dismiss wallet message">×</button></div>}
    {pickerOpen && <WalletPicker onSelect={() => void connect()} onClose={() => setPickerOpen(false)} />}
  </header>;
}
