# HYPR controlled public-testnet demo

Executed and independently checked on 2026-10-12 after explicit user approval.
This is not a real-money coin launch, a user-traction claim, or a professional audit.

## Actual room and contracts

- [Public HYPR Testnet Demo room](https://hypr-pons.vercel.app/room/0xeA3b5d2Cf6EAcD3dd6241736082b7698E519a675)
- Token: [0xeA3b5d2Cf6EAcD3dd6241736082b7698E519a675](https://explorer.testnet.chain.robinhood.com/address/0xeA3b5d2Cf6EAcD3dd6241736082b7698E519a675?tab=contract)
- Curve: [0x706b4b7F544762Fe609B648450b5F92bA1028b34](https://explorer.testnet.chain.robinhood.com/address/0x706b4b7F544762Fe609B648450b5F92bA1028b34?tab=contract)
- Name/symbol: `HYPR Testnet Demo` / `HYPRTEST`.
- Chain: Robinhood testnet, 46630. Creator and approved protocol recipient:
  `0xE698beD535d853f002b1f448549D38ba8343Afa0`.
- Both new contracts have exact-match explorer verification. Their factory and
  adapter were already exact-match verified.

## Six successful public-chain transactions

| Step | Transaction |
| --- | --- |
| Create | [0x0bbb0501…319d19dc](https://explorer.testnet.chain.robinhood.com/tx/0x0bbb0501048fb8cb2c12bc7eb10b62a391bf5876eb3a7f1338b25728319d19dc) |
| Buy with 0.001 test ETH | [0x9247c02a…68e6032](https://explorer.testnet.chain.robinhood.com/tx/0x9247c02a966cf85d21962d723eeda47f20dd1ac887098a40a5b86d53a68e6032) |
| Exact half-inventory approval | [0x696e6c89…dbd840d](https://explorer.testnet.chain.robinhood.com/tx/0x696e6c8910fa76c5b0de183c8707eb8fc1853483d377eec1136cdcb98dbd840d) |
| Sell half | [0x6c5f10a8…0fbd41a](https://explorer.testnet.chain.robinhood.com/tx/0x6c5f10a89511fd69940107c2328551811dae972781934ab5b98513de90fbd41a) |
| Claim creator fees | [0xfecf8746…428e6cdd](https://explorer.testnet.chain.robinhood.com/tx/0xfecf87462cd891cada02f6278f6444fd883c13fa2b08e5380eaeeba6428e6cdd) |
| Claim HYPR protocol fees | [0x8c2c5383…938e08a](https://explorer.testnet.chain.robinhood.com/tx/0x8c2c5383afcaea16afa8b57b4ba786d9bf426b4bf1eeaa91f2375b885938e08a) |

Every receipt succeeded and was checked after two confirmations. Full public
receipts, decoded events, nonce/gas limits, and before/after snapshots are saved
in [the evidence JSON](evidence/hypr-testnet-demo-20261012.json).

## Accounting and budget

- Approval ceiling: 0.003 test ETH including gross buy value and bounded gas.
- Gross buy: 0.001 test ETH.
- Sum of buy value plus each transaction's maximum gas/fee reservation:
  0.00105455220272761 test ETH, below the approved ceiling.
- Actual receipt gas cost: 0.00002037705 test ETH.
- Buy output: 15.799843976540731661 HYPRTEST.
- Half sold: 7.899921988270365830 HYPRTEST, leaving
  7.899921988270365831 HYPRTEST in the test wallet.
- Creator fees claimed: 0.000004481257313635 test ETH.
- HYPR fees claimed: 0.000014190648159847 test ETH.
- Curve reserve after sell and both claims: 0.000493747562121412 test ETH.
- Both fee ledgers now equal zero because the fees were withdrawn, not because
  they failed to accrue. Curve ETH balance equals its reserve after both claims.
- The fee recipients are the same explicitly approved test wallet, but the two
  ledgers, event kinds and claim transactions are distinct. No independent users
  or production payouts are implied.

The corrected independent `CheckHYPRLaunch.s.sol` passed against the public RPC.
Live inventory consists of recorded tradable inventory plus the fixed 200,000
token graduation allocation. Four new regression tests cover fresh, traded,
graduated, and mismatched inventory. No deployed contract or economics changed.

## Hosted and authorization checks

- Hosted runtime smoke passed with `native-rpc` and the real room.
- Hosted API returned the canonical creator, token, curve, reserve, two confirmed
  trades and the zero post-claim fee balances.
- Actual Supabase-backed ownership challenge and verification succeeded;
  replay of the consumed challenge was rejected.
- Native host authorization accepted the indexed creator's valid signature,
  returned a no-store room-specific publish token, and rejected a non-creator.
- Viewer access to the offline creator room was correctly rejected.
- Tokens/signatures/private wallet material were not printed into evidence.

## Browser corrections discovered by this demo

- Removed the trade input/phase circular dependency: a read-only public testnet
  phase lookup runs before any amount is entered or wallet is connected.
- Sell fee preview now uses the returned fee field, not gross proceeds.
- Amount/direction changes invalidate older quotes immediately; late responses
  are discarded and submission requires a quote bound to the current input.
- Curve progress preserves small real reserves rather than rounding every tiny
  testnet trade to zero: current progress is approximately 0.004937%.
- Outstanding fee balances are labeled **unclaimed**, not lifetime earnings.
- Real rooms start with empty local-preview chat, not seeded fake participants.
- The static sample activity chart is absent from real rooms; missing history
  is explicitly disclosed. Creator attribution comes from the factory event.

## Still not verified or launched

- These chain actions were signed locally by the encrypted dedicated test wallet,
  not through an end-user browser wallet. Browser-wallet signing remains a
  separate acceptance test.
- No camera/microphone access, creator-viewer media session, or public broadcast
  was started. Host-token issuance is not proof of video delivery.
- No public-chain graduation: the unchanged threshold is 10 ETH net reserves,
  roughly 10.1266 gross test ETH from zero plus gas. Current faucet funds are
  insufficient. Existing graduation proof is explicitly fork/test-suite proof.
- Persistent shared chat/follows, unattended indexing/backfill, moderation,
  professional review and mainnet release gates remain open.
