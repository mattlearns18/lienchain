// src/lib/network.js
//
// Single source of truth for the active XRPL network. Everything that
// touches a wallet, endpoint, or explorer URL reads from getNetworkConfig().
// Throws loudly at module load if VITE_NETWORK is invalid, or at first
// getNetworkConfig() call if mainnet is selected without a seed — prevents
// silent fallback to testnet behavior under a mainnet flag.

const NETWORK = import.meta.env.VITE_NETWORK || "testnet";

const CONFIGS = {
  testnet: {
    name:       "testnet",
    seed:       import.meta.env.VITE_LIENCO_TESTNET_SEED,
    wssUrl:     import.meta.env.VITE_XRPL_TESTNET_WSS || "wss://s.altnet.rippletest.net:51233",
    explorer:   "https://testnet.xrpl.org/transactions/",
    accountUrl: "https://testnet.xrpl.org/accounts/",
    isMainnet:  false,
  },
  mainnet: {
    name:       "mainnet",
    seed:       import.meta.env.VITE_LIENCO_MAINNET_SEED,
    wssUrl:     import.meta.env.VITE_XRPL_MAINNET_WSS || "wss://xrplcluster.com",
    explorer:   "https://livenet.xrpl.org/transactions/",
    accountUrl: "https://livenet.xrpl.org/accounts/",
    isMainnet:  true,
  },
};

if (!CONFIGS[NETWORK]) {
  throw new Error(`Invalid VITE_NETWORK: "${NETWORK}". Must be 'testnet' or 'mainnet'.`);
}

export function getNetworkConfig() {
  const cfg = CONFIGS[NETWORK];
  if (cfg.isMainnet && !cfg.seed) {
    throw new Error("VITE_NETWORK=mainnet but VITE_LIENCO_MAINNET_SEED is empty. Mainnet seed not configured.");
  }
  return cfg;
}

export const IS_MAINNET    = CONFIGS[NETWORK].isMainnet;
export const NETWORK_NAME  = CONFIGS[NETWORK].name;
