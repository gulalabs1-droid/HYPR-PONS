# HYPR design system ("night show")

Source of truth: `src/app/brand.css` (loaded last in `src/app/layout.tsx`). Older stylesheets
(`globals.css`, `polish.css`, `consumer.css` and others) still define layout for specific pages; the
brand layer overrides tokens and primitives. New work should add to `brand.css` or a page file, never
re-introduce values that fight it.

## Principles

1. **Entertainment first.** Video and people lead; market data is available, never dominant.
2. **Live means red.** Only confirmed-live things use `--live`. Nothing else is red.
3. **One accent for action.** Volt (`--lime`) is for the main action on a screen. Don't make
   everything glow.
4. **Honest states.** Every surface has a designed empty, loading and unavailable state. Never fill
   space with invented numbers.
5. **Sentence case.** Labels read like speech. Monospace is only for numbers and addresses.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#08080c` | Page |
| `--surface` / `-2` / `-3` | `#111117` / `#17171f` / `#1f1f29` | Cards, inputs, raised chips |
| `--line` / `--line-strong` | white 8% / 15% | Borders |
| `--text` / `--text-soft` / `--muted` / `--subtle` | `#f6f6f8` / `#d3d3dc` / `#a6a6b4` / `#8e8e9c` | Text hierarchy (all ≥ 4.5:1 on `--bg`; `--subtle` is about 6:1) |
| `--lime` | `#d3fb5a` | Primary action, active tab icon |
| `--live` | `#ff3b5c` | Live badges, live CTA |
| `--purple` | `#a596ff` | Upcoming shows, testnet labels |
| `--radius-sm/…/xl` | 12 / 16 / 22 / 28px | Inputs / cards / panels / hero media |

## Type

- **Display:** Bricolage Grotesque 600–800 (`--display`) for h1–h3 and big numbers. Tight tracking
  (−0.03 to −0.045em).
- **Body:** Manrope (`--sans`), 14–18px, line-height 1.5–1.65.
- **Mono:** JetBrains Mono (`--mono`) for prices, amounts, addresses only.
- Minimum size 12px anywhere.

## Components

| Component | Class | Notes |
|---|---|---|
| Primary / secondary button | `.primary-button`, `.secondary-button` | Pills, min 46px tall (52px in heroes). One primary per view. |
| Live / next / idle pill | `.live-pill`, `.soon-pill`, `.idle-pill` | The only status vocabulary. |
| Label | `.eyebrow` | 13px bold sentence case. |
| Room card | `.discovery-card` | 16:9 poster first, title in display face, follow + open actions. |
| Showcase room (home hero) | `.showcase-*` | One real room: Live, Next show or Between shows. Never fake chat. |
| Room views switch | `.room-modes` | Desktop only; phones use the room tab bar. |
| Pulse panel | `.room-pulse` | Four stats + "How Pulse is counted". |
| Phone tab bar | `.tab-bar` | Home, Watch, Discover, Following, Create. Hidden on rooms (they have their own tabs). |
| Footer | `.site-footer*` | Three link columns + fine print. |

## Motion

- 150–350ms with `--ease`. Lift cards by 4px on hover, never more.
- The live dot blinks; nothing else loops.
- `prefers-reduced-motion` disables the blink and card transitions.

## Layout

- `--shell`: 1200px max, 16px gutters on phones.
- Phones (≤760px): one-row header (60px), bottom tab bar (64px + safe area), no horizontal scroll.
  Verified at 375px on Home, Discover, Watch, Creators, About, Protocol, FAQ and a room.

## Accessibility

- Visible focus ring (`2px var(--lime)`) on every interactive element.
- Toggle buttons use `aria-pressed`; tab bar uses `aria-current="page"`.
- Status changes announced via `role="status"` (broadcast status, toasts).
- Don't convey live state by color alone: the pill always says "Live".
