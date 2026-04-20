const xrpl = require("xrpl");
const fs = require("fs");

const TESTNET_WS = "wss://s.altnet.rippletest.net:51233";
const WALLETS_FILE = "./wallets.json";

const MARKET_MAP = {
  KC:  "kcClinic",
  STL: "stlClinic",
  TX:  "txClinic",
  NV:  "nvClinic",
  IN:  "inClinic",
};

function usage() {
  console.error("Usage: node settle-real.js <settlementAmount> <lienCoPercent> <market>");
  console.error("  Markets : KC | STL | TX | NV | IN");
  console.error("  Example : node settle-real.js 8500 70 KC");
  process.exit(1);
}

async function main() {
  const [,, rawAmount, rawPercent, market] = process.argv;
  if (!rawAmount || !rawPercent || !market) usage();

  const settlementAmount = parseInt(rawAmount, 10);
  const lienCoPercent   = parseInt(rawPercent, 10);
  const marketKey       = MARKET_MAP[market.toUpperCase()];

  if (isNaN(settlementAmount) || isNaN(lienCoPercent) || lienCoPercent < 1 || lienCoPercent > 99) usage();
  if (!marketKey) {
    console.error(`Unknown market "${market}". Valid options: ${Object.keys(MARKET_MAP).join(", ")}`);
    process.exit(1);
  }

  const clinicPercent = 100 - lienCoPercent;
  const lienCoDrops   = Math.floor(settlementAmount * lienCoPercent / 100);
  const clinicDrops   = settlementAmount - lienCoDrops;

  if (!fs.existsSync(WALLETS_FILE)) {
    console.error(`${WALLETS_FILE} not found — run setup-markets.js first`);
    process.exit(1);
  }

  const saved   = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"));
  const lienCo  = xrpl.Wallet.fromSeed(saved.lienCo.seed);
  const clinic  = xrpl.Wallet.fromSeed(saved[marketKey].seed);
  const clinicLabel = saved[marketKey].label;

  const client = new xrpl.Client(TESTNET_WS);
  await client.connect();
  console.log("Connected to XRPL Testnet\n");

  // Fund a simulated attorney wallet for TX1
  process.stdout.write("Funding simulated attorney wallet...");
  const { wallet: attorney } = await client.fundWallet();
  console.log(` ${attorney.address}\n`);

  const timestamp = new Date().toISOString();
  const memoTypeHex = Buffer.from("application/json", "utf8").toString("hex").toUpperCase();

  // --- TX 1: Attorney → LienCo (full settlement received) ---
  const memo1 = {
    event:            "settlement_received",
    market,
    settlementAmount,
    lienCoPercent,
    clinicPercent,
    lienCoDrops,
    clinicDrops,
    note:             `Attorney remits full $${settlementAmount} settlement for ${market} market lien`,
    timestamp,
  };
  const memoHex1 = Buffer.from(JSON.stringify(memo1), "utf8").toString("hex").toUpperCase();

  console.log(`TX 1: Attorney → LienCo   (${settlementAmount} drops = full settlement)...`);
  const tx1 = await client.submitAndWait(
    {
      TransactionType: "Payment",
      Account:         attorney.address,
      Destination:     lienCo.address,
      Amount:          String(settlementAmount),
      Memos: [{ Memo: { MemoData: memoHex1, MemoType: memoTypeHex } }],
    },
    { wallet: attorney }
  );

  if (tx1.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`TX 1 failed: ${tx1.result.meta.TransactionResult}`);
  }
  const hash1 = tx1.result.hash;
  console.log(`  Result : ${tx1.result.meta.TransactionResult}`);

  // --- TX 2: LienCo → Clinic (clinic share) ---
  const memo2 = {
    event:            "settlement_clinic_disbursement",
    market,
    clinicLabel,
    settlementAmount,
    lienCoPercent,
    clinicPercent,
    lienCoDrops,
    clinicDrops,
    note:             `${clinicLabel} receives ${clinicPercent}% of $${settlementAmount} settlement`,
    timestamp,
  };
  const memoHex2 = Buffer.from(JSON.stringify(memo2), "utf8").toString("hex").toUpperCase();

  console.log(`TX 2: LienCo → ${clinicLabel.padEnd(9)} (${clinicDrops} drops = ${clinicPercent}% share)...`);
  const tx2 = await client.submitAndWait(
    {
      TransactionType: "Payment",
      Account:         lienCo.address,
      Destination:     clinic.address,
      Amount:          String(clinicDrops),
      Memos: [{ Memo: { MemoData: memoHex2, MemoType: memoTypeHex } }],
    },
    { wallet: lienCo }
  );

  if (tx2.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`TX 2 failed: ${tx2.result.meta.TransactionResult}`);
  }
  const hash2 = tx2.result.hash;
  console.log(`  Result : ${tx2.result.meta.TransactionResult}`);

  console.log("\n--- Settlement Summary ---");
  console.log(`Market           : ${market} (${clinicLabel})`);
  console.log(`Settlement Total : ${settlementAmount} drops`);
  console.log(`Split            : LienCo ${lienCoPercent}% (${lienCoDrops} drops) | ${clinicLabel} ${clinicPercent}% (${clinicDrops} drops)`);
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
