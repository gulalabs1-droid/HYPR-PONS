"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getEthereum } from "./wallet";
import { WALLET_CHANGED_EVENT, WALLET_DISCONNECTED_KEY, WALLETS_DISCOVERED_EVENT, walletSessionDisconnected } from "./wallet-discovery";

type WalletState = { account: string | null; chainId: number | null };
const empty: WalletState = { account: null, chainId: null };

// Read-only discovery: opening a page never requests wallet approval.
export function useWalletStatus() {
  const [state, setState] = useState<WalletState>(empty);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++version.current;
    const provider = getEthereum();
    if (!provider || walletSessionDisconnected()) { setState(empty); return; }
    try {
      const [accounts, chain] = await Promise.all([
        provider.request({ method: "eth_accounts" }) as Promise<string[]>,
        provider.request({ method: "eth_chainId" }),
      ]);
      if (version.current === current) setState({ account: accounts[0] || null, chainId: Number(chain) });
    } catch { if (version.current === current) setState(empty); }
  }, []);
  useEffect(() => {
    const generation = version;
    let provider = getEthereum();
    const changed = () => void refresh();
    function bind() {
      provider?.removeListener?.("accountsChanged", changed); provider?.removeListener?.("chainChanged", changed);
      provider = getEthereum();
      provider?.on?.("accountsChanged", changed); provider?.on?.("chainChanged", changed);
      void refresh();
    }
    bind();
    window.addEventListener(WALLET_CHANGED_EVENT, bind);
    window.addEventListener(WALLETS_DISCOVERED_EVENT, bind);
    const storageChanged = (event: StorageEvent) => { if (event.key === WALLET_DISCONNECTED_KEY) bind(); };
    window.addEventListener("storage", storageChanged);
    const visible = () => { if (document.visibilityState !== "hidden") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current++;
      provider?.removeListener?.("accountsChanged", changed); provider?.removeListener?.("chainChanged", changed);
      window.removeEventListener(WALLET_CHANGED_EVENT, bind); window.removeEventListener(WALLETS_DISCOVERED_EVENT, bind);
      window.removeEventListener("storage", storageChanged); document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  return { ...state, refresh };
}
