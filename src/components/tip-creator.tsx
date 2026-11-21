"use client";
import React, { useState } from "react";
import { parseEther, toHex } from "viem";
import { getEthereum, ROBINHOOD_TESTNET_CHAIN_ID, shortAddress, switchToRobinhoodTestnet } from "@/lib/wallet";
import { OPEN_WALLET_EVENT, walletErrorMessage } from "@/lib/wallet-discovery";
import { getHyprClientConfig } from "@/lib/hypr-client-config";
import { TIP_AMOUNTS } from "@/lib/tips";
import { COMMUNITY_UPDATED_EVENT } from "@/lib/growth";

const config = getHyprClientConfig();

/** Send test ETH straight from your wallet to the creator's wallet, then announce it in chat. */
export function TipCreator({ roomId, creator, creatorName, compact = false }: { roomId: string; creator: string; creatorName: string; compact?: boolean }) {
  const [open, setOpen] = useState(false), [amount, setAmount] = useState<string>(TIP_AMOUNTS[1]);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [hash, setHash] = useState("");
  if (!config.enabled) return null;
  async function announce(txHash: string) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await fetch("/api/community/tip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, hash: txHash }) });
      if (response.ok) { window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT)); return true; }
      if (response.status !== 404) { const data = await response.json() as { error?: string }; throw new Error(data.error || "Tip announcement failed."); }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    return false;
  }
  async function send() {
    const ethereum = getEthereum();
    if (!ethereum) { window.dispatchEvent(new Event(OPEN_WALLET_EVENT)); setNotice("Choose a wallet to send a tip. Watching and chatting stay free."); return; }
    setBusy(true); setNotice(""); setHash("");
    try {
      const [from] = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
      if (!from) throw new Error("No wallet account was returned.");
      if (from.toLowerCase() === creator.toLowerCase()) throw new Error("This is your room—tips come from viewers.");
      if (Number(await ethereum.request({ method: "eth_chainId" })) !== ROBINHOOD_TESTNET_CHAIN_ID && !await switchToRobinhoodTestnet(ethereum)) throw new Error("Switch your wallet to Robinhood Chain testnet to tip.");
      const txHash = await ethereum.request({ method: "eth_sendTransaction", params: [{ from, to: creator, value: toHex(parseEther(amount)), chainId: toHex(ROBINHOOD_TESTNET_CHAIN_ID) }] }) as string;
      if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error("Your wallet didn’t return a transaction. Check its activity before trying again.");
      setHash(txHash); setNotice("Sent! Confirming on the network…");
      setNotice(await announce(txHash) ? `Thanks! ${creatorName} got your tip and the room can see it in chat.` : "Your tip is on its way. The chat shout-out appears once the network confirms it.");
    } catch (error) { setNotice(walletErrorMessage(error)); }
    finally { setBusy(false); }
  }
  return <div className={`tip-creator${compact ? " is-compact" : ""}`}>
    {!open ? <button type="button" className="secondary-button" onClick={() => setOpen(true)} aria-label={`Tip ${creatorName}`}>{compact ? "Tip" : `💸 Tip ${creatorName}`}</button> : <div className="tip-panel">
      <strong>Tip {creatorName}</strong>
      <p>Goes straight from your wallet to theirs ({shortAddress(creator)}). Testnet only—test ETH has no real value. Network fee extra.</p>
      <div className="tip-amounts" role="group" aria-label="Tip amount">{TIP_AMOUNTS.map(value => <button key={value} type="button" aria-pressed={amount === value} onClick={() => setAmount(value)} disabled={busy}>{value} ETH</button>)}</div>
      <div className="tip-actions"><button type="button" className="claim-link" onClick={() => { setOpen(false); setNotice(""); }} disabled={busy}>Cancel</button><button type="button" className="primary-button" onClick={() => void send()} disabled={busy}>{busy ? "Check your wallet…" : `Send ${amount} test ETH`}</button></div>
    </div>}
    {notice && <p className="accounting-copy" role="status">{notice}{hash && <> <a href={`${config.explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction ↗</a></>}</p>}
  </div>;
}
