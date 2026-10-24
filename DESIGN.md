---
name: Axia Rewards Admin
description: A clear, bounded workspace for explainable rebate decisions.
colors:
  brand: "#001c77"
  brand-hover: "#00145a"
  brand-soft: "#e8ecf8"
  teal: "#00c6c1"
  teal-soft: "#dcf7f6"
  ink: "#0f1115"
  text-2: "#3d4250"
  text-3: "#5b6070"
  ground: "#f2f2f2"
  surface: "#fff"
  subtle: "#f7f7f8"
  line: "#7a808e"
  line-strong: "#5b6070"
  line-soft: "#8a909c"
  ok: "#0a6e5c"
  ok-soft: "#ddf3ee"
  warn: "#7f4d00"
  warn-soft: "#fbefd4"
  bad: "#ae2216"
  bad-soft: "#fbe9e7"
typography:
  headline:
    fontFamily: "Poppins, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  record-title:
    fontFamily: "Poppins, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    letterSpacing: "0"
  title:
    fontFamily: "Poppins, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "0"
  body:
    fontFamily: "Poppins, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Poppins, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: 1.3
  status:
    fontFamily: "Poppins, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "18px"
rounded:
  tag: "3px"
  field: "6px"
  control: "8px"
  outcome: "10px"
  sheet: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  control-gap: "10px"
  md: "12px"
  lg: "16px"
  panel-inline: "18px"
  section: "20px"
  xl: "24px"
  document-inline: "28px"
  page-inline: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
  button-danger:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
  search-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "34px"
  nav-current:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "36px"
  status-declined:
    backgroundColor: "{colors.bad-soft}"
    textColor: "{colors.bad}"
    typography: "{typography.status}"
    rounded: "{rounded.tag}"
    padding: "2px 7px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
  condition:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "10px 0"
  outcome-decline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.bad}"
    rounded: "{rounded.outcome}"
    padding: "14px 18px"
---

# Design System: Axia Rewards Admin

## Overview

**Creative North Star: "Permission to Operate"**

Axia's administrator workspace feels like a clear utility decision: evidence first, an explicit status, and an accountable action. White surfaces, navy authority, visible gray rules and restrained Poppins make long records readable without decorative treatment. The actual Axia by Qcells logo remains the identity anchor.

This system describes the shipped administrator module, including its shared lists, dashboard, rules and invoices. The numbered decision letter is a signature review component, not a required composition for every screen. Consumer routes still use the older styling in `app/globals.css`; their later redesign must retain the solar photograph and illustrative Visa card. Their inherited DM Sans/Manrope typography, gradients and card animation are not administrator rules.

**Key Characteristics:**

- Strong, visible boundaries on flat white surfaces.
- Navy actions and selection; teal identity accents.
- Readable operational density with tabular references and amounts.
- Explicit condition states and a separate decision outcome.
- Responsive structure that preserves evidence and actions.

## Colors

The palette combines authoritative Axia navy and a small teal accent with neutral document surfaces and functional outcome colors. Frontmatter is the normative color inventory; names mirror the source tokens in `app/admin.css`.

### Primary

- **Axia Navy** (`brand`): primary actions, selected navigation, links and decision letterhead. `brand-hover` darkens actions; `brand-soft` identifies selected records and informational states.

### Secondary

- **Axia Teal** (`teal`): selected navigation icons and count accents. `teal-soft` supports counts. Teal is not the success text color.
- **Satisfied Green** (`ok`, `ok-soft`): satisfied conditions and approved status.
- **Review Amber** (`warn`, `warn-soft`): unresolved checks, holds and review labels.
- **Decline Red** (`bad`, `bad-soft`): failed checks, decline actions and blocked-approval explanations.

### Neutral

- **Document Ink** (`ink`): primary text; **Supporting Ink** (`text-2`): explanations; **Quiet Ink** (`text-3`): metadata and placeholders.
- **Desk Gray** (`ground`), **White Sheet** (`surface`) and **Subtle Surface** (`subtle`) distinguish the workspace, records and panel headings.
- **Visible Rule** (`line`), **Strong Rule** (`line-strong`) and **Internal Rule** (`line-soft`) separate surfaces, controls and rows.
- Cream is a fixed brand commitment (`--ax-cream: #f2f0ea`) but has no current rendered use in the administrator stylesheet. Do not invent a shipped cream-summary convention.

**The Visible Boundary Rule.** Use the established line colors for panel, queue, condition and control boundaries; do not substitute faint decorative hairlines.

**The State Has Words Rule.** Color supports a written status or explanation. A disabled approval action must visibly explain a blocking fraud-review hold.

## Typography

**Display Font:** Poppins with the system fallback stack recorded above. There is no separate display face or hero scale in the administrator system.

**Body Font:** Poppins. The app uses tabular numerals for tracking references, money and data comparison.

**Character:** Functional and restrained, with regular text and medium emphasis; semibold establishes page and section hierarchy. No invented promotional type treatment belongs in operational screens.

### Hierarchy

- **Headline:** page title; the review queue uses the same size at medium weight. Small screens reduce ordinary page titles to (20px).
- **Record title:** white medium text on the navy band.
- **Title:** section headings; record subject text uses this size at regular weight with medium name emphasis.
- **Body:** regular operational prose. Condition titles and queue names use medium (14.5px); evidence detail uses regular (13px).
- **Label:** buttons and compact controls. Metadata/status labels use the smaller status role; reference values use medium (15px).
- Dashboard figures use semibold (28px), line height (1.25) and tracking (-0.02em); secondary metrics use (24px).

