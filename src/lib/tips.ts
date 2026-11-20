import { formatEther, parseEther } from "viem";

export const TIP_AMOUNTS = ["0.001", "0.005", "0.01"] as const;
export const MIN_TIP_WEI = parseEther("0.0001");
export const MAX_TIP_WEI = parseEther("1");

export function tipAnnouncement(amountWei: bigint) {
  const amount = Number(formatEther(amountWei)).toLocaleString("en-US", { maximumFractionDigits: 6 });
  return `💸 Tipped the creator ${amount} test ETH`;
}

type Tx = { from: string; to: string | null; value: bigint; input?: string; chainId?: number };
type Receipt = { status: string; blockNumber: bigint };

/** A tip is a plain, successful value transfer to the room creator on HYPR's network. */
export function tipProblem(tx: Tx | null, receipt: Receipt | null, creator: string, chainId: number) {
  if (!tx || !receipt) return "Transaction not found yet. Try again in a few seconds.";
  if (receipt.status !== "success") return "This transaction failed, so no tip was sent.";
  if (tx.chainId !== undefined && tx.chainId !== chainId) return "This transaction is on a different network.";
  if (!tx.to || tx.to.toLowerCase() !== creator.toLowerCase()) return "This transaction wasn’t sent to this room’s creator.";
  if (tx.input && tx.input !== "0x") return "Tips are plain transfers, not contract calls.";
  if (tx.value < MIN_TIP_WEI || tx.value > MAX_TIP_WEI) return "Tips must be between 0.0001 and 1 test ETH.";
  if (tx.from.toLowerCase() === creator.toLowerCase()) return "Creators can’t tip their own room.";
  return null;
}
