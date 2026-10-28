/** Read-only acceptance against real public receipts; no wallets, signatures or transactions. */
import assert from "node:assert/strict";
import {createPublicClient,http,decodeEventLog} from "viem";
import {readMarket} from "../src/lib/market-server";
import {TRADE_EVENT} from "../src/lib/market";
import {getHyprNetwork,HYPR_NETWORKS} from "../src/lib/integrations/hypr/constants";
async function main(){
  const token=process.argv[2]||"0xea3b5d2cf6eacd3dd6241736082b7698e519a675";
  const start=performance.now(),one=readMarket(token),two=readMarket(token);
  assert.equal(one,two,"simultaneous public reads must coalesce");
  const result=await one,coldMs=Math.round(performance.now()-start),warm=performance.now();
  assert.equal(await readMarket(token),result);const warmMs=Number((performance.now()-warm).toFixed(2));
  const network=HYPR_NETWORKS[getHyprNetwork()],client=createPublicClient({chain:network,transport:http(process.env.HYPR_RPC_URL||network.rpcUrl,{timeout:8000,retryCount:0})});
  for(const trade of result.trades.slice(-6)){
    const receipt=await client.getTransactionReceipt({hash:trade.hash});assert.equal(receipt.status,"success");
    const log=receipt.logs.find(item=>item.logIndex===trade.logIndex&&item.address.toLowerCase()===result.curve.toLowerCase());assert.ok(log);
    const event=decodeEventLog({abi:[TRADE_EVENT],data:log.data,topics:log.topics,strict:true});
    assert.equal(event.args.trader.toLowerCase(),trade.trader);assert.equal(event.args.tokenAmount.toString(),trade.tokens);assert.equal(event.args.grossQuoteAmount.toString(),trade.grossQuote);assert.equal(event.args.fee.toString(),trade.fee);
    assert.equal(event.args.isBuy,trade.side==="buy");assert.equal(Number(receipt.blockNumber),trade.blockNumber);
    const block=await client.getBlock({blockNumber:receipt.blockNumber});assert.equal(Number(block.timestamp),trade.time);
  }
  console.log(JSON.stringify({passed:true,readOnly:true,coldMs,warmMs,confirmedTrades:result.trades.length,receiptAndTimestampMatches:Math.min(6,result.trades.length),historyComplete:result.historyComplete,chainId:result.chainId}));
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Market smoke failed");process.exitCode=1;});