Meaningful condition groups and navigation groups use small uppercase headings. These name real sections; they are not ornamental kickers.

## Layout

The desktop shell uses a left sidebar (256px), a sticky top bar (60px), and a flexible content region. Standard pages have a maximum content width (1440px) and padding (28px 32px 40px). Panels usually separate by (20px); major sections separate by (28px).

The review workspace is a specific two-column application of this system: queue (380px), flexible gray desk, white decision sheet with maximum width (820px). At widths up to (1200px), the queue becomes (320px) and desk padding becomes (20px). Above (1024px), the workspace height is `calc(100dvh - 112px)` with minimum height (520px). The queue and condition evidence scroll independently; the record references, outcome and actions remain in view. Selection reveals the active queue row and resets evidence to its start. Deciding advances to the next held rebate.

At (1024px) and below, the sidebar becomes a fixed off-canvas navigation panel, and the queue and desk stack. The queue list is capped at (46vh); opening a queue item routes to its full record. At (640px) and below, the top bar is (56px), page/desk side padding is (16px), references become two columns, condition statuses sit below their evidence, and record actions share available width. Standard metric strips progress from four columns to two, then one. Tables retain their scrolling container when needed.

**The Decision Stays Available Rule.** On desktop review, queue browsing and evidence reading must preserve access to the selected rebate's outcome and actions.

## Elevation & Depth

Administrator panels and document sheets are flat at rest, with no surface shadow. White, gray and subtle fills plus visible strokes establish depth. A navy inset stroke marks the selected queue item. Focus treatment is functional: interactive elements use a navy outline (2px) with offset (2px), while fields use a navy border and ring (`0 0 0 3px #001c7722`).

### Shadow Vocabulary

- **Modal:** `0 12px 32px #171a2633` separates an active dialog from the workspace.
- **Toast:** `0 8px 24px #171a2626` lifts temporary feedback.
- **Queue selection:** `inset 0 0 0 1px var(--ax-brand)` is a boundary, not ambient elevation.

**The Flat Workspace Rule.** Keep routine sheets, panels and buttons flat; reserve elevation for dialogs and temporary feedback.

## Shapes

Controls and navigation use gently rounded corners; fields, tags, outcome boxes and sheets use their separate frontmatter radii. Panels and record sheets have one visible border; decision outcomes use a stronger stroke (2px). Condition rows and tables use single internal rules. Do not replace status rectangles with decorative pills or turn document sheets into floating dashboard cards.

## Components

### Buttons

Confident, compact actions with clear labels. Primary buttons use navy/white; secondary buttons use white/ink with a strong-rule border; destructive confirmations use red/white. Standard minimum height is (36px), compact (34px), and record actions (42px) with horizontal padding (20px). Primary hover darkens navy without lifting. Secondary hover uses the subtle surface; disabled buttons have opacity (0.5). Background and border transitions are (150ms). Record decline is an outlined secondary action with red text; destructive confirmation is solid red.

### Chips

Status tags are flat rectangles with the tag radius, semantic text and a pale corresponding background. Text is sentence case, not a colored dot alone. Queue filter buttons are separate controls: white with visible borders when inactive, ink/white when active, and an exposed pressed state.

### Cards / Containers

Panels use white, the sheet radius and visible-rule borders, with no shadow. A subtle heading band uses padding (14px 18px) and a bottom rule. Table cells use (9px 14px) padding and internal boundaries; numeric columns align right. The invoice is a document component with its own print behavior, not a decision-letter clone.

### Inputs / Fields

White fill, strong-rule border and field radius; normal fields have minimum height (36px) and padding (7px 10px). Search wraps its icon and borderless text input in a control-radius frame (34px high). Placeholders use Quiet Ink at full opacity. Search focus rings the enclosing frame. Required and error text uses Decline Red with a written explanation.

### Navigation

The white left sidebar has a visible right rule and groups real destinations. Rows are (36px) high, regular Poppins (14px), with control-radius corners. Hover uses Desk Gray; current navigation uses navy, white medium text and a teal SVG icon. Mobile navigation uses the existing menu, dismiss button and scrim, with a (200ms) slide. Use real inline SVG icons, not text glyph substitutes.

### Decision record

A white bounded sheet with a navy header, four reference cells, subject line, meaningful condition groups, stable numbered conditions, explicit state words, one bordered outcome and decision actions. Desktop conditions use number (32px), flexible evidence and status (120px) columns; mobile moves the status beneath evidence. Preserve the real rule order and evidence detail. Fraud holds explain blocked approval beside the actions. Decisions require the existing confirmation flow; decline requires a reason. Do not imply a status update issues a card or transfers funds.

## Do's and Don'ts

### Do:

- **Do** keep the actual Axia by Qcells logo, fixed brand palette and Poppins administrator typography.
- **Do** use visible boundaries to separate panels, conditions, queue rows and controls.
- **Do** pair semantic color with explicit status words and visible blocking explanations.
- **Do** preserve tabular references, readable evidence and access to decision actions.
- **Do** reuse the administrator primitives across shared admin pages while choosing composition for each job.

### Don't:

- **Don't** introduce generic SaaS decoration, playful styling, cramped density or off-brand colors.
- **Don't** replace strong boundaries with faint hairlines or rely on color alone for state.
- **Don't** add ambient card shadows, hover lift or entrance choreography to the administrator workspace.
- **Don't** make every page a decision letter or apply this administrator composition to consumer routes.
- **Don't** canonize the consumer site's inherited typography and visual effects as administrator guidance.
