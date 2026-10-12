"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, custom, decodeFunctionResult, encodeFunctionData, parseEther, parseUnits, formatEther } from "viem";
import { HYPR_CURVE_ABI, HYPR_ERC20_APPROVE_ABI } from "@/lib/integrations/hypr/curve-abi";
import { getEthereum } from "@/lib/wallet";
import { getHyprClientConfig } from "@/lib/hypr-client-config";
import { waitForTransactionReceipt } from "@/lib/transaction";

type Props = {
  curveAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
};

type Quote = {
  output: bigint;
  fee: bigint;
};

const TOKEN_DECIMALS = 18;
const SLIPPAGE_BPS = 200n;
const BPS = 10_000n;
const hyprClientConfig = getHyprClientConfig();
const EXPECTED_CHAIN_ID = hyprClientConfig.chainId;
const EXPECTED_NETWORK_LABEL = hyprClientConfig.networkLabel;

function hexValue(value: bigint) {
  return `0x${value.toString(16)}` as `0x${string}`;
}

export function NativeTradePanel({ curveAddress, tokenAddress, tokenSymbol }: Props) {
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [phase, setPhase] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  const parsedAmount = useMemo(() => {
    try {
      return direction === "buy" ? parseEther(amount || "0") : parseUnits(amount || "0", TOKEN_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amount, direction]);

  const readQuote = useCallback(async () => {
    const provider = getEthereum();
    if (!provider || parsedAmount <= 0n) {
      setQuote(null);
      setPhase(null);
      return;
    }
    try {
      const chainId = Number(await provider.request({ method: "eth_chainId" }));
      if (chainId !== EXPECTED_CHAIN_ID) {
        setStatus(`Switch your wallet to ${EXPECTED_NETWORK_LABEL} first.`);
        setQuote(null);
        setPhase(null);
        return;
      }
      const client = createPublicClient({ transport: custom(provider as never) });
      const phaseData = await client.call({
        to: curveAddress,
        data: encodeFunctionData({ abi: HYPR_CURVE_ABI, functionName: "phase" }),
      });
      if (!phaseData.data) throw new Error("empty phase response");
      const phaseValue = decodeFunctionResult({ abi: HYPR_CURVE_ABI, functionName: "phase", data: phaseData.data }) as number;
      setPhase(Number(phaseValue));
      if (phaseValue !== 0) {
        setQuote(null);
        return;
      }
      const data = encodeFunctionData({
        abi: HYPR_CURVE_ABI,
        functionName: direction === "buy" ? "quoteBuy" : "quoteSell",
        args: [parsedAmount],
      });
      const result = await client.call({ to: curveAddress, data });
      if (!result.data) throw new Error("empty quote response");
      const values = decodeFunctionResult({
        abi: HYPR_CURVE_ABI,
        functionName: direction === "buy" ? "quoteBuy" : "quoteSell",
        data: result.data,
      }) as readonly [bigint, bigint, bigint];
      setQuote({ output: values[0], fee: values[1] });
    } catch {
      setQuote(null);
      setPhase(null);
      setStatus("No live quote available. Confirm the room is on the selected Robinhood network.");
    }
  }, [curveAddress, direction, parsedAmount]);

  useEffect(() => {
    const timer = window.setTimeout(() => void readQuote(), 250);
    return () => window.clearTimeout(timer);
  }, [readQuote]);

  async function trade(event: React.FormEvent) {
    event.preventDefault();
    const provider = getEthereum();
    if (!provider || !quote || parsedAmount <= 0n) {
      setStatus("Connect a wallet and enter a valid amount first.");
      return;
    }
    setPending(true);
    setStatus("");
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      const from = accounts[0];
      const chainId = Number(await provider.request({ method: "eth_chainId" }));
      if (!from || chainId !== EXPECTED_CHAIN_ID) throw new Error(`Switch your wallet to ${EXPECTED_NETWORK_LABEL} first.`);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
      const minimum = quote.output * (BPS - SLIPPAGE_BPS) / BPS || 1n;
      if (direction === "buy") {
        const data = encodeFunctionData({ abi: HYPR_CURVE_ABI, functionName: "buy", args: [minimum, deadline] });
        const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from, to: curveAddress, data, value: hexValue(parsedAmount) }] }) as string;
        setStatus("Buy submitted; waiting for confirmation…");
        await waitForTransactionReceipt(provider, hash);
      } else {
        const approvalData = encodeFunctionData({ abi: HYPR_ERC20_APPROVE_ABI, functionName: "approve", args: [curveAddress, parsedAmount] });
        const approvalHash = await provider.request({ method: "eth_sendTransaction", params: [{ from, to: tokenAddress, data: approvalData }] }) as string;
        setStatus("Approve submitted; waiting for confirmation…");
        await waitForTransactionReceipt(provider, approvalHash);
        const data = encodeFunctionData({ abi: HYPR_CURVE_ABI, functionName: "sell", args: [parsedAmount, minimum, deadline] });
        const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from, to: curveAddress, data }] }) as string;
        setStatus("Sell submitted; waiting for confirmation…");
        await waitForTransactionReceipt(provider, hash);
      }
      setStatus("Confirmed. Refreshing the onchain quote…");
      await readQuote();
      setAmount("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Trade cancelled or reverted. No state was assumed.");
    } finally {
      setPending(false);
    }
  }

  const phaseLabel = phase === 2 ? "Graduated" : phase === 1 ? "Graduating" : phase === 0 ? "Live" : "Unknown";
  const outputLabel = direction === "buy" ? `${formatEther(quote?.output || 0n)} ${tokenSymbol}` : `${formatEther(quote?.output || 0n)} ETH`;

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
      <div className="panel-heading"><div><span className="eyebrow">NATIVE CURVE</span><h2>Trade the launch</h2></div><span className="live-chip">{phaseLabel}</span></div>
      <p className="trade-copy">Wallet-signed testnet trade with a 2% minimum-output buffer and a five-minute deadline.</p>
      <div className="trade-tabs"><button className={direction === "buy" ? "selected" : ""} onClick={() => { setDirection("buy"); setAmount(""); setStatus(""); }}>Buy</button><button className={direction === "sell" ? "selected" : ""} onClick={() => { setDirection("sell"); setAmount(""); setStatus(""); }}>Sell</button></div>
      <form className="trade-form" onSubmit={trade}>
        <label>{direction === "buy" ? "ETH input" : `${tokenSymbol} input`}<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder={direction === "buy" ? "0.10" : "1000"} disabled={pending || phase !== 0} /></label>
        <div className="trade-quote"><span>ESTIMATED OUTPUT</span><strong>{quote ? outputLabel : "—"}</strong><small>{quote ? `Fee ${formatEther(quote.fee)} ${direction === "buy" ? "ETH" : "ETH"}` : "Enter an amount for an onchain quote."}</small></div>
        <button className="primary-button" type="submit" disabled={pending || phase !== 0 || !quote}>{pending ? "Confirming…" : direction === "buy" ? "Buy with wallet ↗" : "Sell with wallet ↗"}</button>
        {status && <span className="launch-status" role="status">{status}</span>}
      </form>
    </section>
  );
}
