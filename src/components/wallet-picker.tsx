"use client";

import { useEffect, useState } from "react";
import { discoverWallets, getWalletChoices, selectWallet, WALLETS_DISCOVERED_EVENT, type WalletChoice } from "@/lib/wallet-discovery";
import { Modal } from "./modal";

export function WalletPicker({ onSelect, onClose }: { onSelect: () => void; onClose: () => void }) {
  const [choices, setChoices] = useState<WalletChoice[]>([]);
  const [copied, setCopied] = useState(false);
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
  return <Modal title="Choose your wallet" onClose={onClose}>
    <p className="dialog-copy">Watching is free and needs no wallet. Chat uses a free signature; creating and trading use test ETH.</p>
    <div className="wallet-choices">{choices.map((choice) => <button type="button" className="secondary-button" key={choice.id} onClick={() => { selectWallet(choice); onSelect(); }}>{choice.name}<span aria-hidden="true">→</span></button>)}</div>
    {!choices.length ? <div className="wallet-help"><strong>No wallet found in this browser</strong>{walletHelp}</div> : <details className="wallet-help"><summary>Can’t find Phantom?</summary>{walletHelp}</details>}
    <p className="dialog-copy">Choose the wallet you recognize. HYPR never asks for a recovery phrase or private key. Support for Robinhood testnet depends on your wallet.</p>
  </Modal>;
}
