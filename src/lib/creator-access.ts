import { ROBINHOOD_TESTNET_CHAIN_ID, shortAddress } from "./wallet";

export function creatorAccessProblem(address: string | undefined, chainId: number, creator: string) {
  if (!address) return "No wallet account was returned. Connect your creator wallet first.";
  if (chainId !== ROBINHOOD_TESTNET_CHAIN_ID) return "Switch the connected wallet to Robinhood Chain testnet, then try again. Starting a broadcast does not spend test ETH.";
  if (address.toLowerCase() !== creator.toLowerCase()) return `This room was created by ${shortAddress(creator)}. Switch to that wallet to broadcast. You can watch other creators without owning their coin.`;
  return null;
}

export function streamingErrorMessage(error: unknown) {
  const item = error && typeof error === "object" ? error as { name?: string; code?: number; message?: string } : {};
  if (item.name === "NotAllowedError" || /permission denied|permission dismissed/i.test(item.message || "")) return "Camera or microphone permission was denied. Allow access in your browser’s site settings, then try again.";
  if (item.name === "NotFoundError") return "No camera or microphone was found. Connect a device and try again.";
  if (item.name === "NotReadableError") return "Your camera or microphone may be in use by another app. Close that app and try again.";
  if (item.code === 4001 || /user rejected|user denied/i.test(item.message || "")) return "Wallet authorization was cancelled. Your broadcast has not started.";
  return item.message || "The live room could not connect. Check your connection and try again.";
}
