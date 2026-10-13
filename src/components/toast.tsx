"use client";

import { useEffect } from "react";

export function Toast({ message, onDismiss, duration = 6000 }: { message: string; onDismiss: () => void; duration?: number }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, duration]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {message && (
        <div className="toast">
          <span>{message}</span>
          <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss notification">×</button>
        </div>
      )}
    </div>
  );
}
