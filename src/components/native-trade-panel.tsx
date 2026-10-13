"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, http, decodeFunctionResult, encodeFunctionData, parseEther, parseUnits, formatEther } from "viem";
import { HYPR_CURVE_ABI, HYPR_ERC20_APPROVE_ABI } from "@/lib/integrations/hypr/curve-abi";
import { getEthereum, shortAddress, switchToRobinhoodTestnet } from "@/lib/wallet";
import { getHyprClientConfig } from "@/lib/hypr-client-config";
import { classifyTransactionReceipt, waitForTransactionReceipt } from "@/lib/transaction";
import { ROBINHOOD_TESTNET } from "@/lib/integrations/pons/constants";
import { minimumTradeOutput, reviewIsCurrent, pendingTradeKey, parsePendingTrade, readableTradeAmount } from "@/lib/trade-review";
import { OPEN_WALLET_EVENT, walletErrorMessage, walletSessionDisconnected } from "@/lib/wallet-discovery";
import { useWalletStatus } from "@/lib/use-wallet-status";
import { Modal } from "./modal";

type CurveReadClient = { call(args: { to: `0x${string}`; data: `0x${string}` }): Promise<{ data?: `0x${string}` }> };
const publicCurveReader = createPublicClient({ chain: ROBINHOOD_TESTNET, transport: http(ROBINHOOD_TESTNET.rpcUrl) });

type Props = {
  curveAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  readClient?: CurveReadClient;
};

type Quote = {
  output: bigint;
  fee: bigint;
  input: bigint;
  direction: "buy" | "sell";
};

const TOKEN_DECIMALS = 18;
const hyprClientConfig = getHyprClientConfig();
const EXPECTED_CHAIN_ID = hyprClientConfig.chainId;
const EXPECTED_NETWORK_LABEL = hyprClientConfig.networkLabel;

function hexValue(value: bigint) {
  return `0x${value.toString(16)}` as `0x${string}`;
}

