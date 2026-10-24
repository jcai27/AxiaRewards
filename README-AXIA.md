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
