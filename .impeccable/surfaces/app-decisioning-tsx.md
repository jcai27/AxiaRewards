---
version: 1
slug: "app-decisioning-tsx"
primary_target: "app/decisioning.tsx"
related_targets: ["app/portal.tsx","app/admin.css"]
---

# Admin approval and denial workspace

Mode: Operate. Scope: the admin review queue, rebate decision record, and the admin pages that share their system (dashboard, rebate lists, decision rules, invoices). The consumer site adopts the same tokens and component language later.

Audience and job: program operations staff decide the rebates the engine held. They need to see, for one rebate at a time, which approval conditions are satisfied and why it was held, then approve or decline quickly and move to the next. Source of truth for conditions: the Axia/BPS SOW (validated proof of purchase, installation verified via Creatio CRM, campaign start and end dates, rebate code and amount, daily serial file) plus PTO, duplicate and fraud checks.

Constraints: palette and Poppins fixed (navy #001C77, teal #00C6C1, black, white, #F2F2F2, #F2F0EA); left sidebar fixed; clearly visible outlines, no faint hairlines; not generic SaaS, not decorative, not cramped; must sit next to axiasolarusa.com. Tests select on headings "Pending Rebates", textbox "Search rebates", checkbox "Select rebate <tracking>", buttons "Approve" and "Confirm approval".

Unresolved: whether "Rebate Payment" is renamed "Signing Offer" in the UI (SOW wording); decline reason list is provisional ("Need to discuss" in the SOW).

## Direction contract

THESIS: Every rebate decision is written like a utility's Permission to Operate letter: numbered conditions, each marked Satisfied or Not satisfied, and one outcome line. Refuses the category default of metric tiles over a generic table with a details drawer.

OWN-WORLD: White letter sheets with a solid navy letterhead band and a four-cell reference block (rebate, amount, campaign, submitted); conditions as a numbered list on strong rules with right-aligned Satisfied (teal-green) or Not satisfied (red) text; the outcome as a bordered box in the outcome color. Light gray desk ground, cream only for settled/approved summaries, Poppins 400/500, 8px controls, 12px sheets, 1px dark rules.

STORY: Staff see the held queue, open one rebate, read its conditions top to bottom, understand the single reason it was held, decide, and the next held rebate opens automatically.

FIRST VIEWPORT: Sidebar (232px) left; queue column (380px) with title, filter segments (All / Suggest decline / Needs review) and compact items (name, tracking and reason, suggestion tag, amount) with the selected item tinted and navy-edged; desk area with the decision record letter (max 780px): navy letterhead, reference block, "Re:" line, conditions 1..n, outcome box, and Decline / Approve actions bottom right.

FORM: Permission to Operate letter, position 1 of my ordered grounded list (shown as Impeccable's pick; user chose it over the assigned Funding Statement). seed:b507399efda17feb. Signature interaction: deciding a rebate advances to the next held rebate in the queue, with the decided item leaving the list. Motion grammar: 150ms state fades only; no entrance choreography.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
