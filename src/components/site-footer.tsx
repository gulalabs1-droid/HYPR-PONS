import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-brand">
        <span className="brand small"><span className="brand-mark">H</span><span>HYPR</span></span>
        <p className="site-footer-tagline">Live creator rooms that stay open between shows.</p>
      </div>
      <nav className="site-footer-links" aria-label="Footer">
        <div><strong>Watch</strong><Link href="/watch">Watch now</Link><Link href="/discover">Discover</Link><Link href="/following">Following</Link></div>
        <div><strong>Create</strong><Link href="/creators">For creators</Link><Link href="/faq">FAQ</Link></div>
        <div><strong>HYPR</strong><Link href="/about">About HYPR</Link><Link href="/protocol">Protocol</Link><a href="https://faucet.testnet.chain.robinhood.com" target="_blank" rel="noreferrer">Test ETH faucet ↗</a></div>
      </nav>
      <div className="site-footer-legal">
        <span>Social activity, not investment advice. Testnet assets have no real value.</span>
        <span>HYPR is independent and is not affiliated with or endorsed by Robinhood Markets, Inc.</span>
      </div>
    </footer>
  );
}
