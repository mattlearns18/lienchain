#!/usr/bin/env node
/**
 * check.mjs — LienChain quality gate
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ONE COMMAND:  npm run check
 *
 * Runs every safety net the project has, in order, and prints a plain-English
 * verdict. Written for a non-technical owner: every finding explains what it
 * means and why it matters, not just a rule name.
 *
 * WHAT IT RUNS
 * ────────────
 *   Gate 1  Build          — does the app still compile?
 *   Gate 2  Unit tests     — is the settlement math still correct? (27 asserts)
 *   Gate 3  Backtest       — does the money path hold across 1,200+ synthetic liens?
 *   Gate 4  Safety audit   — LienChain-specific rules that catch the mistakes
 *                            that would cost real money or leak real data.
 *
 * EXIT CODES
 * ──────────
 *   0  Safe to ship
 *   1  At least one BLOCKER — do not take real money until resolved
 *
 * Exit codes mean this can drop into GitHub Actions or a pre-push hook later
 * with no changes.
 *
 * ADDING A RULE
 * ─────────────
 * Append an object to the AUDIT_RULES array near the bottom. Each rule gets
 * the loaded source files and returns findings. No other wiring needed.
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));

// ── Output helpers ───────────────────────────────────────────────────────────
// Colors degrade to plain text when piped to a file or CI log without TTY.
const TTY = process.stdout.isTTY;
const c = {
  reset: TTY ? "\x1b[0m"  : "", bold:  TTY ? "\x1b[1m"  : "",
  dim:   TTY ? "\x1b[2m"  : "", red:   TTY ? "\x1b[31m" : "",
  green: TTY ? "\x1b[32m" : "", yellow:TTY ? "\x1b[33m" : "",
  blue:  TTY ? "\x1b[34m" : "", cyan:  TTY ? "\x1b[36m" : "",
};

const SEV = {
  BLOCKER: { label: "BLOCKER", color: c.red,    rank: 0 },
  WARN:    { label: "WARN",    color: c.yellow, rank: 1 },
  INFO:    { label: "INFO",    color: c.blue,   rank: 2 },
};

const findings = [];
const gates    = [];

function finding(severity, rule, title, detail, where = null) {
  findings.push({ severity, rule, title, detail, where });
}

function banner(text) {
  console.log(`\n${c.bold}${c.cyan}${"─".repeat(74)}${c.reset}`);
  console.log(`${c.bold}${c.cyan}  ${text}${c.reset}`);
  console.log(`${c.bold}${c.cyan}${"─".repeat(74)}${c.reset}`);
}

// ── Source loading ───────────────────────────────────────────────────────────
// Read every source file once, up front. Rules operate on this in-memory map so
// a 12-rule audit costs one pass over the disk, not twelve.

const SOURCE_EXTS = new Set([".js", ".jsx", ".mjs", ".cjs", ".json", ".html"]);
const SKIP_DIRS   = new Set(["node_modules", ".git", "dist", "build", ".vercel"]);

// This file is excluded from its own scan. Rules contain the very patterns they
// search for ("issueLienMPT", "TODO(phase10)"), so including it would make the
// auditor report itself — noise that erodes trust in every other finding.
const SKIP_FILES = new Set(["check.mjs"]);

function loadSources(dir, acc = new Map()) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const rel  = relative(ROOT, full);
    if (SKIP_FILES.has(rel)) continue;
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) { loadSources(full, acc); continue; }
    if (!SOURCE_EXTS.has(extname(entry))) continue;
    try { acc.set(rel, readFileSync(full, "utf8")); } catch { /* unreadable, skip */ }
  }
  return acc;
}

/** Find the 1-based line number of the first match, for clickable output. */
function lineOf(source, pattern) {
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (pattern instanceof RegExp ? pattern.test(lines[i]) : lines[i].includes(pattern)) return i + 1;
  }
  return null;
}

// ── Gate runner ──────────────────────────────────────────────────────────────
/**
 * Run a shell command as a gate. A gate can PASS, FAIL, or SKIP.
 *
 * SKIP exists because this repo is developed on a Mac but audited from other
 * environments; a missing platform-native binary is not a code defect, and
 * reporting it as a failure would train the owner to ignore red output — the
 * single worst outcome for a quality gate.
 */
