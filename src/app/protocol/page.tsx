import type { Metadata } from "next";
import { formatEther } from "viem";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { shortAddress } from "@/lib/wallet";
import { getPageProtocolSnapshot } from "@/lib/page-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Protocol accounting",
  description: "A read-only view of native HYPR protocol state on Robinhood Chain testnet.",
};

function formatEth(value?: bigint) {
  return value === undefined ? "—" : `${formatEther(value)} ETH`;
}

export default async function ProtocolPage() {
  const snapshot = await getPageProtocolSnapshot();
  const unavailable = snapshot.source !== "native-rpc";
  const explorer = snapshot.network === "testnet" ? "https://explorer.testnet.chain.robinhood.com" : "https://robinhoodchain.blockscout.com";
  return <main><Header active="protocol" /><div className="page-shell protocol-shell">
    <section className="protocol-hero"><div className="eyebrow"><span className="pulse" /> TESTNET PROTOCOL</div><h1>HYPR accounting,<br /><em>in the open.</em></h1><p>A read-only view of native HYPR state. Values come from confirmed Robinhood Chain testnet reads and have no economic value.</p></section>
    {unavailable && <div className="data-notice" role="status">{snapshot.source === "unconfigured" ? "Native HYPR factory is not configured; no protocol totals are being invented." : "Native HYPR RPC state is unavailable; totals are withheld until reads succeed."}</div>}
    <section className="protocol-grid" aria-label="Protocol metrics">
      <div className="protocol-card"><span>LAUNCHES IN WINDOW</span><strong>{snapshot.launchCount.toLocaleString()}</strong><small>2,500-block bounded read</small></div>
      <div className="protocol-card"><span>ACTIVE / GRADUATED</span><strong>{snapshot.activeLaunches === undefined ? "—" : `${snapshot.activeLaunches} / ${snapshot.graduatedLaunches}`}</strong><small>Derived from curve phase</small></div>
      <div className="protocol-card"><span>GROSS CURVE VOLUME</span><strong>{formatEth(snapshot.totalTradeVolume)}</strong><small>Confirmed TradeExecuted events</small></div>
      <div className="protocol-card"><span>INDEXED TRADES</span><strong>{snapshot.totalTradeCount === undefined ? "—" : snapshot.totalTradeCount.toLocaleString()}</strong><small>Same bounded window</small></div>
      <div className="protocol-card"><span>CREATOR UNCLAIMED</span><strong>{formatEth(snapshot.totalCreatorFees)}</strong><small>Current onchain fee balances, not lifetime earnings</small></div>
      <div className="protocol-card"><span>HYPR UNCLAIMED</span><strong>{formatEth(snapshot.totalProtocolFees)}</strong><small>Current onchain fee balances, not lifetime earnings</small></div>
    </section>
    <section className="protocol-note"><div><span className="eyebrow">READ BOUNDARY</span><h2>No fake totals.</h2><p>Launches are read through a {snapshot.confirmationDepth.toString()}-block confirmation buffer and bounded RPC chunks. If a required state read is incomplete, the affected aggregate stays unavailable. This page has no claim, withdrawal, or configuration controls.</p></div>{snapshot.factoryAddress && <a className="address-line" href={`${explorer}/address/${snapshot.factoryAddress}`} target="_blank" rel="noreferrer">Factory {shortAddress(snapshot.factoryAddress)} · chain {snapshot.network === "testnet" ? "46630" : "4663"} ↗</a>}</section>
    <SiteFooter />
  </div></main>;
}
