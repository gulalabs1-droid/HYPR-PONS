"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { Header } from "./header";
import { LiveLaunchSurface } from "./live-launch-surface";
import { NativeTradePanel } from "./native-trade-panel";
import { SiteFooter } from "./site-footer";
import { Toast } from "./toast";
import { shortAddress } from "@/lib/wallet";
import { formatCurveProgress } from "@/lib/curve-progress";
import { formatEthExact } from "@/lib/format";
import { roomHue } from "@/lib/room-display";
import { useLiveLaunches } from "@/lib/use-live-launches";
import { CommunityPanel } from "./community-panel";

type RoomSection = "chat" | "trade" | "about";
const sectionLabels: Record<RoomSection, string> = { chat: "Chat", trade: "Trade", about: "About" };
function feePercent(value?: string) { return value && Number.isFinite(Number(value)) ? `${(Number(value) / 100).toFixed(2)}%` : "—"; }

export function RoomClient({ token: initialToken, source }: { token: Launch; source?: CombinedLaunchDataSource }) {
  const liveData = useLiveLaunches([initialToken], source);
  const token = liveData.launches.find((launch) => launch.address.toLowerCase() === initialToken.address.toLowerCase()) || initialToken;
  const isNative = token.origin === "hypr";
  const [section, setSection] = useState<RoomSection>("chat");
  const [notice, setNotice] = useState("");
  const sectionsRef = useRef<HTMLDivElement>(null);
  const dismissNotice = useCallback(() => setNotice(""), []);
  const explorer = isNative && process.env.NEXT_PUBLIC_HYPR_NETWORK !== "mainnet" ? "https://explorer.testnet.chain.robinhood.com" : "https://robinhoodchain.blockscout.com";
  const progress = formatCurveProgress(token.nativeRealQuoteReserve, token.nativeGraduationThreshold, token.curveProgressBps, token.curvePhase);

  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title: `${token.name} on HYPR`, url }); return; } catch (error) { if ((error as Error)?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); setNotice("Room link copied."); } catch { setNotice("Copy the room URL from your browser to share it."); }
  }

  function chooseSection(next: RoomSection) {
    setSection(next);
    if (window.matchMedia("(max-width: 760px)").matches) window.requestAnimationFrame(() => sectionsRef.current?.querySelector(`#room-${next}`)?.scrollIntoView({ behavior: "instant", block: "start" }));
  }

  return <main className="room-page">
    <Header />
    <div className="room-shell room-aura" style={{ "--hue": roomHue(token.address) } as React.CSSProperties}>
      <Link href="/" className="back-link">← Discover rooms</Link>
      <section className="room-header room-header-compact">
        <div className="room-token-identity"><span className="room-logo" aria-hidden="true">{token.logo}</span><div>
          <span className="eyebrow">{isNative ? "HYPR COMMUNITY ROOM" : "PONS COMMUNITY ROOM"}</span>
          <h1>{token.name} <span>${token.symbol}</span></h1>
        </div></div>
        <button className="secondary-button" onClick={share}>Share room ↗</button>
      </section>
      <p className="room-safety-note">{isNative ? "Testnet preview · Free test assets, not real money. Watch without a wallet." : token.dataStatus === "demo" ? "Demo room · Sample launch data, not a verified live market." : "Indexed Pons room · Trading availability depends on the launch’s network."}</p>
      {liveData.error && <p className="live-notice" role="status">{liveData.error} Last successful data is kept visible; it may be out of date.</p>}
      <div className="room-experience" ref={sectionsRef}>
        <div className="room-watch" id="room-watch"><LiveLaunchSurface token={token} onOpenChat={() => chooseSection("chat")} onShareRoom={() => void share()} /></div>
        <nav className="room-section-nav" aria-label="Room sections">
          {(Object.keys(sectionLabels) as RoomSection[]).map((key) => <button key={key} type="button" aria-pressed={section === key} aria-controls={`room-${key}`} onClick={() => chooseSection(key)}>{sectionLabels[key]}{key === "trade" && <small>${token.symbol}</small>}</button>)}
        </nav>
        <section className="room-chat-section" id="room-chat" data-mobile-active={section === "chat"} aria-label="Room chat"><CommunityPanel roomId={token.address} creator={token.deployer} /></section>
        <section className="room-trade-section" id="room-trade" data-mobile-active={section === "trade"} aria-label={`Trade ${token.symbol}`}>
          {isNative ? <NativeTradePanel curveAddress={token.pool} tokenAddress={token.address} tokenSymbol={token.symbol} /> : <div className="activity-panel"><h2>About this token’s trading</h2><p className="accounting-copy">HYPR’s in-room buy and sell controls currently support native HYPR testnet launches only. This indexed Pons token is not offered for trading here.</p><a className="claim-link" href={`${explorer}/address/${token.address}`} target="_blank" rel="noreferrer">View its contract ↗</a></div>}
        </section>
        <section className="room-about-section" id="room-about" data-mobile-active={section === "about"} aria-label="About this room">
          <div className="activity-panel room-about-card"><span className="eyebrow">ABOUT ${token.symbol}</span><h2>A coin and a community room</h2>
            <p className="accounting-copy">{token.description}</p>
            <p className="accounting-copy">{isNative ? "This ERC-20 token belongs to this launch. It is not company ownership, a promise of income, or a requirement to watch. Only the wallet that created it can broadcast in this room." : "This launch is indexed from Pons. A room listing does not endorse the token or guarantee its value."}</p>
            {isNative && <div className="room-after-live"><h3>What happens after a broadcast?</h3><p>The audio/video session stops, but this same room link, saved chat, follows and token remain. The creator can broadcast here again. Trading depends on the contract’s status, not whether someone is streaming.</p><p>HYPR does not automatically record broadcasts or save video replays. Saved messages are different from saved video.</p></div>}
            <div className="room-contract-links"><a href={`${explorer}/address/${token.address}`} target="_blank" rel="noreferrer">Token {shortAddress(token.address)} ↗</a><a href={`${explorer}/address/${token.deployer}`} target="_blank" rel="noreferrer">Creator {shortAddress(token.deployer)} ↗</a>{token.launchTxHash && <a href={`${explorer}/tx/${token.launchTxHash}`} target="_blank" rel="noreferrer">Creation transaction ↗</a>}</div>
          </div>
          {isNative && <details className="room-details"><summary>Trading details <span>Price rules, fees & live contract data</span></summary>
            <div className="room-details-body">
              <h3>How pricing works</h3><p>Before graduation, the contract sets the price automatically: buying pushes it up and selling pushes it down. The “bonding curve” is that pricing rule—not a chart or a guarantee of profit.</p>
              <dl className="room-accounting-list">
                <div><dt>ETH available for trades</dt><dd>{formatEthExact(token.nativeRealQuoteReserve)}</dd></div>
                <div><dt>Creator fees available</dt><dd>{formatEthExact(token.nativeCreatorFees)}</dd></div>
                <div><dt>HYPR fees available</dt><dd>{formatEthExact(token.nativeProtocolFees)}</dd></div>
                <div><dt>Trading fee · buy and sell</dt><dd>{feePercent(token.nativeTotalFeeBps)} total · {feePercent(token.nativeCreatorFeeBps)} creator / {feePercent(token.nativeProtocolFeeBps)} HYPR</dd></div>
              </dl>
              <p>Fees available means unclaimed fees, not lifetime earnings. Claimed balances return to zero. Trading fees and network fees are different; all values here are testnet assets.</p>
              <h3>Progress toward liquidity-pool trading</h3><strong className="room-progress-value">{progress}</strong><p>{formatEthExact(token.nativeRealQuoteReserve)} of the {formatEthExact(token.nativeGraduationThreshold)} reserve target. Buys add to the reserve after fees; sells reduce it. Reaching the target triggers the contract’s Uniswap v4 migration. This is not a funding goal, a live-stream status, or a return guarantee.</p>
              <dl className="room-accounting-list"><div><dt>Trading status</dt><dd>{token.curvePhase === "Live" ? "Trading open" : token.curvePhase || "Unavailable"}</dd></div><div><dt>Trades in indexed window</dt><dd>{token.nativeTradeCount === undefined ? "Unavailable" : token.nativeTradeCount.toLocaleString()}</dd></div><div><dt>Gross trading volume in that window</dt><dd>{formatEthExact(token.nativeTradeVolume)}</dd></div></dl>
              <p>Recent activity covers the confirmed 2,500-block scan, not lifetime activity or 24 hours. USD prices and historical charts are not available; we do not invent them.</p>
              <a className="claim-link" href={`${explorer}/address/${token.pool}`} target="_blank" rel="noreferrer">View trading contract ↗</a>
              <p className="accounting-copy">{liveData.updatedAt ? `Live contract data checked ${new Date(liveData.updatedAt).toLocaleTimeString()} · refreshes every 15 seconds while visible.` : "Checking live contract data…"}</p>
            </div>
          </details>}
        </section>
      </div>
      <SiteFooter />
    </div>
    <Toast message={notice} onDismiss={dismissNotice} />
  </main>;
}
