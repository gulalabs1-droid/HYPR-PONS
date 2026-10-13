"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPublicClient, formatEther, http, parseAbi, toHex } from "viem";
import { getEthereum, isRobinhoodChainId, shortAddress, switchToRobinhoodTestnet } from "@/lib/wallet";
import { HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";
import { getHyprClientConfig } from "@/lib/hypr-client-config";
import { isReviewedHyprV0Config } from "@/lib/hypr-launch-config";
import { LaunchPreflightError, launchErrorMessage, prepareNativeLaunch } from "@/lib/launch-preflight";
import { checkLaunchProgress, launchStorageKey, parseSavedLaunch, type LaunchProgress, type SubmittedLaunch } from "@/lib/launch-recovery";

const FACTORY_CONFIG_ABI = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function tradableSupply() view returns (uint256)",
  "function virtualQuoteReserve() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
  "function totalFeeBps() view returns (uint256)",
  "function creatorFeeBps() view returns (uint256)",
  "function protocolFeeBps() view returns (uint256)",
  "function protocolRecipient() view returns (address)",
]);
const hyprClientConfig = getHyprClientConfig();
const factoryAddress = process.env.NEXT_PUBLIC_HYPR_FACTORY_ADDRESS?.trim() || "";
const expectedChainId = hyprClientConfig.chainId;
const expectedNetworkLabel = hyprClientConfig.networkLabel;
const explorerUrl = hyprClientConfig.explorerUrl;
const hasValidFactory = hyprClientConfig.enabled && /^0x[a-fA-F0-9]{40}$/.test(factoryAddress);
type LaunchConfig = {
  totalSupply: bigint;
  tradableSupply: bigint;
  virtualQuoteReserve: bigint;
  graduationThreshold: bigint;
  totalFeeBps: bigint;
  creatorFeeBps: bigint;
  protocolFeeBps: bigint;
  protocolRecipient: `0x${string}`;
};

