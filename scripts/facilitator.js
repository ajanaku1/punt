/**
 * Gasless facilitator - relays EIP-3009 TransferWithAuthorization signed by
 * peers, paying gas from a funded sponsor wallet. Standalone script; runs
 * alongside the peer daemon.
 *
 * Env: FACILITATOR_MNEMONIC (BIP-39 seed), PUNTUSDT_CONTRACT, RPC_URL
 *
 * Wire: peers POST signed authorization payloads to POST /relay/transfer
 * (JSON body with from, to, value, validAfter, validBefore, nonce, v, r, s).
 * The facilitator validates the signature against the PuntUSDT contract's
 * DOMAIN_SEPARATOR, then calls transferWithAuthorization.
 *
 * Usage: node scripts/facilitator.js
 */
import http from "node:http";
import { readEnvFile, ROOT } from "./env-file.js";
import { ethers } from "ethers";

const env = Object.fromEntries(await readEnvFile());
const MNEMONIC = env.FACILITATOR_MNEMONIC;
const USDT = env.PUNTUSDT_CONTRACT ?? env.USDT_CONTRACT;
const RPC = env.RPC_URL;
const PORT = Number(process.env.PUNT_FACILITATOR_PORT ?? 9780);

if (!MNEMONIC || !USDT || !RPC) {
  console.error("FACILITATOR_MNEMONIC, PUNTUSDT_CONTRACT, and RPC_URL required in .env");
  process.exit(1);
}

// ── Sponsor wallet ──────────────────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(RPC);
const sponsor = ethers.Wallet.fromPhrase(MNEMONIC).connect(provider);
const sponsorAddr = await sponsor.getAddress();

const puntUsdt = new ethers.Contract(
  USDT,
  [
    "function transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
    "function balanceOf(address) view returns (uint256)",
    "function DOMAIN_SEPARATOR() view returns (bytes32)",
  ],
  sponsor,
);

const [ethBal, usdtBal, domainSeparator] = await Promise.all([
  provider.getBalance(sponsorAddr),
  puntUsdt.balanceOf(sponsorAddr),
  puntUsdt.DOMAIN_SEPARATOR(),
]);

console.log(`[facilitator] sponsor ${sponsorAddr}`);
console.log(`[facilitator] ETH ${ethers.formatEther(ethBal)}  USDT ${Number(usdtBal) / 1e6}`);
console.log(`[facilitator] PuntUSDT ${USDT}  domain ${domainSeparator}`);

// ── EIP-3009 digest verification ────────────────────────────────────────

const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = ethers.id(
  "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)",
);

function verifyAuthorization({ from, to, value, validAfter, validBefore, nonce, v, r, s }) {
  const structHash = ethers.solidityPackedKeccak256(
    ["bytes32", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
    [TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce],
  );
  const digest = ethers.solidityPackedKeccak256(
    ["bytes2", "bytes32", "bytes32"],
    ["0x1901", domainSeparator, structHash],
  );
  const recovered = ethers.recoverAddress(digest, { v, r, s });
  return recovered === from;
}

// ── HTTP server ─────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/relay/transfer") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);

        // Verify the authorization before spending gas
        if (!verifyAuthorization(payload)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "invalid authorization signature" }));
          return;
        }

        const { from, to, value, validAfter, validBefore, nonce, v, r, s } = payload;

        const tx = await puntUsdt.transferWithAuthorization(
          from, to, value, validAfter, validBefore, nonce, v, r, s,
        );
        const receipt = await tx.wait();
        console.log(`[facilitator] relayed tx ${tx.hash}  ${value / 1e6} USDT  ${from.slice(0, 6)}… → ${to.slice(0, 6)}…`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, txHash: tx.hash, blockNumber: receipt.blockNumber }));
      } catch (err) {
        console.error(`[facilitator] relay failed: ${err.shortMessage ?? err.message}`);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.shortMessage ?? err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("facilitator: POST /relay/transfer");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[facilitator] listening on http://127.0.0.1:${PORT}`);
  console.log("[facilitator] ready - peers can POST /relay/transfer");
});
