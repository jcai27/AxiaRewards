import type { Row } from "./program";

// Rebate decision engine. Pure and isomorphic: the browser uses it to show
// recommendations, and the API re-runs it before applying any decision.
export const ENGINE_VERSION = "rules-v1";

export type CheckStatus = "pass" | "fail" | "warn";
export type Recommendation = "APPROVE" | "DECLINE" | "REVIEW";
export type Check = { id: string; label: string; status: CheckStatus; detail: string; declineReason?: string };
export type Evaluation = { recommendation: Recommendation; checks: Check[]; declineReason?: string; summary: string; version: string };
export type RuleGroup = "Project completion" | "Eligibility" | "Integrity";
export type Rule = { id: string; group: RuleGroup; label: string; description: string; onFail: "Decline" | "Review" };

export const VALID_FINANCIERS = ["Cash", "Solar loan", "Lease", "Power purchase agreement"];
export const SUBMISSION_WINDOW_DAYS = 180;
const approvedStatuses = ["APPROVED", "FUNDED", "SHIPPED"];

// A rebate is approved automatically only when every rule passes. Any failure or
// warning holds it for a person; "onFail" is the suggested outcome for that person.
export const RULES: Rule[] = [
  { id: "pto", group: "Project completion", label: "Project completed with PTO", description: "The solar system is installed and the utility has granted Permission to Operate (PTO), dated on or before today.", onFail: "Decline" },
  { id: "dates", group: "Project completion", label: "Sale, install and PTO dates are consistent", description: "The sale is on or before submission; PTO is on or after the sale and on or before the request was filed.", onFail: "Decline" },
  { id: "code", group: "Eligibility", label: "Rebate code is active", description: "The submitted rebate code exists and is currently active.", onFail: "Decline" },
  { id: "amount", group: "Eligibility", label: "Amount matches code value", description: "The requested amount equals the value of the rebate code.", onFail: "Review" },
  { id: "window", group: "Eligibility", label: `Filed within ${SUBMISSION_WINDOW_DAYS} days of PTO`, description: `The request was filed no more than ${SUBMISSION_WINDOW_DAYS} days after PTO.`, onFail: "Review" },
  { id: "financier", group: "Eligibility", label: "Financing option is valid", description: `Financing is one of: ${VALID_FINANCIERS.join(", ")}.`, onFail: "Decline" },
  { id: "certified", group: "Eligibility", label: "Form is certified", description: "The customer certified the submission and named the certifier.", onFail: "Review" },
  { id: "duplicate", group: "Integrity", label: "No duplicate claim", description: "No other non-declined claim shares this address and rebate code, invoice number, or module serial.", onFail: "Decline" },
  { id: "fraud", group: "Integrity", label: "No fraud hold", description: "The claim has no open fraud case or payment hold.", onFail: "Review" },
  { id: "risk", group: "Integrity", label: "Risk level acceptable", description: "Risk level is low or not assessed.", onFail: "Review" },
  { id: "customer", group: "Integrity", label: "Address matches customer record", description: "When linked to a customer profile, the address and ZIP match it.", onFail: "Review" },
];
const ruleLabel = (id: string) => RULES.find((r) => r.id === id)!.label;

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

export type DecisionContext = {
  today: string;
  codes: Map<string, Row>;
  customers: Map<string, Row>;
  byAddressCode: Map<string, Row[]>;
  byInvoice: Map<string, Row[]>;
  bySerial: Map<string, Row[]>;
};

