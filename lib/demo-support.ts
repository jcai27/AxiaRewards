import type { Row } from "./program";

/** Sample support requests so the inbox shows the kinds of questions the previous vendor handled. */
export function demoSupport(today: string): Row[] {
  const before = (days: number) => new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);
  const ticket = (n: number, name: string, email: string, subject: string, message: string, status: string, days: number, tracking = "", thread: Row[] = []) =>
    ({ id: `demo-support-${n}`, reference: `DEMO${String(n).padStart(4, "0")}`, name, email, subject, message, tracking_number: tracking, status, date_submitted: before(days), thread, sample: true });
  return [
    ticket(1, "Morgan Promotion Demo", "promotion-demo-1@example.com", "Visa card support", "I was told my rebate was approved but I can't find the card email. Can you resend it?", "Received", 1, "7200000001"),
    ticket(2, "Priya Shah", "priya.shah@example.com", "Visa card support", "My virtual card was declined at a gas station. Is it activated?", "In progress", 3, "", [
      { from: "Support", by: "Jordan Lee", date: before(2), text: "Prepaid cards can be declined at pay-at-the-pump terminals because they pre-authorize a large hold. Please pay inside, or use the card online." },
    ]),
    ticket(3, "Luis Romero", "luis.romero@example.com", "Tracking number assistance", "I lost my tracking number. I submitted my rebate in August with my Gmail address.", "Resolved", 9, "", [
      { from: "Support", by: "Alex Morgan", date: before(8), text: "We found your request and sent the tracking number to the email on file." },
    ]),
    ticket(4, "Dana Whitfield", "dana.whitfield@example.com", "Rebate question", "Why is my rebate $2,500 when my payments are higher than that would suggest?", "Received", 0),
  ];
}
