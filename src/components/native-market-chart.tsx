"use client";
import React,{useEffect,useMemo,useRef,useState} from "react";
import dynamic from "next/dynamic";
import {formatEther,formatUnits} from "viem";
import {MARKET_ADDRESS,TRADE_CONFIRMED_EVENT,marketPrice,type MarketSnapshot} from "@/lib/market";
import {useWalletStatus} from "@/lib/use-wallet-status";
import {getHyprClientConfig} from "@/lib/hypr-client-config";
import {shortAddress} from "@/lib/wallet";
const Canvas=dynamic(()=>import("./market-canvas"),{ssr:false,loading:()=> <div className="market-loading" role="status">Preparing interactive chart…</div>});
const intervals=[{label:"Trades",seconds:1},{label:"1m",seconds:60},{label:"5m",seconds:300},{label:"1h",seconds:3600}];

export function NativeMarketChart({tokenAddress,symbol}:{tokenAddress:string;symbol:string}) {
  const root=useRef<HTMLElement>(null),visible=useRef(false);
  const [snapshot,setSnapshot]=useState<MarketSnapshot|null>(null),[error,setError]=useState(""),[limit,setLimit]=useState(200),[loading,setLoading]=useState(false);
  const [interval,setIntervalValue]=useState(1),[style,setStyle]=useState<"line"|"candles">("line"),[scope,setScope]=useState<"all"|"wallet">("all");
  const [selected,setSelected]=useState<string|null>(null),[walletForm,setWalletForm]=useState(false),[addressInput,setAddressInput]=useState(""),[tracked,setTracked]=useState(""),[walletError,setWalletError]=useState(""),[receiptNotice,setReceiptNotice]=useState(false),[expanded,setExpanded]=useState(false);
  const wallet=useWalletStatus(),trackedWallet=(tracked||wallet.account||"").toLowerCase(),manual=Boolean(tracked);
  useEffect(()=>{
    let active=true,pending=false,request:AbortController|null=null;
    setSnapshot(null);setSelected(null);setError("");
    async function refresh() {
      if(pending||!visible.current||document.visibilityState==="hidden")return;
      pending=true;setLoading(true);request=new AbortController();
      const timeout=window.setTimeout(()=>request?.abort(),15000);
      try {
        const response=await fetch(`/api/market?token=${tokenAddress.toLowerCase()}&limit=${limit}`,{signal:request.signal});
        const data=await response.json();
        if(!response.ok||!Array.isArray(data.trades)||data.token?.toLowerCase()!==tokenAddress.toLowerCase())throw new Error(data.error||"Chart history unavailable.");
        if(active){setSnapshot(data);setError("");}
      } catch(failure){if(active)setError(failure instanceof Error?failure.message:"The chart could not refresh.");}
      finally {pending=false;window.clearTimeout(timeout);if(active)setLoading(false);}
    }
    const observer=new IntersectionObserver(entries=>{visible.current=entries.some(entry=>entry.isIntersecting);if(visible.current)void refresh();},{rootMargin:"250px"});
    if(root.current)observer.observe(root.current);
    const poll=window.setInterval(()=>void refresh(),5000),reload=()=>void refresh();
    const confirmed=()=>{setReceiptNotice(true);void refresh();};
    document.addEventListener("visibilitychange",reload);window.addEventListener(TRADE_CONFIRMED_EVENT,confirmed);window.addEventListener("hypr-market-retry",reload);
    return()=>{active=false;request?.abort();observer.disconnect();window.clearInterval(poll);document.removeEventListener("visibilitychange",reload);window.removeEventListener(TRADE_CONFIRMED_EVENT,confirmed);window.removeEventListener("hypr-market-retry",reload);};
  },[tokenAddress,limit]);
  useEffect(()=>{setSelected(null);},[trackedWallet]);
  const trades=snapshot?.trades;
  const markers=useMemo(()=>!trades?[]:scope==="wallet"?trades.filter(trade=>trade.trader===trackedWallet):trades,[trades,scope,trackedWallet]);
  const current=trades?.find(trade=>trade.id===selected)||null;
  const rows=[...markers].reverse(),latest=trades?.at(-1),first=trades?.[0];
  const change=first&&latest?(Number(latest.price)/Number(first.price)-1)*100:null;
  const ownTrades=trades?.filter(trade=>trade.trader===trackedWallet)||[];
  const explorer=getHyprClientConfig().explorerUrl;
  function pick(id:string){setSelected(id);}
  return <section className="market-panel" aria-label={`${symbol} price chart and trades`} ref={root}>
    <div className="market-heading"><div><span className="eyebrow">WATCH THE MARKET · TESTNET</span><h2>${symbol} <span>price & trades</span></h2></div><span className={`market-health ${error?"is-stale":""}`}>{error?"Refresh interrupted":snapshot?"Confirmed history":loading?"Loading chain history…":"Chart ready to load"}</span></div>
    <div className="market-price-row"><div><strong>{latest?marketPrice(latest.price):"—"}</strong><span>test ETH / {symbol}</span></div>{change!==null&&<span className={change>=0?"market-positive":"market-negative"}>{change>=0?"+":""}{change.toFixed(2)}%<small>in loaded history · not 24h</small></span>}</div>
    <div className="market-controls"><div className="market-segments" aria-label="Chart interval">{intervals.map(item=><button type="button" key={item.seconds} aria-pressed={interval===item.seconds} onClick={()=>setIntervalValue(item.seconds)}>{item.label}</button>)}</div><div className="market-segments" aria-label="Chart style">{(["line","candles"] as const).map(value=><button type="button" key={value} aria-pressed={style===value} onClick={()=>setStyle(value)}>{value==="line"?"Line":"Candles"}</button>)}</div></div>
    <p className="market-helper">Line/candles: before trading fees. Arrows: fee-adjusted buy/sell fills. Gas excluded.</p>
    {error&&<div role="status" className="market-notice">{error} {snapshot?"Showing the last successful snapshot, not live prices.":"No invented prices are displayed."} <button type="button" onClick={()=>window.dispatchEvent(new Event("hypr-market-retry"))}>Retry</button></div>}
    {snapshot&&trades?.length?<Canvas trades={trades} markers={markers} interval={interval} style={style} selected={selected} onSelect={pick}/>:<div className="market-loading" role="status"><span aria-hidden="true">↗</span><h3>{snapshot?"The first trade starts the chart.":"Reading real trade history."}</h3><p>{snapshot?"No confirmed curve trades yet. Watch for activity or use the trade panel—there’s no requirement to buy.":"Historical prices come from confirmed contract events, not simulated activity."}</p></div>}
    <div className="market-toolbar"><div className="market-segments" aria-label="Trade markers"><button type="button" aria-pressed={scope==="all"} onClick={()=>setScope("all")}>All trades</button><button type="button" aria-pressed={scope==="wallet"} disabled={!trackedWallet} onClick={()=>setScope("wallet")}>{manual?"Tracked wallet":"My trades"}{trackedWallet?` · ${ownTrades.length}`:""}</button></div><button className="claim-link" type="button" onClick={()=>setWalletForm(value=>!value)}>Track a public wallet</button></div>
    {!trackedWallet&&<p className="market-helper">Watching needs no wallet. Connect yours to mark your buys and sells, or track a public address—no signature needed.</p>}
    {trackedWallet&&<p className="market-helper">{manual?"Tracking public wallet":"Connected wallet"} {shortAddress(trackedWallet)} · markers use actual execution prices, including trading fees, excluding gas. <button type="button" onClick={()=>{setScope("wallet");setSelected(ownTrades.at(-1)?.id||null);}}>Show latest trade</button>{manual&&<button type="button" onClick={()=>{setTracked("");setAddressInput("");setScope("all");}}>Clear tracking</button>}</p>}
    {walletForm&&<form className="market-wallet-form" onSubmit={event=>{event.preventDefault();if(!MARKET_ADDRESS.test(addressInput.trim())){setWalletError("Enter a public 0x wallet address—not a private key or recovery phrase.");return;}setTracked(addressInput.trim().toLowerCase());setScope("wallet");setSelected(null);setWalletError("");setWalletForm(false);}}><label>Public wallet address<input value={addressInput} maxLength={42} placeholder="0x… public address only" onChange={event=>setAddressInput(event.target.value)} autoComplete="off" spellCheck={false}/></label><button type="submit" className="secondary-button">Show wallet trades</button>{walletError&&<p role="alert">{walletError}</p>}</form>}
    {receiptNotice&&<p role="status" className="market-notice">Your transaction was confirmed. Its marker appears after 12-block confirmation and explorer indexing. Pending or reverted transactions never become chart markers.</p>}
    {current&&<div className={`market-selected is-${current.side}`} aria-label="Selected trade details"><div><strong>{current.trader===trackedWallet?(manual?"Tracked":"Your"):"Selected"} {current.side}</strong><span>{new Date(current.time*1000).toLocaleString()} · local time</span></div><dl><div><dt>Average fill · approximately</dt><dd>{marketPrice(current.fillPrice)} test ETH / {symbol}</dd></div><div><dt>{current.side==="buy"?"Paid · trading fee included":"Received · trading fee deducted"}</dt><dd>{formatEther(BigInt(current.walletQuote))} test ETH</dd></div><div><dt>Tokens {current.side==="buy"?"bought":"sold"}</dt><dd>{formatUnits(BigInt(current.tokens),18)} {symbol}</dd></div><div><dt>Trading fee · gas excluded</dt><dd>{formatEther(BigInt(current.fee))} test ETH</dd></div></dl><a href={`${explorer}/tx/${current.hash}`} target="_blank" rel="noreferrer">Verify transaction ↗</a></div>}
    <div className="market-trades-heading"><h3>{scope==="wallet"?(manual?"Tracked wallet activity":"Your confirmed activity"):"Recent confirmed trades"}</h3><span>{markers.length}</span></div>
    {snapshot&&scope==="wallet"&&!markers.length&&<p className="market-helper">No trades for this wallet in the loaded history.{!snapshot.historyComplete?" Load more history or check the explorer for older trades.":""} Token transfers, approvals and purchases on other contracts are not curve trades.</p>}
    <div className="market-trades" role="list" aria-label="Confirmed trade history">{rows.slice(0,expanded?500:6).map(trade=><button role="listitem" type="button" key={trade.id} className={`market-trade is-${trade.side} ${selected===trade.id?"is-selected":""}`} onClick={()=>pick(trade.id)} aria-label={`Inspect ${trade.side} at ${marketPrice(trade.fillPrice)} test ETH per token`}><span className="market-trade-side">{trade.side==="buy"?"↗ BUY":"↘ SELL"}<small>{trade.trader===trackedWallet?(manual?"TRACKED":"YOU"):shortAddress(trade.trader)}</small></span><span>{marketPrice(trade.fillPrice)}<small>test ETH / token · fee included</small></span><span>{Number(formatEther(BigInt(trade.walletQuote))).toLocaleString("en-US",{maximumSignificantDigits:6})} ETH<small>{new Date(trade.time*1000).toLocaleTimeString()}</small></span></button>)}</div>
    {rows.length>6&&<button className="claim-link" type="button" onClick={()=>setExpanded(value=>!value)}>{expanded?"Show fewer trades":`Show ${rows.length} loaded trades`}</button>}
    {snapshot&&!snapshot.historyComplete&&<p className="market-helper">History is partial: {snapshot.scannedLogs} recent contract logs loaded. {limit<500?<button type="button" disabled={loading} onClick={()=>setLimit(500)}>Load more history</button>:<a href={`${explorer}/address/${snapshot.curve}`} target="_blank" rel="noreferrer">See older activity in explorer ↗</a>}</p>}
    <details className="market-method"><summary>What the chart and markers mean</summary><p>The line and candles use average curve execution prices before trading fees. Buy/sell arrows sit at each trade’s actual average wallet price: buy cost includes the trading fee; sell proceeds have that fee deducted. Gas is separate. Several trades can share one candle. Selecting a trade shows its exact timestamp and raw token/ETH amounts; this is not profit or loss, a current executable quote, or a USD valuation.</p><p>Only native HYPR bonding-curve trades are shown. {snapshot?.phase===2?"This token has graduated: pool trades are not included here.":"Trades after graduation on a liquidity pool are not included."} Refreshes about every five seconds while visible; chain confirmations and explorer indexing introduce delay. Empty periods are not filled with invented trades.</p></details>
    <div className="market-footnote"><span>{snapshot?`${snapshot.historyComplete?"All indexed curve history":"Partial curve history"} · safe block ${snapshot.safeBlock.toLocaleString()} · 12-block depth`:"Waiting for confirmed chain history"}{snapshot?` · checked ${new Date(snapshot.checkedAt).toLocaleTimeString()}`:""}</span><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™ · Copyright (с) 2025 TradingView, Inc.</a></div>
  </section>;
}
