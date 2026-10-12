export type EventLogIdentity = {
  transactionHash?: string | null;
  logIndex?: bigint | number | null;
};

export function stableEventId(log: EventLogIdentity) {
  if (log.transactionHash == null || log.logIndex == null) return null;
  return `${log.transactionHash}:${log.logIndex}`;
}

export function uniqueLogsByEventId<T extends EventLogIdentity>(logs: T[]) {
  return [...new Map(logs.map((log) => [stableEventId(log), log])).values()];
}

export function confirmedBlockRange(
  latest: bigint,
  confirmationDepth: bigint,
  lookbackBlocks: bigint,
  floor: bigint,
) {
  const safeHead = latest > confirmationDepth ? latest - confirmationDepth : latest;
  const fromBlock = safeHead > lookbackBlocks ? safeHead - lookbackBlocks : floor;
  return { fromBlock, safeHead };
}
