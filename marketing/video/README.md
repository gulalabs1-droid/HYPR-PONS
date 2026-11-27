# HYPR films

Three short films for social, each in 9:16 (TikTok, Reels, Shorts) and 16:9 (X, YouTube, LinkedIn).
Everything is original: the animation is HTML drawn frame by frame, and the score is synthesized in
`music.mjs`, so there are no samples, stock footage or licences to worry about.

| Film | Length | For | The feeling |
|---|---|---|---|
| **The room stays** (`room-stays`) | 37s | Everyone; the hero film | Loss: you stream to almost no one, one person stays, the stream ends and it's all gone. Then the room is still there. |
| **Night one** (`night-one`) | 33s | Creators | Persistence: night 1 to an empty chat, night 4 someone says hi, night 23 "been here since night 4". |
| **2:14 am** (`two-am`) | 28s | Viewers | Belonging: can't sleep, find a room that's awake, someone says your name back. |

Story scenes carry a small "Dramatization" label. They show no viewer counts, no prices and no
coin; the end cards say "Robinhood Chain testnet preview".

## Render

Needs Chrome, ffmpeg and Playwright (an `npx playwright` cache works):

```bash
PLAYWRIGHT=/path/to/node_modules/playwright CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ./render-all.sh
```

Output goes to `output/videos/` (not committed). Single film: `node render.mjs <story> <v|h> <out.mp4> <score.wav>`.
Stills for review: `node stills.mjs <story> <v|h> <dir> <t1> <t2>…`. Story timelines are in `stories/`;
cue times in `music.mjs` match them.

## Post copy

Pin the first comment with the link. Add "testnet preview" anywhere the post mentions the chain.

**The room stays**
> Streams end. Communities shouldn't.
> HYPR keeps your room open between shows: the chat, the schedule, the people who stayed.
> Free to watch, no wallet. Testnet preview → hypr-pons.vercel.app

**Night one**
> Night 1: nobody. Night 4: one hi. Night 23: "been here since night 4."
> You never needed millions. You needed the ones who come back.
> Go live from your browser and keep your room between shows → hypr-pons.vercel.app/creators

**2:14 am**
> For everyone who can't sleep.
> Find a room that's still awake. Free to watch, no wallet, just a nickname.
> hypr-pons.vercel.app

Suggested hashtags (use 2–3, not all): #smallstreamer #livestream #creators #community #latenight
