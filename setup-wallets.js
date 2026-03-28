const xrpl = require("xrpl");
const fs = require("fs");

const WALLETS_FILE = "./wallets.json";

async function main() {
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();
  console.log("Connected to XRPL Testnet");

  // Generate and fund LienCo wallet
  console.log("\nFunding LienCo wallet...");
  const { wallet: lienCoWallet } = await client.fundWallet();
  console.log("LienCo wallet funded.");

  // Generate and fund Clinic wallet
  console.log("Funding Clinic wallet...");
  const { wallet: clinicWallet } = await client.fundWallet();
  console.log("Clinic wallet funded.");

  // Fetch balances
  const lienCoInfo = await client.request({
    command: "account_info",
    account: lienCoWallet.address,
    ledger_index: "validated",
  });

  const clinicInfo = await client.request({
    command: "account_info",
    account: clinicWallet.address,
    ledger_index: "validated",
  });

  const lienCoBalance = xrpl.dropsToXrp(lienCoInfo.result.account_data.Balance);
  const clinicBalance = xrpl.dropsToXrp(clinicInfo.result.account_data.Balance);

  // Persist wallet credentials
  const walletData = {
    lienCo: {
      address: lienCoWallet.address,
      seed: lienCoWallet.seed,
    },
    clinic: {
      address: clinicWallet.address,
      seed: clinicWallet.seed,
    },
  };
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(walletData, null, 2));
  console.log(`\nWallet credentials saved to ${WALLETS_FILE}`);

  console.log("\n--- Wallet Summary ---");
  console.log(`LienCo  Address : ${lienCoWallet.address}`);
  console.log(`LienCo  Balance : ${lienCoBalance} XRP`);
  console.log(`Clinic  Address : ${clinicWallet.address}`);
  console.log(`Clinic  Balance : ${clinicBalance} XRP`);

  await client.disconnect();
}

main().catch(console.error);
