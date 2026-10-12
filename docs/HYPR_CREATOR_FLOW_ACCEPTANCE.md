# Creator flow improvements — 2026-10-12

## Real user launches, not another agent-created coin

The connected Phantom address `0x342209E9C6538b093AdBeE755808ad0546077A87`
successfully submitted two testnet launches after the approved gas funding:

- `0xcac51e95f6b5b41a4f7ed3362d0ef6d45832d1c94e8d6c181b6ee09d9b9f0e21`
  created token `0x2Af33FB80dF76B10711d37cC85Ec99ab93F7FB52`.
- `0x50957cdd0c1f3a0ed7f7038ebb4e6627a4cb358c8c7bc7367b7043cccb851aa5`
  created token `0x93376cb24809d56175D55eAd36Fe60D125eDE411`.

The latest receipt succeeded at block 133786653. The canonical factory event
matches the user's wallet, token and curve. Public protocol API discovery returned
both user launches and the earlier dedicated demo. The original client still
displayed one old room: navigating to its own home URL via a Link did not refresh
the existing server-rendered data. A success text left users with no direct room
link, encouraging another submission instead of showing the completed journey.

## Implemented acceptance boundaries

- Transaction submission and coin/room readiness are separate visible stages.
- A valid returned transaction hash is saved per wallet/factory/testnet and
  recovered after refresh. Older browser sessions recover the latest confirmed
  launch for the already connected wallet without prompting or signing.
- Pending setup replaces the create form; no duplicate-create action is shown.
- An explicit **Create another coin** action appears only after room readiness or
  a confirmed reverted transaction.
- The status endpoint reads the exact receipt, checks the RPC chain and canonical
  factory event, preserves the indexer's full 12-block confirmation depth, and
  persists the launch before returning its canonical room link.
- Exact-receipt recovery works beyond the recent 2,500-block discovery window.
- Read failures and slow room persistence keep the transaction link and safe
  retry path; they never claim the coin failed or send another transaction.
- Readiness refreshes the discovery data. **Open your room** navigates directly
  to its actual token address rather than asking users to find it manually.
- Testnet-only discovery is labeled testnet, not incorrectly "mixed sources";
  real missing social/market data remains disclosed. Native launches are sorted
  newest-first before room conversion.
- Supply, fee and contract details are available under an expandable section.
- Creator broadcasting checks the network and exact indexed creator before
  requesting a wallet signature. Device/permission errors remain visible after
  the media room mounts, and connection status is not presented as proven live
  media before a connection exists.
- The studio explains free wallet authorization and subsequent camera/audio
  sharing via LiveKit. Opening the room does not start a broadcast.

## Verification and remaining gates

71 application tests (including 11 new recovery/access tests), typecheck, lint,
production build and client-secret scan passed locally before publication.
No new coin, browser signature, camera/microphone permission, public broadcast,
mainnet transfer or paid plan is part of these changes.

This is an improved testnet creator journey, not proof of complete consumer
launch readiness. Real creator/viewer video delivery, shared social persistence,
unattended backfill/moderation, graduation funding and professional security/legal
review remain separate acceptance gates.
