"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Server renders read live chain state, so page navigations can take a moment.
// Show a top progress bar as soon as an internal link to another page is clicked.
export function NavigationProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setState("loading");
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    setState((current) => current === "loading" ? "done" : current);
  }, [pathname]);

  useEffect(() => {
    if (state === "idle") return undefined;
    const timer = window.setTimeout(() => setState("idle"), state === "done" ? 400 : 20000);
    return () => window.clearTimeout(timer);
  }, [state]);

  return <div className={`nav-progress is-${state}`} aria-hidden="true"><span /></div>;
}
