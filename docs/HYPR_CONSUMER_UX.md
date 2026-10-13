# Consumer room UX

HYPR remains a testnet MVP. These improvements do not imply mainnet readiness, a professional security audit, million-user capacity, or a completed real-media acceptance test.

## Viewer journey

- Watch-first room: a compact identity and testnet notice, then the broadcast player. Watching never requires a wallet, a token purchase, or camera/microphone access.
- Desktop: the player and chat are adjacent; trading and About are secondary sections.
- Mobile: Chat / Trade / About navigation shows one section at a time. Switching tabs does not unmount an active broadcast or erase an entered amount/message.
- Prices, balances, broadcast state, and chat remain actual chain/service data. Unavailable values are not replaced with sample activity.
- Technical accounting is in Trading details; fees and purchase risks stay visible in the trade flow.

## Wallet and trade journey

- EIP-6963 wallet discovery lets users select a recognized installed provider. All signing flows use that selected provider; wallet metadata is treated as untrusted text.
- The connected-wallet button opens an account panel, not an immediate disconnect. Native controls require testnet 46630; mainnet 4663 is not marked trade-ready.
- Mobile browsers without injected providers receive explicit wallet-browser instructions. This is not WalletConnect support; real iOS/Android wallet interoperability still requires testing.
- Quotes are viewable without a wallet. A distinct review names the token, input, estimated output, minimum output, included trading fee, and extra network fee.
- Buy network fees are estimated when the connected wallet supports it. Otherwise the wallet supplies the final fee; no network estimate is invented.
- Reviewed quotes expire after 30 seconds and preserve the reviewed 2% minimum output. The live quote, signer/network, ETH balance, and sell token balance are checked before submission.
- Sell uses an exact token allowance, then a sale. A changed price after approval stops the sale and explains that the allowance already succeeded.
- Transaction hashes are displayed immediately. Pending hashes are saved per testnet/curve/account when browser storage is available. An uncertain receipt blocks duplicate submissions until explicitly checked.

## Creator journey and privacy

- Creator controls are separated from the watcher experience. The indexed creator is still checked on the server before issuing a publishing token.
- Camera and microphone start OFF. Opening the studio makes no media request.
- A user-initiated private device preview requests permission but does not publish or record. Preview tracks stop when preferences change, the preview/studio closes, the page unmounts, or broadcasting starts.
- A separate Start broadcast action requires a preview, creator-wallet authorization, and deliberate user action. Only actually published, unmuted creator tracks count as LIVE.
- End broadcast is distinct from leaving as a viewer. Viewer controls never request capture devices.

## Acceptance checks

1. Fresh wallet-free visitor: discover a room, find the player and read chat without any wallet/media prompt.
2. Phone-sized layouts: no horizontal overflow; Chat, Trade, and About remain reachable; opening a review preserves its fees and risk disclosures.
3. Buy/sell reviews: verify the named token, fee math, 2% minimum, expiry, insufficient funding, insufficient tokens, and transaction recovery with mocked providers. Never send test transactions solely to validate visual layout.
4. Installed wallets: inspect provider choices and account menu without accepting connection/signing requests on the user's behalf.
5. Creator studio: confirm both devices off and disabled preview/start with no selection. Do not enable personal media during automation without explicit approval.

Outstanding external acceptance: real iOS/Android wallet browsers, virtual keyboard/orientation behavior, actual creator-to-viewer media delivery with an approved source, and a five-person novice usability test. Capacity and protocol-economics review are separate from UI acceptance.
