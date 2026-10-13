import Link from "next/link";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";

export default function NotFound() {
  return (
    <main>
      <Header />
      <div className="page-shell">
        <section className="status-page">
          <span className="status-code">404</span>
          <span className="eyebrow">PAGE NOT FOUND</span>
          <h1>Nothing here yet.</h1>
          <p>If you followed a room link, the address may be mistyped or the launch hasn’t been indexed yet. New launches can take about a minute to confirm and appear.</p>
          <div className="hero-actions">
            <Link href="/#discover" className="primary-button">Browse rooms →</Link>
            <Link href="/#launch" className="secondary-button">Create a launch</Link>
          </div>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}
