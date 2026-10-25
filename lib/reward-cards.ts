import type { Row } from "./program";

// Simulated prepaid card issuer. When a rebate is approved the program "issues" a Visa Prepaid
// card and emails the customer a link to claim it. Nothing is funded and no real card exists;
// a live integration would call the issuer's API here and send its delivery email.
export const CARD_PROVIDER = "Demo Visa Prepaid (simulated)";
export const CARD_VALID_DAYS = 180;

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);

export function issueCard(r: Row, today: string) {
  const digital = r.reward_type !== "Physical";
  const reward: Row = {
    id: `reward-${r.id}`, reward_reference: `AX-CARD-${String(r.tracking_number).slice(-6)}`, rebate_id: r.id,
    customer_id: r.customer_id || "", customer_name: `${r.first_name} ${r.last_name}`, email: r.email,
    related_tracking_number: r.tracking_number, reward_type: digital ? "Virtual" : "Physical",
    status: digital ? "DELIVERED" : "MAILING", issued_amount: Number(r.rebate_amount), remaining_balance: Number(r.rebate_amount),
    last_four: String(1000 + (parseInt(String(r.tracking_number).slice(-4), 10) * 7) % 9000), date_issued: today,
    expiry_date: addDays(today, CARD_VALID_DAYS), date_activated: "", date_shipped: "", provider: CARD_PROVIDER,
    claim_token: token(), simulated: true,
  };
  const email: Row = {
    id: `reward-email-${r.id}`, type: "reward_card", reward_id: reward.id, tracking_number: r.tracking_number,
    to: r.email, customer_name: reward.customer_name, amount: reward.issued_amount, reward_type: reward.reward_type,
    subject: digital ? `Your ${usd(reward.issued_amount)} Axia Visa Prepaid Card is ready` : `Your ${usd(reward.issued_amount)} Axia Visa Prepaid Card is on its way`,
    status: digital ? "Delivered (simulated)" : "Sent (simulated)", created: new Date().toISOString(), sends: 1,
  };
  return { reward, email };
}

/** What the customer sees for their card. The card number is never stored; only the last four digits exist. */
export const publicCard = (c: Row) => ({
  reward_reference: c.reward_reference, customer_name: c.customer_name, reward_type: c.reward_type, status: c.status,
  issued_amount: c.issued_amount, remaining_balance: c.remaining_balance, last_four: c.last_four,
  date_issued: c.date_issued, expiry_date: c.expiry_date, date_activated: c.date_activated, provider: c.provider,
  tracking_number: c.related_tracking_number,
});