function formatTokenAmount(value: bigint) {
  const whole = formatEther(value).split(".")[0];
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function LaunchResultCard({ submission, progress, notice, onCheck, onNew }: { submission: SubmittedLaunch; progress: LaunchProgress | null; notice: string; onCheck: () => void; onNew: () => void }) {
  const ready = progress?.status === "ready";
  const failed = progress?.status === "failed";
  const created = progress && ["confirming", "indexing", "ready"].includes(progress.status);
  return <div className={`launch-result ${ready ? "is-ready" : ""}`} role="status" aria-live="polite">
    <span className="eyebrow">{ready ? "✓ ROOM READY" : failed ? "TRANSACTION REVERTED" : created ? "✓ COIN CREATED" : "TRANSACTION SENT"}</span>
    <h3>{ready ? "Your coin has a home." : failed ? "This coin wasn’t created." : created ? "Your coin is created." : "Waiting for confirmation…"}</h3>
    <p>{ready ? `Your ${progress.name || submission.name} room is ready. Open it to trade or start your creator broadcast.` : failed ? "The network reverted this transaction. Check the details before trying again." : progress?.status === "indexing" ? "We’re preparing your room. Your coin already exists—don’t create it again." : "We’re confirming your launch and preparing its room automatically. You can refresh safely; we’ll recover this transaction."}</p>
    {!ready && !failed && <ol className="launch-steps"><li className="done">Wallet approval complete</li><li className={created ? "done" : ""}>{created ? "Coin created on testnet" : "Confirming transaction"}</li><li>{progress?.status === "confirming" ? `Preparing room · ${Math.min(progress.confirmations || 0, progress.requiredConfirmations || 12)} / ${progress.requiredConfirmations || 12} confirmations` : "Preparing your room"}</li></ol>}
    {ready && <a className="primary-button launch-room-link" href={progress.roomUrl!}>Open your room →</a>}
    {notice && <p className="launch-recovery-notice">{notice}</p>}
    <div className="launch-result-actions"><a href={`${explorerUrl}/tx/${submission.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>{!ready && <button type="button" onClick={onCheck}>Check again</button>}{(ready || failed) && <button type="button" onClick={onNew}>Create another coin</button>}</div>
    <small>Robinhood testnet · test assets only. Opening the room does not turn on your camera.</small>
  </div>;
}

export function LaunchpadPanel() {
  const router = useRouter();
  const creationStarted = useRef(false);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState<"checking" | "wallet">("checking");
  const [submission, setSubmission] = useState<SubmittedLaunch | null>(null);
  const [progress, setProgress] = useState<LaunchProgress | null>(null);
  const [checkVersion, setCheckVersion] = useState(0);
  const [needsFunding, setNeedsFunding] = useState(false);
  const [needsWallet, setNeedsWallet] = useState(false);
  const [config, setConfig] = useState<LaunchConfig | null>(null);
  const [configStatus, setConfigStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!hasValidFactory) return;
    const ethereum = getEthereum();
    if (!ethereum) return;
    let cancelled = false;
    let recoveredWallet = "";
    async function recover() {
      try {
        const accounts = await ethereum!.request({ method: "eth_accounts" }) as string[];
        const chainId = Number(await ethereum!.request({ method: "eth_chainId" }));
        const creator = accounts[0];
        if (!creator || chainId !== expectedChainId) { recoveredWallet = ""; return; }
        if (recoveredWallet === creator.toLowerCase()) return;
        recoveredWallet = creator.toLowerCase();
        let saved: SubmittedLaunch | null = null;
        try { saved = parseSavedLaunch(window.localStorage.getItem(launchStorageKey(factoryAddress, creator)), factoryAddress, creator); } catch { /* Storage is optional. */ }
        if (!saved) {
          // Recover launches made before browser recovery existed; no wallet prompt or signing.
          const response = await fetch("/api/protocol/launches", { cache: "no-store" });
          if (!response.ok) return;
          const data = await response.json() as { launches?: Array<{ creator: string; transactionHash: string; blockNumber: string; name: string; symbol: string }> };
          const latest = data.launches?.filter((launch) => launch.creator.toLowerCase() === creator.toLowerCase() && /^(0|[1-9][0-9]*)$/.test(launch.blockNumber)).sort((a, b) => BigInt(a.blockNumber) > BigInt(b.blockNumber) ? -1 : 1)[0];
          if (latest) saved = parseSavedLaunch(JSON.stringify({ hash: latest.transactionHash, creator, chainId, factory: factoryAddress, name: latest.name, symbol: latest.symbol }), factoryAddress, creator);
        }
        if (!cancelled && saved && !creationStarted.current) setSubmission((current) => current || saved);
      } catch { /* A recovery lookup failure must not fabricate a previous launch. */ }
    }
    void recover();
    ethereum.on?.("accountsChanged", recover);
    ethereum.on?.("chainChanged", recover);
    return () => { cancelled = true; ethereum.removeListener?.("accountsChanged", recover); ethereum.removeListener?.("chainChanged", recover); };
  }, []);

  useEffect(() => {
    if (!submission) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    let attempts = 0;
    setProgress(null);
    setStatus("");
    async function check() {
      attempts += 1;
      try {
        const next = await checkLaunchProgress(submission!, fetch, abort.signal);
        if (cancelled) return;
        setProgress(next);
        setStatus("");
        if (next.status === "ready") { router.refresh(); return; }
        if (next.status === "failed") return;
      } catch (error) {
        if (cancelled) return;
        setStatus(error instanceof Error ? error.message : "Room setup is taking longer. Check again; don’t create another coin.");
      }
      if (attempts < 48 && !cancelled) timer = setTimeout(check, 2500);
      else if (!cancelled) setStatus("Your transaction is saved. Room setup is taking longer than usual—use Check again, not Create another coin.");
    }
    void check();
    return () => { cancelled = true; abort.abort(); if (timer) clearTimeout(timer); };
  }, [submission, checkVersion, router]);

  useEffect(() => {
    if (!hasValidFactory) {
      setConfig(null);
      setConfigStatus("idle");
      return undefined;
    }
    let cancelled = false;
    setConfig(null);
    setConfigStatus("loading");
    const network = HYPR_NETWORKS.testnet;
    const client = createPublicClient({ chain: network, transport: http(network.rpcUrl) });
    const address = factoryAddress as `0x${string}`;
    Promise.all([
      client.readContract({ address, abi: FACTORY_CONFIG_ABI, functionName: "totalSupply" }),
      client.readContract({ address, abi: FACTORY_CONFIG_ABI, functionName: "tradableSupply" }),
      client.readContract({ address, abi: FACTORY_CONFIG_ABI, functionName: "virtualQuoteReserve" }),
      client.readContract({ address, abi: FACTORY_CONFIG_ABI, functionName: "graduationThreshold" }),
      client.readContract({ address, abi: FACTORY_CONFIG_ABI, functionName: "totalFeeBps" }),
      client.readContract({ address, abi: FACTORY_CONFIG_ABI, functionName: "creatorFeeBps" }),
      client.readContract({ address, abi: FACTORY_CONFIG_ABI, functionName: "protocolFeeBps" }),
      client.readContract({ address, abi: FACTORY_CONFIG_ABI, functionName: "protocolRecipient" }),
    ]).then(([totalSupply, tradableSupply, virtualQuoteReserve, graduationThreshold, totalFeeBps, creatorFeeBps, protocolFeeBps, protocolRecipient]) => {
      if (cancelled) return;
      const nextConfig = { totalSupply, tradableSupply, virtualQuoteReserve, graduationThreshold, totalFeeBps, creatorFeeBps, protocolFeeBps, protocolRecipient };
      if (!isReviewedHyprV0Config(nextConfig)) {
        setConfig(null);
        setConfigStatus("error");
        return;
      }
      setConfig(nextConfig);
      setConfigStatus("ready");
    }).catch(() => {
      if (!cancelled) setConfigStatus("error");
    });
    return () => { cancelled = true; };
  }, []);

  async function createLaunch(event: React.FormEvent) {
    event.preventDefault();
    if (submission || pending) return;
    if (!hasValidFactory) return;
    if (!config) {
      setStatus(configStatus === "loading" ? "Reading the factory configuration first." : "Factory configuration is unavailable; no transaction was sent.");
      return;
    }
    if (name.trim().length < 2 || symbol.trim().length < 2) {
      setStatus("Enter a name and symbol with at least 2 characters.");
      return;
    }
    const ethereum = getEthereum();
    if (!ethereum) {
      setNeedsWallet(true);
      setStatus("No browser wallet found. Install an EVM wallet to create a launch.");
      return;
    }
    setPending(true);
    creationStarted.current = true;
    setStage("checking");
    setStatus("");
    setNeedsFunding(false);
    setNeedsWallet(false);
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      let chainId = Number(await ethereum.request({ method: "eth_chainId" }));
      if (chainId !== expectedChainId) {
        setStatus(`Asking your wallet to switch to ${expectedNetworkLabel}…`);
        if (await switchToRobinhoodTestnet(ethereum)) chainId = Number(await ethereum.request({ method: "eth_chainId" }));
      }
      if (!isRobinhoodChainId(chainId) || chainId !== expectedChainId) {
        setStatus(`Switch your wallet to ${expectedNetworkLabel} first.`);
        return;
      }
      const from = accounts[0];
      if (!from) {
        setStatus("No wallet account was returned.");
        return;
      }
      setStatus("Checking your testnet balance and simulating the launch; no transaction sent yet…");
      const network = HYPR_NETWORKS.testnet;
      const client = createPublicClient({ chain: network, transport: http(network.rpcUrl) });
      const prepared = await prepareNativeLaunch(client, from as `0x${string}`, factoryAddress as `0x${string}`, name, symbol);
      // Do not submit using an account/network that changed during the public-RPC checks.
      const latestAccounts = await ethereum.request({ method: "eth_accounts" }) as string[];
      const latestChainId = Number(await ethereum.request({ method: "eth_chainId" }));
      if (latestAccounts[0]?.toLowerCase() !== from.toLowerCase() || latestChainId !== expectedChainId) {
        throw new LaunchPreflightError("Your wallet account or network changed during the checks. Reconnect on Robinhood testnet and try again. No transaction was sent.");
      }
      setStatus("Balance and simulation passed. Review the testnet transaction in your wallet…");
      setStage("wallet");
      const hash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: factoryAddress, data: prepared.data, gas: toHex(prepared.gas), value: "0x0", chainId: toHex(expectedChainId) }],
      });
      if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("The wallet returned no valid transaction link. Check wallet Activity before retrying; no launch was confirmed.");
      const submitted = { hash, creator: from, chainId: expectedChainId, factory: factoryAddress, name: name.trim(), symbol: symbol.trim().replace(/^\$+/, "").toUpperCase() };
      try { window.localStorage.setItem(launchStorageKey(factoryAddress, from), JSON.stringify(submitted)); } catch { /* Receipt recovery also works through the server's confirmed launch history. */ }
      setSubmission(submitted);
      setStatus("");
      setName("");
      setSymbol("");
    } catch (error) {
      setNeedsFunding(error instanceof LaunchPreflightError && error.needsFunding);
      setStatus(launchErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <section id="launch" className="launchpad-panel">
      <div className="launchpad-copy">
        <span className="eyebrow">CREATE ON HYPR · TESTNET</span>
        <h2>Your coin. Your community.</h2>
        <p>Name your coin, approve it in your wallet, then open your room. Trading and native creator streaming stay inside HYPR.</p>
        <p className="launch-testnet-note">You’re testing with free test ETH—not launching a real-money coin. Going live is a separate step.</p>
        {!hasValidFactory && (
          <div className="data-notice" role="status">
            {hyprClientConfig.reason || "Testnet factory address is not configured. This form is disabled and sends no transaction."}
          </div>
        )}
        {hasValidFactory && configStatus === "loading" && <div className="data-notice" role="status">Reading immutable launch configuration before enabling creation…</div>}
        {hasValidFactory && configStatus === "error" && <div className="data-notice" role="status">Factory configuration could not be read or does not match the reviewed HYPR V0 economics. Creation is disabled and sends no transaction.</div>}
        {config && <details className="launch-details"><summary>Supply, fees &amp; technical details</summary><span className="launch-config">Factory {shortAddress(factoryAddress)} · chain {expectedChainId}</span><div className="launch-preview" aria-label="Immutable launch configuration">
          <div><span>SUPPLY</span><strong>{formatTokenAmount(config.totalSupply)} tokens</strong></div>
          <div><span>TRADABLE</span><strong>{formatTokenAmount(config.tradableSupply)} tokens</strong></div>
          <div><span>QUOTE / THRESHOLD</span><strong>{formatEther(config.virtualQuoteReserve)} / {formatEther(config.graduationThreshold)} ETH</strong></div>
          <div><span>FEE SPLIT</span><strong>{(Number(config.totalFeeBps) / 100).toFixed(2)}% total</strong><small>{(Number(config.creatorFeeBps) / 100).toFixed(2)}% creator · {(Number(config.protocolFeeBps) / 100).toFixed(2)}% HYPR</small></div>
          <div><span>PROTOCOL RECIPIENT</span><strong>{shortAddress(config.protocolRecipient)}</strong></div>
        </div></details>}
      </div>
      {submission ? <LaunchResultCard submission={submission} progress={progress} notice={status} onCheck={() => setCheckVersion((version) => version + 1)} onNew={() => {
        creationStarted.current = true;
        try { window.localStorage.removeItem(launchStorageKey(factoryAddress, submission.creator)); } catch { /* Storage is optional. */ }
        setSubmission(null); setProgress(null); setStatus(""); setName(""); setSymbol("");
      }} /> : <form className="launchpad-form" onSubmit={createLaunch}>
        <label><span className="field-label">Name <small aria-hidden="true">{name.length}/32</small></span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder="Your community" autoComplete="off" disabled={!hasValidFactory || pending} /></label>
        <label><span className="field-label">Symbol <small aria-hidden="true">{symbol.length}/10</small></span><input value={symbol} onChange={(event) => setSymbol(event.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())} maxLength={10} placeholder="HYPR" autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={!hasValidFactory || pending} /></label>
        <span className="launch-form-help">Your symbol is the short ticker, like HYPR. Creation costs a small testnet gas fee — <a href="https://faucet.testnet.chain.robinhood.com" target="_blank" rel="noreferrer">get free test ETH ↗</a></span>
        <button className="primary-button" type="submit" disabled={!hasValidFactory || !config || pending}>{pending ? stage === "checking" ? "Checking your launch…" : "Approve in your wallet…" : configStatus === "loading" ? "Getting ready…" : "Create coin & room →"}</button>
        {status && <span className="launch-status" role="status">
          {status}
          {needsFunding && <a href="https://faucet.testnet.chain.robinhood.com" target="_blank" rel="noreferrer"> Get free Robinhood test ETH ↗</a>}
          {needsWallet && <a href="https://metamask.io/download" target="_blank" rel="noreferrer"> Get MetaMask ↗</a>}
        </span>}
      </form>}
    </section>
  );
}
