const xrpl = require("xrpl");
const fs = require("fs");

const WALLETS_FILE = "./wallets.json";
const TESTNET_WS = "wss://s.altnet.rippletest.net:51233";

function usage() {
  console.error("Usage: node settle-lien.js <settlementAmount> <lienCoPercent>");
  console.error("  e.g. node settle-lien.js 8500 68");
  process.exit(1);
}

async function main() {
  const [,, rawAmount, rawPercent] = process.argv;
  if (!rawAmount || !rawPercent) usage();

  const settlementAmount = parseInt(rawAmount, 10);
  const lienCoPercent = parseInt(rawPercent, 10);
  if (isNaN(settlementAmount) || isNaN(lienCoPercent) || lienCoPercent < 1 || lienCoPercent > 99) usage();

  const clinicPercent = 100 - lienCoPercent;
  // Treat settlement amount as drops (1 XRP = 1,000,000 drops)
  // This keeps amounts feasible on testnet while preserving the numeric split
  const totalDrops = settlementAmount;
  const lienCoDrops = Math.floor(totalDrops * lienCoPercent / 100);
  const clinicDrops = totalDrops - lienCoDrops;

  const client = new xrpl.Client(TESTNET_WS);
  await client.connect();
  console.log("Connected to XRPL Testnet\n");

  // Load LienCo and Clinic wallets
  if (!fs.existsSync(WALLETS_FILE)) {
    console.error(`${WALLETS_FILE} not found — run setup-wallets.js first`);
    process.exit(1);
  }
  const saved = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"));
  const lienCo = xrpl.Wallet.fromSeed(saved.lienCo.seed);
  const clinic = xrpl.Wallet.fromSeed(saved.clinic.seed);

  // Fund a fresh simulated attorney wallet
  console.log("Funding simulated attorney wallet from testnet faucet...");
  const { wallet: attorney } = await client.fundWallet();
  console.log(`Attorney: ${attorney.address}\n`);

  const timestamp = new Date().toISOString();

  // --- TX 1: Attorney → LienCo (full settlement) ---
  const settleMemo = {
    event: "settlement_received",
    settlementAmount: settlementAmount,
    lienRef: "PI-LIEN-2025-11-001",
    clinicID: "KC-PI-789",
    timestamp,
  };
  const settleMemoHex = Buffer.from(JSON.stringify(settleMemo), "utf8").toString("hex").toUpperCase();
  const memoTypeHex = Buffer.from("application/json", "utf8").toString("hex").toUpperCase();

  console.log(`TX 1: Attorney → LienCo  (${totalDrops} drops = full settlement)...`);
  const tx1 = await client.submitAndWait(
    {
      TransactionType: "Payment",
      Account: attorney.address,
      Destination: lienCo.address,
      Amount: String(totalDrops),
      Memos: [{ Memo: { MemoData: settleMemoHex, MemoType: memoTypeHex } }],
    },
    { wallet: attorney }
  );

  if (tx1.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`TX 1 failed: ${tx1.result.meta.TransactionResult}`);
  }
  const hash1 = tx1.result.hash;
  console.log(`  Result : ${tx1.result.meta.TransactionResult}`);

  // --- TX 2: LienCo → Clinic (clinic's share) ---
  const splitMemo = {
    event: "lien_split_disbursement",
    settlementAmount: settlementAmount,
    lienCoPercent,
    clinicPercent,
    lienCoDrops,
    clinicDrops,
    reductionNote: `Bill reduced from original. LienCo retains ${lienCoPercent}% (${lienCoDrops} drops), Clinic receives ${clinicPercent}% (${clinicDrops} drops).`,
    lienRef: "PI-LIEN-2025-11-001",
    clinicID: "KC-PI-789",
    timestamp,
  };
  const splitMemoHex = Buffer.from(JSON.stringify(splitMemo), "utf8").toString("hex").toUpperCase();

  console.log(`TX 2: LienCo → Clinic    (${clinicDrops} drops = ${clinicPercent}%)...`);
  const tx2 = await client.submitAndWait(
    {
      TransactionType: "Payment",
      Account: lienCo.address,
      Destination: clinic.address,
      Amount: String(clinicDrops),
      Memos: [{ Memo: { MemoData: splitMemoHex, MemoType: memoTypeHex } }],
    },
    { wallet: lienCo }
  );

  if (tx2.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`TX 2 failed: ${tx2.result.meta.TransactionResult}`);
  }
  const hash2 = tx2.result.hash;
  console.log(`  Result : ${tx2.result.meta.TransactionResult}`);

  // --- Summary ---
  console.log("\n--- Settlement Summary ---");
  console.log(`Lien Ref         : PI-LIEN-2025-11-001`);
  console.log(`Settlement Total : ${settlementAmount} drops (${xrpl.dropsToXrp(String(settlementAmount))} XRP)`);
  console.log(`Split            : LienCo ${lienCoPercent}% (${lienCoDrops} drops) | Clinic ${clinicPercent}% (${clinicDrops} drops)`);
  console.log(`Timestamp        : ${timestamp}`);
  console.log("");
  console.log(`TX 1 Hash  : ${hash1}`);
  console.log(`TX 1 Link  : https://testnet.xrpl.org/transactions/${hash1}`);
  console.log("");
  console.log(`TX 2 Hash  : ${hash2}`);
  console.log(`TX 2 Link  : https://testnet.xrpl.org/transactions/${hash2}`);

  await client.disconnect();
}

main().catch(console.error);
