# ADR-003: On-Device AI Jury with On-Chain Enforcement

## Context

Every prediction market needs settlement - someone must decide who won the bet. Centralized platforms use an oracle or an admin. Punt cannot: there is no server, no admin, and no single trusted peer. The settlement mechanism must be decentralized, verifiable, and enforceable without a central authority.

## Decision

Three jurors each run a **local QVAC LLM at temperature 0** to grade the bet against official match data (football-data.org). Each juror signs their verdict with their **WDK EVM key** (EIP-191 signature over `keccak256("PUNT_VERDICT", chainId, escrowAddress, betId, winner)`). The escrow contract (`Escrow.sol`) verifies 2-of-3 distinct juror signatures via **`ecrecover`** before releasing the pot.

The juror keys are listed in the escrow at pot creation - a joiner verifies the jury set before staking. The contract enforces that `winner` must be either `creator` or `joiner` - a juror cannot redirect the pot.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Centralized oracle** (e.g., Chainlink, a trusted API) | Violates "no server" proposition. A single oracle is a single point of failure and a single point of corruption. |
| **Cloud LLM** (OpenAI, Anthropic API) | Violates the QVAC track requirement (all AI must be on-device). Also introduces an API key dependency - the app stops working if the key rotates or the endpoint goes down. |
| **Majority vote without on-chain enforcement** | A gossiped majority verdict is not enforceable. The losing peer could simply refuse to pay. On-chain escrow + `ecrecover` makes the verdict mechanically inevitable - the contract pays the winner, not the loser. |
| **5-of-7 or larger jury** | More jurors means lower probability of collusion but higher coordination cost. 2-of-3 is the minimal honest-majority threshold - only one juror needs to be honest. |
| **zk-proof of LLM inference** | A zero-knowledge proof that a specific model produced a specific output would be cryptographically ideal but is not practical for a 4B-parameter model in 2026. EIP-191 signatures over the verdict are the pragmatic equivalent - the juror cryptographically commits to their grade. |

## Consequences

- **Positive:** Settlement is trustless within the honest-majority assumption. One honest juror is enough to prevent a false verdict.
- **Positive:** The jury mechanism is transparent - any peer can verify signatures with `verdict.js:verifyVerdict()` without running an LLM.
- **Positive:** Jurors never hold stakes and never need gas. They only sign and gossip.
- **Negative:** Honest-majority is an assumption, not a guarantee. Two colluding jurors can steal the pot. This is documented in the README and accepted for the prototype scope.
- **Negative:** Temperature 0 grading is deterministic but not infallible - the model can still misread the evidence (see ADR-006).

## References

- `contracts/Escrow.sol:settle()` - on-chain 2-of-3 verification
- `packages/shared/verdict.js` - off-chain signing and verification
- `packages/juror/grade.js` - grading prompt and extraction
- `packages/juror/index.js` - juror daemon loop
