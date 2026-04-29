/**
 * store.js — Phase 5 data layer
 *
 * React state + localStorage persistence for the Case, ClinicLien, and
 * ReductionRequest concepts introduced in Phase 5. Per-clinic XRPL MPTs
 * continue minting exactly as before — this is purely UI workflow state.
 *
 * Storage keys
 * ─────────────
 *   lienchain:liens              — user-created ClinicLien objects (seed/
 *                                  historical liens live only in Dashboard.jsx
 *                                  and are merged in by the caller)
 *   lienchain:cases              — Case objects
 *   lienchain:reductionRequests  — ReductionRequest objects
 *
 * Back-compat shim
 * ─────────────────
 *   All legacy lien objects (created before Phase 5) lack a `caseId` field.
 *   normalizeLien() adds `caseId = lien.id` so every code path that reads a
 *   lien can assume caseId is always present.
 */

const KEYS = {
  liens:              "lienchain:liens",
  cases:              "lienchain:cases",
  reductionRequests:  "lienchain:reductionRequests",
};

// ── ClinicLien ────────────────────────────────────────────────────────────────

/**
 * Back-compat shim: guarantee every lien has a caseId.
 * For legacy single-clinic liens (pre-Phase 5), caseId = lien.id.
 */
export function normalizeLien(lien) {
  if (lien.caseId) return lien;
  return { ...lien, caseId: lien.id };
}

/**
 * Load all liens. The caller provides seedLiens (the hardcoded historical
 * settlements). User-created liens are read from localStorage and merged;
 * seed liens that already appear in localStorage are deduplicated by id.
 *
 * All returned liens are normalized (caseId guaranteed).
 *
 * @param {object[]} seedLiens  Historical/seed records from Dashboard.jsx
 * @returns {object[]}
 */
export function loadLiens(seedLiens) {
  let stored = [];
  try {
    stored = JSON.parse(localStorage.getItem(KEYS.liens) || "[]");
  } catch (_) { /* corrupted storage — start fresh */ }

  const seedIds = new Set(seedLiens.map(l => l.id));
  const userLiens = stored.filter(l => !seedIds.has(l.id));

  return [...seedLiens, ...userLiens].map(normalizeLien);
}

/**
 * Persist user-created liens to localStorage. Seed liens are intentionally
 * excluded — they live in Dashboard.jsx and are always re-merged on load,
 * so storing them would just duplicate data.
 *
 * @param {object[]} liens    Full liens array (seed + user)
 * @param {Set}      seedIds  Set of ids that belong to seed data
 */
export function saveLiens(liens, seedIds) {
  const userLiens = liens.filter(l => !seedIds.has(l.id));
  try {
    localStorage.setItem(KEYS.liens, JSON.stringify(userLiens));
  } catch (_) { /* storage quota exceeded — silently skip */ }
}

// ── Case ──────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} Case
 * @property {string}   caseId           e.g. "PI-CASE-2026-04-001" or lien.id for single-clinic
 * @property {string}   attorney         Firm name (+ bar # if known)
 * @property {string}   treatmentMonth
 * @property {string}   treatmentYear
 * @property {string[]} clinicLienIds    Ordered list of ClinicLien ids on this case
 * @property {string}   status           "Active" | "Settled" | "Partial Settlement"
 * @property {string}   createdAt        ISO timestamp
 */

/**
 * Create a Case wrapper for a newly-minted lien.
 * In Phase 5 Commit 1 (single-clinic only), caseId = lien.id.
 * Phase 5 Commit 2 will introduce multi-clinic cases with a distinct caseId.
 *
 * @param {object} lien  Normalized ClinicLien
 * @returns {Case}
 */
export function createCaseForLien(lien) {
  return {
    caseId:         lien.caseId,          // lien.id for single-clinic cases
    attorney:       lien.attorney ?? "",
    treatmentMonth: lien.treatmentMonth ?? "",
    treatmentYear:  lien.treatmentYear  ?? "",
    clinicLienIds:  [lien.id],
    status:         lien.status ?? "Active",
    createdAt:      lien.ts ?? new Date().toISOString(),
  };
}

/**
 * Load all Cases from localStorage.
 * @returns {Case[]}
 */
export function loadCases() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.cases) || "[]");
  } catch (_) { return []; }
}

/**
 * Persist Cases to localStorage.
 * @param {Case[]} cases
 */
export function saveCases(cases) {
  try {
    localStorage.setItem(KEYS.cases, JSON.stringify(cases));
  } catch (_) {}
}

/**
 * Upsert a Case into an existing cases array (add if new, replace if caseId
 * already exists). Returns the updated array.
 *
 * @param {Case[]} cases
 * @param {Case}   newCase
 * @returns {Case[]}
 */
export function upsertCase(cases, newCase) {
  const idx = cases.findIndex(c => c.caseId === newCase.caseId);
  if (idx === -1) return [...cases, newCase];
  const updated = [...cases];
  updated[idx] = newCase;
  return updated;
}

// ── ReductionRequest ──────────────────────────────────────────────────────────

/**
 * @typedef {object} ReductionRequest
 * @property {string} id             "RED-XXXXXX"
 * @property {string} caseId
 * @property {string} clinicLienId
 * @property {string} clinicName
 * @property {number} originalAmount
 * @property {number} proposedAmount
 * @property {string} reason         Dropdown value from ReductionModal
 * @property {string} context        Free text (optional)
 * @property {string} submittedBy    Clinic / attorney name
 * @property {string} submittedAt    ISO timestamp
 * @property {string} status         "open" | "accepted" | "declined"
 */

/**
 * Load all ReductionRequests from localStorage.
 * @returns {ReductionRequest[]}
 */
export function loadReductionRequests() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.reductionRequests) || "[]");
  } catch (_) { return []; }
}

/**
 * Persist ReductionRequests to localStorage.
 * @param {ReductionRequest[]} requests
 */
export function saveReductionRequests(requests) {
  try {
    localStorage.setItem(KEYS.reductionRequests, JSON.stringify(requests));
  } catch (_) {}
}

/**
 * Append a new ReductionRequest to the stored list.
 * @param {ReductionRequest} request
 * @returns {ReductionRequest[]} Updated full list
 */
export function addReductionRequest(request) {
  const all = loadReductionRequests();
  const updated = [...all, request];
  saveReductionRequests(updated);
  return updated;
}
