import assert from "node:assert/strict";
import {test} from "node:test";
import {encodeAbiParameters,encodeEventTopics,parseAbiParameters,parseEther} from "viem";
import {decodeMarketTrade,TRADE_EVENT,quotePerToken,orderedTrades,marketCandles,marketPrice,includeFillPrices} from "../src/lib/market";
import {GET} from "../src/app/api/market/route";
const curve=`0x${"1".repeat(40)}`,trader=`0x${"2".repeat(40)}` as const;
function log(buy=true,extra:Record<string,unknown>={}) {
  return {address:{hash:curve},block_number:100,index:2,block_timestamp:"2026-10-12T18:02:31Z",transaction_hash:`0x${"a".repeat(64)}`,
    topics:encodeEventTopics({abi:[TRADE_EVENT],eventName:"TradeExecuted",args:{trader,isBuy:buy}}),
    data:encodeAbiParameters(parseAbiParameters("uint256,uint256,uint256,uint256,uint256,uint256,uint256"),[parseEther("1"),parseEther("10"),parseEther("0.0125"),parseEther("0.003"),parseEther("0.0095"),parseEther("1"),parseEther("100")]),...extra};
}
test("fill markers correctly distinguish buy cost, sell proceeds and fee-exclusive market prices",()=>{
  const buy=decodeMarketTrade(log(true),curve,200)!,sell=decodeMarketTrade(log(false),curve,200)!;
  assert.equal(buy.price,"0.09875");assert.equal(buy.fillPrice,"0.1");assert.equal(buy.walletQuote,parseEther("1").toString());
  assert.equal(sell.price,"0.1");assert.equal(sell.fillPrice,"0.09875");assert.equal(sell.walletQuote,parseEther("0.9875").toString());
  assert.equal(buy.trader,trader);assert.equal(buy.id,`0x${"a".repeat(64)}:2`);
});
test("chart divisions preserve small prices and raw amounts without integer overflow",()=>{
  assert.equal(quotePerToken(1n,10n**24n),"0.000000000000000000000001");
  assert.equal(quotePerToken(1000n,1n),"1000");assert.equal(quotePerToken(0n,1n),"0");
  assert.throws(()=>quotePerToken(1n,0n));assert.throws(()=>quotePerToken(-1n,2n));
  assert.notEqual(marketPrice("0.000000000001"),"0");
});
test("actual fee-adjusted fills remain within the visible chart scale",()=>{
  const buy=decodeMarketTrade(log(true),curve,200)!,sell=decodeMarketTrade(log(false),curve,200)!;
  const bounds=includeFillPrices({minValue:0.099,maxValue:0.0995},[buy,sell]);
  assert.deepEqual(bounds,{minValue:0.09875,maxValue:0.1});
  assert.deepEqual(includeFillPrices({minValue:1,maxValue:2},[]),{minValue:1,maxValue:2});
});
test("chart rejects wrong contracts, malformed identities and missing timestamps; unconfirmed trades are omitted",()=>{
  assert.throws(()=>decodeMarketTrade(log(),`0x${"3".repeat(40)}`,200),/address mismatch/);
  for(const extra of [{index:-1},{block_number:-1},{transaction_hash:"not a hash"},{block_timestamp:"unavailable"}])assert.throws(()=>decodeMarketTrade(log(true,extra),curve,200));
  assert.equal(decodeMarketTrade(log(),curve,99),null);
  assert.equal(decodeMarketTrade(log(true,{topics:[`0x${"0".repeat(64)}`]}),curve,200),null);
});
test("candles deduplicate by transaction/log, preserve chain order and never invent quiet-period candles",()=>{
  const a=decodeMarketTrade(log(),curve,200)!;
  const b={...a,id:"next",blockNumber:101,logIndex:0,time:a.time+1,price:"0.2"};
  const c={...a,id:"later",blockNumber:103,time:a.time+3600,price:"0.05"};
  assert.deepEqual(orderedTrades([c,b,a,a]).map(t=>t.id),[a.id,b.id,c.id]);
  const bars=marketCandles([c,b,a,a],60);assert.equal(bars.length,2);
  assert.equal(bars[0].open,0.09875);assert.equal(bars[0].high,0.2);assert.equal(bars[0].low,0.09875);assert.equal(bars[0].close,0.2);assert.equal(bars[0].volume,2);
  assert.deepEqual(marketCandles([],60),[]);
});
test("chart history API rejects arbitrary destinations, malformed tokens and unbounded page counts before network reads",async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>{assert.fail("invalid chart input reached the network");};
  try {
    for(const query of ["token=https://evil.test",`token=${curve}&limit=1000000`,`token=${curve}&limit=-1`,"token=0x123"]){
      const response=await GET(new Request(`https://hypr.test/api/market?${query}`));assert.equal(response.status,400);assert.equal(response.headers.get("cache-control"),"no-store");
    }
  } finally {globalThis.fetch=original;}
});
