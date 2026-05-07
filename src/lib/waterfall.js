/**
 * waterfall.js — Pure waterfall calculator with per-state floor enforcement.
 *
 * Exported so AttorneyPortal.jsx (and tests) can import without pulling in
 * React. No side-effects; every call with the same inputs returns the same output.
 *
 * Phase 6, Commit 2: Indiana 20% clinic floor applied iteratively after pro-rata.
 */

/**
 * Distribute netAvailable across clinics with optional IN floor enforcement.
 *
 * @param {number} netAvailable   Net settlement amount after attorney fee + costs.
 * @param {Array<{id:string, clinic:string, bill:number, split:number, market:string}>} clinics
 * @param {number} clinicFloorPct Indiana floor fraction (e.g. 0.20). Read from
 *                                MARKET_INFO.IN.policy.clinicFloorPct by callers.
 * @returns {{
 *   clinicRows: Array<{...clinic, recovery:number, lienCoAmt:number, clinicAmt:number, floorApplied:boolean}>,
 *   floorAppliedCount: number,
 *   poolExhausted: boolean,
 *   patientNet: number,
 *   onChainTotal: number,
 *   totalLienCo: number,
 *   totalClinic: number,
 *   totalBills: number,
 * }}
 */
export function calcWaterfall(netAvailable, clinics, clinicFloorPct = 0.20) {
  const totalBills = clinics.reduce((s, c) => s + c.bill, 0);

  let clinicRows;
  let poolExhausted = false;

  if (netAvailable <= 0) {
    // No pool — every clinic gets $0
    clinicRows = clinics.map(c => ({ ...c, recovery: 0, lienCoAmt: 0, clinicAmt: 0, floorApplied: false }));
  } else if (netAvailable >= totalBills) {
    // Full recovery — floor irrelevant, patient gets residual
    clinicRows = clinics.map(c => {
      const recovery  = c.bill;
      const lienCoAmt = recovery * c.split / 100;
      const clinicAmt = recovery - lienCoAmt;
      return { ...c, recovery, lienCoAmt, clinicAmt, floorApplied: false };
    });
  } else {
    // ── Shortfall branch: pro-rata then iterative IN floor enforcement ────────
    //
    // State per clinic:
    //   recovery  — current allocation (starts as pro-rata share)
    //   fixed     — true once this clinic's recovery is locked in
    //   floorApplied — true if it was raised to floor
    //
    const recoveries   = new Map();
    const fixed        = new Set();
    const floorFlag    = new Map();

    // Step 1: initialize with pure pro-rata
    for (const c of clinics) {
      recoveries.set(c.id, totalBills > 0 ? (c.bill / totalBills) * netAvailable : 0);
      floorFlag.set(c.id, false);
    }

    // Iterative floor enforcement (steps 2-7 in spec)
    let iterating = true;
    while (iterating) {
      iterating = false;

      // Step 2-4: find unfixed IN clinic with largest positive gap vs floor
      let worstId  = null;
      let worstGap = 0;

      for (const c of clinics) {
        if (fixed.has(c.id) || c.market !== 'IN') continue;
        const floor = Math.ceil((c.bill * clinicFloorPct) * 100) / 100; // round up to cent
        const gap   = floor - recoveries.get(c.id);
        if (gap > 0.005 && gap > worstGap) { worstGap = gap; worstId = c.id; }
      }

      if (!worstId) break; // all IN clinics at or above floor — done

      const target      = clinics.find(c => c.id === worstId);
      const targetFloor = Math.ceil((target.bill * clinicFloorPct) * 100) / 100;
      const currentRec  = recoveries.get(worstId);

      // Pool available = sum of recoveries of non-fixed clinics OTHER than the target
      const unfixedOthers = clinics.filter(c => !fixed.has(c.id) && c.id !== worstId);
      const poolFromOthers = unfixedOthers.reduce((s, c) => s + recoveries.get(c.id), 0);

      const raise = targetFloor - currentRec;

      if (raise <= poolFromOthers) {
        // Step 5a: pool can cover — raise to floor, re-pro-rata others
        recoveries.set(worstId, targetFloor);
        floorFlag.set(worstId, true);
        fixed.add(worstId);

        // Step 6: re-pro-rata remaining pool across unfixed others
        const poolForOthers    = poolFromOthers - raise;
        const sumOtherBills    = unfixedOthers.reduce((s, c) => s + c.bill, 0);
        for (const c of unfixedOthers) {
          recoveries.set(c.id, sumOtherBills > 0 ? (c.bill / sumOtherBills) * poolForOthers : 0);
        }
        iterating = true; // back to step 2
      } else {
        // Step 5b: pool exhausted — give target everything others had, zero the rest.
        // Mark IN clinics that are zeroed out as floorApplied=true (floor was needed
        // but unmet — "attempted") so the UI can show the FLOOR tag on them too.
        const partialRaise = poolFromOthers;
        recoveries.set(worstId, currentRec + partialRaise);
        floorFlag.set(worstId, true);
        fixed.add(worstId);
        for (const c of unfixedOthers) {
          recoveries.set(c.id, 0);
          fixed.add(c.id);
          // Mark IN clinics that needed a floor but couldn't receive it
          if (c.market === 'IN') {
            const cFloor = Math.ceil((c.bill * clinicFloorPct) * 100) / 100;
            if (cFloor > 0) floorFlag.set(c.id, true);
          }
        }
        poolExhausted = true;
        iterating = false;
      }
    }

    clinicRows = clinics.map(c => {
      const recovery  = recoveries.get(c.id);
      const lienCoAmt = recovery * c.split / 100;
      const clinicAmt = recovery - lienCoAmt;
      return { ...c, recovery, lienCoAmt, clinicAmt, floorApplied: floorFlag.get(c.id) };
    });
  }

  const patientNet       = Math.max(0, netAvailable) >= totalBills
    ? netAvailable - totalBills
    : 0;
  const onChainTotal  = clinicRows.reduce((s, r) => s + r.recovery, 0);
  const totalLienCo   = clinicRows.reduce((s, r) => s + r.lienCoAmt, 0);
  const totalClinic   = clinicRows.reduce((s, r) => s + r.clinicAmt, 0);
  const floorAppliedCount = clinicRows.filter(r => r.floorApplied).length;

  return {
    clinicRows, floorAppliedCount, poolExhausted,
    patientNet, onChainTotal, totalLienCo, totalClinic, totalBills,
  };
}
