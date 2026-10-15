/** Interactive synthetic-only API smoke. Ephemeral key/session stay in process memory and are never printed. */
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { uploadCapturedMedia } from "../src/lib/media-client";
const account=privateKeyToAccount(generatePrivateKey());
const base=(process.argv[2]||"https://hypr-pons.vercel.app").replace(/\/$/,"");
const roomId="0xea3b5d2cf6eacd3dd6241736082b7698e519a675";
let cookie="";
console.log(JSON.stringify({testWallet:account.address,purpose:"synthetic private recording smoke; no funds, camera, microphone, or user wallet"}));
async function request(path:string,body?:unknown) {
  return fetch(`${base}${path}`,{method:body?"POST":"GET",headers:{origin:base,cookie,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
}
async function main() {
for await(const line of createInterface({input:process.stdin})) {
  try {
    const command=JSON.parse(line) as {action:string;id?:string;path?:string;durationSeconds?:number};
    if(command.action==="signin") {
      const challenge=await request("/api/community/session",{wallet:account.address});const message=await challenge.json();
      if(!challenge.ok) throw new Error(`challenge ${challenge.status}`);
      cookie=challenge.headers.get("set-cookie")!.split(";")[0];
      const signature=await account.signMessage({message:message.message});
      const verified=await request("/api/community/session",{signature});if(!verified.ok) throw new Error(`sign-in ${verified.status}`);
      cookie=verified.headers.get("set-cookie")!.split(";")[0];
      console.log(JSON.stringify({signedIn:true,wallet:account.address}));
    } else if(command.action==="upload") {
      if(!command.path||!command.id) throw new Error("path and id required");
      const bytes=await readFile(command.path);
      const authorized=await request("/api/media",{roomId,action:"upload",id:command.id});const upload=await authorized.json();
      if(!authorized.ok) throw new Error(`upload authorization ${authorized.status}: ${upload.error}`);
      const originalFetch=globalThis.fetch, originalWindow=Object.getOwnPropertyDescriptor(globalThis,"window");
      globalThis.fetch=(input,options)=>{
        if(typeof input==="string"&&input.startsWith("/")) return originalFetch(base+input,{...options,headers:{...Object.fromEntries(new Headers(options?.headers)),origin:base,cookie}});
        return originalFetch(input,options);
      };
      Object.defineProperty(globalThis,"window",{configurable:true,value:{dispatchEvent:()=>true}});
      try { await uploadCapturedMedia(roomId,upload,{blob:new Blob([bytes],{type:"video/webm"}),mime:"video/webm",durationSeconds:command.durationSeconds||3},()=>{}); }
      finally { globalThis.fetch=originalFetch;if(originalWindow) Object.defineProperty(globalThis,"window",originalWindow);else Reflect.deleteProperty(globalThis,"window"); }
      const privatePlayback=await request(`/api/media/playback?roomId=${roomId}&id=${command.id}`);const playback=await privatePlayback.json();
      if(!privatePlayback.ok) throw new Error(`private playback ${privatePlayback.status}`);
      const stored=await fetch(playback.url);const received=Buffer.from(await stored.arrayBuffer());
      if(createHash("sha256").update(bytes).digest("hex")!==createHash("sha256").update(received).digest("hex")) throw new Error("downloaded media bytes differ");
      const anonymous=await fetch(`${base}/api/media/playback?roomId=${roomId}&id=${command.id}`);
      const deniedPublish=await request("/api/media",{roomId,action:"publish",id:command.id});
      const retry=await request("/api/media",{roomId,action:"complete",id:command.id,durationSeconds:command.durationSeconds||3});
      console.log(JSON.stringify({uploaded:true,bytes:bytes.length,byteIdenticalPlayback:true,privateOwnerPlayback:privatePlayback.status,anonymousDraftDenied:anonymous.status,nonCreatorPublishDenied:deniedPublish.status,completionRetry:retry.status}));
    } else if(command.action==="exit") break;
    else throw new Error("unknown action");
  } catch(error) { console.log(JSON.stringify({error:error instanceof Error?error.message:String(error)})); }
}
}
void main().catch(() => { console.error("Synthetic smoke failed."); process.exitCode=1; });
