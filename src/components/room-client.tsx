"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { Header } from "./header";
import { LiveLaunchSurface } from "./live-launch-surface";
import { NativeTradePanel } from "./native-trade-panel";
import { SiteFooter } from "./site-footer";
import { shortAddress } from "@/lib/wallet";
import { formatCurveProgress } from "@/lib/curve-progress";
import { formatEthExact } from "@/lib/format";
import { roomHue } from "@/lib/room-display";
import { showPhase } from "@/lib/growth";
import { ShowTime } from "./creator-growth";
import { useLiveLaunches } from "@/lib/use-live-launches";
import { CommunityPanel } from "./community-panel";
import { CreatorGrowth } from "./creator-growth";
import { ShareRoom } from "./share-room";
import { countOnce } from "@/lib/counts";
import { useGrowth } from "@/lib/use-growth";
import { FollowButton } from "./follow-button";
import { RemindMe } from "./remind-me";
import { LOBBY_OPENS_MS, ShowCountdown, useNow } from "./show-countdown";
import { TokenArt, tokenGlyph } from "./token-art";
import { RoomFaq } from "./room-faq";
import { RoomMediaLibrary } from "./room-media-library";
import { useMediaLibrary } from "@/lib/use-media-library";
import { isThrowawayRoom } from "@/lib/discovery";
import { useWalletStatus } from "@/lib/use-wallet-status";
import { NativeMarketChart } from "./native-market-chart";
import { RoomPulse } from "./room-pulse";

// Viewers come for the person: chat and replays first, the optional coin last.
type RoomSection = "chat" | "videos" | "about" | "coin";
const sectionLabels: Record<RoomSection, string> = { chat: "Chat", videos: "Replays", about: "About", coin: "Coin" };
const sectionIcons: Record<RoomSection, React.ReactNode> = {
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />,
  videos: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="m10 9 5 3-5 3Z" /></>,
  about: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  coin: <><circle cx="12" cy="12" r="9" /><path d="m7 14 3-3 3 2 4-5" /></>,
};
// Older shared links used separate chart and trade tabs.
const sectionAliases: Record<string, RoomSection> = { chart: "coin", trade: "coin", coin: "coin", chat: "chat", videos: "videos", replays: "videos", about: "about" };
// Desktop views rearrange the same elements, so the video never remounts and a live connection survives.
type RoomMode = "watch" | "community" | "trade";
const modeLabels: Record<RoomMode, string> = { watch: "Watch", community: "Community", trade: "Trade" };
function feePercent(value?: string) { return value && Number.isFinite(Number(value)) ? `${(Number(value) / 100).toFixed(2)}%` : "—"; }

