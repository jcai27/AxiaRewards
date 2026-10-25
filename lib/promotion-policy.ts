import {z} from "zod";

export const FINANCING_OPTIONS=["EnFin","Cash","Solar loan","Lease","Power purchase agreement"] as const;
export const US_STATES="AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
export const promotionPolicySchema=z.object({
  auto_approve:z.boolean().default(true),
  submission_window_days:z.number().int().min(1).max(730).default(180),
  min_system_size_kw:z.number().min(0).max(1000).default(0),
  eligible_states:z.array(z.string().refine(s=>US_STATES.includes(s),"Choose a US state abbreviation.")).max(51).default([]),
  allowed_financiers:z.array(z.enum(FINANCING_OPTIONS)).min(1).max(FINANCING_OPTIONS.length).default([...FINANCING_OPTIONS]),
  require_proof:z.boolean().default(true),
  require_crm:z.boolean().default(true),
  require_serial:z.boolean().default(true),
  late_submission_action:z.enum(["REVIEW","DECLINE"]).default("REVIEW"),
  eligibility_action:z.enum(["REVIEW","DECLINE"]).default("DECLINE"),
  auto_decline_duplicates:z.boolean().default(true),
  // FIXED pays the code's amount. PAYMENT_MULTIPLE pays a multiple of the EnFin monthly payment, kept within min and max.
  amount_mode:z.enum(["FIXED","PAYMENT_MULTIPLE"]).default("FIXED"),
  payment_multiplier:z.number().min(1).max(24).default(6),
  min_rebate_amount:z.number().min(0).max(100000).default(500),
  max_rebate_amount:z.number().min(0).max(100000).default(2500),
}).strict();
export type PromotionPolicy=z.infer<typeof promotionPolicySchema>;
export const defaultPromotionPolicy=():PromotionPolicy=>promotionPolicySchema.parse({});
export function policyFor(code?:{policy?:unknown}):PromotionPolicy {
  return promotionPolicySchema.parse(code?.policy||{});
}
const calendarDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;},"Enter a valid calendar date.");
export const promotionSchema=z.object({
  rebate_code:z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/,"Use letters, numbers, hyphens or underscores."),
  title:z.string().trim().min(1).max(120),
  rebate_amount:z.number().positive().max(100000).multipleOf(0.01),
  start_date:calendarDate,
  end_date:calendarDate,
  active:z.boolean(),
  policy:promotionPolicySchema,
}).strict().refine(v=>v.start_date<=v.end_date,{message:"The end date must be on or after the start date.",path:["end_date"]})
  .refine(v=>v.policy.min_rebate_amount<=v.policy.max_rebate_amount,{message:"The maximum rebate must be at least the minimum.",path:["policy","max_rebate_amount"]});

export type RebateAmount={amount:number;calculated?:number;payment?:number;capped?:"max"|"min";missingPayment?:boolean};
/** The rebate a claim earns under its promotion. Payment-based codes use the EnFin monthly payment on the claim. */
export function rebateAmountFor(code:{rebate_amount?:unknown;policy?:unknown},claim:{enfin_monthly_payment?:unknown}):RebateAmount{
  const policy=policyFor(code);
  if(policy.amount_mode==="FIXED")return {amount:Number(code.rebate_amount)};
  const payment=Number(claim.enfin_monthly_payment);
  if(!Number.isFinite(payment)||payment<=0)return {amount:policy.min_rebate_amount,missingPayment:true};
  const calculated=Math.round(payment*policy.payment_multiplier*100)/100;
  if(calculated>policy.max_rebate_amount)return {amount:policy.max_rebate_amount,calculated,payment,capped:"max"};
  if(calculated<policy.min_rebate_amount)return {amount:policy.min_rebate_amount,calculated,payment,capped:"min"};
  return {amount:calculated,calculated,payment};
}
