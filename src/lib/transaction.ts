import type { EthereumProvider } from "./wallet";

export type TransactionReceiptStatus = "pending" | "confirmed" | "reverted";

export function classifyTransactionReceipt(receipt: unknown): TransactionReceiptStatus {
  const status = typeof receipt === "object" && receipt !== null && "status" in receipt
    ? (receipt as { status?: unknown }).status
    : undefined;
  if (typeof status !== "string") return "pending";
  const normalized = status.toLowerCase();
  if (normalized === "0x1" || normalized === "0x01") return "confirmed";
  if (normalized === "0x0" || normalized === "0x00") return "reverted";
  return "pending";
}

export async function waitForTransactionReceipt(
  provider: EthereumProvider | null,
  hash: string,
  options: { attempts?: number; intervalMs?: number; revertedMessage?: string; timeoutMessage?: string } = {},
) {
  if (!provider) throw new Error("wallet unavailable");
  const attempts = options.attempts ?? 90;
  const intervalMs = options.intervalMs ?? 1_000;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [hash] });
    const status = classifyTransactionReceipt(receipt);
    if (status === "confirmed") return receipt;
    if (status === "reverted") throw new Error(options.revertedMessage || "transaction reverted");
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(options.timeoutMessage || "transaction receipt timed out; verify it in the explorer");
}