export function RoomClient({ token: initialToken, source }: { token: Launch; source?: CombinedLaunchDataSource }) {
  const liveData = useLiveLaunches([initialToken], source);
  const token = liveData.launches.find((launch) => launch.address.toLowerCase() === initialToken.address.toLowerCase()) || initialToken;
  const isNative = token.origin === "hypr";
  // Coinless rooms have no contract: no chart, trading or contract links.
  const hasCoin = isNative && !token.coinless;
  const growth = useGrowth(token.address);
  const creatorProfile = growth.state?.rooms[0];
  const [section, setSection] = useState<RoomSection>("chat");
  const [mode, setMode] = useState<RoomMode>("watch");
  const sectionsRef = useRef<HTMLDivElement>(null);
  const userSelectedSection = useRef(false);
  const explorer = isNative && process.env.NEXT_PUBLIC_HYPR_NETWORK !== "mainnet" ? "https://explorer.testnet.chain.robinhood.com" : "https://robinhoodchain.blockscout.com";
  const progress = formatCurveProgress(token.nativeRealQuoteReserve, token.nativeGraduationThreshold, token.curveProgressBps, token.curvePhase);
  const liveNow = token.broadcastStatus === "live";
  const phase = showPhase(creatorProfile?.show || null, liveNow);
  const roomName = creatorProfile?.displayName || token.name;
  const library = useMediaLibrary(token.address, isNative);
  const wallet = useWalletStatus();
  const ownsRoom = Boolean(wallet.account && wallet.account.toLowerCase() === token.deployer.toLowerCase());
  const latestReplay = library.state?.assets.find(asset => asset.published);
  const hasReplays = Boolean(library.state?.assets.length);
  const otherLive = liveData.launches.filter(item => item.address.toLowerCase() !== token.address.toLowerCase() && item.broadcastStatus === "live" && !isThrowawayRoom({ token: item, title: item.name })).map(item => ({ address: item.address, name: item.name }));
  const showStart = creatorProfile?.show?.status === "scheduled" ? Date.parse(creatorProfile.show.startsAt) : NaN;
  const clock = useNow(creatorProfile?.show?.startsAt);
  // Pre-show lobby: 15 minutes before, until an hour after the planned start, while not live.
  const lobbyOpen = !liveNow && Number.isFinite(showStart) && clock >= showStart - LOBBY_OPENS_MS && clock < showStart + 60 * 60_000;

  useEffect(() => { countOnce("room_view", token.address); }, [token.address]);

  useEffect(() => {
    function followSectionLink() {
      const raw = window.location.hash.replace(/^#room-/, "");
      const value = Object.prototype.hasOwnProperty.call(sectionAliases, raw) ? sectionAliases[raw] : null;
      if (!value || (!isNative && value === "videos")) return;
      userSelectedSection.current = true;
      setSection(value);
      if (value === "coin") setMode("trade"); else if (value === "about") setMode("community");
      if (window.matchMedia("(max-width: 760px)").matches) window.requestAnimationFrame(() => sectionsRef.current?.querySelector(`#room-${value === "coin" ? (isNative ? "chart" : "trade") : value}`)?.scrollIntoView({ behavior: "instant", block: "start" }));
    }
    followSectionLink();
    window.addEventListener("hashchange", followSectionLink);
    return () => window.removeEventListener("hashchange", followSectionLink);
  }, [isNative, token.address]);

  function chooseSection(next: RoomSection) {
    userSelectedSection.current = true;
    setSection(next);
    if (next === "coin") setMode("trade");
    window.requestAnimationFrame(() => sectionsRef.current?.querySelector(`#room-${next === "coin" ? (isNative ? "chart" : "trade") : next}`)?.scrollIntoView({ behavior: "instant", block: "start" }));
  }

  return <main className="room-page">
    <Header compact />
    <div className="room-shell room-aura" style={{ "--hue": roomHue(token.address) } as React.CSSProperties}>
      <Link href="/discover" className="back-link">← Discover rooms</Link>
      <section className="room-header room-header-compact">
        <div className="room-token-identity"><span className="room-logo" aria-hidden="true"><TokenArt seed={token.address} glyph={tokenGlyph(token.logo, token.symbol)} /></span><div>
          <span className="eyebrow">Community room</span>
          <h1>{roomName}</h1>
        </div></div>
        <div className="share-controls"><FollowButton roomId={token.address} growth={growth} />{isNative && <RemindMe roomId={token.address} calendarHref={creatorProfile?.show ? `/api/community/calendar?roomId=${token.address}&showId=${creatorProfile.show.id}` : undefined} />}<ShareRoom roomId={token.address} name={roomName} /></div>
      </section>
      <div className="room-modes" role="group" aria-label="Room view">{(Object.keys(modeLabels) as RoomMode[]).filter(key => key !== "trade" || hasCoin).map(key => <button key={key} type="button" aria-pressed={mode === key} onClick={() => setMode(key)}>{key === "trade" ? `Trade $${token.symbol}` : modeLabels[key]}</button>)}</div>
      {(liveNow || creatorProfile?.show) && <div className={`room-now is-${phase}${lobbyOpen ? " is-lobby" : ""}`}>
        <span className="room-now-badge">{liveNow ? <><span className="pulse" />Live now</> : lobbyOpen ? "Pre-show" : phase === "upcoming" ? "Next show" : phase === "awaiting-creator" ? "Starting soon" : "Scheduled"}</span>
        {creatorProfile?.show && <><strong>{creatorProfile.show.title}</strong>{phase === "upcoming" && <ShowCountdown startsAt={creatorProfile.show.startsAt} />}{phase !== "live" && <ShowTime iso={creatorProfile.show.startsAt} />}</>}
        {lobbyOpen && <button type="button" className="room-now-action" onClick={() => chooseSection("chat")}>Chat is open—say hi →</button>}
      </div>}
      {!isNative && <p className="room-safety-note">{token.dataStatus === "demo" ? "Demo room · Sample launch data, not a verified live market." : "Indexed Pons room · Trading availability depends on the launch’s network."}</p>}
      {liveData.error && <p className="live-notice" role="status">{liveData.error} Last successful data is kept visible; it may be out of date.</p>}
      <div className={`room-experience${hasCoin?" has-market":""}`} ref={sectionsRef} data-mode={hasCoin || mode !== "trade" ? mode : "watch"} data-chatting={liveNow && (section === "chat" || section === "coin")}>
        <div className="room-watch" id="room-watch"><LiveLaunchSurface token={token} onOpenChat={() => chooseSection("chat")} showTitle={creatorProfile?.show?.title} nextShow={creatorProfile?.show?.status === "scheduled" ? creatorProfile.show : undefined} latestReplay={latestReplay} otherLive={otherLive} /></div>
        <nav className="room-section-nav" aria-label="Room sections" data-native={isNative}>
          <button type="button" aria-label="Watch broadcast" aria-controls="room-watch" onClick={() => sectionsRef.current?.querySelector("#room-watch")?.scrollIntoView({ behavior: "instant", block: "start" })}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m10 8 6 4-6 4Z" /></svg><span>Watch</span></button>
          {(Object.keys(sectionLabels) as RoomSection[]).filter(key => (isNative || key !== "videos") && (key !== "videos" || hasReplays || ownsRoom) && (key !== "coin" || !token.coinless)).map((key) => <button key={key} type="button" aria-pressed={section === key} aria-controls={key === "coin" ? (isNative ? "room-chart room-trade" : "room-trade") : `room-${key}`} onClick={() => chooseSection(key)}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{sectionIcons[key]}</svg><span>{sectionLabels[key]}</span></button>)}
        </nav>
        {hasCoin&&<section className="room-chart-section" id="room-chart" data-mobile-active={section==="coin"}><NativeMarketChart tokenAddress={token.address} symbol={token.symbol}/></section>}
        {isNative && <section className="room-media-section" id="room-videos" data-mobile-active={section === "videos"}><RoomMediaLibrary roomId={token.address} library={library} showWhenEmpty={ownsRoom} /></section>}
        <section className="room-chat-section" id="room-chat" data-mobile-active={section === "chat"} aria-label="Room chat"><CommunityPanel roomId={token.address} creator={token.deployer} creatorName={creatorProfile?.displayName || token.name} reportsEnabled={growth.state?.enabled === true} chatActive={section === "chat"} /></section>
        {!token.coinless && <section className="room-trade-section" id="room-trade" data-mobile-active={section === "coin"} aria-label={`Trade ${token.symbol}`}>
          {isNative ? <NativeTradePanel curveAddress={token.pool} tokenAddress={token.address} tokenSymbol={token.symbol} /> : <div className="activity-panel"><h2>About this token’s trading</h2><p className="accounting-copy">HYPR’s in-room buy and sell controls currently support native HYPR testnet launches only. This indexed Pons token is not offered for trading here.</p><a className="claim-link" href={`${explorer}/address/${token.address}`} target="_blank" rel="noreferrer">View its contract ↗</a></div>}
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
              <p>Recent activity covers the confirmed 2,500-block scan, not lifetime activity or 24 hours. The price chart shows confirmed curve trades; it does not show USD prices or pool trades.</p>
              <a className="claim-link" href={`${explorer}/address/${token.pool}`} target="_blank" rel="noreferrer">View trading contract ↗</a>
              <p className="accounting-copy">{liveData.updatedAt ? `Live contract data checked ${new Date(liveData.updatedAt).toLocaleTimeString()} · refreshes every 15 seconds while visible.` : "Checking live contract data…"}</p>
            </div>
          </details>}
        </section>}
        <section className="room-about-section" id="room-about" data-mobile-active={section === "about"} aria-label="About this room">
          <div className="activity-panel room-about-card"><span className="eyebrow">About this room</span><h2>{roomName}</h2>
            <p className="accounting-copy">{creatorProfile?.bio || "A permanent place to watch, talk, and come back for the next show."}</p>
            <p className="accounting-copy">{token.coinless ? "Free to watch, chat and follow. Only the creator can broadcast here." : `The room has an optional $${token.symbol} coin. You never need it to watch, chat or follow; only the creator’s wallet can broadcast here.`}</p>
            {isNative && <div className="room-after-live"><h3>What happens after a broadcast?</h3><p>The audio/video session stops, but this same room link, saved chat, follows and token remain. The creator can broadcast here again. Trading depends on the contract’s status, not whether someone is streaming.</p><p>Recording is opt-in. Creators can save up to 10 minutes as a private replay draft and allow 30-second viewer clips. Creator-published recordings appear in Replays & clips. There is no always-on cloud DVR; saved chat is separate from saved video.</p></div>}
            {!token.coinless && <div className="room-contract-links"><a href={`${explorer}/address/${token.address}`} target="_blank" rel="noreferrer">Token {shortAddress(token.address)} ↗</a><a href={`${explorer}/address/${token.deployer}`} target="_blank" rel="noreferrer">Creator {shortAddress(token.deployer)} ↗</a>{token.launchTxHash && <a href={`${explorer}/tx/${token.launchTxHash}`} target="_blank" rel="noreferrer">Creation transaction ↗</a>}</div>}
          </div>
          {isNative && <RoomPulse roomId={token.address} />}
          <RoomFaq compact />
        </section>
        {isNative && <div className="room-creator" id="creator-dashboard"><CreatorGrowth roomId={token.address} creator={token.deployer} live={liveNow} growth={growth} /></div>}
      </div>
      <SiteFooter />
    </div>
  </main>;
}
