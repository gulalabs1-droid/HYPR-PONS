export const GUEST_LIMIT = 4;
export const GUEST_IDENTITY = /^guest-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const PARTICIPANT_SID = /^PA_[A-Za-z0-9_-]{1,100}$/;
export type GuestState = "audience" | "requested" | "approved" | "declined";
export type GuestMetadata = { role: "viewer"; wallet: string; launchAddress: string; guestState: GuestState; hostSid?: string };

/** Only the server can write participant metadata; callers still validate its shape. */
export function guestMetadata(value?: string): GuestMetadata | null {
  if (!value || value.length > 2048) return null;
  try {
    const data = JSON.parse(value) as Partial<GuestMetadata>;
    if (data.role !== "viewer" || !/^0x[0-9a-f]{40}$/.test(data.wallet || "") ||
      !/^0x[0-9a-f]{40}$/.test(data.launchAddress || "") ||
      !["audience", "requested", "approved", "declined"].includes(data.guestState || "") ||
      (data.hostSid !== undefined && !PARTICIPANT_SID.test(data.hostSid))) return null;
    return data as GuestMetadata;
  } catch { return null; }
}

export function isApprovedGuest(metadata: string | undefined, hostSid: string | undefined) {
  const guest = guestMetadata(metadata);
  return Boolean(hostSid && guest?.guestState === "approved" && guest.hostSid === hostSid);
}
