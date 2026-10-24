# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: program operations staff.** They spend most of the working day in the administrator module: reviewing and approving or declining pending rebates in bulk, managing referral payment status, checking fraud holds, uploading rebate codes and campaigns, exporting CSV reports, and managing administrator accounts.
- **Secondary: consumers.** Solar customers who bought qualifying Axia by Qcells products. They redeem a rebate, track payment status by a 10-digit tracking number, and find card and FAQ information on the public site.

## Product Purpose

Axia Rewards runs the Axia by Qcells solar rebate and referral program. Consumers submit and track rebate requests. Administrators review those requests, manage referral rewards, and report on the program. It succeeds when staff can move a high volume of requests through review accurately and quickly, and consumers can claim and track rewards without contacting support.

## Operating Context

- Consumer site at `/`: redeem rebate wizard (pre-installation registration, post-installation submission, PTO finalization), Track Payment, My Visa Card, FAQs, Contact Us, Privacy.
- Admin module at `/home` and related routes: dashboard, submitted rebates (all/pending/approved/declined), referral payments, uploaders, three CSV report builders, program analytics, payments & rewards, fraud review, solar customers, administrators.
- Roles: full access ("Client Ace High") and view-only ("Client View Only"). The view-only role is enforced on the server.
- Demo workspace with fictional seed data (987 rebates, 56 referrals, 22 sample staff).

## Capabilities and Constraints

- React 19 client-rendered portal on Vinext/Cloudflare Workers with D1. Routing is a client-side `path` switch in `app/portal.tsx`. Styles are in `app/globals.css`.
- Does not issue cards, move money, or connect to a payment processor. Status changes only update the program database.
- Email delivery, support phone numbers, cardholder URL and legal copy are not configured. The UI must not imply they are.
- Existing e2e/role/scenario tests in `tests/` select on page content and roles. Keep behavior and labels stable.

## Brand Commitments

- "axia® by Qcells" wordmark must be kept.
- The illustrative CSS-rendered Visa card must be kept (fictional card details).
- Footer attribution: "Powered by Best Payment Solutions".
- Admin copy should be plain and functional. The warm "sunny" tone is not binding in the admin module.

## Evidence on Hand

- Solar sunset photograph (Michael Pointner, Pexels) used on the consumer site.
- No real testimonials, customers, metrics or approved legal copy. Do not fabricate any.

## Product Principles

1. Throughput first in the admin module. Review, filter, select and export are always the shortest path.
2. Status must be unambiguous. Every record's state, risk and next action can be read at a glance.
3. Never overstate what the system does: no implied payments, deliveries or notifications that aren't real.
4. Consumers get clarity and reassurance. Staff get density and precision.
