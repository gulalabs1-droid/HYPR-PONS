import { decodeEventLog, parseAbiItem, type Hex } from "viem";

export const TRADE_CONFIRMED_EVENT = "hypr-trade-confirmed";
export const TRADE_EVENT = parseAbiItem("event TradeExecuted(address indexed trader, bool indexed isBuy, uint256 grossQuoteAmount, uint256 tokenAmount, uint256 fee, uint256 creatorFee, uint256 protocolFee, uint256 realQuoteReserve, uint256 realTokenReserve)");
export type MarketTrade = { id:string; hash:Hex; blockNumber:number; logIndex:number; time:number; trader:string; side:"buy"|"sell"; tokens:string; grossQuote:string; fee:string; walletQuote:string; price:string; fillPrice:string };
export type MarketSnapshot = { token:string; curve:string; symbol:string; chainId:number; checkedAt:string; safeBlock:number; confirmationDepth:number; trades:MarketTrade[]; historyComplete:boolean; scannedLogs:number; limit:number; source:"robinhood-explorer"; phase:number };
export type MarketCandle = { time:number; open:number; high:number; low:number; close:number; volume:number };
export const MARKET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const hashPattern = /^0x[0-9a-fA-F]{64}$/;

/** Fixed point division before chart-only conversion to Number. Both assets have 18 decimals. */
export function quotePerToken(quote:bigint, tokens:bigint) {
  if(quote<0n || tokens<=0n) throw new Error("Invalid execution amounts");
  const scaled=quote*10n**36n/tokens;
  return `${scaled/10n**36n}.${(scaled%10n**36n).toString().padStart(36,"0")}`.replace(/\.?0+$/,"");
}
export function decodeMarketTrade(raw:unknown, curve:string, safeBlock:number):MarketTrade|null {
  if(!raw || typeof raw!=="object") throw new Error("Invalid history response");
  const log=raw as {address?:{hash?:string};topics?:unknown[];data?:string;block_number?:number;block_timestamp?:string;transaction_hash?:string;index?:number};
  if(log.address?.hash?.toLowerCase()!==curve.toLowerCase()) throw new Error("History address mismatch");
  if(!Array.isArray(log.topics) || log.topics[0]?.toString().toLowerCase()!=="0x699c7fbbb1dbc4637ba5aaa9cc981b638ec6c38bd8d72fd00e6bb0b587283aad") return null;
  if(!Number.isSafeInteger(log.block_number)||log.block_number!<0||!Number.isSafeInteger(log.index)||log.index!<0||!hashPattern.test(log.transaction_hash||"")) throw new Error("Invalid trade identity");
  if(log.block_number!>safeBlock) return null;
  const timestamp=Date.parse(log.block_timestamp||"")/1000;
  if(!Number.isFinite(timestamp)||timestamp<=0) throw new Error("Trade time unavailable");
  const decoded=decodeEventLog({abi:[TRADE_EVENT],data:log.data as Hex,topics:log.topics.filter((topic):topic is Hex=>typeof topic==="string") as [Hex,...Hex[]],strict:true});
  const a=decoded.args;
  if(a.tokenAmount<=0n || a.grossQuoteAmount<=0n || a.fee<0n || a.fee>=a.grossQuoteAmount || a.creatorFee+a.protocolFee!==a.fee) throw new Error("Invalid trade amounts");
  const marketQuote=a.isBuy?a.grossQuoteAmount-a.fee:a.grossQuoteAmount;
  const walletQuote=a.isBuy?a.grossQuoteAmount:a.grossQuoteAmount-a.fee;
  const price=quotePerToken(marketQuote,a.tokenAmount),fillPrice=quotePerToken(walletQuote,a.tokenAmount);
  if(!Number.isFinite(Number(price))||Number(price)<=0||!Number.isFinite(Number(fillPrice))||Number(fillPrice)<=0) throw new Error("Unsupported price range");
  return {id:`${log.transaction_hash!.toLowerCase()}:${log.index}`,hash:log.transaction_hash as Hex,blockNumber:log.block_number!,logIndex:log.index!,time:Math.floor(timestamp),trader:a.trader.toLowerCase(),side:a.isBuy?"buy":"sell",tokens:a.tokenAmount.toString(),grossQuote:a.grossQuoteAmount.toString(),fee:a.fee.toString(),walletQuote:walletQuote.toString(),price,fillPrice};
}
export function orderedTrades(trades:MarketTrade[]) {
  return [...new Map(trades.map(trade=>[trade.id,trade])).values()].sort((a,b)=>a.blockNumber-b.blockNumber||a.logIndex-b.logIndex);
}
export function marketCandles(trades:MarketTrade[], interval:number):MarketCandle[] {
  const bars=new Map<number,MarketCandle>();
  for(const trade of orderedTrades(trades)) {
    const time=Math.floor(trade.time/interval)*interval,price=Number(trade.price),volume=Number(trade.grossQuote)/1e18;
    const bar=bars.get(time);
    if(bar) {bar.high=Math.max(bar.high,price);bar.low=Math.min(bar.low,price);bar.close=price;bar.volume+=volume;}
    else bars.set(time,{time,open:price,high:price,low:price,close:price,volume});
  }
  return [...bars.values()].sort((a,b)=>a.time-b.time);
}
export function marketPrice(value:string|number) {
  const n=Number(value);return Number.isFinite(n)&&n>0?n.toLocaleString("en-US",{maximumSignificantDigits:8,useGrouping:false}):"—";
}
