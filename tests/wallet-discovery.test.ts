import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverWallets, getWalletChoices, selectWallet, setWalletSessionDisconnected, walletErrorMessage, walletSessionDisconnected } from "../src/lib/wallet-discovery";
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
