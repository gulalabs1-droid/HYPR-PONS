import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverWallets, getWalletChoices, rememberSelectedWallet, selectWallet, setWalletSessionDisconnected, walletErrorMessage, walletSessionDisconnected } from "../src/lib/wallet-discovery";
import { getEthereum } from "../src/lib/wallet";

test("wallet discovery selects an explicit provider rather than whichever extension wins window.ethereum", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const target = new EventTarget();
  const first = { async request() { return "first"; } };
  const second = { async request() { return "second"; } };
  Object.defineProperty(globalThis, "window", { configurable: true, value: Object.assign(target, { ethereum: first }) });
  try {
    discoverWallets();
    const event = new Event("eip6963:announceProvider");
    Object.assign(event, { detail: { info: { uuid: "second-wallet", name: "Second wallet" }, provider: second } });
    target.dispatchEvent(event); target.dispatchEvent(event);
    assert.equal(getWalletChoices().length, 2);
    assert.equal(getEthereum(), first);
    selectWallet(getWalletChoices().find((choice) => choice.id === "second-wallet")!);
    assert.equal(getEthereum(), second);
    setWalletSessionDisconnected(true); assert.equal(walletSessionDisconnected(), true);
    selectWallet(getWalletChoices()[0]); assert.equal(walletSessionDisconnected(), false);
  } finally { if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window"); }
});
test("wallet errors distinguish pending requests, rejection and insufficient funding", () => {
  assert.match(walletErrorMessage({ code: -32002 }), /already waiting/);
  assert.match(walletErrorMessage({ code: 4001 }), /cancelled/);
  assert.match(walletErrorMessage({ message: "insufficient funds for gas" }), /free test ETH/);
});

test("Phantom remains selectable when another extension owns the default provider", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const target = new EventTarget();
  const other = { async request() { return "other"; } };
  const phantom = { isPhantom: true, async request() { return "phantom"; } };
  Object.defineProperty(globalThis, "window", { configurable: true, value: Object.assign(target, { ethereum: other, phantom: { ethereum: phantom } }) });
  try {
    discoverWallets();
    const available = getWalletChoices();
    assert.equal(available.find((choice) => choice.name === "Phantom")?.provider, phantom);
    assert.equal(available.find((choice) => choice.name === "Browser wallet")?.provider, other);
    selectWallet(available.find((choice) => choice.name === "Phantom")!);
    assert.equal(getEthereum(), phantom);
    const event = new Event("eip6963:announceProvider");
    Object.assign(event, { detail: { info: { uuid: "phantom-announcement", name: "Phantom" }, provider: phantom } });
    target.dispatchEvent(event);
    assert.equal(getWalletChoices().filter((choice) => choice.name === "Phantom").length, 1);
  } finally { if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window"); }
});

test("a non-Phantom object is not presented as Phantom", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const target = new EventTarget();
  Object.defineProperty(globalThis, "window", { configurable: true, value: Object.assign(target, { phantom: { ethereum: { async request() {} } } }) });
  try { discoverWallets(); assert.equal(getWalletChoices().some((choice) => choice.name === "Phantom"), false); }
  finally { if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window"); }
});

test("an approved Phantom choice survives a new tab without connecting another wallet or undoing disconnect", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const stored = new Map<string, string>();
  const localStorage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); }, removeItem: (key: string) => { stored.delete(key); } };
  let requests = 0;
  const makePhantom = () => ({ isPhantom: true, async request() { requests++; return []; } });
  const other = { async request() { requests++; return []; } };
  const first = makePhantom();
  const setWindow = (phantom?: ReturnType<typeof makePhantom>) => {
    const target = Object.assign(new EventTarget(), { localStorage, ethereum: other, phantom: phantom ? { ethereum: phantom } : undefined });
    Object.defineProperty(globalThis, "window", { configurable: true, value: target });
    return target;
  };
  try {
    setWindow(first); discoverWallets(); selectWallet(getWalletChoices().find((choice) => choice.provider === first)!);
    assert.equal(stored.size, 0, "a selection alone is not saved before connection succeeds");
    rememberSelectedWallet();
    assert.deepEqual([...stored.values()], ["phantom"]);

    const next = makePhantom();
    setWindow(next); discoverWallets();
    assert.equal(getEthereum(), next, "the remembered Phantom wins over another default wallet");
    assert.equal(requests, 0, "restoring a preference never requests a connection or signature");

    setWalletSessionDisconnected(true);
    setWindow(makePhantom()); discoverWallets();
    assert.equal(walletSessionDisconnected(), true);
    assert.equal(getEthereum(), null, "a new tab cannot silently undo explicit disconnection");

    const reconnected = getWalletChoices().find((choice) => choice.name === "Phantom")!;
    selectWallet(reconnected);
    assert.equal(walletSessionDisconnected(), true, "choosing a wallet does not clear disconnect before approval");
    setWalletSessionDisconnected(false); rememberSelectedWallet();
    assert.equal(walletSessionDisconnected(), false);

    const late = setWindow(); discoverWallets();
    assert.equal(getEthereum(), null, "never fall back to a different wallet while Phantom is unavailable");
    const announced = makePhantom();
    const event = new Event("eip6963:announceProvider");
    Object.assign(event, { detail: { info: { uuid: "late-phantom", name: "Phantom" }, provider: announced } });
    late.dispatchEvent(event);
    assert.equal(getEthereum(), announced, "a late Phantom announcement restores the preference");
    assert.equal(requests, 0);
  } finally { if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window"); }
});
