"use client";

import Link from "next/link";
import { Header } from "@/components/header";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main>
      <Header />
      <div className="page-shell">
        <section className="status-page">
          <span className="status-code">!</span>
          <span className="eyebrow">SOMETHING WENT WRONG</span>
          <h1>We couldn’t load this page.</h1>
          <p>The Robinhood Chain RPC may be slow or briefly unavailable. No transaction was sent. Try again in a moment.</p>
          <div className="hero-actions">
            <button type="button" className="primary-button" onClick={reset}>Try again ↻</button>
            <Link href="/" className="secondary-button">Back to Discover</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
