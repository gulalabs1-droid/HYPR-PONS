import { createPublicClient, http, parseAbi } from "viem";
import { getHyprFactoryAddress, getHyprNetwork, HYPR_NETWORKS } from "./integrations/hypr/constants";
import { launchFromReceipt } from "./launch-receipt";
import { parseAbiItem,toEventSelector,pad } from "viem";
import { HYPR_FACTORY_ABI } from "./integrations/hypr/abi";
import { decodeMarketTrade, orderedTrades, type MarketSnapshot, type MarketTrade } from "./market";

const cache=new Map<string,{expires:number;value:Promise<MarketSnapshot>}>();
export class MarketUnavailable extends Error { constructor(message:string,public status=503){super(message);} }
export function readMarket(token:string,limit=200) {
  const key=`${getHyprNetwork()}:${getHyprFactoryAddress()}:${token.toLowerCase()}:${limit}`;
  const hit=cache.get(key);if(hit&&hit.expires>Date.now()) return hit.value;
  // A bounded per-instance cache coalesces simultaneous viewers; CDN caching is wallet independent.
  if(cache.size>=32)cache.delete(cache.keys().next().value!);
  const value=loadMarket(token,limit).catch(error=>{cache.delete(key);throw error;});
  cache.set(key,{expires:Date.now()+5000,value});return value;
}
async function loadMarket(token:string,limit:number):Promise<MarketSnapshot> {
  const started=Date.now();
  const factory=getHyprFactoryAddress(),network=HYPR_NETWORKS[getHyprNetwork()];
  if(!factory)throw new MarketUnavailable("Chart history is not configured.");
  const origin=network.blockExplorers.default.url;
  // Indexed topic lookup works beyond the short RPC window and does not depend
  // on database credentials. Its result is verified against the actual receipt.
  const query=new URLSearchParams({module:"logs",action:"getLogs",address:factory,topic0:toEventSelector(parseAbiItem(HYPR_FACTORY_ABI[0])),topic1:pad(token as `0x${string}`,{size:32}),topic0_1_opr:"and",fromBlock:"0",toBlock:"latest"});
  const lookup=await fetch(`${origin}/api?${query}`,{cache:"no-store",signal:AbortSignal.timeout(8000)});
  if(!lookup.ok)throw new MarketUnavailable("Launch history is temporarily unavailable.");
  const found=await lookup.json() as {result?:{transactionHash?:string}[]};
  if(!Array.isArray(found.result))throw new MarketUnavailable("Launch history could not be read.");
  if(!found.result.length)throw new MarketUnavailable("This chart requires a native HYPR launch.",404);
  if(found.result.length!==1||!/^0x[0-9a-fA-F]{64}$/.test(found.result[0].transactionHash||""))throw new MarketUnavailable("The chart launch could not be verified.");
  const client=createPublicClient({chain:network,transport:http(process.env.HYPR_RPC_URL||network.rpcUrl,{timeout:8000,retryCount:0})});
  const [chainId,latest,receipt]=await Promise.all([client.getChainId(),client.getBlockNumber(),client.getTransactionReceipt({hash:found.result[0].transactionHash as `0x${string}`})]);
  if(chainId!==network.id)throw new MarketUnavailable("The chart provider is on the wrong network.");
  const launch=launchFromReceipt(receipt,factory);
  if(launch.token.toLowerCase()!==token.toLowerCase())throw new MarketUnavailable("The chart contract could not be verified.");
  const safeBlock=Number(latest>12n?latest-12n:0n);
  if(Number(launch.blockNumber)>safeBlock)throw new MarketUnavailable("Waiting for the launch’s chain confirmations.");
  const phase=Number(await client.readContract({address:launch.curve,abi:parseAbi(["function phase() view returns(uint8)"]),functionName:"phase"}));
  let cursor:Record<string,string>|null=null,complete=false,scannedLogs=0;
  const trades:MarketTrade[]=[];
  for(let page=0;page<Math.ceil(limit/50);page++) {
    const remaining=12000-(Date.now()-started);
    if(remaining<500)break; // Return explicitly partial history instead of an unbounded backfill.
    const query=cursor?`?${new URLSearchParams(cursor)}`:"";
    const response=await fetch(`${origin}/api/v2/addresses/${launch.curve}/logs${query}`,{cache:"no-store",signal:AbortSignal.timeout(Math.min(5000,remaining))});
    if(!response.ok)throw new MarketUnavailable("Trade history is temporarily unavailable. No substitute prices are shown.");
    const body=await response.json() as {items?:unknown[];next_page_params?:Record<string,unknown>|null};
    if(!Array.isArray(body.items)||body.items.length>50)throw new MarketUnavailable("The history provider returned an invalid page.");
    scannedLogs+=body.items.length;
    for(const item of body.items) {const trade=decodeMarketTrade(item,launch.curve,safeBlock);if(trade&&trade.blockNumber>=Number(launch.blockNumber))trades.push(trade);}
    if(!body.next_page_params){complete=true;break;}
    cursor={};
    // Never follow an upstream URL or arbitrary query field.
    for(const field of ["block_number","index","items_count"]) {
      const value=body.next_page_params[field];
      if(value!==undefined){if(!/^\d{1,16}$/.test(String(value)))throw new MarketUnavailable("Invalid history cursor.");cursor[field]=String(value);}
    }
    if(!cursor.block_number||cursor.index===undefined)throw new MarketUnavailable("The history cursor is unavailable.");
  }
  return {token:launch.token,curve:launch.curve,symbol:launch.symbol,chainId:network.id,checkedAt:new Date().toISOString(),safeBlock,confirmationDepth:12,trades:orderedTrades(trades),historyComplete:complete,scannedLogs,limit,source:"robinhood-explorer",phase};
}
