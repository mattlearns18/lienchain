# LienChain Phase 1 — Testnet Settlement Proof

Live XRPL Testnet settlements demonstrating configurable split disbursements across three markets.
All transactions are publicly verifiable on the XRPL Testnet Explorer.

---

## Test 1 — TX Clinic (Texas)
**Bill Amount:** $18,400 | **Split:** LienCo 72% / TX Clinic 28%

```
Market           : TX (TX Clinic)
Settlement Total : 18,400 drops
Split            : LienCo 72% (13,248 drops) | TX Clinic 28% (5,152 drops)
Timestamp        : 2026-04-20T02:48:33.849Z

TX 1 (Attorney → LienCo)   : 623549C92642B8A351A071408DF8FB56FE87818EBD2132F1D21E9F9647D8064C
TX 2 (LienCo → TX Clinic)  : 5ADFB159756E183E96AFD2F5073EC240A330173B3594CCD3A201D46FF8C97E42
```

- TX 1: https://testnet.xrpl.org/transactions/623549C92642B8A351A071408DF8FB56FE87818EBD2132F1D21E9F9647D8064C
- TX 2: https://testnet.xrpl.org/transactions/5ADFB159756E183E96AFD2F5073EC240A330173B3594CCD3A201D46FF8C97E42

---

## Test 2 — NV Clinic (Nevada)
**Bill Amount:** $12,400 | **Split:** LienCo 65% / NV Clinic 35%

```
Market           : NV (NV Clinic)
Settlement Total : 12,400 drops
Split            : LienCo 65% (8,060 drops) | NV Clinic 35% (4,340 drops)
Timestamp        : 2026-04-20T02:48:50.104Z

TX 1 (Attorney → LienCo)   : 8E492D22B44F1BB755BBB59B1DD8B86727E65C637C671B604EB8B1808F8209E9
TX 2 (LienCo → NV Clinic)  : 5CA13EDB51A94485081718B4FAA08DD47A5F3FBD2145F59B5AB176DC381C0FEC
```

- TX 1: https://testnet.xrpl.org/transactions/8E492D22B44F1BB755BBB59B1DD8B86727E65C637C671B604EB8B1808F8209E9
- TX 2: https://testnet.xrpl.org/transactions/5CA13EDB51A94485081718B4FAA08DD47A5F3FBD2145F59B5AB176DC381C0FEC

---

## Test 3 — IN Clinic (Indiana)
**Bill Amount:** $9,800 | **Split:** LienCo 70% / IN Clinic 30%

```
Market           : IN (IN Clinic)
Settlement Total : 9,800 drops
Split            : LienCo 70% (6,860 drops) | IN Clinic 30% (2,940 drops)
Timestamp        : 2026-04-20T02:49:07.181Z

TX 1 (Attorney → LienCo)   : 521F59DE3D867D701866C98F57CE2507D55F87CAA50AE6BAF8C0D03A0C3E2526
TX 2 (LienCo → IN Clinic)  : 573115D5AAEAD7C8847B7D2D0402E5ADF42B3A4CB0542BC944DF095AEE819CD0
```

- TX 1: https://testnet.xrpl.org/transactions/521F59DE3D867D701866C98F57CE2507D55F87CAA50AE6BAF8C0D03A0C3E2526
- TX 2: https://testnet.xrpl.org/transactions/573115D5AAEAD7C8847B7D2D0402E5ADF42B3A4CB0542BC944DF095AEE819CD0

---

## Summary

| Market | Bill Amount | LienCo % | Clinic % | Status |
|--------|------------|----------|----------|--------|
| TX Clinic (Texas) | $18,400 | 72% | 28% | ✅ Settled |
| NV Clinic (Nevada) | $12,400 | 65% | 35% | ✅ Settled |
| IN Clinic (Indiana) | $9,800 | 70% | 30% | ✅ Settled |

All 6 transactions confirmed on XRPL Testnet with structured JSON memo metadata
containing market label, split ratio, and ISO timestamp.