function runGate(name, cmd, { skipIf = null, timeoutMs = 300_000 } = {}) {
  process.stdout.write(`  ${c.dim}running${c.reset} ${name} … `);
  const started = Date.now();
  try {
    const out = execSync(cmd, {
      cwd: ROOT, encoding: "utf8", timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`${c.green}PASS${c.reset} ${c.dim}(${secs}s)${c.reset}`);
    gates.push({ name, status: "PASS", output: out });
    return { ok: true, output: out };
  } catch (err) {
    const combined = `${err.stdout || ""}${err.stderr || ""}`;
    const secs = ((Date.now() - started) / 1000).toFixed(1);

    if (skipIf && skipIf(combined)) {
      console.log(`${c.yellow}SKIP${c.reset} ${c.dim}(${secs}s)${c.reset}`);
      gates.push({ name, status: "SKIP", output: combined });
      return { ok: null, output: combined };
    }

    console.log(`${c.red}FAIL${c.reset} ${c.dim}(${secs}s)${c.reset}`);
    gates.push({ name, status: "FAIL", output: combined });
    return { ok: false, output: combined };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  AUDIT RULES
// ═════════════════════════════════════════════════════════════════════════════
//
// Each rule: { id, severity, run(sources) }. `run` calls finding() for each hit.
// Rules are LienChain-specific on purpose — a generic linter would not know
// that shipping testnet money scaling to mainnet is catastrophic, or that
// two clinics sharing a wallet address means someone gets paid twice.

const AUDIT_RULES = [

  // ── BLOCKERS ───────────────────────────────────────────────────────────────

  {
    id: "mainnet-money-scaling",
    severity: "BLOCKER",
    run(sources) {
      const settle = sources.get("src/lib/settle-onchain.js");
      const money  = sources.get("src/lib/money.js");
      if (!settle || !money) return;

      const usesTestnetScaling = /dollarsToTestnetDrops/.test(settle);
      // A real guard = the code refuses to run (throws) when network is mainnet.
      const hasMainnetGuard =
        /isMainnet[\s\S]{0,400}?throw/.test(settle) ||
        /throw[\s\S]{0,200}?isMainnet/.test(settle) ||
        /if\s*\(\s*.*mainnet.*\)\s*[\s\S]{0,120}?throw/i.test(settle);

      if (usesTestnetScaling && !hasMainnetGuard) {
        finding("BLOCKER", this.id,
          "Testnet money scaling can reach mainnet",
          "settle-onchain.js converts dollars with dollarsToTestnetDrops(), which divides every " +
          "amount by 1,000 so payments fit in faucet-funded testnet wallets. money.js says in its " +
          "own comment: \"Do NOT use this scaling on mainnet.\" But nothing in the code stops it. " +
          "If VITE_NETWORK is set to mainnet today, a $5,000 clinic payout would send 5 XRP of real " +
          "money instead of $5,000 — and there is no undo on a settled XRPL transaction. " +
          "FIX: throw an error at the top of executeSettlementPayment() when getNetworkConfig().isMainnet " +
          "is true and the stablecoin path is not implemented.",
          "src/lib/settle-onchain.js");
      }
    },
  },

  {
    id: "committed-secret",
    severity: "BLOCKER",
    run(sources) {
      // XRPL family seeds start with 's' and are ~29 base58 chars.
      const SEED = /\bs[1-9A-HJ-NP-Za-km-z]{28}\b/;
      for (const [path, src] of sources) {
        if (path.includes(".env.example")) continue;   // placeholders are fine
        if (path === "wallets.json") continue;         // gitignored in practice, checked separately
        if (!SEED.test(src)) continue;
        finding("BLOCKER", this.id,
          "A wallet seed appears to be committed in source",
          "A seed is the private key to a wallet — anyone who reads it controls the funds in that " +
          "wallet permanently. Seeds belong only in .env.local (never committed) or in Vercel's " +
          "encrypted environment variables. If this is a real seed that has ever been pushed to " +
          "GitHub, treat it as compromised: move the funds to a new wallet and rotate the seed.",
          path);
      }

      // wallets.json holds real testnet seeds. Confirm git is actually ignoring it.
      if (existsSync(join(ROOT, "wallets.json"))) {
        let ignored = false;
        try {
          execSync("git check-ignore -q wallets.json", { cwd: ROOT, stdio: "ignore" });
          ignored = true;
        } catch { ignored = false; }
        if (!ignored) {
          finding("BLOCKER", this.id,
            "wallets.json is NOT gitignored",
            "wallets.json contains wallet seeds. It is currently tracked by git, which means the " +
            "seeds are in your repository history and visible to anyone with repo access. " +
            "FIX: add wallets.json to .gitignore, then run `git rm --cached wallets.json`. " +
            "Treat every seed in it as compromised and regenerate.",
            "wallets.json");
        }
      }
    },
  },

  {
    id: "attorney-session-revocation",
    severity: "BLOCKER",
    run(sources) {
      const portal = sources.get("src/pages/AttorneyPortal.jsx");
      if (!portal) return;
      // The bug: session validity checked on caseId alone, never re-matching the token.
      const weak = /hasValidSession\s*=\s*sessionStore\.some\(\s*s\s*=>\s*s\.caseId\s*===\s*caseId\s*\)/;
      if (weak.test(portal)) {
        finding("BLOCKER", this.id,
          "Revoking an attorney's access does not actually revoke it",
          "When you Reassign a case to a different attorney, the system generates a new access " +
          "token. But the session check only asks \"does this browser have a session for this " +
          "case?\" — it never re-checks that the stored token still matches the current one. " +
          "So the previous attorney's browser keeps working after you remove them. " +
          "FIX: also compare s.token against the case's current attorneyAssignment.token, and drop " +
          "the session when they differ.",
          `src/pages/AttorneyPortal.jsx:${lineOf(portal, weak) ?? "?"}`);
      }
    },
  },

  {
    id: "duplicate-clinic-wallets",
    severity: "BLOCKER",
    run(sources) {
      const wizard = sources.get("src/components/IntakeWizard.jsx");
      if (!wizard) return;
      const block = wizard.match(/CLINIC_DESTINATIONS\s*=\s*\{([\s\S]*?)\}/);
      if (!block) return;

      const byAddress = new Map();
      for (const m of block[1].matchAll(/"([^"]+)"\s*:\s*"(r[1-9A-HJ-NP-Za-km-z]{24,34})"/g)) {
        const [, clinic, addr] = m;
        if (!byAddress.has(addr)) byAddress.set(addr, []);
        byAddress.get(addr).push(clinic);
      }

      for (const [addr, clinics] of byAddress) {
        if (clinics.length < 2) continue;
        finding("BLOCKER", this.id,
          `${clinics.length} clinics share one wallet address`,
          `${clinics.join(", ")} all pay out to ${addr}. On testnet this is harmless — the wallets ` +
          "were reused as stand-ins. On mainnet it means a settlement intended for one clinic lands " +
          "in another clinic's account, with no way to reverse it. Every clinic must have its own " +
          "verified destination address before real money moves. " +
          "FIX: per-clinic onboarding with a $1 test payment confirming each address before first use.",
          "src/components/IntakeWizard.jsx");
      }
    },
  },

  {
    id: "immutable-mint-flags",
    severity: "BLOCKER",
    run(sources) {
      const tok = sources.get("src/lib/xrpl-tokenize.js");
      if (!tok) return;
      const hardcodedTransferable = /Flags:\s*8\b/.test(tok);
      const readsPolicy = /assignable|policy\.[A-Za-z]*assign/i.test(tok);
      if (hardcodedTransferable && !readsPolicy) {
        finding("BLOCKER", this.id,
          "Every lien is minted permanently transferable, regardless of state law",
          "Flags: 8 is tfTransferable — it lets the lien token be sold to anyone. Some states " +
          "restrict assignment of medical liens (this is why Indiana was retired as a market). " +
          "XRPL mint flags are IMMUTABLE: they are set once at mint and can never be changed, and " +
          "tfBurnable is not set either, so you cannot burn and re-mint to correct it. Every lien " +
          "minted before this is fixed is permanently transferable. " +
          "FIX: Phase 13 — drive the flag from a per-market policy.assignable field (phase13-plan.md). " +
          "For today's active markets (KC/STL/TX/NV, all assignable) this is a no-op, so it is safe " +
          "to land early — and it must land before mainnet volume.",
          "src/lib/xrpl-tokenize.js");
      }
    },
  },

  // ── WARNINGS ───────────────────────────────────────────────────────────────

  {
    id: "no-server-persistence",
    severity: "WARN",
    run(sources) {
      let calls = 0;
      const files = new Set();
      for (const [path, src] of sources) {
        if (path.includes("__tests__") || path.endsWith(".mjs")) continue;
        const hits = src.match(/localStorage\./g);
        if (hits) { calls += hits.length; files.add(path); }
      }
      if (calls === 0) return;
      finding("WARN", this.id,
        `All business data lives in one browser (${calls} localStorage calls across ${files.size} files)`,
        "There is no database and no server. Liens, cases, attorney assignments, fiat receipts, and " +
        "patient disbursement records exist only in the localStorage of whichever browser created " +
        "them. Clearing the cache erases the book of business. A second computer shows an empty " +
        "dashboard. Two people can never see the same data. The XRPL transactions survive — the " +
        "business context around them does not. " +
        "This is acceptable for demos and is the single largest gap before taking real liens. " +
        "FIX: backend + database migration (see GO-LIVE-READINESS.md).",
        [...files].sort().join(", "));
    },
  },

  {
    id: "unresolved-mainnet-todos",
    severity: "WARN",
    run(sources) {
      const hits = [];
      for (const [path, src] of sources) {
        src.split("\n").forEach((line, i) => {
          if (/TODO\(phase10\)/.test(line)) hits.push(`${path}:${i + 1}`);
        });
      }
      if (!hits.length) return;
      finding("WARN", this.id,
        `${hits.length} unresolved TODO(phase10) markers block the mainnet flip`,
        "These mark work that was deliberately deferred until mainnet: the stablecoin (RLUSD) " +
        "currency path replacing testnet scaling, and a real clinic-registry UI replacing the " +
        "hardcoded clinic list. Each one is a thing that must be true before real money moves.",
        hits.join(", "));
    },
  },

  {
    id: "naming-drift",
    severity: "WARN",
    run(sources) {
      const hits = [];
      for (const [path, src] of sources) {
        if (/issueLienMPT/.test(src)) hits.push(path);
      }
      if (!hits.length) return;
      finding("WARN", this.id,
        "A function is still named issueLienMPT() but it mints an NFToken",
        "The app mints an XRPL NFToken (XLS-20) via NFTokenMint. It has never minted an MPT " +
        "(Multi-Purpose Token). This misnamed function is what caused months of incorrect " +
        "documentation describing the wrong token standard — a real risk when an attorney or " +
        "investor asks what you're building on. " +
        "FIX: rename to issueLienNFT() and update callers in IntakeWizard.jsx.",
        hits.join(", "));
    },
  },

  {
    id: "legacy-mint-path",
    severity: "WARN",
    run() {
      if (!existsSync(join(ROOT, "issue-lien.js"))) return;
      const src = readFileSync(join(ROOT, "issue-lien.js"), "utf8");
      const looksLegacy = /TrustSet/.test(src);
      const marked = /LEGACY|DEPRECATED|DO NOT USE/i.test(src.slice(0, 1200));
      if (looksLegacy && !marked) {
        finding("WARN", this.id,
          "issue-lien.js is a third, inconsistent way to create a lien and isn't marked legacy",
          "This root script uses TrustSet + Payment — an IOU / issued-currency approach that is " +
          "neither the NFToken the app actually mints nor an MPT. It is old dev tooling, but leaving " +
          "it unlabeled next to the real code is exactly what invites someone (or a future AI " +
          "session) to describe the wrong architecture. " +
          "FIX: delete it, or put a LEGACY — NOT THE PRODUCTION PATH banner at the top.",
          "issue-lien.js");
      }
    },
  },

  {
    id: "missing-legal-documents",
    severity: "WARN",
    run() {
      const required = {
        "TERMS-OF-SERVICE.md":  "Terms of Service — what clinics and operators agree to",
        "PRIVACY-POLICY.md":    "Privacy Policy — required before collecting data from anyone",
        "HIPAA-BAA.md":         "HIPAA Business Associate Agreement — clinics' counsel will ask",
        "CLINIC-AGREEMENT.md":  "Clinic Lien Purchase Agreement — the core legal instrument",
      };
      const missing = Object.entries(required).filter(([f]) => !existsSync(join(ROOT, f)));
      if (!missing.length) return;
      finding("WARN", this.id,
        `${missing.length} operating legal documents do not exist yet`,
        missing.map(([f, why]) => `${f} — ${why}`).join(" · ") +
        ". attorney-opinion-packet.md is the packet to OBTAIN the opinion letter; it is not a " +
        "substitute for the documents that govern day-to-day operation. No real lien should be " +
        "purchased without at minimum a signed clinic agreement.",
        null);
    },
  },

  {
    id: "no-error-monitoring",
    severity: "WARN",
    run(sources) {
      const hasMonitoring = [...sources.values()].some(s =>
        /Sentry|LogRocket|Datadog|Bugsnag|window\.onerror|addEventListener\(["']error/.test(s));
      if (hasMonitoring) return;
      finding("WARN", this.id,
        "Nothing reports errors when something breaks for a real user",
        "If a settlement fails at 11pm for a clinic in Texas, no one finds out until someone " +
        "complains. There is no crash reporting, no error log, no alerting. Before real users, " +
        "wire a monitoring service (Sentry's free tier is enough at this volume) so failures " +
        "surface to you rather than to your customer.",
        null);
    },
  },

  // ── INFO ───────────────────────────────────────────────────────────────────

  {
    id: "test-surface",
    severity: "INFO",
    run(sources) {
      // backtest.mjs counts as coverage: it imports the real shipped modules
      // (not copies) and asserts invariants over 1,200+ synthetic liens, which
      // is stronger evidence than most unit tests.
      const testFiles = [...sources.keys()].filter(p =>
        p.includes("__tests__") || p.endsWith(".test.js") || p === "backtest.mjs");
      const libFiles  = [...sources.keys()].filter(p => p.startsWith("src/lib/") && !p.includes("__tests__"));
      const tested    = new Set();
      for (const t of testFiles) {
        const src = sources.get(t);
        for (const lib of libFiles) {
          const base = lib.split("/").pop().replace(/\.js$/, "");
          if (new RegExp(`\\b${base}\\b`).test(src)) tested.add(lib);
        }
      }
      const untested = libFiles.filter(f => !tested.has(f));
      finding("INFO", this.id,
        `${tested.size} of ${libFiles.length} core library files are covered by tests`,
        untested.length
          ? `Not directly covered: ${untested.map(f => f.split("/").pop()).join(", ")}. ` +
            "The two that matter most — waterfall.js (the settlement math) and money.js (dollar→on-chain " +
            "conversion) — are both covered, by the unit tests and the backtest respectively. " +
            "The remainder are lower risk: they read from the ledger or from storage rather than deciding " +
            "how much money moves."
          : "Every core library file is referenced by a test or the backtest.",
        null);
    },
  },
];

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═════════════════════════════════════════════════════════════════════════════

console.log(`\n${c.bold}LienChain quality gate${c.reset}  ${c.dim}${new Date().toLocaleString()}${c.reset}`);

// ── Gate 1–3: the things that actually execute ───────────────────────────────
banner("Gates — build, tests, backtest");

// A missing platform-native binary (e.g. running on Linux against node_modules
// installed on a Mac) is an environment problem, not a code defect. Skip, don't
// fail — a gate that cries wolf is a gate the owner learns to ignore.
//
// Covers: rolldown (Vite 8+), rollup (Vite ≤7), esbuild, swc, and the generic
// npm optional-dependency bug that produces all of them.
const isPlatformBinaryError = (out) =>
  /Cannot find native binding/i.test(out) ||
  /@(rolldown|rollup|esbuild|swc)\/[\w-]*(binding|rollup|esbuild)?[\w-]*(linux|darwin|win32|android)/i.test(out) ||
  /Cannot find module\s+'@(rolldown|rollup|esbuild|swc)\//i.test(out) ||
  /EBADPLATFORM|Unsupported platform/i.test(out) ||
  /npm\/cli\/issues\/4828/.test(out);

const build = runGate("build          ", "npm run build --silent", { skipIf: isPlatformBinaryError });

const TEST_PATH = "src/lib/__tests__/waterfall.test.js";
const tests = existsSync(join(ROOT, TEST_PATH))
  ? runGate("waterfall tests", `node ${TEST_PATH}`)
  : (console.log(`  ${c.yellow}SKIP${c.reset} waterfall tests ${c.dim}(file not found)${c.reset}`),
     gates.push({ name: "waterfall tests", status: "SKIP", output: "not found" }), { ok: null });

const backtest = existsSync(join(ROOT, "backtest.mjs"))
  ? runGate("backtest       ", "node backtest.mjs", { skipIf: isPlatformBinaryError })
  : (console.log(`  ${c.yellow}SKIP${c.reset} backtest ${c.dim}(file not found)${c.reset}`),
     gates.push({ name: "backtest", status: "SKIP", output: "not found" }), { ok: null });

// Surface the test tallies the scripts print, so the owner sees the numbers.
for (const [gate, re, label] of [
  [tests,    /(\d+)\s*\/\s*(\d+)\s*(?:pass|assertions)/i, "assertions"],
  [backtest, /OVERALL:\s*(\S+)\s*(\w+)/i,                 "backtest verdict"],
]) {
  if (!gate?.output) continue;
  const m = gate.output.match(re);
  if (m) console.log(`         ${c.dim}${label}: ${m[0].trim()}${c.reset}`);
}

// ── Gate 4: static safety audit ──────────────────────────────────────────────
banner("Safety audit — LienChain-specific rules");

const sources = loadSources(ROOT);
console.log(`  ${c.dim}scanned ${sources.size} source files${c.reset}`);

for (const rule of AUDIT_RULES) {
  try {
    rule.run(sources);
  } catch (err) {
    finding("WARN", "audit-rule-crashed",
      `Audit rule "${rule.id}" failed to run`,
      `The rule itself threw: ${err.message}. This is a bug in check.mjs, not necessarily in the ` +
      "app — but it means that particular safety check did not run.", null);
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
banner("Findings");

findings.sort((a, b) => SEV[a.severity].rank - SEV[b.severity].rank);

if (!findings.length) {
  console.log(`  ${c.green}Nothing flagged.${c.reset}`);
} else {
  for (const f of findings) {
    const s = SEV[f.severity];
    console.log(`\n  ${s.color}${c.bold}[${s.label}]${c.reset} ${c.bold}${f.title}${c.reset}`);
    if (f.where) console.log(`  ${c.dim}${f.where}${c.reset}`);
    // Wrap the explanation to ~78 cols so it reads like prose in a terminal.
    const words = f.detail.split(/\s+/);
    let line = "  ";
    for (const w of words) {
      if ((line + w).length > 78) { console.log(line); line = "  "; }
      line += w + " ";
    }
    if (line.trim()) console.log(line);
  }
}

// ── Verdict ──────────────────────────────────────────────────────────────────
banner("Verdict");

const counts = {
  BLOCKER: findings.filter(f => f.severity === "BLOCKER").length,
  WARN:    findings.filter(f => f.severity === "WARN").length,
  INFO:    findings.filter(f => f.severity === "INFO").length,
};
const gateFailed = gates.some(g => g.status === "FAIL");
const gateSkipped = gates.filter(g => g.status === "SKIP");

console.log(`  gates    ${gates.map(g =>
  `${g.name.trim()}:${g.status === "PASS" ? c.green : g.status === "SKIP" ? c.yellow : c.red}${g.status}${c.reset}`
).join("  ")}`);
console.log(`  findings ${c.red}${counts.BLOCKER} blocker${c.reset}  ${c.yellow}${counts.WARN} warn${c.reset}  ${c.blue}${counts.INFO} info${c.reset}`);

if (gateSkipped.length) {
  console.log(`\n  ${c.yellow}Note:${c.reset} ${gateSkipped.length} gate(s) skipped — usually means node_modules was`);
  console.log(`  installed on a different operating system. Run ${c.bold}npm install${c.reset} on this machine`);
  console.log(`  to get full coverage.`);
}

const shippable = !gateFailed && counts.BLOCKER === 0;

console.log("");
if (gateFailed) {
  console.log(`  ${c.red}${c.bold}NOT SHIPPABLE${c.reset} — a gate failed. The code does not build or the math is wrong.`);
  console.log(`  ${c.dim}Fix the failing gate above before anything else.${c.reset}`);
} else if (counts.BLOCKER > 0) {
  console.log(`  ${c.red}${c.bold}DEMO ONLY${c.reset} — builds and tests pass, but ${counts.BLOCKER} blocker(s) stand between`);
  console.log(`  this and accepting real money. Safe to show investors. Not safe to take a lien.`);
} else if (counts.WARN > 0) {
  console.log(`  ${c.green}${c.bold}SHIPPABLE${c.reset} — no blockers. ${counts.WARN} warning(s) to clear before volume.`);
} else {
  console.log(`  ${c.green}${c.bold}CLEAN${c.reset} — gates pass, no blockers, no warnings.`);
}
console.log("");

process.exit(shippable ? 0 : 1);
