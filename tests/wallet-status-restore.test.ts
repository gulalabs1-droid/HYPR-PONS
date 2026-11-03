import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useWalletStatus } from "../src/lib/use-wallet-status";
import { discoverWallets, getWalletChoices, rememberSelectedWallet, selectWallet, WALLET_DISCONNECTED_KEY } from "../src/lib/wallet-discovery";

test("a remembered Phantom restores read-only status and another tab can disconnect it", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const values = new Map<string, string>();
  const localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const methods: string[] = [];
  const address = `0x${"a".repeat(40)}`;
  const phantom = { isPhantom: true, async request({ method }: { method: string }) {
    methods.push(method);
    if (method === "eth_accounts") return [address];
    if (method === "eth_chainId") return "0xb626";
    if (method === "eth_getBalance") return new Promise(() => {}); // A stalled balance lookup must not block connection status.
    throw new Error(`Unexpected wallet request: ${method}`);
  } };
  const other = { async request() { throw new Error("The default wallet must not be used"); } };
  function setWindow() {
    const target = Object.assign(new EventTarget(), { localStorage, ethereum: other, phantom: { ethereum: phantom } });
    Object.defineProperty(globalThis, "window", { configurable: true, value: target });
    return target;
  }
  function Probe() { const wallet = useWalletStatus(); return createElement("span", null, wallet.account || "disconnected"); }
  let renderer: ReactTestRenderer | undefined;
  try {
    setWindow(); discoverWallets(); selectWallet(getWalletChoices().find((choice) => choice.name === "Phantom")!); rememberSelectedWallet();
    const next = setWindow(); discoverWallets();
    Object.defineProperty(globalThis, "document", { configurable: true, value: Object.assign(new EventTarget(), { visibilityState: "visible" }) });
    await act(async () => { renderer = create(createElement(Probe)); await new Promise<void>((resolve) => setImmediate(resolve)); });
    assert.equal(renderer!.root.findByType("span").children[0], address);
    assert.ok(methods.includes("eth_accounts"));
    assert.ok(methods.every((method) => ["eth_accounts", "eth_chainId"].includes(method)), "restoration must never prompt, sign, or send");

    localStorage.setItem(WALLET_DISCONNECTED_KEY, "yes");
    const event = new Event("storage"); Object.assign(event, { key: WALLET_DISCONNECTED_KEY });
    await act(async () => { next.dispatchEvent(event); await new Promise<void>((resolve) => setImmediate(resolve)); });
    assert.equal(renderer!.root.findByType("span").children[0], "disconnected");
  } finally {
    await act(async () => renderer?.unmount());
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});
