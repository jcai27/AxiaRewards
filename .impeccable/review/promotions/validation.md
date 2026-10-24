# Per-promotion eligibility validation

October 24, 2026. Working feature, inherited administrator design.

- `npm run test:promotions`: 11 checks passed. Shared pure engine tested for per-code filing windows, inclusive boundaries, size, state, financing, optional evidence, missing data and retained safeguards. Browser/API checks cover live preview, persistence, isolated changes, stale/invalid saves, manual-only approval, saved decision snapshots, CSV policy preservation, filtered review links and mobile overflow.
- `npm run test:decisions`: 16 checks passed.
- `npm run test:e2e`: 22 checks passed.
- `npm run test:scenarios`: 14 checks passed.
- `npm run test:roles`: passed, including server-side rejection of promotion writes by a view-only administrator.
- `tests/demo-static.mjs`: 12 checks passed against the built browser demo, including new per-code preview/save/reload and independent thresholds/approval modes.
- TypeScript and targeted ESLint passed for the promotion editor, policy schema, demo fixtures, decision engine, program API and decision record. Unrelated existing lint debt in older components remains.
- Worker and static production builds passed. sql.js browser externalization notices remain non-blocking; persistence and server-handler behavior pass static integration checks.

Four fresh captures show the actual static demo with a fresh browser database: desktop and mobile settings, plus desktop/mobile preview viewport captures. No horizontal overflow. The fixed demo information banner becomes an in-flow footer on this form to keep controls unobstructed. Selected code is revealed in the directory on desktop and phone.

The one design detector pass reported documentation advisories for existing admin tint/type values. This is an extension of the incumbent system; its design files were not rewritten to repair unrelated documentation drift. The independent finish review returned `ship` with no material fixes.

Six fictional claims belong to three new demo promotions. Additive seeding preserves edited settings. New decisions store a full code-policy revision and evaluated checks. Older decisions without snapshots explicitly identify their current-eligibility view. Saving policy does not process the backlog or rewrite completed decisions. Money/card fulfillment and upstream evidence integrations remain simulated or unconfigured as described in README-AXIA.md.
