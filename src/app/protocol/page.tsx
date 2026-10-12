import { formatEther } from "viem";
import { Header } from "@/components/header";
import { shortAddress } from "@/lib/wallet";
import { readNativeProtocolSnapshot } from "@/lib/integrations/hypr/indexer";

export const dynamic = "force-dynamic";

function formatEth(value?: bigint) {
  return value === undefined ? "—" : `${formatEther(value)} ETH`;
}

export default async function ProtocolPage() {
  const snapshot = await readNativeProtocolSnapshot();
  const unavailable = snapshot.source !== "native-rpc";
  return <main><Header active="protocol" /><div className="page-shell protocol-shell">
    <section className="protocol-hero"><div className="eyebrow"><span className="pulse" /> TESTNET PROTOCOL</div><h1>HYPR accounting,<br /><em>in the open.</em></h1><p>A read-only view of native HYPR state. Values come from confirmed Robinhood Chain testnet reads and have no economic value.</p></section>
    {unavailable && <div className="data-notice" role="status">{snapshot.source === "unconfigured" ? "Native HYPR factory is not configured; no protocol totals are being invented." : "Native HYPR RPC state is unavailable; totals are withheld until reads succeed."}</div>}
    <section className="protocol-grid" aria-label="Protocol metrics">
      <div className="protocol-card"><span>LAUNCHES IN WINDOW</span><strong>{snapshot.launchCount.toLocaleString()}</strong><small>2,500-block bounded read</small></div>
      <div className="protocol-card"><span>ACTIVE / GRADUATED</span><strong>{snapshot.activeLaunches === undefined ? "—" : `${snapshot.activeLaunches} / ${snapshot.graduatedLaunches}`}</strong><small>Derived from curve phase</small></div>
      <div className="protocol-card"><span>GROSS CURVE VOLUME</span><strong>{formatEth(snapshot.totalTradeVolume)}</strong><small>Confirmed TradeExecuted events</small></div>
      <div className="protocol-card"><span>INDEXED TRADES</span><strong>{snapshot.totalTradeCount === undefined ? "—" : snapshot.totalTradeCount.toLocaleString()}</strong><small>Same bounded window</small></div>
      <div className="protocol-card"><span>CREATOR ACCRUAL</span><strong>{formatEth(snapshot.totalCreatorFees)}</strong><small>Onchain fee ledgers</small></div>
      <div className="protocol-card"><span>HYPR ACCRUAL</span><strong>{formatEth(snapshot.totalProtocolFees)}</strong><small>Onchain fee ledgers</small></div>
    </section>
    <section className="protocol-note"><div><span className="eyebrow">READ BOUNDARY</span><h2>No fake totals.</h2><p>Launches are read through a {snapshot.confirmationDepth.toString()}-block confirmation buffer and bounded RPC chunks. If a required state read is incomplete, the affected aggregate stays unavailable. This page has no claim, withdrawal, or configuration controls.</p></div>{snapshot.factoryAddress && <span className="address-line">Factory {shortAddress(snapshot.factoryAddress)} · chain {snapshot.network === "testnet" ? "46630" : "4663"}</span>}</section>
  </div></main>;
}