export function NativeTradePanel({ curveAddress, tokenAddress, tokenSymbol, readClient = publicCurveReader }: Props) {
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [phase, setPhase] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [review, setReview] = useState<(Quote & { reviewedAt: number }) | null>(null);
  const [gasEstimate, setGasEstimate] = useState<bigint | null>(null);
  const [hashes, setHashes] = useState<string[]>([]);
  const [unresolvedHash, setUnresolvedHash] = useState<string | null>(null);
  const wallet = useWalletStatus();
  const quoteVersion = useRef(0);
  const gasVersion = useRef(0);
  const pendingRef = useRef(false);
  const invalidateQuote = useCallback(() => { quoteVersion.current++; }, []);

  const parsedAmount = useMemo(() => {
    try {
      return direction === "buy" ? parseEther(amount || "0") : parseUnits(amount || "0", TOKEN_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amount, direction]);

  const readQuote = useCallback(async (): Promise<Quote | null> => {
    if (!hyprClientConfig.enabled) return null;
    const version = ++quoteVersion.current;
    try {
      // Read the curve independently of an amount or connected wallet, so an
      // empty input can become editable. Signing still checks the wallet chain.
      const phaseData = await readClient.call({
        to: curveAddress,
        data: encodeFunctionData({ abi: HYPR_CURVE_ABI, functionName: "phase" }),
      });
      if (version !== quoteVersion.current) return null;
      if (!phaseData.data) throw new Error("empty phase response");
      const phaseValue = decodeFunctionResult({ abi: HYPR_CURVE_ABI, functionName: "phase", data: phaseData.data }) as number;
      setPhase(Number(phaseValue));
      if (Number(phaseValue) !== 0 || parsedAmount <= 0n) {
        setQuote(null);
        return null;
      }
      const data = encodeFunctionData({
        abi: HYPR_CURVE_ABI,
        functionName: direction === "buy" ? "quoteBuy" : "quoteSell",
        args: [parsedAmount],
      });
      const result = await readClient.call({ to: curveAddress, data });
      if (version !== quoteVersion.current) return null;
      if (!result.data) throw new Error("empty quote response");
      const values = decodeFunctionResult({
        abi: HYPR_CURVE_ABI,
        functionName: direction === "buy" ? "quoteBuy" : "quoteSell",
        data: result.data,
      }) as readonly [bigint, bigint, bigint];
      const next = { output: values[0], fee: direction === "buy" ? values[1] : values[2], input: parsedAmount, direction };
      if (next.output <= 0n) { setQuote(null); setStatus("This amount is too small to receive any output. Choose a larger amount before reviewing."); return null; }
      setQuote(next);
      return next;
    } catch {
      if (version !== quoteVersion.current) return null;
      setQuote(null);
      setPhase(null);
      setStatus("We couldn’t read the current price. Check your connection and try again; no trade was sent.");
      return null;
    }
  }, [curveAddress, direction, parsedAmount, readClient]);

  useEffect(() => {
    invalidateQuote();
    setQuote(null);
    const timer = window.setTimeout(() => void readQuote(), 250);
    return () => { invalidateQuote(); window.clearTimeout(timer); };
  }, [readQuote, invalidateQuote]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (!pending && document.visibilityState !== "hidden") void readQuote(); }, 10000);
    return () => window.clearInterval(timer);
  }, [pending, readQuote]);

  useEffect(() => {
    if (pendingRef.current) return;
    let saved = null;
    try { if (wallet.account) saved = parsePendingTrade(window.localStorage?.getItem(pendingTradeKey(curveAddress, wallet.account)) || null); } catch { /* Browsers may disable storage. */ }
    setUnresolvedHash(saved?.hash || null);
    if (saved) { setHashes([saved.hash]); setStatus(`A previous ${saved.kind === "approval" ? "token allowance" : "trade"} needs a receipt check. Check it below before sending another.`); }
  }, [curveAddress, wallet.account]);

  function savePending(hash: string, from: string, kind: "approval" | "trade") {
    setUnresolvedHash(hash);
    try { window.localStorage?.setItem(pendingTradeKey(curveAddress, from), JSON.stringify({ hash, kind })); } catch { /* Explorer link still survives in this mounted screen. */ }
  }
  function clearPending(from: string) {
    setUnresolvedHash(null);
    try { window.localStorage?.removeItem(pendingTradeKey(curveAddress, from)); } catch { /* Storage is optional. */ }
  }

  async function openReview(event: React.FormEvent) {
    event.preventDefault();
    setStatus(""); setGasEstimate(null);
    const gasRequest = ++gasVersion.current;
    if (!quote || quote.input !== parsedAmount || quote.direction !== direction) return;
    setReview({ ...quote, reviewedAt: Date.now() });
    const provider = getEthereum();
    if (provider && wallet.account && wallet.chainId === EXPECTED_CHAIN_ID && direction === "buy") {
      try {
        const data = encodeFunctionData({ abi: HYPR_CURVE_ABI, functionName: "buy", args: [minimumTradeOutput(quote.output), BigInt(Math.floor(Date.now() / 1000) + 300)] });
        const [gas, price] = await Promise.all([
          provider.request({ method: "eth_estimateGas", params: [{ from: wallet.account, to: curveAddress, data, value: hexValue(quote.input) }] }),
          provider.request({ method: "eth_gasPrice" }),
        ]);
        if (gasVersion.current === gasRequest) setGasEstimate(BigInt(gas as string) * BigInt(price as string));
      } catch { /* The wallet supplies the final network fee; never invent an estimate. */ }
    }
  }

  async function trade() {
    const provider = getEthereum();
    if (!provider || !wallet.account) { window.dispatchEvent(new Event(OPEN_WALLET_EVENT)); return; }
    if (pendingRef.current || unresolvedHash) return;
    if (!review || !reviewIsCurrent(review, parsedAmount, direction) || parsedAmount <= 0n) {
      setStatus("This review has expired. Close it and review the latest price before confirming.");
      return;
    }
    pendingRef.current = true; setPending(true);
    setStatus("");
    let tradingAccount: string | null = null;
    let approvalConfirmed = false;
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      const from = accounts[0];
      tradingAccount = from || null;
      let chainId = Number(await provider.request({ method: "eth_chainId" }));
      if (from && chainId !== EXPECTED_CHAIN_ID && await switchToRobinhoodTestnet(provider)) chainId = Number(await provider.request({ method: "eth_chainId" }));
      if (!from || chainId !== EXPECTED_CHAIN_ID) throw new Error(`Switch your wallet to ${EXPECTED_NETWORK_LABEL} first.`);
      if (from.toLowerCase() !== wallet.account.toLowerCase()) throw new Error("Your wallet account changed. Close this review and check the new account before trying again.");
      async function checkSigner() {
        const currentAccounts = await provider!.request({ method: "eth_accounts" }) as string[];
        if (walletSessionDisconnected() || getEthereum() !== provider || currentAccounts[0]?.toLowerCase() !== from.toLowerCase() || Number(await provider!.request({ method: "eth_chainId" })) !== EXPECTED_CHAIN_ID) throw new Error("Your wallet or network changed during the checks. Reconnect on Robinhood testnet and review again.");
      }
      const fresh = await readQuote();
      const minimum = minimumTradeOutput(review.output);
      if (!fresh || fresh.output < minimum) throw new Error("The price changed beyond your 2% limit. Close this review and get a new quote; no trade was sent.");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
      setHashes([]);
      if (direction === "buy") {
        const balance = BigInt(await provider.request({ method: "eth_getBalance", params: [from, "latest"] }) as string);
        if (balance <= parsedAmount || (gasEstimate !== null && balance < parsedAmount + gasEstimate)) throw new Error("Not enough test ETH for this purchase and its network fee. Get free test ETH first.");
        const data = encodeFunctionData({ abi: HYPR_CURVE_ABI, functionName: "buy", args: [minimum, deadline] });
        await checkSigner();
        const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from, to: curveAddress, data, value: hexValue(parsedAmount) }] }) as string;
        setHashes([hash]); savePending(hash, from, "trade");
        setStatus("Buy submitted; waiting for confirmation…");
        await waitForTransactionReceipt(provider, hash);
        clearPending(from);
      } else {
        const balanceData = await provider.request({ method: "eth_call", params: [{ to: tokenAddress, data: `0x70a08231${from.slice(2).padStart(64, "0")}` }, "latest"] });
        if (BigInt(balanceData as string) < parsedAmount) throw new Error(`You don’t have enough ${tokenSymbol} for this sale. Choose a smaller amount; no token allowance or sale was sent.`);
        const approvalData = encodeFunctionData({ abi: HYPR_ERC20_APPROVE_ABI, functionName: "approve", args: [curveAddress, parsedAmount] });
        await checkSigner();
        const approvalHash = await provider.request({ method: "eth_sendTransaction", params: [{ from, to: tokenAddress, data: approvalData }] }) as string;
        setHashes([approvalHash]); savePending(approvalHash, from, "approval");
        setStatus("Step 1 of 2: exact token allowance submitted. Waiting for confirmation…");
        await waitForTransactionReceipt(provider, approvalHash);
        approvalConfirmed = true;
        clearPending(from);
        const afterApproval = await readQuote();
        if (!afterApproval || afterApproval.output < minimum) throw new Error("Your token allowance is confirmed, but the price changed beyond your 2% limit. No sale was sent. Close this review and get a new quote.");
        await checkSigner();
        const data = encodeFunctionData({ abi: HYPR_CURVE_ABI, functionName: "sell", args: [parsedAmount, minimum, BigInt(Math.floor(Date.now() / 1000) + 300)] });
        setStatus("Step 2 of 2: confirm the sale in your wallet.");
        const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from, to: curveAddress, data }] }) as string;
        setHashes([approvalHash, hash]); savePending(hash, from, "trade");
        setStatus("Sell submitted; waiting for confirmation…");
        await waitForTransactionReceipt(provider, hash);
        clearPending(from);
      }
      setStatus("Confirmed. Refreshing the onchain quote…");
      await readQuote();
      setAmount("");
      setReview(null); void wallet.refresh();
    } catch (error) {
      if (tradingAccount && /reverted/i.test(error instanceof Error ? error.message : "")) clearPending(tradingAccount);
      setStatus(`${approvalConfirmed ? "Token allowance confirmed; the sale is not confirmed. Check the transaction links. " : ""}${walletErrorMessage(error)}`);
    } finally {
      pendingRef.current = false; setPending(false);
    }
  }

  const phaseLabel = phase === 2 ? "Graduated" : phase === 1 ? "Moving to pool" : phase === 0 ? "Trading open" : "Checking price…";
  const outputLabel = `${readableTradeAmount(quote?.output || 0n, direction === "buy" ? 6 : 8)} ${direction === "buy" ? tokenSymbol : "test ETH"}`;

  if (!hyprClientConfig.enabled) {
    return (
      <section className="activity-panel trade-panel">
        <div className="panel-heading"><div><span className="eyebrow">NATIVE CURVE</span><h2>Trading locked</h2></div><span className="live-chip">testnet only</span></div>
        <p className="trade-copy">{hyprClientConfig.reason}</p>
      </section>
    );
  }

  return (
    <section className="activity-panel trade-panel">
      <div className="panel-heading"><div><span className="eyebrow">ROOM TOKEN · TESTNET</span><h2>Buy or sell ${tokenSymbol}</h2></div><span className="live-chip">{phaseLabel}</span></div>
      <p className="trade-copy">You’re trading this room’s token—not ownership in HYPR or the creator. Watching is free. Test assets have no real value.</p>
      <p className="trade-fee-note">1.25% trading fee included · 0.30% creator / 0.95% HYPR. Network fees are extra.</p>
      <div className="trade-tabs"><button aria-pressed={direction === "buy"} className={direction === "buy" ? "selected" : ""} disabled={pending} onClick={() => { quoteVersion.current++; setQuote(null); setDirection("buy"); setAmount(""); setStatus(""); }}>Buy</button><button aria-pressed={direction === "sell"} className={direction === "sell" ? "selected" : ""} disabled={pending} onClick={() => { quoteVersion.current++; setQuote(null); setDirection("sell"); setAmount(""); setStatus(""); }}>Sell</button></div>
      <form className="trade-form" onSubmit={openReview}>
        <label>{direction === "buy" ? "You pay (test ETH)" : `You sell (${tokenSymbol})`}<input value={amount} onChange={(event) => { quoteVersion.current++; setQuote(null); setAmount(event.target.value.replace(",", ".")); }} inputMode="decimal" autoComplete="off" placeholder={direction === "buy" ? "0.001" : "1000"} aria-invalid={amount !== "" && parsedAmount <= 0n} disabled={pending || phase !== 0} /></label>
        <div className="trade-quote"><span>You receive (estimated)</span><strong>{quote ? outputLabel : "—"}</strong><small>{quote ? `Included trading fee: ${formatEther(quote.fee)} test ETH` : "Enter an amount to see the current price."}</small></div>
        <div className="trade-presets" aria-label="Quick amounts">
          {(direction === "buy" ? ["0.001", "0.01", "0.05"] : ["100", "1000", "10000"]).map((preset) => (
            <button key={preset} type="button" className={amount === preset ? "selected" : ""} disabled={pending || phase !== 0} onClick={() => { quoteVersion.current++; setQuote(null); setAmount(preset); }}>
              {preset} {direction === "buy" ? "ETH" : tokenSymbol}
            </button>
          ))}
        </div>
        <button className="primary-button" type="submit" disabled={pending || Boolean(unresolvedHash) || phase !== 0 || !quote || quote.input !== parsedAmount || quote.direction !== direction}>{pending ? "Check your wallet…" : direction === "buy" ? "Review purchase →" : "Review sale →"}</button>
        {phase === 0 && !quote && <p className="trade-copy">Enter a positive amount above to review a trade. Nothing is sent until you confirm in your wallet.</p>}
        {phase !== null && phase !== 0 && <p className="trade-copy">Curve trading has ended for this token. This screen does not offer liquidity-pool trades.</p>}
        <a className="claim-link" href="https://faucet.testnet.chain.robinhood.com" target="_blank" rel="noreferrer">Need test ETH? Get it free ↗</a>
      </form>
      {status && <p className="launch-status" role="status">{status}</p>}
      {hashes.map((hash, index) => <a className="transaction-link" key={hash} href={`${hyprClientConfig.explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer">Check transaction {index + 1} in explorer ↗</a>)}
      {unresolvedHash && !pending && <button className="secondary-button" onClick={async () => {
        const provider = getEthereum(); if (!provider) return;
        try { const result = classifyTransactionReceipt(await provider.request({ method: "eth_getTransactionReceipt", params: [unresolvedHash] }));
          if (result === "pending") setStatus("This transaction is still pending. Check the explorer before sending another.");
          else { if (wallet.account) clearPending(wallet.account); setReview(null); setAmount(""); setStatus(result === "confirmed" ? "Transaction confirmed. Check the explorer for its action before starting another trade." : "Transaction failed. Network fees may still apply."); void readQuote(); void wallet.refresh(); }
        } catch (error) { setStatus(walletErrorMessage(error)); }
      }}>Check pending transaction</button>}
      {review && <Modal title={direction === "buy" ? "Review your purchase" : "Review your sale"} onClose={() => { if (!pending) setReview(null); }}>
        <p className="dialog-copy">This is a testnet transaction for ${tokenSymbol}. Test ETH and this test token have no real value.</p>
        <dl className="trade-review-rows">
          <div><dt>{direction === "buy" ? "You pay" : "You sell"}</dt><dd>{formatEther(review.input)} {direction === "buy" ? "test ETH" : tokenSymbol}</dd></div>
          <div><dt>You receive (estimated)</dt><dd>{readableTradeAmount(review.output, direction === "buy" ? 6 : 8)} {direction === "buy" ? tokenSymbol : "test ETH"}</dd></div>
          <div><dt>Minimum receive · about (2% limit)</dt><dd>{readableTradeAmount(minimumTradeOutput(review.output), direction === "buy" ? 6 : 8)} {direction === "buy" ? tokenSymbol : "test ETH"}</dd></div>
          <div><dt>Trading fee (1.25%) · included</dt><dd>{formatEther(review.fee)} test ETH</dd></div>
          <div><dt>Network fee · extra</dt><dd>{gasEstimate !== null ? `About ${formatEther(gasEstimate)} test ETH; wallet confirms final fee` : "Your wallet shows the fee before approval"}</dd></div>
          <div><dt>Wallet</dt><dd>{wallet.account ? shortAddress(wallet.account) : "Not connected"}</dd></div>
          <div><dt>Network</dt><dd>Robinhood Chain testnet (46630)</dd></div>
        </dl>
        <details className="review-exact"><summary>Exact quoted amounts</summary><p>Estimated receive: {formatEther(review.output)} {direction === "buy" ? tokenSymbol : "test ETH"}</p><p>Contract minimum: {formatEther(minimumTradeOutput(review.output))} {direction === "buy" ? tokenSymbol : "test ETH"}</p><p>The display above is shortened. These exact amounts determine the trade’s 2% minimum-output limit.</p></details>
        <p className="dialog-copy">Prices change when people buy and sell. No return is guaranteed. {direction === "sell" && "Selling needs two wallet confirmations: an exact token allowance, then the sale. Each can have a network fee."}</p>
        {status && <p className="live-notice" role="status">{status}</p>}
        {hashes.map((hash, index) => <a className="transaction-link" key={hash} href={`${hyprClientConfig.explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer">Transaction {index + 1} ↗</a>)}
        <button className="primary-button" disabled={pending || Boolean(unresolvedHash)} onClick={() => void trade()}>{pending ? "Check your wallet…" : !wallet.account ? "Connect wallet to continue" : wallet.chainId !== EXPECTED_CHAIN_ID ? "Switch to testnet & continue" : "Confirm in wallet"}</button>
        <button className="secondary-button" disabled={pending || Boolean(unresolvedHash)} onClick={async () => { const fresh = await readQuote(); if (fresh) { setReview({ ...fresh, reviewedAt: Date.now() }); setStatus("Quote refreshed. Check the updated amounts before confirming."); } }}>Refresh review quote</button>
        <button className="secondary-button" disabled={pending} onClick={() => setReview(null)}>Back to amount</button>
      </Modal>}
    </section>
  );
}
