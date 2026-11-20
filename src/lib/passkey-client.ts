"use client";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { COMMUNITY_UPDATED_EVENT } from "./growth";
import { syncDeviceFollows } from "./follow-sync";

export const passkeysSupported = () => typeof window !== "undefined" && browserSupportsWebAuthn();

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/community/passkey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json() as Record<string, unknown> & { error?: string };
  if (!response.ok) throw new Error(data.error || "Passkey sign-in failed.");
  return data;
}

function friendly(error: unknown) {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return new Error("Passkey request canceled.");
  if (name === "InvalidStateError") return new Error("This device already has a HYPR passkey. Use “I already have a passkey”.");
  return error instanceof Error ? error : new Error("Passkey sign-in failed.");
}

async function finish(data: Record<string, unknown>) {
  await syncDeviceFollows().catch(() => 0);
  window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT));
  return { name: String(data.name || "Member") };
}

/** Create a wallet-free HYPR member account protected by Face ID, Touch ID, Windows Hello or a security key. */
export async function createPasskeyAccount(name: string) {
  try {
    const { options } = await post({ action: "register-options", name });
    const response = await startRegistration({ optionsJSON: options as never });
    return finish(await post({ action: "register", response }));
  } catch (error) { throw friendly(error); }
}

export async function signInWithPasskey() {
  try {
    const { options } = await post({ action: "login-options" });
    const response = await startAuthentication({ optionsJSON: options as never });
    return finish(await post({ action: "login", response }));
  } catch (error) { throw friendly(error); }
}
