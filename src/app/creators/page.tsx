import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import "./creators.css";

export const metadata: Metadata = {
  title: "For creators",
  description: "Host a live conversation, invite approved guests and keep a room your community can return to. Explore the Robinhood Chain testnet preview.",
  alternates: { canonical: "/creators" },
  openGraph: { title: "HYPR for creators — your show, your room", description: "Host live, invite your community and keep the conversation going. Testnet preview.", type: "website", url: "/creators" },
  twitter: { card: "summary_large_image", title: "HYPR for creators — your show, your room", description: "Host live, invite your community and keep the conversation going. Testnet preview." },
};

const contact = "mailto:labsgula@gmail.com?subject=HYPR%20creator%20preview";

export default function CreatorsPage() {
  return <main className="creator-intro"><Header />
    <div className="page-shell">
      <section className="creator-intro-hero" aria-labelledby="creator-hero-title">
        <div className="creator-intro-copy">
          <span className="eyebrow">FOR CREATORS · EARLY PREVIEW</span>
          <h1 id="creator-hero-title">Go live.<br /><em>Keep your people.</em></h1>
          <p>Host the conversation in your own room. Invite guests on camera or mic, then come back to the same community for your next show.</p>
          <div className="creator-intro-actions"><a className="primary-button" href={contact}>Get help with your first show ↗</a><Link className="secondary-button" href="/discover">Explore rooms ↗</Link></div>
          <p className="creator-intro-note">Robinhood Chain testnet preview · Test assets have no real value.</p>
        </div>
        <div className="creator-intro-visual" aria-label="A room for your show and community">
          <div className="creator-intro-window"><div className="creator-intro-window-top"><span>YOUR HYPR ROOM</span><span>✦</span></div><div className="creator-intro-orb" aria-hidden="true"><span>H</span></div><strong>Your show.<br />Your community.</strong><p>A place to watch, join in, and return.</p></div>
          <div className="creator-intro-visual-note"><span aria-hidden="true">↗</span><div><strong>One room link</strong><small>Share it before, during and after a show.</small></div></div>
        </div>
      </section>

      <section className="creator-intro-benefits" aria-labelledby="creator-benefits-title"><div className="creator-intro-section-heading"><span className="eyebrow">A LITTLE MORE THAN A STREAM</span><h2 id="creator-benefits-title">Make it a place worth coming back to.</h2></div>
        <div className="creator-intro-grid">
          <article><span aria-hidden="true">01</span><h3>Meet your audience live</h3><p>Broadcast directly in your browser. Viewers can watch without connecting a wallet or buying a coin.</p></article>
          <article><span aria-hidden="true">02</span><h3>Bring people into the show</h3><p>Signed-in viewers can request to join on camera or mic. You decide who comes on.</p></article>
          <article><span aria-hidden="true">03</span><h3>Give them a place to return</h3><p>Your room, saved chat and follows stay after a broadcast. You can schedule your next show there.</p></article>
        </div>
      </section>

      <section className="creator-intro-how" aria-labelledby="creator-how-title"><div><span className="eyebrow">YOUR FIRST SHOW</span><h2 id="creator-how-title">Start small.<br />Make it yours.</h2><p>HYPR is an early testnet product. We can help you get set up and listen to your feedback.</p><a className="secondary-button" href={contact}>Email the HYPR team ↗</a></div>
        <ol>
          <li><span>1</span><div><strong>Set up a test room</strong><p>Connect an EVM wallet on Robinhood Chain testnet and create a test coin and room. You’ll need free test ETH for network fees.</p></div></li>
          <li><span>2</span><div><strong>Open your studio</strong><p>Choose when to turn on your camera and microphone. Creating a room does not start a broadcast.</p></div></li>
          <li><span>3</span><div><strong>Invite your people</strong><p>Share the room link. Watching needs no wallet; chatting and guest requests require a wallet sign-in.</p></div></li>
        </ol>
      </section>

      <section className="creator-intro-contact" aria-labelledby="creator-contact-title"><div><span className="eyebrow">LET’S MAKE YOUR FIRST SHOW EASY</span><h2 id="creator-contact-title">Have a community or an idea?</h2><p>Tell us what you want to host. We’ll help you try the current preview and hear what works for you.</p><p className="creator-intro-note">Recordings are opt-in. Creators review clips and replays before publishing.</p></div><div><a className="primary-button" href={contact}>Email HYPR ↗</a><a className="creator-email" href={contact}>labsgula@gmail.com</a></div></section>
      <SiteFooter />
    </div>
  </main>;
}
