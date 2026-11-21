"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getEthereum, ROBINHOOD_TESTNET_CHAIN_ID, shortAddress, switchToRobinhoodTestnet } from "@/lib/wallet";
import { discoverWallets, OPEN_WALLET_EVENT, rememberSelectedWallet, setWalletSessionDisconnected, walletErrorMessage } from "@/lib/wallet-discovery";
import { useWalletStatus } from "@/lib/use-wallet-status";
import { WalletPicker } from "./wallet-picker";
import { resetCommunitySession, signInCommunity } from "@/lib/community-client";
import { COMMUNITY_SIGNED_OUT_EVENT, COMMUNITY_UPDATED_EVENT } from "@/lib/growth";
import { SideRail } from "./side-rail";

/** `compact` keeps phones to one header row so video starts near the top; the menu opens the links. */
// Phone tab bar: thumb-reachable navigation on every page except rooms (rooms have their own tabs).
const TABS = [
  { key: "home", href: "/", label: "Home", icon: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { key: "watch", href: "/watch", label: "Watch", icon: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm6 3v6l5-3z" },
  { key: "discover", href: "/discover", label: "Discover", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3.5 5.5-2 5-5 2 2-5z" },
  { key: "following", href: "/following", label: "Following", icon: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" },
  { key: "create", href: "/creators", label: "Create", icon: "M12 5v14M5 12h14" },
] as const;

function TabBar({ active }: { active?: string }) {
  return <nav className="tab-bar" aria-label="Sections">
    {TABS.map(tab => <Link key={tab.key} href={tab.href} className={active === tab.key ? "active" : ""} aria-current={active === tab.key ? "page" : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={tab.icon} /></svg><span>{tab.label}</span>
    </Link>)}
  </nav>;
}

export function Header({ active, compact = false }: { active?: "home" | "watch" | "discover" | "protocol" | "following" | "create"; compact?: boolean }) {
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

  return <><header className={`site-header${compact ? " is-compact" : ""}${navOpen ? " nav-open" : ""}`}>
    <div className="header-inner">
      <Link href="/" className="brand" aria-label="HYPR home"><span className="brand-mark">H</span><span>HYPR</span></Link>
      {compact && <button type="button" className="nav-toggle" aria-expanded={navOpen} aria-controls="main-nav" aria-label={navOpen ? "Close menu" : "Open menu"} onClick={() => setNavOpen(open => !open)}><span aria-hidden="true">{navOpen ? "✕" : "☰"}</span></button>}
      <nav className="main-nav" id="main-nav" aria-label="Main navigation" onClick={() => setNavOpen(false)}>
        <Link className={active === "watch" ? "active" : ""} aria-current={active === "watch" ? "page" : undefined} href="/watch">Watch</Link>
        <Link className={active === "discover" ? "active" : ""} aria-current={active === "discover" ? "page" : undefined} href="/discover">Discover</Link>
        <Link className={active === "following" ? "active" : ""} aria-current={active === "following" ? "page" : undefined} href="/following">Following</Link>
        <Link className={active === "create" ? "active" : ""} aria-current={active === "create" ? "page" : undefined} href="/creators">Create</Link>
        <Link href="/faq">How it works</Link>
      </nav>
      <form className="header-search" action="/discover" role="search"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg><input type="search" name="q" maxLength={200} placeholder="Search creators and shows" aria-label="Search creators and shows" /></form>
      <div className="header-actions" ref={menuRef}>
        <Link href="/creators" className="header-golive"><span aria-hidden="true" className="header-golive-dot" />Go live</Link>
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
  </header><SideRail active={active} />{!compact && <TabBar active={active} />}</>;
}
