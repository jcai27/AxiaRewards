import { csv, type Row } from "./program";

// Program invoices bill the funder for approved rebates. Rebates link back via
// program_invoice_id / program_invoice_number (invoice_number on a rebate is the
// customer's purchase invoice, which is a different document).
export const INVOICEABLE_STATUSES = ["APPROVED", "FUNDED", "SHIPPED"];
export const PAYMENT_TERMS_DAYS = 30;
export const INVOICE_FROM = { name: "Axia Rebate & Referral Program", detail: "Administered by Best Payment Solutions" };
export const INVOICE_TO = { name: "Axia by Qcells", detail: "Rebate program funding" };
export const invoiceTransitions: Record<string, string[]> = { DRAFT: ["ISSUED", "VOID"], ISSUED: ["PAID", "VOID"], PAID: [], VOID: [] };

export const invoiceable = (r: Row) => INVOICEABLE_STATUSES.includes(r.status) && !r.program_invoice_id && !!r.date_approved_declined;

export type InvoiceLine = { rebate_id: string; tracking_number: string; customer: string; rebate_code: string; dealer_name: string; date_approved: string; amount: number };

export const invoiceLine = (r: Row): InvoiceLine => ({
  rebate_id: r.id,
  tracking_number: r.tracking_number,
  customer: `${r.first_name} ${r.last_name}`,
  rebate_code: r.rebate_code,
  dealer_name: r.dealer_name,
  date_approved: r.date_approved_declined,
  amount: Number(r.rebate_amount) || 0,
});

export const invoiceTotal = (lines: InvoiceLine[]) => Number(lines.reduce((s, l) => s + l.amount, 0).toFixed(2));

export const invoiceCsv = (invoice: Row) =>
  csv(
    invoice.lines.map((l: InvoiceLine) => ({ ...l, invoice_number: invoice.invoice_number })),
    ["Invoice Number", "Tracking Number", "Customer", "Rebate Code", "Dealer Name", "Date Approved", "Amount"],
  );
