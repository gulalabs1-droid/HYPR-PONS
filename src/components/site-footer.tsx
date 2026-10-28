import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-brand">
        <span className="brand small"><span className="brand-mark">H</span><span>HYPR</span></span>
        <span>Social activity, not investment advice. Testnet assets have no real value.</span>
      </div>
      <nav className="site-footer-links" aria-label="Footer">
        <Link href="/#launch">Create</Link>
        <Link href="/discover">Discover</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/about">About HYPR</Link>
        <Link href="/protocol">Protocol</Link>
        <a href="https://faucet.testnet.chain.robinhood.com" target="_blank" rel="noreferrer">Test ETH faucet ↗</a>
        <a href="https://docs.ponsfamily.com" target="_blank" rel="noreferrer">Pons docs ↗</a>
      </nav>
    </footer>
  );
}
