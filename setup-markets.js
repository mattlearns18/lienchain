const xrpl = require("xrpl");
const fs = require("fs");

const TESTNET_WS = "wss://s.altnet.rippletest.net:51233";
const WALLETS_FILE = "./wallets.json";

const WALLETS_CONFIG = [
  { key: "lienCo",    label: "LienCo"     },
  { key: "kcClinic",  label: "KC Clinic"  },
  { key: "stlClinic", label: "STL Clinic" },
  { key: "txClinic",  label: "TX Clinic"  },
  { key: "nvClinic",  label: "NV Clinic"  },
  { key: "inClinic",  label: "IN Clinic"  },
];

async function main() {
  const client = new xrpl.Client(TESTNET_WS);
  await client.connect();
  console.log("Connected to XRPL Testnet\n");

  const results = {};

  for (const { key, label } of WALLETS_CONFIG) {
    process.stdout.write(`Funding ${label}...`);
    const { wallet } = await client.fundWallet();

    const info = await client.request({
      command: "account_info",
      account: wallet.address,
      ledger_index: "validated",
    });
    const balance = xrpl.dropsToXrp(info.result.account_data.Balance);

    results[key] = { label, address: wallet.address, seed: wallet.seed, balance };
    console.log(` done`);
  }

  fs.writeFileSync(WALLETS_FILE, JSON.stringify(results, null, 2));
  console.log(`\nWallet credentials saved to ${WALLETS_FILE}\n`);

  // Summary table
  const col = { name: 12, address: 36, balance: 10 };
  const hr = `${"─".repeat(col.name + 2)}┼${"─".repeat(col.address + 2)}┼${"─".repeat(col.balance + 2)}`;
  const row = (n, a, b) =>
    ` ${n.padEnd(col.name)} │ ${a.padEnd(col.address)} │ ${b.padStart(col.balance)} `;

  console.log(row("Wallet", "Address", "Balance (XRP)"));
  console.log(hr);
  for (const { label, address, balance } of Object.values(results)) {
    console.log(row(label, address, `${balance} XRP`));
  }

  await client.disconnect();
}

main().catch(console.error);
