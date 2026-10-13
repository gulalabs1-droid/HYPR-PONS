import { Header } from "@/components/header";

export default function ProtocolLoading() {
  return (
    <main aria-busy="true">
      <Header active="protocol" />
      <div className="page-shell protocol-shell">
        <span className="sr-only" role="status">Loading protocol accounting…</span>
        <section className="protocol-hero">
          <div className="skeleton" style={{ width: 180, height: 14 }} />
          <div className="skeleton" style={{ width: "min(520px, 100%)", height: 150, marginTop: 24 }} />
        </section>
        <div className="protocol-grid">
          {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="skeleton" style={{ height: 128, borderRadius: 14 }} />)}
        </div>
      </div>
    </main>
  );
}
