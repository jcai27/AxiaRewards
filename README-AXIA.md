# Axia Rewards portal

A full-stack consumer rebate portal and administrator module, built with React, Vinext, and Cloudflare D1. Source lives in this directory. Hosted access is private by default.

## Run locally

Use Node 22.13 or newer, then `npm ci` and `npm run build`. Apply migrations in order:

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_familiar_moon_knight.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_dashing_wolverine.sql
npm run dev
```

Open the printed loopback URL. Consumer home is `/`; administrator dashboard is `/home`. On a local development preview, `/signin-with-chatgpt?return_to=/home` signs in as the starter's Seedy account. That mock sign-in is excluded from production builds.

Migrations are schema-only. The API seeds fictional data once, using idempotent writes: 915 rebates, 20 referrals, 10 example administrators, 2 rebate codes, and 1 referral campaign. The dashboard initially shows 700 requests awaiting completion/review (650 pending plus 50 registrations), 198 approved/funded, 17 declined, and $184,946.66 funded across 170 records. Counts derive from records and the selected submission year.

Sample tracking: `1000000051` (rebate), `2000000000` (referrer), `3000000000` (referee).

## Expanded solar demo scenarios

The additive `solar-scenarios-v2` seed runs once on the next API request. It inserts records with stable IDs and never replaces existing records or administrator changes. It adds 60 linked solar customers, 72 rebates, 36 referrals, 12 operational staff profiles, 94 payment ledger entries, 60 reward cards, 18 fraud-review cases, 12 illustrative report runs, 3 rebate codes, and 2 campaigns. Combined with the original seed, a clean database has 987 rebates, 56 referrals and 22 sample staff accounts. Existing user-created records are additional to these counts.

Explore `/customers`, `/payments`, `/fraud-review` and `/program-analytics`, or use the dashboard's program-data links. Staff specialties include rebates, referral operations, payments, fraud and risk, reporting, and dealer support. The customer profiles connect installation sizes, panel and battery models, dealer details, rebates, referral rewards, payments and card histories. Product model names and addresses are fictional. The 2025 and 2026 cohorts provide reporting comparisons.

Payments cover scheduled, processing, paid, failed, returned and on-hold states. Reward cards cover issued, activated, partially spent, shipped, expired, reissued and blocked scenarios; only masked last-four digits are stored. The seed sends no invitations, initiates no payments and issues no cards. Sample staff profiles cannot authenticate or gain real administrator access.

Fraud scenarios include repeated invoice numbers and module serials, installation/reward address mismatches, simulated submission velocity, inconsistent PTO dates and reward recipient mismatches. All cases and evidence are fictional fixtures, not the output of a working fraud detection service. Open fraud holds prevent approval of linked pending claims. Fraud details are restricted to administrator APIs; consumer tracking does not reveal these signals. Review pages provide inspection rather than case-resolution actions.

Analytics calculate monthly submissions, dealer performance, approval rate, funding, review time and fraud outcomes from saved records. The connected demo payment ledger is a subset of the entire program; its settled-payment figure is labeled separately from total rebate funding. Historic example report runs are illustrative and do not claim downloadable artifacts exist. Existing report builders can export current data, including risk fields.

`node tests/demo-data.mjs` validates deterministic counts, linked identities, payment/card reconciliation, fraud evidence and analytics. `node tests/demo-scenarios-e2e.mjs` checks the new pages, exports, record links, holds, mobile layouts, sample access and seed idempotency against the local development database.

## Features

- Pre-installation registration, post-installation submission, email-verified PTO finalization, random 10-digit tracking, and duplicate purchase protection.
- Searchable rebate and referral tables, pagination, horizontally scrollable columns, detail dialogs, bulk approvals/declines with required reasons, decision actor/date, and conflict protection.
- Referral installation, processing, shipment and disqualification management. Referee and referrer tabs use their own tracking numbers and amounts.
- Validated CSV upserts for rebate codes and campaigns, template downloads, previews, and active-file downloads.
- Three CSV report builders with column selection, submission dates, and rebate status filters. Export values are quoted and protected against spreadsheet formula injection.
- Administrator invitations, editing, deactivation, server-enforced full/view-only roles, one-time invitation acceptance, and seven-day invitation expiration.
- FAQ accordions, persisted contact requests with reference numbers, responsive navigation, dialogs, accessible labels, errors and loading states.

## Authentication and private access

Sites supplies trusted identity headers. The first authenticated administrator is enrolled as the owner under the owner-private Sites access policy; only that identity or an accepted, active administrator membership can access admin APIs. The owner has full access. Sample administrators cannot authenticate. Invited accounts are bound to the signed-in user ID after verifying their invited email.

Keep the Site private during evaluation. Before allowing a broader audience, explicitly provision the owner/admin identities and review the hosting access policy. Application invitations do not change Sites audience permissions. A recipient must have access to this Site as well as a valid invitation.

Tracking returns limited payment information and no customer name, address, phone, or email. Tracking numbers should still be treated as private. Administrative writes validate origin and role on the server. Reviews and referral updates protect against stale records; tracking numbers and new purchase keys have database uniqueness constraints. Administrative actions are recorded in `audit`.

## Delivery and production configuration

This implementation manages program records. It does not issue Visa cards, move money, or integrate with a payment processor. Staff status changes only update the program database.

No email delivery provider, cardholder URL, support phone numbers, or approved legal copy were supplied. Optional setting names are in `.env.example`; configure hosted values through Sites environment variables. Never commit secrets.

- `EMAIL_WEBHOOK_URL`: an HTTPS service accepting the JSON message described in `.env.example`; optional `EMAIL_WEBHOOK_TOKEN` is sent as a bearer token. Invitations are persisted in the `outbox` as Queued without a configured service, or on delivery failure. An administrator can copy the invitation link. Resending creates a new token and queues a fresh delivery; there is no background outbox sender. A 2xx webhook response marks the message Sent (service accepted), not proof of inbox delivery.
- Contact requests are persisted as `messages`; support email notifications/inbox routing are not connected.
- `CARDHOLDER_URL`, `SUPPORT_PHONE`, `CARDHOLDER_PHONE`: set to the approved program/provider values. Without these, the UI directs customers to the information supplied with their card or welcome email.
- Replace the clearly labeled demo privacy notice with the operator's approved policy and retention terms before collecting real customer data.

## Verification

`npx tsc --noEmit` checks types and `npm run build` generates the deployable Worker and client assets. `npm run test:e2e` runs browser and API integration checks against a running local development server (default `http://127.0.0.1:5173`). Use `TEST_URL` to select a different loopback preview. Playwright uses installed Chrome on Windows; `CHROME_PATH` can override its path. On other systems install a Playwright Chromium browser or specify its executable.

