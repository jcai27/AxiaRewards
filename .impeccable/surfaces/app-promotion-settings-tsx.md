---
version: 1
slug: "app-promotion-settings-tsx"
primary_target: "app/promotion-settings.tsx"
related_targets: ["app/admin.css", "app/review.tsx", "app/decisioning.tsx"]
---

# Promotion eligibility settings

Mode: Operate. Extend the established administrator system without a new visual direction. Program staff maintain separate eligibility policies for promotion codes and preview their effects on pending claims.

THESIS: One selected promotion owns one explicit set of thresholds. A searchable code directory sits beside a plain settings document; a preview compares saved and draft eligibility without changing claims.

OWN-WORLD: Inherit DESIGN.md: Poppins, navy heading band, white document surfaces, gray ground, visible gray boundaries, small teal accents and semantic states. Preserve the existing left navigation. No new raster assets.

STORY: Choose a promotion, edit its campaign/threshold/evidence/approval settings, inspect the pending-claim preview, save, then open its filtered review queue. Saving does not approve or decline claims. Completed decisions preserve their recorded policy and checks.

FIRST VIEWPORT: Existing admin sidebar and top bar; page title and New promotion action; a 290px searchable code directory and a flexible settings sheet with navy code heading and pending-review link. Group promotion details, thresholds, and evidence/approval. Place save after the form and a non-mutating eligibility preview directly beneath. On narrow screens stack directory and sheet, then fields.

FORM: Established document-based admin system; inherits original direction seed:b507399efda17feb. This is a functional extension, with no new workshop, comp or raster. Native form controls, explicit labels, visible validation and saved/draft state. Fraud/duplicate/PTO safeguards remain shared.

FINISH: Verify rendered desktop/mobile, settings persistence, per-code engine behavior, read-only restrictions and immutable decision evidence; document the shipped extension and validation.
