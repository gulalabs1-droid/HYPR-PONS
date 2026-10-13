import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { decodeFunctionData, encodeFunctionResult, parseEther } from "viem";
import { NativeTradePanel } from "../src/components/native-trade-panel";
import { HYPR_CURVE_ABI } from "../src/lib/integrations/hypr/curve-abi";
import type { EthereumProvider } from "../src/lib/wallet";

async function withPanel(phase: number, run: (renderer: ReactTestRenderer, calls: string[], flush: () => Promise<void>) => Promise<void>, provider?: EthereumProvider) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const callbacks = new Map<number, () => void>();
  let nextId = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    setTimeout(callback: () => void) { callbacks.set(++nextId, callback); return nextId; },
    clearTimeout(id: number) { callbacks.delete(id); },
    setInterval() { return ++nextId; }, clearInterval() {},
    addEventListener() {}, removeEventListener() {},
    ethereum: provider,
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, visibilityState: "visible", addEventListener() {}, removeEventListener() {} } });
  const calls: string[] = [];
  let renderer: ReactTestRenderer | undefined;
  const flush = async () => {
    await act(async () => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback();
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  };
  try {
    await act(async () => {
      renderer = create(createElement(NativeTradePanel, {
        curveAddress: `0x${"1".repeat(40)}`, tokenAddress: `0x${"2".repeat(40)}`, tokenSymbol: "TEST",
        readClient: { async call({ data }) {
          const { functionName } = decodeFunctionData({ abi: HYPR_CURVE_ABI, data });
          calls.push(functionName);
          const result = functionName === "phase" ? phase : functionName === "quoteBuy"
            ? [parseEther("2"), parseEther("0.0000125"), parseEther("0.0009875")]
            : [parseEther("0.00049375"), parseEther("0.0005"), parseEther("0.00000625")];
          return { data: encodeFunctionResult({ abi: HYPR_CURVE_ABI, functionName, result: result as never }) };
        } },
      }));
    });
    await flush();
    await run(renderer!, calls, flush);
  } finally {
    await act(async () => renderer?.unmount());
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
}

test("empty native trade input becomes editable without a connected wallet", async () => {
  await withPanel(0, async (renderer, calls) => {
    assert.equal(renderer.root.findByType("input").props.disabled, false);
    assert.deepEqual(calls, ["phase"]);
    assert.equal(renderer.root.findByProps({ type: "submit" }).props.disabled, true);
  });
});

test("native sell preview displays the fee, not gross sell proceeds", async () => {
  await withPanel(0, async (renderer, calls, flush) => {
    await act(async () => renderer.root.findAllByType("button").find((button) => button.props.children === "Sell")!.props.onClick());
    await flush();
    await act(async () => renderer.root.findByType("input").props.onChange({ target: { value: "1" } }));
    await flush();
    assert.ok(calls.includes("quoteSell"));
    const text = JSON.stringify(renderer.toJSON());
    assert.ok(text.includes("0.00000625"));
    assert.ok(text.includes("0.00049375"));
    assert.equal(text.includes('"0.0005"'), false);
  });
});

test("graduated native curves remain input-locked even without an amount", async () => {
  await withPanel(2, async (renderer, calls) => {
    assert.equal(renderer.root.findByType("input").props.disabled, true);
    assert.deepEqual(calls, ["phase"]);
    assert.ok(JSON.stringify(renderer.toJSON()).includes("Graduated"));
  });
});

test("editing a trade amount invalidates the old quote before another request completes", async () => {
  await withPanel(0, async (renderer, _calls, flush) => {
    const input = () => renderer.root.findByType("input");
    const submit = () => renderer.root.findByProps({ type: "submit" });
    await act(async () => input().props.onChange({ target: { value: "0.001" } }));
    await flush();
    assert.equal(submit().props.disabled, false);
    await act(async () => input().props.onChange({ target: { value: "0.002" } }));
    assert.equal(submit().props.disabled, true);
    await flush();
    assert.equal(submit().props.disabled, false);
  });
});

test("review is explicit, names the token and fees, and sends no wallet transaction", async () => {
  await withPanel(0, async (renderer, _calls, flush) => {
    await act(async () => renderer.root.findByType("input").props.onChange({ target: { value: "0.001" } }));
    await flush();
    assert.equal(renderer.root.findAllByType("dialog").length, 0);
    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    assert.equal(renderer.root.findAllByType("dialog").length, 1);
    const text = JSON.stringify(renderer.toJSON());
    assert.ok(text.includes("Review your purchase"));
    assert.ok(text.includes("Minimum you receive (2% limit)"));
    assert.ok(text.includes("Network fee · extra"));
    assert.ok(text.includes("test ETH"));
    assert.ok(text.includes("TEST"));
    assert.ok(text.includes("Connect wallet to continue"));
  });
});

test("an unfunded buyer gets a funding explanation before any transaction is sent", async () => {
  const methods: string[] = [];
  const account = `0x${"3".repeat(40)}`;
  const provider: EthereumProvider = { async request({ method }) {
    methods.push(method);
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
    if (method === "eth_chainId") return "0xb626";
    if (method === "eth_getBalance") return "0x0";
    if (method === "eth_estimateGas" || method === "eth_gasPrice") return "0x1";
    throw new Error(`Unexpected method: ${method}`);
  } };
  await withPanel(0, async (renderer, _calls, flush) => {
    await act(async () => renderer.root.findByType("input").props.onChange({ target: { value: "0.001" } }));
    await flush();
    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    assert.equal(methods.includes("eth_sendTransaction"), false);
    await act(async () => renderer.root.findAllByType("button").find((button) => button.props.children === "Confirm in wallet")!.props.onClick());
    assert.equal(methods.includes("eth_sendTransaction"), false);
    assert.match(JSON.stringify(renderer.toJSON()), /Not enough test ETH/);
  }, provider);
});

test("a seller without tokens stops before asking for an allowance", async () => {
  const methods: string[] = [];
  const account = `0x${"3".repeat(40)}`;
  const provider: EthereumProvider = { async request({ method }) {
    methods.push(method);
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
    if (method === "eth_chainId") return "0xb626";
    if (method === "eth_getBalance") return "0x10000";
    if (method === "eth_call") return "0x0";
    throw new Error(`Unexpected method: ${method}`);
  } };
  await withPanel(0, async (renderer, _calls, flush) => {
    await act(async () => renderer.root.findAllByType("button").find((button) => button.props.children === "Sell")!.props.onClick());
    await flush();
    await act(async () => renderer.root.findByType("input").props.onChange({ target: { value: "1" } }));
    await flush();
    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    await act(async () => renderer.root.findAllByType("button").find((button) => button.props.children === "Confirm in wallet")!.props.onClick());
    assert.equal(methods.includes("eth_sendTransaction"), false);
    assert.match(JSON.stringify(renderer.toJSON()), /don’t have enough/);
  }, provider);
});
