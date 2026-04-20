// XRPL Testnet data fetching via HTTP JSON-RPC
// Uses fetch (browser-native) instead of the Node xrpl package to avoid polyfill issues

const TESTNET_RPC = "https://s.altnet.rippletest.net:51234/";
const TIMEOUT_MS  = 10_000;
// Ripple epoch starts 2000-01-01; JS epoch starts 1970-01-01
const RIPPLE_EPOCH_OFFSET = 946_684_800;

async function rpc(method, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(TESTNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params: [params] }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.result?.error) throw new Error(json.result.error_message || json.result.error);
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

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

// ---------------------------------------------------------------------------
// getWalletBalances — queries account_info for each wallet in parallel
// ---------------------------------------------------------------------------
export async function getWalletBalances(wallets) {
  const results = await Promise.allSettled(
    wallets.map(async (w) => {
      const result = await rpc("account_info", {
        account: w.address,
        ledger_index: "validated",
      });
      const drops   = result.account_data?.Balance ?? "0";
      const balance = dropsToXrp(drops);
      return { ...w, balance, drops: parseInt(drops, 10) };
    })
  );

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { ...wallets[i], balance: "—", drops: 0, error: r.reason?.message }
  );
}

// ---------------------------------------------------------------------------
// getRecentTransactions — account_tx for one address
// ---------------------------------------------------------------------------
export async function getRecentTransactions(walletAddress, limit = 10) {
  const result = await rpc("account_tx", {
    account: walletAddress,
    limit,
    ledger_index_min: -1,
    ledger_index_max: -1,
  });

  const txList = result.transactions ?? [];

  return txList.map((entry) => {
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
    };
  });
}

// ---------------------------------------------------------------------------
// getAllMarketActivity — aggregates recent TXs across all wallets, deduped
// ---------------------------------------------------------------------------
export async function getAllMarketActivity(wallets, limit = 20) {
  const settled = await Promise.allSettled(
    wallets.map(async (w) => {
      const txs = await getRecentTransactions(w.address, 10);
      return txs.map((tx) => ({ ...tx, sourceWallet: w.label, sourceKey: w.key }));
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
}
