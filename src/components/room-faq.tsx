import React from "react";
import Link from "next/link";

export const roomQuestions = [
  { id: "wallet", question: "Do I need a wallet or a coin to watch?", answer: "No. Watching, chatting with a nickname and following a room are all free and need no wallet or coin. Buying a coin is optional. Signing in (one free wallet signature) syncs your follows across devices and lets you ask to join a show." },
  { id: "guests", question: "Can I join the creator on a live show?", answer: "In a native HYPR live room, sign in with a free wallet signature and request to join. The creator can approve or decline and may remove a guest from the stage. After approval, you decide when to turn on your camera or microphone; watching never requires either. Up to four guests can be on stage. Built-in replays and clips capture the creator’s tracks; other people may still record a broadcast." },
  { id: "offline", question: "What happens when the creator ends the stream?", answer: "The broadcast ends, not the community. The permanent room link stays available, along with shared messages when the community service is connected. Save the room or follow the creator to find it again. An offline room is not a video replay." },
  { id: "clips", question: "Can I make a video clip or watch a replay?", answer: "Yes, when the creator enables it. In a live room, creators can choose Record replay (up to 10 minutes / 40 MB). With creator permission, viewers can record the next 30 seconds (up to 8 MB)—not the previous 30 seconds. Recordings upload as private drafts and only the creator can publish them. Published recordings have a permanent playback/share page and need no wallet to watch. Browser recording requires keeping HYPR open; this is not an always-on cloud DVR. Recording starts off and never requests viewer camera or microphone access. Moment Share Cards remain artwork and text, not video." },
  { id: "schedule", question: "Does a scheduled show mean the creator is live?", answer: "No. A show time is the creator’s plan, shown in your local time zone. Only a confirmed broadcast is labeled Live now. If the start time passes without a broadcast, the creator has not gone live yet." },
  { id: "testnet", question: "What are the coins, and is this real money?", answer: "This version of HYPR uses Robinhood Chain testnet. Each coin belongs to a community launch; it is not a share of HYPR or a promise of returns. Test assets have no real monetary value. You never need to trade to watch." },
  { id: "safety", question: "How do I report a problem?", answer: "Tap ⋯ on a message or use Report this room. Reports go to the room’s creator, who can hide messages; signing in is needed to report so reports can’t be spammed." },
] as const;

export function RoomFaq({ compact = false }: { compact?: boolean }) {
  return <section className="room-faq" aria-label="Frequently asked questions">
    <div className="section-heading"><div><span className="eyebrow">A LITTLE LESS GUESSWORK</span><h2>{compact ? "New here? Start here." : "Good questions. Clear answers."}</h2></div>{compact && <Link href="/faq">All FAQs ↗</Link>}</div>
    <div className="faq-list">{roomQuestions.filter((_, index) => !compact || index < 3).map(item => <details id={item.id} key={item.id}><summary>{item.question}<span aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</div>
  </section>;
}
