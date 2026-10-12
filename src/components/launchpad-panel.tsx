"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPublicClient, formatEther, http, parseAbi, toHex } from "viem";
import { getEthereum, isRobinhoodChainId, shortAddress } from "@/lib/wallet";
import { HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";
import { getHyprClientConfig } from "@/lib/hypr-client-config";
import { isReviewedHyprV0Config } from "@/lib/hypr-launch-config";
import { waitForTransactionReceipt } from "@/lib/transaction";
import { LaunchPreflightError, launchErrorMessage, prepareNativeLaunch } from "@/lib/launch-preflight";

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

export function LaunchpadPanel() {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [needsFunding, setNeedsFunding] = useState(false);
  const [config, setConfig] = useState<LaunchConfig | null>(null);
  const [configStatus, setConfigStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

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
      setStatus("Install an EVM wallet to create a launch.");
      return;
    }
    setPending(true);
    setStatus("");
    setTxHash("");
    setConfirmed(false);
    setNeedsFunding(false);
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const chainId = Number(await ethereum.request({ method: "eth_chainId" }));
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
      const hash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: factoryAddress, data: prepared.data, gas: toHex(prepared.gas), value: "0x0", chainId: toHex(expectedChainId) }],
      });
      setTxHash(String(hash));
      setStatus("Launch submitted; waiting for confirmation…");
      await waitForTransactionReceipt(ethereum, String(hash), {
        revertedMessage: "launch transaction reverted",
        timeoutMessage: "launch receipt timed out; verify it in the explorer",
      });
      setConfirmed(true);
      setStatus(`Launch confirmed on ${expectedNetworkLabel}. The indexer waits 12 blocks before listing the room.`);
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
        <span className="eyebrow">NATIVE HYPR V0</span>
        <h2>Create a live launch.</h2>
        <p>Fixed supply. One curve. Visible fees. A persistent room from the first transaction.</p>
        {!hasValidFactory && (
          <div className="data-notice" role="status">
            {hyprClientConfig.reason || "Testnet factory address is not configured. This form is disabled and sends no transaction."}
          </div>
        )}
        {hasValidFactory && (
          <span className="launch-config">Factory {shortAddress(factoryAddress)} · chain {expectedChainId}</span>
        )}
        {hasValidFactory && configStatus === "loading" && <div className="data-notice" role="status">Reading immutable launch configuration before enabling creation…</div>}
        {hasValidFactory && configStatus === "error" && <div className="data-notice" role="status">Factory configuration could not be read or does not match the reviewed HYPR V0 economics. Creation is disabled and sends no transaction.</div>}
        {config && <div className="launch-preview" aria-label="Immutable launch configuration">
          <div><span>SUPPLY</span><strong>{formatTokenAmount(config.totalSupply)} tokens</strong></div>
          <div><span>TRADABLE</span><strong>{formatTokenAmount(config.tradableSupply)} tokens</strong></div>
          <div><span>QUOTE / THRESHOLD</span><strong>{formatEther(config.virtualQuoteReserve)} / {formatEther(config.graduationThreshold)} ETH</strong></div>
          <div><span>FEE SPLIT</span><strong>{(Number(config.totalFeeBps) / 100).toFixed(2)}% total</strong><small>{(Number(config.creatorFeeBps) / 100).toFixed(2)}% creator · {(Number(config.protocolFeeBps) / 100).toFixed(2)}% HYPR</small></div>
          <div><span>PROTOCOL RECIPIENT</span><strong>{shortAddress(config.protocolRecipient)}</strong></div>
        </div>}
      </div>
      <form className="launchpad-form" onSubmit={createLaunch}>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder="Your community" disabled={!hasValidFactory || pending} /></label>
        <label>Symbol<input value={symbol} onChange={(event) => setSymbol(event.target.value)} maxLength={10} placeholder="HYPR" disabled={!hasValidFactory || pending} /></label>
        <button className="primary-button" type="submit" disabled={!hasValidFactory || !config || pending}>{pending ? "Waiting for wallet…" : configStatus === "loading" ? "Reading config…" : "Create launch ↗"}</button>
        {status && <span className="launch-status" role="status">
          {status}
          {needsFunding && <a href="https://faucet.testnet.chain.robinhood.com" target="_blank" rel="noreferrer"> Get free Robinhood test ETH ↗</a>}
          {txHash && <a href={`${explorerUrl}/tx/${txHash}`} target="_blank" rel="noreferrer"> View explorer ↗</a>}
          {confirmed && <Link href="/"> Refresh Discover ↗</Link>}
        </span>}
      </form>
    </section>
  );
}
