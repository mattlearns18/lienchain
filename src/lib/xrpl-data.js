// XRPL Testnet data fetching via WebSocket (xrpl.js Client).
//
// Browsers block direct HTTP JSON-RPC POSTs to the XRPL testnet endpoint
// (CORS), which previously caused every balance/activity fetch here to
// reject and fall through to an em-dash placeholder. WebSocket is exempt
// from that restriction, so this module now mirrors the approach already
// proven in xrpl-tokenize.js.

import { Client } from "xrpl";

const WSS_ENDPOINT = "wss://s.altnet.rippletest.net:51233";
const CONNECT_TIMEOUT_MS = 10_000;
// Ripple epoch starts 2000-01-01; JS epoch starts 1970-01-01
const RIPPLE_EPOCH_OFFSET = 946_684_800;

function dropsToXrp(drops) {
  return (parseInt(drops, 10) / 1_000_000).toFixed(6).replace(/\.?0+$/, "");
}

function rippleToDate(rippleTs) {
  return rippleTs ? new Date((rippleTs + RIPPLE_EPOCH_OFFSET) * 1000) : null;
}

function decodeMemo(memoData) {
  if (!memoData) return null;
  try {
    const str = decodeURIComponent(
      memoData.replace(/../g, "%$&")  // hex → percent-encoded
    );
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Opens a connected client, runs `work(client)`, then always disconnects.
// Callers never see the raw client.
async function withClient(work) {
  const client = new Client(WSS_ENDPOINT, { connectionTimeout: CONNECT_TIMEOUT_MS });
  try {
    await client.connect();
    return await work(client);
  } finally {
    try { await client.disconnect(); } catch { /* ignore */ }
  }
}

// Normalize a single transaction entry into the shape the Dashboard expects.
function normalizeTx(entry, sourceWallet = null, sourceKey = null) {
  const txn    = entry.tx_json  ?? entry.tx ?? {};
  const hash   = txn.hash       ?? entry.hash ?? "";
  const amount = txn.Amount;
  const isXrp  = typeof amount === "string";
  const memo   = txn.Memos?.[0]?.Memo?.MemoData
    ? decodeMemo(txn.Memos[0].Memo.MemoData)
    : null;

  return {
    hash,
    type:        txn.TransactionType ?? "unknown",
    account:     txn.Account ?? "",
    destination: txn.Destination ?? "",
    amountRaw:   amount,
    amountXrp:   isXrp ? dropsToXrp(amount) : null,
    currency:    isXrp ? "XRP" : amount?.currency ?? "?",
    date:        rippleToDate(txn.date),
    result:      entry.meta?.TransactionResult ?? "unknown",
    memo,
    sourceWallet,
    sourceKey,
  };
}

// ---------------------------------------------------------------------------
// getWalletBalances — one WS connection, parallel account_info requests
// ---------------------------------------------------------------------------
export async function getWalletBalances(wallets) {
  return withClient(async (client) => {
    const results = await Promise.allSettled(
      wallets.map((w) =>
        client.request({
          command: "account_info",
          account: w.address,
          ledger_index: "validated",
        })
      )
    );

    return results.map((r, i) => {
      if (r.status !== "fulfilled") {
        return { ...wallets[i], balance: "—", drops: 0, error: r.reason?.message };
      }
      const drops = r.value.result.account_data?.Balance ?? "0";
      return {
        ...wallets[i],
        balance: dropsToXrp(drops),
        drops:   parseInt(drops, 10),
      };
    });
  });
}

// ---------------------------------------------------------------------------
// getRecentTransactions — account_tx for one address (reuses a client if
// provided, otherwise opens its own)
// ---------------------------------------------------------------------------
export async function getRecentTransactions(walletAddress, limit = 10) {
  return withClient(async (client) => {
    const res = await client.request({
      command: "account_tx",
      account: walletAddress,
      limit,
      ledger_index_min: -1,
      ledger_index_max: -1,
    });
    const txList = res.result?.transactions ?? [];
    return txList.map((entry) => normalizeTx(entry));
  });
}

// ---------------------------------------------------------------------------
// getAllMarketActivity — one WS connection, fan out account_tx across wallets
// ---------------------------------------------------------------------------
export async function getAllMarketActivity(wallets, limit = 20) {
  return withClient(async (client) => {
    const settled = await Promise.allSettled(
      wallets.map(async (w) => {
        const res = await client.request({
          command: "account_tx",
          account: w.address,
          limit: 10,
          ledger_index_min: -1,
          ledger_index_max: -1,
        });
        const txList = res.result?.transactions ?? [];
        return txList.map((entry) => normalizeTx(entry, w.label, w.key));
      })
    );

    const all = settled
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => r.value);

    // Deduplicate by hash
    const seen   = new Set();
    const unique = all.filter((tx) => {
      if (!tx.hash || seen.has(tx.hash)) return false;
      seen.add(tx.hash);
      return true;
    });

    // Sort newest first
    unique.sort((a, b) => {
      const ta = a.date?.getTime() ?? 0;
      const tb = b.date?.getTime() ?? 0;
      return tb - ta;
    });

    return unique.slice(0, limit);
  });
}
