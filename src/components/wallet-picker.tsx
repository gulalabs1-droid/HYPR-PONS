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
  return <Modal title="Choose your wallet" onClose={onClose}>
    <p className="dialog-copy">Watching is free and needs no wallet. Chat uses a free signature; creating and trading use test ETH.</p>
    <div className="wallet-choices">{choices.map((choice) => <button type="button" className="secondary-button" key={choice.id} onClick={() => { selectWallet(choice); onSelect(); }}>{choice.name}<span aria-hidden="true">→</span></button>)}</div>
    {!choices.length && <div className="wallet-help"><strong>No wallet found in this browser</strong><p>On your phone, open HYPR using your EVM wallet’s built-in browser. Ordinary Safari and Chrome do not expose a wallet connection here yet.</p><button type="button" className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Link copied — paste it in your wallet browser" : "Copy this page’s link"}</button><p>On desktop, install a trusted EVM wallet extension, then reload HYPR.</p><a href="https://metamask.io/download" target="_blank" rel="noreferrer" className="claim-link">Get MetaMask from its official site ↗</a></div>}
    <p className="dialog-copy">Choose the wallet you recognize. HYPR never asks for a recovery phrase or private key. Support for Robinhood testnet depends on your wallet.</p>
  </Modal>;
}
