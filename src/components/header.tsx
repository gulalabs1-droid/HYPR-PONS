"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getEthereum, ROBINHOOD_TESTNET_CHAIN_ID, shortAddress, switchToRobinhoodTestnet } from "@/lib/wallet";
import { discoverWallets, OPEN_WALLET_EVENT, rememberSelectedWallet, setWalletSessionDisconnected, walletErrorMessage } from "@/lib/wallet-discovery";
import { useWalletStatus } from "@/lib/use-wallet-status";
import { WalletPicker } from "./wallet-picker";
import { resetCommunitySession, signInCommunity } from "@/lib/community-client";
import { COMMUNITY_SIGNED_OUT_EVENT, COMMUNITY_UPDATED_EVENT } from "@/lib/growth";

/** `compact` keeps phones to one header row so video starts near the top; the menu opens the links. */
export function Header({ active, compact = false }: { active?: "watch" | "discover" | "protocol" | "following"; compact?: boolean }) {
  const wallet = useWalletStatus();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [member, setMember] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrongChain = Boolean(wallet.account && wallet.chainId !== ROBINHOOD_TESTNET_CHAIN_ID);

  useEffect(() => {
    discoverWallets();
    const open = () => { setMenuOpen(false); setPickerOpen(true); };
    window.addEventListener(OPEN_WALLET_EVENT, open);
    return () => window.removeEventListener(OPEN_WALLET_EVENT, open);
  }, []);

  useEffect(() => {
    // Passkey members have no wallet; read their name from the HYPR session.
    let active = true;
    const load = () => fetch("/api/community/session", { cache: "no-store" }).then(response => response.json()).then((data: { kind?: string; name?: string | null }) => { if (active) setMember(data.kind === "passkey" ? data.name || "Member" : null); }).catch(() => undefined);
    void load();
    window.addEventListener(COMMUNITY_UPDATED_EVENT, load); window.addEventListener(COMMUNITY_SIGNED_OUT_EVENT, load);
    return () => { active = false; window.removeEventListener(COMMUNITY_UPDATED_EVENT, load); window.removeEventListener(COMMUNITY_SIGNED_OUT_EVENT, load); };
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
      rememberSelectedWallet();
      if (Number(await ethereum.request({ method: "eth_chainId" })) !== ROBINHOOD_TESTNET_CHAIN_ID && !await switchToRobinhoodTestnet(ethereum)) {
        setMessage("Your wallet is connected, but not on HYPR’s testnet. Open your wallet to finish switching; no trade was sent.");
      }
      await wallet.refresh();
      // One sign-in: the same free signature unlocks chat, follows sync and creator tools.
      try { await signInCommunity(); window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT)); }
      catch { setMessage("Wallet connected. Sign the free HYPR message when you chat or follow to sync across devices."); }
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
    try { await resetCommunitySession(); window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT)); setMessage("Disconnected from HYPR. To revoke the site’s wallet permission too, use your wallet’s connected-sites settings."); }
    catch { setMessage("Your wallet is disconnected, but HYPR sign-out did not finish. Reconnect or retry before using another wallet."); }
  }

  return <header className={`site-header${compact ? " is-compact" : ""}${navOpen ? " nav-open" : ""}`}>
    <div className="header-inner">
      <Link href="/" className="brand" aria-label="HYPR home"><span className="brand-mark">H</span><span>HYPR</span></Link>
      {compact && <button type="button" className="nav-toggle" aria-expanded={navOpen} aria-controls="main-nav" aria-label={navOpen ? "Close menu" : "Open menu"} onClick={() => setNavOpen(open => !open)}><span aria-hidden="true">{navOpen ? "✕" : "☰"}</span></button>}
      <nav className="main-nav" id="main-nav" aria-label="Main navigation" onClick={() => setNavOpen(false)}>
        <Link className={active === "watch" ? "active" : ""} aria-current={active === "watch" ? "page" : undefined} href="/watch">Watch</Link>
        <Link className={active === "discover" ? "active" : ""} aria-current={active === "discover" ? "page" : undefined} href="/discover">Discover</Link>
        <Link className={active === "following" ? "active" : ""} aria-current={active === "following" ? "page" : undefined} href="/following">Following</Link>
        <Link href="/creators">Create</Link>
        <Link href="/faq">How it works</Link>
      </nav>
      <div className="header-actions" ref={menuRef}>
        <button className={`wallet-button${wrongChain ? " is-warning" : wallet.account ? " is-connected" : ""}`} onClick={() => wallet.account || member ? setMenuOpen(!menuOpen) : setPickerOpen(true)} disabled={busy} aria-expanded={wallet.account || member ? menuOpen : undefined} aria-controls={wallet.account || member ? "wallet-account-panel" : undefined} aria-label={busy ? "Waiting for wallet" : wallet.account ? `Wallet ${shortAddress(wallet.account)}${wrongChain ? ", switch to testnet needed" : ""}` : undefined}>
          <span className={wallet.account && !wrongChain ? "status-dot" : "status-dot inactive"} aria-hidden="true" />
          {busy ? "Check your wallet…" : wallet.account ? `${shortAddress(wallet.account)} ▾` : member ? `👤 ${member} ▾` : "Sign in"}
        </button>
        {menuOpen && !wallet.account && member && <div className="wallet-account-panel" id="wallet-account-panel">
          <strong>Signed in as {member}</strong><p className="accounting-copy">Passkey account · follows sync across your devices.</p>
          <button className="secondary-button" onClick={() => { setMenuOpen(false); setPickerOpen(true); }}>Use a wallet instead</button>
          <button className="claim-link" onClick={async () => { setMenuOpen(false); try { await resetCommunitySession(); setMember(null); window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT)); } catch { setMessage("Sign-out didn’t finish. Try again."); } }}>Sign out</button>
        </div>}
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
    {busy && <div className="wallet-banner" role="status"><span>Check your wallet for a connection or network request. If you don’t see it, open the wallet extension or app.</span></div>}
    {wrongChain && !message && !busy && <div className="wallet-banner"><span>Wallet connected · switch to Robinhood testnet before creating or trading.</span><button className="wallet-switch" onClick={() => void switchNetwork()} disabled={busy}>Switch to testnet</button></div>}
    {message && <div className="wallet-banner" role="status"><span>{message}</span><button onClick={() => setMessage("")} aria-label="Dismiss wallet message">×</button></div>}
    {pickerOpen && <WalletPicker onSelect={() => void connect()} onClose={() => setPickerOpen(false)} onMember={name => { setMember(name); setMessage(`Welcome, ${name}! You’re signed in with your passkey.`); }} />}
  </header>;
}
