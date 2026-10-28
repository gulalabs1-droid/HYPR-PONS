# Confirmed market chart and execution markers — October 28, 2026

Native HYPR rooms now expose a dedicated Chart view on mobile and a chart beside the trade panel on desktop. The default native mobile room section is Chart; viewing and historical wallet observation need no signature, camera or microphone. Live video remains above the market.

## Data and precision

- `/api/market?token=<native-token>&limit=50|200|500` reads a fixed official network explorer, never a caller-supplied origin or curve.
- Factory topic lookup finds the launch beyond the existing 2,500-block recent scan. Its identity is verified with the actual RPC receipt and configured factory; wrong network, failed launch, foreign token and insufficient confirmations fail closed.
- Raw `TradeExecuted` logs are decoded with the Solidity event ABI. Transaction hash plus log index is the identity. Chain block/log order determines candle open/close. Trades above `head - 12` are omitted. Transfers, approvals and fee claims are not trades.
- The official explorer is a trusted indexing dependency. Confirmations are a depth policy, not a mathematical finality/security guarantee. Trade logs and timestamps are explorer-indexed; each trade is not independently cryptographically proven by this UI.
- Market line/candles use fee-exclusive average curve execution: buy `(gross - fee) / tokens`, sell `gross / tokens`. Arrows use actual wallet average fill: buy `gross / tokens`, sell `(gross - fee) / tokens`. Gas is excluded. Selected details preserve raw integer amounts; displayed prices are rounded approximations.
- Ratios are divided with BigInt fixed precision before floating-point conversion for rendering. Chart scale explicitly includes marker fill prices so fee-spread arrows do not disappear outside the visible range.
- Time axis is UTC; selected trade details use browser-local time. Multiple trades may share a candle. No empty-period trades/candles are invented. Last trade time is visible and is not represented as a current executable quote.

## Performance and boundaries

TradingView Lightweight Charts 5.2.1 is dynamically loaded for actual price history, not bundled into the home/discover route. Canvas rendering, bounded history, per-instance request coalescing, five-second shared CDN caching, and visibility/viewport-aware polling reduce repeat work. Crosshair labels update at animation-frame cadence. Polling preserves chart position instead of repeatedly resetting a selected trade's zoom.

The initial lookup scans at most 200 contract logs; explicit expansion scans at most 500, with an overall backfill budget. Partial history is labeled. Wallet counts and markers apply only to loaded history, not all lifetime holdings. Public wallet tracking is observation, not sign-in or proof of ownership. Chart privacy does not rely on local storage; account switches clear selected personal-trade context.

Only native curve activity is charted. Post-graduation pool trading, Pons charts, USD feeds, unrealized P&L, historical holdings/cost-basis accounting and sub-second unconfirmed streaming are not claimed. A confirmed wallet transaction can precede its marker because the chart waits for depth and indexing. No wallet transaction was sent as part of chart acceptance testing.

The public `/about` page and sitemap give creators, reviewers and prospective partners a stable factual product overview. Funding/application materials remain local under `output/hypr-growth-20261028/`, excluded from Git and Vercel uploads. No program agreements or paid plans are accepted by this release.

The framework is updated to the supported Next.js 15.5.28 patch, keeping the existing major version. Chart attribution remains visible, including the upstream TradingView copyright notice.