function group(rows: Row[], key: (r: Row) => string) {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

export function decisionContext(data: { rebates: Row[]; codes: Row[]; customers?: Row[] }, today: string): DecisionContext {
  const live = data.rebates.filter((r) => r.status !== "DECLINED");
  return {
    today,
    codes: new Map(data.codes.map((c) => [c.rebate_code, c])),
    customers: new Map((data.customers || []).map((c) => [c.id, c])),
    byAddressCode: group(live, (r) => (r.address1 && r.zip ? `${norm(r.address1)}|${norm(r.zip)}|${r.rebate_code}` : "")),
    byInvoice: group(live, (r) => norm(r.invoice_number)),
    bySerial: group(live, (r) => norm(r.module_serial)),
  };
}

/** Other claims that collide with this one, for the duplicate check and the detail view. */
export function relatedClaims(r: Row, ctx: DecisionContext) {
  const others = (list: Row[] | undefined) => (list || []).filter((o) => o.id !== r.id);
  return {
    address: others(ctx.byAddressCode.get(`${norm(r.address1)}|${norm(r.zip)}|${r.rebate_code}`)),
    invoice: r.invoice_number ? others(ctx.byInvoice.get(norm(r.invoice_number))) : [],
    serial: r.module_serial ? others(ctx.bySerial.get(norm(r.module_serial))) : [],
  };
}

export function evaluate(r: Row, ctx: DecisionContext): Evaluation {
  const checks: Check[] = [];
  const add = (id: string, status: CheckStatus, detail: string, declineReason?: string) =>
    checks.push({ id, label: ruleLabel(id), status, detail, ...(status === "fail" && declineReason ? { declineReason } : {}) });

  const code = ctx.codes.get(r.rebate_code);
  if (!code) add("code", "fail", `Code "${r.rebate_code}" is not a program rebate code.`, "Incorrect Rebate Code Selected");
  else if (!code.active) add("code", "fail", `Code "${r.rebate_code}" is inactive.`, "Incorrect Rebate Code Selected");
  else add("code", "pass", `${r.rebate_code} is active (${usd(code.rebate_amount)}).`);

  if (code && Math.abs(Number(code.rebate_amount) - Number(r.rebate_amount)) > 0.005)
    add("amount", "warn", `Requested ${usd(r.rebate_amount)}; ${r.rebate_code} pays ${usd(code.rebate_amount)}.`);
  else if (code) add("amount", "pass", `${usd(r.rebate_amount)} matches the code value.`);
  else add("amount", "warn", "Cannot compare the amount without a valid code.");

  if (r.status === "REBATE_REGISTRATION" || (r.preinstallation && !r.installation_complete_date))
    add("pto", "fail", "Registered before installation; installation has not been confirmed.", "System has not been installed");
  else if (!r.pto_date) add("pto", "fail", "No PTO date on file.", "System has not passed Permission To Operate (PTO) yet");
  else if (r.pto_date > ctx.today) add("pto", "fail", `PTO date ${r.pto_date} is in the future.`, "System has not passed Permission To Operate (PTO) yet");
  else add("pto", "pass", `Installed; PTO granted ${r.pto_date}.`);

  // Pre-installation registrations are filed twice; PTO is judged against the finalization date.
  const filed = r.installation_complete_date || r.date_submitted;
  if (!r.date_of_sale || r.date_of_sale > r.date_submitted || r.date_of_sale > ctx.today)
    add("dates", "fail", `Date of sale ${r.date_of_sale || "is missing"} is after submission on ${r.date_submitted}.`, "Invalid Date of Sale");
  else if (r.pto_date && r.pto_date < r.date_of_sale) add("dates", "fail", `PTO ${r.pto_date} is before the sale on ${r.date_of_sale}.`, "Invalid Date of Sale");
  else if (r.pto_date && r.pto_date > filed) add("dates", "fail", `PTO ${r.pto_date} is after the request was filed on ${filed}.`, "System has not passed Permission To Operate (PTO) yet");
  else add("dates", "pass", `Sold ${r.date_of_sale}, filed ${filed}.`);

  if (r.pto_date && r.pto_date <= filed) {
    const gap = days(r.pto_date, filed);
    add("window", gap > SUBMISSION_WINDOW_DAYS ? "warn" : "pass", `Submitted ${gap} day${gap === 1 ? "" : "s"} after PTO.`);
  } else add("window", "warn", "Cannot measure the submission window without a valid PTO date.");

  const financier = VALID_FINANCIERS.find((f) => f.toLowerCase() === String(r.financier || "").toLowerCase());
  if (!r.financier) add("financier", "warn", "No financing option recorded.");
  else if (!financier) add("financier", "fail", `"${r.financier}" is not an accepted financing option.`, "Invalid financier option");
  else add("financier", "pass", financier);

  add("certified", r.certified_by ? "pass" : "warn", r.certified_by ? `Certified by ${r.certified_by}.` : "No certifier named.");

  const related = relatedClaims(r, ctx);
  const approvedTwin = related.address.find((o) => approvedStatuses.includes(o.status));
  if (approvedTwin) add("duplicate", "fail", `Claim ${approvedTwin.tracking_number} for this address and code is already ${approvedTwin.status.toLowerCase()}.`, "Duplicate rebate submitted");
  else if (related.address.length) add("duplicate", "warn", `Claim ${related.address[0].tracking_number} has the same address and code.`);
  else if (related.invoice.length) add("duplicate", "warn", `Invoice ${r.invoice_number} also appears on claim ${related.invoice[0].tracking_number}.`);
  else if (related.serial.length) add("duplicate", "warn", `Module serial ${r.module_serial} also appears on claim ${related.serial[0].tracking_number}.`);
  else add("duplicate", "pass", "No matching address, invoice or serial.");

  if (r.payment_hold || ["OPEN", "UNDER_REVIEW", "CONFIRMED"].includes(r.fraud_review_status))
    add("fraud", "warn", `Fraud case ${r.fraud_review_status?.toLowerCase().replace("_", " ") || "open"}${r.fraud_reason ? `: ${r.fraud_reason}` : ""}.`);
  else add("fraud", "pass", r.fraud_review_status ? `Fraud case ${r.fraud_review_status.toLowerCase()}.` : "No fraud case.");

  const risk = String(r.risk_level || "NOT_ASSESSED");
  add("risk", ["HIGH", "MEDIUM"].includes(risk) ? "warn" : "pass", `Risk ${risk.toLowerCase().replace("_", " ")}.`);

  const customer = r.customer_id ? ctx.customers.get(r.customer_id) : undefined;
  if (!customer) add("customer", "pass", "Not linked to a customer profile.");
  else if (norm(customer.address1) !== norm(r.address1) || norm(customer.zip) !== norm(r.zip))
    add("customer", "warn", `Profile address is ${customer.address1}, ${customer.zip}.`);
  else add("customer", "pass", `Matches ${customer.name}'s profile.`);

  const order = (id: string) => RULES.findIndex((rule) => rule.id === id);
  checks.sort((a, b) => order(a.id) - order(b.id));
  const fail = checks.find((c) => c.status === "fail");
  const warns = checks.filter((c) => c.status === "warn");
  const recommendation: Recommendation = fail ? "DECLINE" : warns.length ? "REVIEW" : "APPROVE";
  const summary = fail
    ? `Decline: ${fail.detail}`
    : warns.length
      ? `Needs review: ${warns.map((w) => w.label.toLowerCase()).join("; ")}.`
      : "All checks passed.";
  return { recommendation, checks, declineReason: fail?.declineReason, summary, version: ENGINE_VERSION };
}

export const recommendationLabel: Record<Recommendation, string> = { APPROVE: "Meets all thresholds", DECLINE: "Suggest decline", REVIEW: "Needs review" };
export const AUTO_APPROVER = "Automatic approval";
