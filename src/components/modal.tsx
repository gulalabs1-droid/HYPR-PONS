"use client";

import React, { useEffect, useRef, type ReactNode } from "react";

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus?.(); };
  }, []);
  return <dialog ref={ref} className="hypr-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="dialog-heading"><h2>{title}</h2><button type="button" className="dialog-close" aria-label={`Close ${title}`} onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}
