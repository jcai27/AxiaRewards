import type { Row } from "./program";
import {FINANCING_OPTIONS,policyFor,rebateAmountFor,type PromotionPolicy} from "./promotion-policy";

// Rebate decision engine. Pure and isomorphic: the browser uses it to show
// recommendations, and the API re-runs it before applying any decision.
export const ENGINE_VERSION = "rules-v4";

export type CheckStatus = "pass" | "fail" | "warn";
export type Recommendation = "APPROVE" | "DECLINE" | "REVIEW";
// "notice" flags something a reviewer should see without holding the claim, such as a capped amount.
export type Check = { id: string; label: string; status: CheckStatus; detail: string; declineReason?: string; notRequired?:boolean; notice?: string };
export type Evaluation = { recommendation: Recommendation; checks: Check[]; declineReason?: string; summary: string; version: string; promotion?:{code:string;revision:number;settings:PromotionPolicy;amount:number;start_date:string;end_date:string} };
export type RuleGroup = "Project completion" | "Eligibility" | "Integrity";
export type Rule = { id: string; group: RuleGroup; label: string; description: string; onFail: "Decline" | "Review" };

export const VALID_FINANCIERS: readonly string[] = FINANCING_OPTIONS;
export const SUBMISSION_WINDOW_DAYS = 180;
const approvedStatuses = ["APPROVED", "FUNDED", "SHIPPED"];

