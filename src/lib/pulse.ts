/** HYPR Pulse: public, aggregate community engagement. Coin price and trading never count. */
export type Pulse = {
  followers: number;
  newFollowers30d: number;
  chatters30d: number;
  regulars30d: number;
  shows30d: number;
  lastShowAt: string | null;
  checkedAt: string | null;
};

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : 0);
const isoOrNull = (value: unknown) => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null);

/** Database rows arrive loosely typed (bigint counts can be strings); accept only sane values. */
export function normalizePulse(raw: unknown): Pulse | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  return {
    followers: count(row.followers),
    newFollowers30d: count(row.newFollowers30d),
    chatters30d: count(row.chatters30d),
    regulars30d: count(row.regulars30d),
    shows30d: count(row.shows30d),
    lastShowAt: isoOrNull(row.lastShowAt),
    checkedAt: isoOrNull(row.checkedAt),
  };
}

export function pulseIsEmpty(pulse: Pulse) {
  return !pulse.followers && !pulse.chatters30d && !pulse.shows30d;
}

/** Share of people who chatted this month and came back on another day. Hidden below 5 chatters: too noisy. */
export function returnRate(pulse: Pulse) {
  return pulse.chatters30d >= 5 ? Math.round((pulse.regulars30d / pulse.chatters30d) * 100) : null;
}
