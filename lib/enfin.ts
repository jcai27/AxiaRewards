// Simulated EnFin loan lookup. A live integration would ask EnFin for the customer's loan by
// name and address; the demo derives a stable monthly payment from the same details instead.
export const ENFIN_SOURCE = "demo-simulated";

export function simulatedEnfinPayment(r: { email?: string; address1?: string; zip?: string }) {
  let h = 0;
  for (const ch of `${r.email || ""}|${r.address1 || ""}|${r.zip || ""}`.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  // $95.00 to $494.75 a month, in quarter-dollar steps: 6x lands on both sides of the demo $2,500 cap.
  return 95 + (h % 1600) * 0.25;
}
