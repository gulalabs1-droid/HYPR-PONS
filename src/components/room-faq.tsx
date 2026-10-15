import React from "react";
import Link from "next/link";

export const roomQuestions = [
  { id: "wallet", question: "Do I need a wallet or a coin to watch?", answer: "No. Open a room and watch an available broadcast for free. Buying a coin is optional. Posting chat and following with a wallet require a wallet authorization signature; saving a room on this device does not." },
  { id: "offline", question: "What happens when the creator ends the stream?", answer: "The broadcast ends, not the community. The permanent room link stays available, along with shared messages when the community service is connected. Save the room or follow the creator to find it again. An offline room is not a video replay." },
  { id: "clips", question: "Can I make a video clip or watch a replay?", answer: "Not yet. HYPR’s current Moment Share Cards are artwork and text, not video. Native video clips and replays are not available, and HYPR does not automatically record your camera or microphone. You can share the permanent room link today." },
  { id: "schedule", question: "Does a scheduled show mean the creator is live?", answer: "No. A show time is the creator’s plan, shown in your local time zone. Only a confirmed broadcast is labeled Live now. If the start time passes without a broadcast, the creator has not gone live yet." },
  { id: "testnet", question: "What are the coins, and is this real money?", answer: "This version of HYPR uses Robinhood Chain testnet. Each coin belongs to a community launch; it is not a share of HYPR or a promise of returns. Test assets have no real monetary value. You never need to trade to watch." },
  { id: "safety", question: "How do I report a problem?", answer: "Use the report controls inside the room. Reporting requires wallet authorization and a connected community service. Reports currently go to that room’s creator, not an independent 24/7 moderation team. Do not share passwords, private keys, recovery phrases, or personal information in chat." },
] as const;

export function RoomFaq({ compact = false }: { compact?: boolean }) {
  return <section className="room-faq" aria-label="Frequently asked questions">
    <div className="section-heading"><div><span className="eyebrow">A LITTLE LESS GUESSWORK</span><h2>{compact ? "New here? Start here." : "Good questions. Clear answers."}</h2></div>{compact && <Link href="/faq">All FAQs ↗</Link>}</div>
    <div className="faq-list">{roomQuestions.filter((_, index) => !compact || index < 3).map(item => <details id={item.id} key={item.id}><summary>{item.question}<span aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</div>
  </section>;
}
