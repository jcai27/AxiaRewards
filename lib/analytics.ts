import type { Row } from "./program";

export const paymentFields=["Payment Reference","Customer Name","Email","Source","Recipient Type","Related Tracking Number","Amount","Currency","Status","Reward Type","Date Created","Date Scheduled","Date Paid","Failure Reason","Hold Reason","Dealer Name","State"];
export const rewardFields=["Reward Reference","Customer Name","Email","Payment Reference","Related Tracking Number","Reward Type","Status","Issued Amount","Remaining Balance","Last Four","Date Issued","Expiry Date","Date Activated","Date Shipped"];
export const fraudFields=["Case Number","Customer Name","Email","Tracking Number","Case Type","Status","Risk Level","Amount At Risk","Assigned To","Date Opened","Date Closed","Payment Hold","Evidence","Recommendation"];
export const customerFields=["Name","Email","Phone","Address Line 1","City","State","Zip","Dealer Name","Account Status","Customer Since","System Size Kw","Module Count","Module Model","Battery Model","Preferred Reward Type","Risk Level"];

export function programAnalytics(data:Row,year:string){
  const rebates:Row[]=data.rebates.filter((r:Row)=>r.date_submitted.startsWith(year));
  const payments:Row[]=(data.payments||[]).filter((r:Row)=>r.date_created.startsWith(year));
  const fraud:Row[]=(data.fraud||[]).filter((r:Row)=>r.date_opened.startsWith(year));
  const decided=rebates.filter(r=>r.date_approved_declined),approved=rebates.filter(r=>["APPROVED","FUNDED","SHIPPED"].includes(r.status));
  const monthly=Array.from({length:12},(_,i)=>{const key=`${year}-${String(i+1).padStart(2,"0")}`;const list=rebates.filter(r=>r.date_submitted.startsWith(key));return {month:new Date(Number(year),i,1).toLocaleDateString("en-US",{month:"short"}),submissions:list.length,funded:list.filter(r=>r.date_funded).reduce((s,r)=>s+r.rebate_amount,0)};});
  const dealers=Object.values(rebates.reduce((groups:Record<string,Row>,r)=>{const key=r.dealer_name;const a=groups[key]||(groups[key]={dealer_name:key,submissions:0,approved:0,declined:0,funded_amount:0});a.submissions++;if(["APPROVED","FUNDED","SHIPPED"].includes(r.status))a.approved++;if(r.status==="DECLINED")a.declined++;if(r.date_funded)a.funded_amount+=r.rebate_amount;return groups;},{})).sort((a,b)=>b.submissions-a.submissions);
  const paid=payments.filter(p=>p.status==="PAID");const activeFraud=fraud.filter(f=>["OPEN","UNDER_REVIEW"].includes(f.status));
  const reviewDays=decided.map(r=>(Date.parse(r.date_approved_declined)-Date.parse(r.date_submitted))/86400000).filter(n=>n>=0);
  return {rebates,payments,fraud,monthly,dealers,approvalRate:decided.length?approved.length/decided.length*100:0,averageReviewDays:reviewDays.length?reviewDays.reduce((s,n)=>s+n,0)/reviewDays.length:0,paidAmount:paid.reduce((s,p)=>s+p.amount,0),failedPayments:payments.filter(p=>["FAILED","RETURNED"].includes(p.status)).length,heldAmount:payments.filter(p=>p.status==="ON_HOLD").reduce((s,p)=>s+p.amount,0),activeFraud:activeFraud.length,exposure:activeFraud.reduce((s,f)=>s+f.amount_at_risk,0),rebateFunded:rebates.filter(r=>r.date_funded).reduce((s,r)=>s+r.rebate_amount,0)};
}
