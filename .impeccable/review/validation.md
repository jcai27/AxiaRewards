# Approval workspace validation

Validated October 24, 2026, against the local development database and a fresh browser-only build.

- `npm run test:decisions`: 16 checks passed, including campaign-date holds, confirmed decline and advance, invoicing, and keyboard navigation past the first 40 queue rows with selection and actions visible.
- `npm run test:scenarios`: 14 checks passed.
- `npm run test:e2e`: 22 checks passed.
- `DEMO_URL=http://localhost:4173/AxiaRewards node tests/demo-static.mjs`: 10 checks passed against the final static build.
- `npx tsc --noEmit`: passed after final source corrections.
- `npx eslint app/review.tsx lib/decision.ts app/api/program/route.ts`: passed after final source corrections.
- `npm run build:demo` and `npm run build`: passed after final source corrections. The static build reports sql.js Node-module externalization notices; browser persistence and SQLite behavior pass integration checks.
- `git diff --check`: passed.

The full touched-file lint run is not clean. `app/decisioning.tsx`, `app/portal.tsx`, and `lib/program.ts` retain existing JSX escaping, state-in-effect, and broad-type findings. Linting those files from HEAD via standard input confirms those rule classes predate this work (10, 17, and 2 baseline errors respectively). Three escaping errors introduced in the new review component were fixed. No lint rules were disabled.

The previous session's design detector reported `[]`. It was not rerun during this continuation. An independent finish review identified four material fixes; the follow-up verdict scored all four resolved. See `finish-review.md` and `finish-verdict.md`. Fresh captures include desktop and mobile queue/full record, plus desktop evidence scrolling and navigation beyond the initially rendered rows.

This is fictional demo data. Creatio sync, purchase evidence and serial records are simulated, not live integrations. See README-AXIA.md for limitations. Test-created local records are not included in the static deployment; each visitor seeds a separate browser database.
