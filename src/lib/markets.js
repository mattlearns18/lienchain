// Single source of truth for market metadata + per-state policy.
// Phase 6: centralized so per-state lien priority rules can read policy
// fields (clinicFloorPct, priorityWarning) without scattered conditionals.
//
// Shape is a superset of the three local definitions this replaces:
//   - Dashboard.jsx       used: state, flags, notes
//   - AttorneyPreview.jsx used: state, statute, flags
//   - IntakeWizard.jsx    used: state, statute, warnings
// All existing consumers read a strict subset of these fields.

// MARKETS — every market the dashboard can DISPLAY/FILTER, including retired ones
// so historical settlements still render. To control which markets you can create
// NEW liens in, use SELECTABLE_MARKETS (below), not this list.
export const MARKETS = ['All', 'KC', 'STL', 'TX', 'NV', 'IN'];

export const MARKET_INFO = {
  KC: {
    state:    'Missouri',
    active:   true,
    statute:  'RSMo §484.130',
    flags:    [],
    warnings: [],
    notes:    'Standard PI lien perfection. No special state-level restrictions currently tracked.',
    policy:   {},
  },
  STL: {
    state:    'Missouri',
    active:   true,
    statute:  'RSMo §484.130',
    flags:    [],
    warnings: [],
    notes:    'Standard PI lien perfection. No special state-level restrictions currently tracked.',
    policy:   {},
  },
  TX: {
    state:    'Texas',
    active:   true,
    statute:  'Tex. Health & Safety Code §55.005',
    flags:    ['tx-72h'],
    warnings: ['⚠ 72-hour rescission window: Texas law allows lien rescission within 72 hours of assignment. Flag all TX liens.'],
    notes:    '72-hour rescission window after assignment. File/record the lien within 72 hours.',
    policy:   {
      priorityWarning: 'Texas hospital lien priority is not yet enforced in this waterfall. If a hospital lien exists on this case, consult with the attorney before settling. Under Tex. Health & Safety Code §55.005, hospital liens take priority over other medical provider liens.',
    },
  },
  NV: {
    state:    'Nevada',
    active:   true,
    statute:  'NRS §108.590',
    flags:    [],
    warnings: [],
    notes:    'No special state-level restrictions currently tracked.',
    policy:   {},
  },
  IN: {
    state:    'Indiana',
    active:   false,  // RETIRED as a go-forward market (no new liens). Existing
                      // Indiana settlements remain viewable as history; the 20%
                      // clinic-floor engine in waterfall.js is retained but dormant.
    statute:  'Ind. Code §32-33-4-4',
    flags:    ['in-nonassignable'],
    warnings: ['⛔ Non-assignability risk: Indiana PI liens may be non-assignable. Confirm assignment validity before issuing.'],
    notes:    'Indiana applies a 20% clinic floor and limits lien assignability. Confirm assignability before secondary transfer.',
    policy:   {
      clinicFloorPct: 0.20,
      nonAssignable:  true,
    },
  },
};

// SELECTABLE_MARKETS — markets you can create NEW liens in (intake wizard reads this).
// Derived from the per-market `active` flag, so retiring/re-adding a market is a
// one-field change in MARKET_INFO above. Indiana (active:false) is excluded here but
// stays in MARKETS/MARKET_INFO so its historical settlements still render.
export const SELECTABLE_MARKETS = Object.keys(MARKET_INFO).filter(m => MARKET_INFO[m].active !== false);
