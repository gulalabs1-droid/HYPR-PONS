# Phantom launch diagnosis — 2026-10-12

Inspected the user's existing HYPR page in Brave and the actual Phantom extension.
Phantom's receive dialog showed **Robinhood Chain Testnet**, with public address
`0x342209E9C6538b093AdBeE755808ad0546077A87` matching HYPR's connected address.
This was not an unverified inference about Brave Wallet or a chain-switch failure.

Independent official testnet RPC checks returned chain 46630, balance **0 test ETH**,
confirmed transaction nonce 0, and pending nonce 0. The connected account therefore
had no gas funds and no outgoing confirmed/pending transactions at the check.
The previously funded dedicated demo wallet is a different account.

A read-only `createLaunch("mm", "MM")` simulation succeeded against the actual
factory, so the supplied metadata and current factory path do not explain a
contract revert. Approximate execution gas was 1,737,912 at 10,000,000 wei/gas;
this estimate is not a guaranteed final wallet fee. No transaction was broadcast.

## Corrections

- Creation checks the exact public RPC chain and connected account's gas balance.
- A zero balance stops before gas estimation or `eth_sendTransaction`, and gives
  the full public funding address and the official free testnet faucet link.
- Funded accounts receive a public-RPC contract gas estimate; low balances and
  invalid gas estimates fail closed. Gas includes a 20% margin, with a 2x-price
  funding budget (the wallet still presents the final fee).
- UTF-8 name/symbol limits and normalized symbols are checked before RPC calls.
- Account/network are rechecked immediately before the wallet request.
- Generic wallet errors no longer imply success or recommend blind retries.
  Receipt/recovery links remain visible if a transaction hash was returned.
- Seven new regressions cover zero/low funds, wrong chain, encoding, metadata,
  failed estimates, and ordinary-object wallet errors.

Funding a different wallet is a separate user-approved testnet transfer or faucet
request. Nothing here authorizes a browser transaction signature, imports any
wallet key, or claims that live video was tested.
