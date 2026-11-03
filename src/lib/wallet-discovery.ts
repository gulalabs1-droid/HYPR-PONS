import type { EthereumProvider } from "./wallet";

export type WalletChoice = { id: string; name: string; provider: EthereumProvider };
const choices = new Map<string, WalletChoice>();
let selected: WalletChoice | null = null;
let discoveryWindow: Window | null = null;
let disconnected = false;
const WALLET_PREFERENCE_KEY = "hypr-wallet-preference-v1";
export const WALLET_DISCONNECTED_KEY = "hypr-wallet-disconnected-v1";
export const WALLET_CHANGED_EVENT = "hypr:wallet-changed";
export const WALLETS_DISCOVERED_EVENT = "hypr:wallets-discovered";
export const OPEN_WALLET_EVENT = "hypr:open-wallet";

function readWalletSetting(key: string) {
  try { return typeof window === "undefined" ? null : window.localStorage.getItem(key); } catch { return null; }
}
function writeWalletSetting(key: string, value: string | null) {
  try { if (typeof window !== "undefined") { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } } catch { /* Private browsing can block storage. */ }
}
export function hasRememberedPhantom() { return readWalletSetting(WALLET_PREFERENCE_KEY) === "phantom"; }
export function walletSessionDisconnected() { return disconnected || readWalletSetting(WALLET_DISCONNECTED_KEY) === "yes"; }
export function setWalletSessionDisconnected(value: boolean) {
  disconnected = value;
  writeWalletSetting(WALLET_DISCONNECTED_KEY, value ? "yes" : null);
  if (value) writeWalletSetting(WALLET_PREFERENCE_KEY, null);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(WALLET_CHANGED_EVENT));
}

export function selectedWalletProvider() {
  if (typeof window === "undefined" || disconnected) return null;
  if (discoveryWindow === window && selected) return selected.provider;
  if (!hasRememberedPhantom() || walletSessionDisconnected()) return null;
  const phantom = (window as Window & { phantom?: { ethereum?: EthereumProvider & { isPhantom?: boolean } } }).phantom?.ethereum;
  if (phantom?.isPhantom && typeof phantom.request === "function") return phantom;
  if (discoveryWindow === window) return [...choices.values()].find((choice) => (choice.provider as EthereumProvider & { isPhantom?: boolean }).isPhantom === true)?.provider || null;
  return null;
}

// Remember only the wallet type after the user has connected it successfully.
// Addresses, signatures, and wallet credentials never enter browser storage.
export function rememberSelectedWallet() {
  const provider = typeof window !== "undefined" && discoveryWindow === window ? selected?.provider as (EthereumProvider & { isPhantom?: boolean }) | undefined : undefined;
  const direct = typeof window !== "undefined" ? (window as Window & { phantom?: { ethereum?: EthereumProvider & { isPhantom?: boolean } } }).phantom?.ethereum : undefined;
  writeWalletSetting(WALLET_PREFERENCE_KEY, provider && (provider.isPhantom === true || (provider === direct && direct?.isPhantom === true)) ? "phantom" : null);
}

export function discoverWallets() {
  if (typeof window === "undefined") return;
  if (discoveryWindow !== window) {
    choices.clear(); selected = null; disconnected = false; discoveryWindow = window;
    window.addEventListener("eip6963:announceProvider", ((event: CustomEvent) => {
      const detail = event.detail as { info?: { uuid?: unknown; name?: unknown }; provider?: EthereumProvider } | undefined;
      if (typeof detail?.info?.uuid !== "string" || typeof detail.info.name !== "string" || typeof detail.provider?.request !== "function") return;
      const id = detail.info.uuid;
      if (id.length > 100 || choices.has(id)) return;
      // Names are untrusted wallet-provided labels. Never render their icons or HTML.
      choices.set(id, { id, name: detail.info.name.slice(0, 60), provider: detail.provider });
      window.dispatchEvent(new Event(WALLETS_DISCOVERED_EVENT));
    }) as EventListener);
  }
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function getWalletChoices() {
  const result = [...choices.values()];
  if (typeof window === "undefined") return result;
  const browser = window as Window & {
    ethereum?: EthereumProvider & { isPhantom?: boolean };
    phantom?: { ethereum?: EthereumProvider & { isPhantom?: boolean } };
  };
  const phantom = browser.phantom?.ethereum;
  const hasPhantom = () => result.some((choice) => choice.provider === phantom || (choice.provider as EthereumProvider & { isPhantom?: boolean }).isPhantom === true);
  // Phantom exposes this provider even when a competing extension owns window.ethereum.
  if (phantom?.isPhantom && typeof phantom.request === "function" && !hasPhantom()) result.push({ id: "phantom-direct", name: "Phantom", provider: phantom });
  const injected = browser.ethereum;
  if (injected && typeof injected.request === "function" && !result.some((choice) => choice.provider === injected) && !(injected.isPhantom && hasPhantom())) {
    result.push({ id: "browser", name: injected.isPhantom ? "Phantom" : "Browser wallet", provider: injected });
  }
  return result;
}

export function selectWallet(choice: WalletChoice) {
  selected = choice;
  disconnected = false;
  if (typeof window !== "undefined") { discoveryWindow = window; window.dispatchEvent(new Event(WALLET_CHANGED_EVENT)); }
}

export function walletErrorMessage(error: unknown) {
  const item = error && typeof error === "object" ? error as { code?: number; message?: string; data?: { originalError?: { code?: number } } } : {};
  const code = item.code ?? item.data?.originalError?.code;
  if (code === 4001 || /user rejected|user denied/i.test(item.message || "")) return "You cancelled the wallet request. Nothing new was sent. You can try again when ready.";
  if (code === -32002) return "A request is already waiting in your wallet. Open the wallet extension or app to approve or cancel it.";
  if (/insufficient funds/i.test(item.message || "")) return "Not enough test ETH for this action and its network fee. Get free test ETH, then try again.";
  if (/reverted/i.test(item.message || "")) return "The trade could not complete. Refresh the quote and check its amount. If a transaction was sent, check it in the explorer; network fees may still apply.";
  return item.message || "Your wallet could not complete the request. Open it to check the connection, then try again.";
}