`npm run test:roles` targets a **built** local Worker at `http://127.0.0.1:8787` (`npm start -- --port 8787`), where tests can supply trusted ingress headers. It checks invite email matching, single use, view-only reads and write denial, and inactive account rejection. Development preview deliberately strips caller-supplied identity headers. Both test scripts reject non-loopback URLs and mutate only the local preview database. Test-created records are not published; hosted D1 is separate.

## Asset credits

Solar sunset photograph by [Michael Pointner on Pexels](https://www.pexels.com/photo/solar-panels-at-sunset-18316988/). Wordmark treatment and illustrative Visa card are rendered with HTML/CSS; card details are fictional. Brand and program names follow the supplied brief.

See `README.md` for the underlying Sites starter and hosting lifecycle.

## Browser-only demo (GitHub Pages)

### Per-promotion eligibility demo

Open **Promotion settings** in the administrator navigation (`/promotion-codes`). Select any code to set its amount and sales dates, filing deadline after PTO, minimum installed system size, eligible states, financing options, required purchase/Creatio/serial evidence, and automatic versus manual approval. Threshold failures can hold for review or suggest decline. PTO, date consistency, duplicates, fraud holds and risk screening remain shared safeguards; nothing is declined automatically.

Three fictional promotions and six linked pending claims demonstrate different outcomes:

| Promotion | Amount | Deadline | Size / states | Approval |
| --- | --- | --- | --- | --- |
| AXIA-FLEX-2026 | $750 | 180 days | No size minimum; all states | Automatic when eligible |
| AXIA-PLUS-2026 | $1,500 | 60 days | At least 6 kW; CA, AZ; cash or solar loan | Automatic when eligible |
| AXIA-STORAGE-2026 | $2,000 | 30 days | At least 8 kW; CA, NY; cash or solar loan | Manual even when eligible |

The flexible and plus examples include the same 5 kW/Texas purchase profile so the difference is visible. The premium offer illustrates a qualifying claim that still requires manual approval. These are illustrative program settings, not actual Axia offer terms.

The editor previews pending claims with draft settings before saving. Save updates recommendations but does not approve the backlog or rewrite completed decisions. New decisions store the policy revision, terms and condition evidence that were used. Conflicting saves are rejected; CSV code imports preserve custom policies and advance the revision. View-only staff can inspect settings but cannot change them. Each browser retains its own edited settings in the GitHub Pages demo. Reset demo restores the fixtures.

Run `npm run test:promotions` against the local development server for policy-engine and editor integration checks. The static demo suite also checks independent thresholds and persistence across reloads.

### Approval record and integrations

The review queue uses a Permission to Operate decision-letter layout: 17 numbered conditions, evidence for each condition, an outcome, and confirmed Approve/Decline actions. Desktop queue rows and condition evidence scroll independently while the outcome and actions stay visible. J/K moves selection, reveals rows beyond the first 40, and starts the next record at its first condition. A completed decision advances to the next held rebate. On smaller screens, opening a queue item navigates to its full record.

Rules v2 adds proof of purchase, installation status from Creatio, campaign dates, and daily serial-file matching to the existing eligibility and integrity checks. These are **demo evidence fields**, not live integrations: new demo submissions simulate a signed-contract date, an installed Creatio result, and a matching serial record. Seeded records include deliberate gaps for review. No contract upload/validation service, live Creatio connection, or daily serial-file feed is configured. Campaign windows are illustrative. Do not use this demo to validate actual purchase or installation evidence.

The invoice builder defaults to the previous Monday–Sunday week and also supports a custom period. Invoice payment changes program records only; no card issuance or money movement is connected. Decline reasons remain provisional, and the SOW's proposed “Signing Offer” naming is still an open product decision.

The finished admin design system is recorded in `DESIGN.md` and `.impeccable/design.json`; review evidence is under `.impeccable/review/`.

`static-demo/` builds a static copy of the portal that needs no server. The real API handlers in `app/api/program/route.ts` run in the page against SQLite compiled to WebAssembly (sql.js), and the database persists in the visitor's browser (IndexedDB). Every visitor gets an independent copy of the fictional demo data. The admin sign-in is `demo` / `demo`; it is a demo convenience, not access control. A "Reset demo" button erases the browser copy.

```powershell
npm run build:demo     # writes dist-demo/ (served under /AxiaRewards/)
npm run preview:demo   # http://localhost:4173/AxiaRewards/
$env:DEMO_URL='http://localhost:4173/AxiaRewards'; node tests/demo-static.mjs
```

Publish by pushing the contents of `dist-demo/` to the `gh-pages` branch. GitHub Pages serves `404.html` (a copy of `index.html`) for deep links.
