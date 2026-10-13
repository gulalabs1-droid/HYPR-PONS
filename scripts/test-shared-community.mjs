// Uses a new, unfunded test identity, not a user's wallet or server credential.
// The one public test message is soft-hidden by its owner and the test follow is undone.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const base = (process.argv[2] || "https://hypr-pons.vercel.app").replace(/\/$/, "");
const roomId = "0xeA3b5d2Cf6EAcD3dd6241736082b7698E519a675";
const account = privateKeyToAccount(generatePrivateKey());
let cookies = new Map();
async function request(path, body) {
  const response = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Origin: base, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") }, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const header of response.headers.getSetCookie()) { const [pair] = header.split(";"); const separator = pair.indexOf("="); cookies.set(pair.slice(0, separator), pair.slice(separator + 1)); }
  const data = await response.json();
  if (!response.ok) throw new Error(`Community check failed: ${response.status} ${data.error || ""}`);
  return data;
}

const unsigned = await fetch(`${base}/api/community`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ roomId, action: "message", body: "must not persist" }) });
assert.equal(unsigned.status, 401);
const challenge = await request("/api/community/session", { wallet: account.address });
const signature = await account.signMessage({ message: challenge.message });
assert.equal((await request("/api/community/session", { signature })).wallet, account.address.toLowerCase());
let messageId;
try {
  await request("/api/community", { roomId, action: "follow", following: true });
  assert.equal((await request(`/api/community?roomId=${roomId}`)).following, true);
  const body = `HYPR integration check ${randomUUID()} — temporary test message`;
  await request("/api/community", { roomId, action: "message", body });
  const observer = await (await fetch(`${base}/api/community?roomId=${roomId}`, { cache: "no-store" })).json();
  const message = observer.messages.find((entry) => entry.body === body);
  assert.ok(message, "independent public reader must see the saved message");
  messageId = message.id;
  assert.equal(message.wallet.toLowerCase(), account.address.toLowerCase());
  console.log("PASS: unsigned writes rejected; real wallet challenge/session; durable follow; message visible to independent reader.");
} finally {
  if (messageId) await request("/api/community", { roomId, action: "hide", messageId });
  await request("/api/community", { roomId, action: "follow", following: false });
  assert.equal((await request(`/api/community?roomId=${roomId}`)).following, false);
  if (messageId) { const observer = await (await fetch(`${base}/api/community?roomId=${roomId}`)).json(); assert.equal(observer.messages.some((entry) => entry.id === messageId), false); }
  console.log("PASS: test message soft-hidden; test follow removed. No transactions or real funds used.");
}
