const xrpl = require("xrpl");
const fs = require("fs");

const WALLETS_FILE = "./wallets.json";
const TESTNET_WS = "wss://s.altnet.rippletest.net:51233";
// XRPL requires non-standard (non-3-char) currencies as a 40-char hex string (20 bytes, first byte != 0x00)
const CURRENCY = Buffer.from("PILIEN", "ascii").toString("hex").toUpperCase().padEnd(40, "0");

async function loadOrCreateWallets(client) {
  if (fs.existsSync(WALLETS_FILE)) {
    console.log(`Loading wallets from ${WALLETS_FILE}...`);
    const data = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"));
    return {
      lienCo: xrpl.Wallet.fromSeed(data.lienCo.seed),
      clinic: xrpl.Wallet.fromSeed(data.clinic.seed),
    };
  }

  console.log("No wallets.json found — generating and funding new wallets...");
  const { wallet: lienCo } = await client.fundWallet();
  const { wallet: clinic } = await client.fundWallet();

  fs.writeFileSync(
    WALLETS_FILE,
    JSON.stringify(
      {
        lienCo: { address: lienCo.address, seed: lienCo.seed },
        clinic: { address: clinic.address, seed: clinic.seed },
      },
      null,
      2
    )
  );
  console.log(`Wallets saved to ${WALLETS_FILE}`);
  return { lienCo, clinic };
}

async function main() {
  const client = new xrpl.Client(TESTNET_WS);
  await client.connect();
  console.log("Connected to XRPL Testnet\n");

  const { lienCo, clinic } = await loadOrCreateWallets(client);
  console.log(`LienCo  : ${lienCo.address}`);
  console.log(`Clinic  : ${clinic.address}\n`);

  // Step 1: Clinic creates a trust line for PILIEN issued by LienCo
  console.log("Creating trust line from Clinic for PILIEN...");
  const trustSetTx = await client.submitAndWait(
    {
      TransactionType: "TrustSet",
      Account: clinic.address,
      LimitAmount: {
        currency: CURRENCY,
        issuer: lienCo.address,
        value: "1000000",
      },
    },
    { wallet: clinic }
  );

  if (trustSetTx.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`TrustSet failed: ${trustSetTx.result.meta.TransactionResult}`);
  }
  console.log("Trust line created.\n");

  // Step 2: Build memo with lien metadata
  const lienMetadata = {
    tokenName: "PI-LIEN-2025-11-001",
    billAmount: 8500,
    purchasePrice: 6630,
    discountRate: "22%",
    clinicID: "KC-PI-789",
    maturityDays: 180,
    status: "Active",
  };

  const memoHex = Buffer.from(JSON.stringify(lienMetadata), "utf8").toString("hex").toUpperCase();
  const memoTypeHex = Buffer.from("application/json", "utf8").toString("hex").toUpperCase();

  // Step 3: LienCo issues 1 PILIEN to Clinic with memo
  console.log("Issuing 1 PILIEN from LienCo to Clinic...");
  const paymentTx = await client.submitAndWait(
    {
      TransactionType: "Payment",
      Account: lienCo.address,
      Destination: clinic.address,
      Amount: {
        currency: CURRENCY,
        issuer: lienCo.address,
        value: "1",
      },
      Memos: [
        {
          Memo: {
            MemoData: memoHex,
            MemoType: memoTypeHex,
          },
        },
      ],
    },
    { wallet: lienCo }
  );

  const txResult = paymentTx.result.meta.TransactionResult;
  if (txResult !== "tesSUCCESS") {
    throw new Error(`Payment failed: ${txResult}`);
  }

  const txHash = paymentTx.result.hash;

  console.log("\n--- PILIEN Lien Issued ---");
  console.log(`Token        : ${CURRENCY}`);
  console.log(`Amount       : 1`);
  console.log(`Issuer       : ${lienCo.address} (LienCo)`);
  console.log(`Recipient    : ${clinic.address} (Clinic)`);
  console.log(`Tx Hash      : ${txHash}`);
  console.log(`Explorer     : https://testnet.xrpl.org/transactions/${txHash}`);
  console.log("\nMemo metadata:");
  console.log(JSON.stringify(lienMetadata, null, 2));

  await client.disconnect();
}

main().catch(console.error);
