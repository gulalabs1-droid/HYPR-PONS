"use client";

import { useEffect, useState } from "react";
import { discoverWallets, getWalletChoices, selectWallet, WALLETS_DISCOVERED_EVENT, type WalletChoice } from "@/lib/wallet-discovery";
import { Modal } from "./modal";
import { createPasskeyAccount, passkeysSupported, signInWithPasskey } from "@/lib/passkey-client";

export function WalletPicker({ onSelect, onClose, onMember }: { onSelect: () => void; onClose: () => void; onMember?: (name: string) => void }) {
  const [choices, setChoices] = useState<WalletChoice[]>([]);
  const [copied, setCopied] = useState(false);
  const [passkeyOk, setPasskeyOk] = useState(false), [name, setName] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => setPasskeyOk(passkeysSupported()), []);
  async function member(run: () => Promise<{ name: string }>) {
    setBusy(true); setError("");
    try { const result = await run(); onMember?.(result.name); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Passkey sign-in failed."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const update = () => setChoices(getWalletChoices());
    window.addEventListener(WALLETS_DISCOVERED_EVENT, update);
    discoverWallets(); update();
    return () => window.removeEventListener(WALLETS_DISCOVERED_EVENT, update);
  }, []);
  const walletHelp = <>
    <p>On a computer, open HYPR in Brave or Chrome where Phantom is installed and unlocked. Wallet extensions aren’t available in every browser.</p>
    <p>On a phone, open HYPR inside Phantom’s browser. If Phantom is already installed, refresh the page and try again.</p>
    <button type="button" className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Link copied" : "Copy HYPR link"}</button>
    <p><a href="https://phantom.com/download" target="_blank" rel="noreferrer" className="claim-link">Get Phantom from its official site ↗</a></p>
  </>;
  return <Modal title="Sign in to HYPR" onClose={onClose}>
    {passkeyOk && <section className="passkey-signin" aria-label="Sign in without a wallet">
      <strong>No wallet? Use a passkey</strong>
      <p className="dialog-copy">Face ID, Touch ID, Windows Hello or a security key. Follows sync across devices; chat shows your nickname.</p>
      <form onSubmit={event => { event.preventDefault(); void member(() => createPasskeyAccount(name)); }}><input value={name} onChange={event => setName(event.target.value)} maxLength={24} placeholder="Pick a nickname" aria-label="Nickname" autoComplete="nickname" disabled={busy} /><button className="primary-button" disabled={busy || name.trim().length < 2}>{busy ? "Waiting…" : "Create passkey"}</button></form>
      <button type="button" className="claim-link" disabled={busy} onClick={() => void member(signInWithPasskey)}>I already have a passkey</button>
      {error && <p className="live-notice" role="alert">{error}</p>}
    </section>}
    <strong className="wallet-choices-title">Or use a wallet</strong>
    <p className="dialog-copy">Wallets are needed to create rooms, go live, tip and trade test coins.</p>
    <div className="wallet-choices">{choices.map((choice) => <button type="button" className="secondary-button" key={choice.id} onClick={() => { selectWallet(choice); onSelect(); }}>{choice.name}<span aria-hidden="true">→</span></button>)}</div>
    {!choices.length ? <div className="wallet-help"><strong>No wallet found in this browser</strong>{walletHelp}</div> : <details className="wallet-help"><summary>Can’t find Phantom?</summary>{walletHelp}</details>}
    <p className="dialog-copy">Choose the wallet you recognize. HYPR never asks for a recovery phrase or private key. Support for Robinhood testnet depends on your wallet.</p>
  </Modal>;
}
