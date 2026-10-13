import { Header } from "@/components/header";

export default function Loading() {
  return (
    <main aria-busy="true">
      <Header active="discover" />
      <div className="page-shell">
        <span className="sr-only" role="status">Loading rooms from Robinhood Chain…</span>
        <section className="hero">
          <div className="skeleton" style={{ width: 220, height: 14 }} />
          <div className="skeleton" style={{ width: "min(560px, 100%)", height: 150, marginTop: 26 }} />
          <div className="skeleton" style={{ width: "min(440px, 100%)", height: 46, marginTop: 24 }} />
        </section>
        <div className="skeleton" style={{ height: 44 }} />
        <div className="skeleton" style={{ height: 260, marginTop: 14, borderRadius: 16 }} />
        <div className="token-grid skeleton-grid">
          {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton" style={{ height: 230, borderRadius: 14 }} />)}
        </div>
      </div>
    </main>
  );
}
