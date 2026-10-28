import { NextResponse } from "next/server";
import { MARKET_ADDRESS } from "@/lib/market";
import { readMarket, MarketUnavailable } from "@/lib/market-server";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const query=new URL(request.url).searchParams,token=query.get("token")||"",raw=query.get("limit")||"200";
  if(!MARKET_ADDRESS.test(token)||!["50","200","500"].includes(raw))return NextResponse.json({error:"Choose a valid native token and history limit."},{status:400,headers:{"Cache-Control":"no-store"}});
  try {return NextResponse.json(await readMarket(token,Number(raw)),{headers:{"Cache-Control":"public, s-maxage=5, stale-while-revalidate=5"}});}
  catch(error){return NextResponse.json({error:error instanceof MarketUnavailable?error.message:"We couldn’t refresh trade history. No substitute prices are shown."},{status:error instanceof MarketUnavailable?error.status:503,headers:{"Cache-Control":"no-store"}});}
}