// A rebate is approved automatically only when every rule passes. Any failure or
// warning holds it for a person; "onFail" is the suggested outcome for that person.
// Conditions follow the Axia/BPS SOW: validated proof of purchase (signed installation
// contract), installation status validated with Creatio, campaign start and end dates,
// rebate code and amount, and the daily serial file, plus PTO and integrity checks.
export const RULES: Rule[] = [
  { id: "proof", group: "Project completion", label: "Proof of purchase on file", description: "The signed and completed installation contract has been received.", onFail: "Review" },
  { id: "crm", group: "Project completion", label: "Installation verified in Creatio", description: "Axia's Creatio CRM reports the installation as complete.", onFail: "Review" },
  { id: "pto", group: "Project completion", label: "Project completed with PTO", description: "The solar system is installed and the utility has granted Permission to Operate (PTO), dated on or before today.", onFail: "Decline" },
  { id: "dates", group: "Project completion", label: "Sale, install and PTO dates are consistent", description: "The sale is on or before submission; PTO is on or after the sale and on or before the request was filed.", onFail: "Decline" },
  { id: "campaign", group: "Eligibility", label: "Sale within campaign dates", description: "The date of sale falls between the rebate campaign's start and end dates.", onFail: "Decline" },
  { id: "code", group: "Eligibility", label: "Rebate code is active", description: "The submitted rebate code exists and is currently active.", onFail: "Decline" },
  { id: "amount", group: "Eligibility", label: "Amount matches promotion", description: "The amount equals the code's fixed value, or its multiple of the EnFin monthly payment kept within the promotion's minimum and maximum. Amounts over the maximum are capped and flagged.", onFail: "Review" },
  { id: "window", group: "Eligibility", label: "Filed within promotion deadline", description: "The request meets the deadline set for its promotion code.", onFail: "Review" },
  { id: "financier", group: "Eligibility", label: "Financing option is valid", description: "Financing is allowed by the promotion code settings.", onFail: "Decline" },
  { id: "certified", group: "Eligibility", label: "Form is certified", description: "The customer certified the submission and named the certifier.", onFail: "Review" },
  { id: "system", group: "Eligibility", label: "System meets promotion minimum", description: "The installed system meets the minimum kW set for its promotion code.", onFail: "Review" },
  { id: "state", group: "Eligibility", label: "State is eligible for promotion", description: "The installation is in a state allowed by its promotion code.", onFail: "Review" },
  { id: "serial", group: "Integrity", label: "Serial in daily serial file", description: "The module serial number appears in the daily serial file Axia sends to BPS.", onFail: "Review" },
  { id: "duplicate", group: "Integrity", label: "No duplicate claim", description: "No approved claim at this address already used this rebate code. Other claims at the same address (any code), or sharing the invoice number or module serial, are held for review.", onFail: "Decline" },
  { id: "fraud", group: "Integrity", label: "No fraud hold", description: "The claim has no open fraud case or payment hold.", onFail: "Review" },
  { id: "risk", group: "Integrity", label: "Risk level acceptable", description: "Risk level is low or not assessed.", onFail: "Review" },
  { id: "customer", group: "Integrity", label: "Address matches customer record", description: "When linked to a customer profile, the address and ZIP match it.", onFail: "Review" },
];
const ruleLabel = (id: string) => RULES.find((r) => r.id === id)!.label;

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
// USPS-style abbreviations so "123 North Main Street, Apt 4" and "123 N Main St #4" match.
const ADDRESS_WORDS: Record<string, string> = {
  street: "st", avenue: "ave", av: "ave", road: "rd", drive: "dr", lane: "ln", boulevard: "blvd", court: "ct", circle: "cir",
  place: "pl", terrace: "ter", parkway: "pkwy", highway: "hwy", trail: "trl", square: "sq", point: "pt", crossing: "xing",
  north: "n", south: "s", east: "e", west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
  apartment: "", apt: "", unit: "", suite: "", ste: "", number: "", no: "",
};
const addressKey = (r: Row) => {
  const zip = String(r.zip ?? "").replace(/\D/g, "").slice(0, 5);
  const street = `${r.address1 ?? ""} ${r.address2 ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").map((w) => ADDRESS_WORDS[w] ?? w).join("");
  return street && zip ? `${street}|${zip}` : "";
};
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

export type DecisionContext = {
  today: string;
  codes: Map<string, Row>;
  customers: Map<string, Row>;
  byAddress: Map<string, Row[]>;
  byInvoice: Map<string, Row[]>;
  bySerial: Map<string, Row[]>;
  serialFile: Set<string>;
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

export function decisionContext(data: { rebates: Row[]; codes: Row[]; customers?: Row[]; serial_file?: string[] }, today: string): DecisionContext {
  const live = data.rebates.filter((r) => r.status !== "DECLINED");
  return {
    today,
    codes: new Map(data.codes.map((c) => [c.rebate_code, c])),
    customers: new Map((data.customers || []).map((c) => [c.id, c])),
    byAddress: group(live, addressKey),
    byInvoice: group(live, (r) => norm(r.invoice_number)),
    bySerial: group(live, (r) => norm(r.module_serial)),
    serialFile: new Set((data.serial_file || []).map(norm)),
  };
}

/** Other claims that collide with this one, for the duplicate check and the detail view. */
export function relatedClaims(r: Row, ctx: DecisionContext) {
  const others = (list: Row[] | undefined) => (list || []).filter((o) => o.id !== r.id);
  return {
    address: others(ctx.byAddress.get(addressKey(r))),
    invoice: r.invoice_number ? others(ctx.byInvoice.get(norm(r.invoice_number))) : [],
    serial: r.module_serial ? others(ctx.bySerial.get(norm(r.module_serial))) : [],
  };
}

export function evaluate(r: Row, ctx: DecisionContext): Evaluation {
  const code=ctx.codes.get(r.rebate_code),policy=policyFor(code);
  const checks: Check[] = [];
  const add = (id: string, status: CheckStatus, detail: string, declineReason?: string, label=ruleLabel(id),notRequired=false) =>
    checks.push({ id, label, status, detail, ...(notRequired?{notRequired:true}:{}), ...(status === "fail" && declineReason ? { declineReason } : {}) });

  if(!policy.require_proof)add("proof","pass","Not required by this promotion.",undefined,ruleLabel("proof"),true);
  else if (r.proof_of_purchase) add("proof", "pass", `Signed installation contract dated ${r.proof_of_purchase}.`);
  else add("proof", "warn", "No signed installation contract has been received.");

  const crm = String(r.crm_install_status || "");
  const crmSource = r.crm_source === "demo-simulated" ? " (simulated sync)" : "";
  if(!policy.require_crm)add("crm","pass","Not required by this promotion.",undefined,ruleLabel("crm"),true);
  else if (crm === "INSTALLED") add("crm", "pass", `Creatio reports Installed${r.crm_synced ? `, synced ${r.crm_synced}` : ""}${crmSource}.`);
  else if (crm === "PENDING") add("crm", "warn", `Creatio reports installation pending${crmSource}.`);
  else if (crm === "NOT_FOUND") add("crm", "warn", "No matching project was found in Creatio.");
  else add("crm", "warn", "Installation status has not been received from Creatio.");

  if (!code) add("code", "fail", `Code "${r.rebate_code}" is not a program rebate code.`, "Incorrect Rebate Code Selected");
  else if (!code.active) add("code", "fail", `Code "${r.rebate_code}" is inactive.`, "Incorrect Rebate Code Selected");
  else add("code", "pass", `${r.rebate_code} is active (${usd(code.rebate_amount)}).`);

  if (!code) add("campaign", "warn", "Cannot check campaign dates without a valid code.");
  else if (!code.start_date || !code.end_date) add("campaign", "warn", `${r.rebate_code} has no campaign start and end dates.`);
  else if (!r.date_of_sale || r.date_of_sale < code.start_date || r.date_of_sale > code.end_date)
    add("campaign", "fail", `Sold ${r.date_of_sale || "on an unknown date"}; ${r.rebate_code} runs ${code.start_date} to ${code.end_date}.`, "Sale outside campaign dates");
  else add("campaign", "pass", `Sold ${r.date_of_sale}; ${r.rebate_code} runs ${code.start_date} to ${code.end_date}.`);

  const due = code ? rebateAmountFor(code, r) : undefined;
  const formula = due?.payment ? `${policy.payment_multiplier} × ${usd(due.payment)} EnFin monthly payment = ${usd(due.calculated!)}` : "";
  if (!code || !due) add("amount", "warn", "Cannot compare the amount without a valid code.");
  else if (due.missingPayment) add("amount", "warn", `No EnFin monthly payment on file; ${r.rebate_code} pays ${policy.payment_multiplier} × the monthly payment.`);
  else if (Math.abs(due.amount - Number(r.rebate_amount)) > 0.005)
    add("amount", "warn", `Requested ${usd(r.rebate_amount)}; ${r.rebate_code} pays ${usd(due.amount)}${formula ? ` (${formula}${due.capped ? `, kept within ${usd(policy.min_rebate_amount)}–${usd(policy.max_rebate_amount)}` : ""})` : ""}.`);
  else if (due.capped === "max") {
    add("amount", "pass", `${formula}, capped at the ${usd(policy.max_rebate_amount)} maximum.`);
    checks[checks.length - 1].notice = `Calculated amount exceeds the ${usd(policy.max_rebate_amount)} maximum by ${usd(due.calculated! - policy.max_rebate_amount)}; paying the maximum.`;
  } else if (due.capped === "min") add("amount", "pass", `${formula}, raised to the ${usd(policy.min_rebate_amount)} minimum.`);
  else add("amount", "pass", formula ? `${formula}.` : `${usd(r.rebate_amount)} matches the code value.`);

  if (r.status === "REBATE_REGISTRATION" || (r.preinstallation && !r.installation_complete_date))
    add("pto", "fail", "Registered before installation; installation has not been confirmed.", "System has not been installed");
  else if (!r.pto_date) add("pto", "fail", "No PTO date on file.", "System has not passed Permission To Operate (PTO) yet");
  else if (r.pto_date > ctx.today) add("pto", "fail", `PTO date ${r.pto_date} is in the future.`, "System has not passed Permission To Operate (PTO) yet");
  else add("pto", "pass", `Installed; PTO granted ${r.pto_date}.`);

  // Pre-installation registrations are filed twice, so PTO is judged against the later of the
  // submission and finalization dates. (Imported records may carry an earlier install date.)
  const filed = [r.date_submitted, r.installation_complete_date].filter(Boolean).sort().at(-1) as string;
  if (!r.date_of_sale || r.date_of_sale > r.date_submitted || r.date_of_sale > ctx.today)
    add("dates", "fail", `Date of sale ${r.date_of_sale || "is missing"} is after submission on ${r.date_submitted}.`, "Invalid Date of Sale");
  else if (r.pto_date && r.pto_date < r.date_of_sale) add("dates", "fail", `PTO ${r.pto_date} is before the sale on ${r.date_of_sale}.`, "Invalid Date of Sale");
  else if (r.pto_date && r.pto_date > filed) add("dates", "fail", `PTO ${r.pto_date} is after the request was filed on ${filed}.`, "System has not passed Permission To Operate (PTO) yet");
  else add("dates", "pass", `Sold ${r.date_of_sale}, filed ${filed}.`);

  if (r.pto_date && r.pto_date <= filed) {
    const gap = days(r.pto_date, filed);
    add("window",gap>policy.submission_window_days?(policy.late_submission_action==="DECLINE"?"fail":"warn"):"pass",`Submitted ${gap} day${gap===1?"":"s"} after PTO; ${r.rebate_code} allows ${policy.submission_window_days} days.`,"Submission outside promotion deadline",`Filed within ${policy.submission_window_days} days of PTO`);
  } else add("window", "warn", "Cannot measure the submission window without a valid PTO date.",undefined,`Filed within ${policy.submission_window_days} days of PTO`);

  const financier = policy.allowed_financiers.find((f) => f.toLowerCase() === String(r.financier || "").toLowerCase());
  if (!r.financier) add("financier", "warn", "No financing option recorded.");
  else if (!financier) add("financier",policy.eligibility_action==="DECLINE"?"fail":"warn",`"${r.financier}" is not accepted by ${r.rebate_code}; allowed: ${policy.allowed_financiers.join(", ")}.`, "Invalid financier option");
  else add("financier", "pass", financier);

  add("certified", r.certified_by ? "pass" : "warn", r.certified_by ? `Certified by ${r.certified_by}.` : "No certifier named.");

  const size=Number(r.system_size_kw),thresholdStatus=policy.eligibility_action==="DECLINE"?"fail":"warn";
  if(!policy.min_system_size_kw)add("system","pass","No minimum system size for this promotion.",undefined,ruleLabel("system"),true);
  else if(!Number.isFinite(size)||size<=0)add("system","warn",`System size is missing; ${r.rebate_code} requires at least ${policy.min_system_size_kw} kW.`);
  else add("system",size>=policy.min_system_size_kw?"pass":thresholdStatus,`${size} kW installed; ${r.rebate_code} requires at least ${policy.min_system_size_kw} kW.`,"System below promotion minimum");
  if(!policy.eligible_states.length)add("state","pass","All US states are eligible for this promotion.");
  else if(!r.state)add("state","warn","Installation state is missing.");
  else add("state",policy.eligible_states.includes(String(r.state).toUpperCase())?"pass":thresholdStatus,`${r.state}; ${r.rebate_code} allows ${policy.eligible_states.join(", ")}.`,"State not eligible for promotion");

  if(!policy.require_serial)add("serial","pass","Not required by this promotion.",undefined,ruleLabel("serial"),true);
  else if (!r.module_serial) add("serial", "warn", "No module serial number recorded.");
  else if (!ctx.serialFile.has(norm(r.module_serial))) add("serial", "warn", `${r.module_serial} is not in the daily serial file.`);
  else add("serial", "pass", `${r.module_serial} matched in the daily serial file.`);

  const related = relatedClaims(r, ctx);
  const sameCode = related.address.filter((o) => o.rebate_code === r.rebate_code);
  const approvedTwin = sameCode.find((o) => approvedStatuses.includes(o.status));
  if (approvedTwin) add("duplicate", "fail", `Claim ${approvedTwin.tracking_number} for this address and code is already ${approvedTwin.status.toLowerCase()}.`, "Duplicate rebate submitted");
  else if (sameCode.length) add("duplicate", "warn", `Claim ${sameCode[0].tracking_number} has the same address and code.${policy.auto_decline_duplicates ? " Approving either one automatically declines the other as a duplicate." : ""}`);
  else if (related.address.length) add("duplicate", "warn", `Claim ${related.address[0].tracking_number} at this address used code ${related.address[0].rebate_code}.`);
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
  return { recommendation, checks, declineReason: fail?.declineReason, summary, version: ENGINE_VERSION,...(code?{promotion:{code:code.rebate_code,revision:Number(code.policy_revision)||0,settings:policy,amount:Number(code.rebate_amount),start_date:code.start_date,end_date:code.end_date}}:{}) };
}

export const recommendationLabel: Record<Recommendation, string> = { APPROVE: "Meets all thresholds", DECLINE: "Suggest decline", REVIEW: "Needs review" };
export const AUTO_APPROVER = "Automatic approval";
export const AUTO_DUPLICATE_DECLINER = "Automatic duplicate check";
