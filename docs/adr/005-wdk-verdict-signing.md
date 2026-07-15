# ADR-005: WDK Signing for Juror Verdicts

## Context

Juror verdicts are cryptographic commitments - they must be signed by the juror's key so the escrow contract can verify them on-chain. The question is: which key stack, and what signature format?

Punt already uses WDK for staking (create/join pots). The juror key could be a separate keypair, but using the same stack has advantages in consistency, tooling, and the judge narrative.

## Decision

Use the **same WDK EVM key** for both staking and jury verdicts. Every juror has a self-custodial WDK wallet (BIP-39 mnemonic). They sign verdicts with `account.signMessage()` - the WDK-native signing method that produces EIP-191 signatures identical to ethers `Wallet.signMessage()`.

The digest layout is:
```
keccak256("PUNT_VERDICT", chainId, escrowAddress, betId, winner)
```

The contract prepends the EIP-191 prefix (`\x19Ethereum Signed Message:\n32`) and recovers with `ecrecover`. This layout is byte-identical between `verdict.js:verdictDigest()` and `Escrow.sol:settle()`.

The `signVerdict()` function accepts either an ethers wallet or a WDK account - both delegate to the same primitive, so the signature is identical and recovers the same address.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Separate jury keypair (not WDK)** | Adds a second key management burden. Using one key stack for everything means one mnemonic, one backup, one identity. Also simpler for the judge narrative: "every signature in Punt is WDK-native." |
| **EIP-712 typed data** | Would require the contract to verify via `ecrecover` over a typed data hash. EIP-191 is simpler, well-tested, and sufficient for a single-value commitment. |
| **Ed25519 or non-EVM signatures** | The escrow contract runs on an EVM chain. `ecrecover` is the only native signature verification available in Solidity without precompiles. Using the EVM-native key type avoids cross-curve bridging. |
| **Compatibility with `@tetherto/wdk-wallet-evm` `sign()` vs `signMessage()`** | `account.sign()` signs raw bytes; `account.signMessage()` adds the EIP-191 prefix. The contract expects the prefix, so `signMessage()` is correct. `signVerdict()` normalizes to this. |

## Consequences

- **Positive:** One key per peer - stakes and verdicts share the same identity. The UI can show "your wallet" for both.
- **Positive:** The `signVerdict` abstraction accepts both ethers and WDK signers, so tests can use ephemeral ethers wallets without the full WDK stack.
- **Negative:** If a juror's key is compromised, both their verdict authority and any funds in the wallet are at risk. In production, a derived key or separate signer would be warranted.

## References

- `packages/shared/verdict.js:verdictDigest()` - digest construction
- `packages/shared/verdict.js:signVerdict()` - signer-agnostic signature
- `contracts/Escrow.sol:settle()` - on-chain recovery
- `packages/shared/wdk.js:signingAccount()` - WDK wallet derivation
