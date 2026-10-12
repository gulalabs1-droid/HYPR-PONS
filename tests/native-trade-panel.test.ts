import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { decodeFunctionData, encodeFunctionResult, parseEther } from "viem";
import { NativeTradePanel } from "../src/components/native-trade-panel";
import { HYPR_CURVE_ABI } from "../src/lib/integrations/hypr/curve-abi";

async function withPanel(phase: number, run: (renderer: ReactTestRenderer, calls: string[], flush: () => Promise<void>) => Promise<void>) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const callbacks = new Map<number, () => void>();
  let nextId = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    setTimeout(callback: () => void) { callbacks.set(++nextId, callback); return nextId; },
    clearTimeout(id: number) { callbacks.delete(id); },
  } });
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
