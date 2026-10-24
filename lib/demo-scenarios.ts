import type { Row } from "./program";

export const demoVersion = "solar-scenarios-v2";
const datePlus = (value:string,days:number) => {const d=new Date(value+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const locations = [
  ["San Diego","CA","92101"],["Sacramento","CA","95814"],["Phoenix","AZ","85001"],
  ["Austin","TX","78701"],["Las Vegas","NV","89101"],["Orlando","FL","32801"],
  ["Denver","CO","80202"],["Charlotte","NC","28202"],["Albany","NY","12207"],["Fresno","CA","93721"],
];
const names = ["Maya Chen","Gabriel Torres","Priya Shah","Marcus Reed","Elena Vasquez","Oliver Brooks","Zoe Carter","Isaac Nguyen","Nadia Hassan","Leo Thompson","Amara Okafor","Ethan Park","Sofia Rivera","Daniel Kim","Ava Mitchell","Caleb Williams","Isla Morgan","Adrian Patel","Layla Bennett","Mateo Garcia"];
const dealers = ["Axia By QCells","Sunrise Solar Partners (Demo)","Bright Horizon Energy (Demo)","Desert Sun Installers (Demo)"];
const staffSpecs = [
  ["Alex Morgan","Program Director","Program Administration","Client Ace High"],
  ["Jordan Lee","Rebate Operations Lead","Rebate Operations","Client Ace High"],
  ["Taylor Brooks","Rebate Specialist","Rebate Operations","Client Ace High"],
  ["Riley Campbell","Payment Operations Manager","Payments & Rewards","Client Ace High"],
  ["Morgan Ellis","Payment Reconciliation Analyst","Payments & Rewards","Client View Only"],
  ["Avery Scott","Fraud Review Lead","Fraud & Risk","Client Ace High"],
  ["Quinn Foster","Fraud Investigation Analyst","Fraud & Risk","Client View Only"],
  ["Cameron Diaz","Reporting Analyst","Reporting & Analytics","Client View Only"],
  ["Sydney Walker","Program Insights Manager","Reporting & Analytics","Client View Only"],
  ["Drew Parker","Dealer Support Specialist","Dealer Support","Client Ace High"],
  ["Jamie Sullivan","Referral Operations Specialist","Referral Operations","Client Ace High"],
  ["Reese Collins","Former Payment Coordinator","Payments & Rewards","Client View Only"],
];

/** Additive fixtures. Stable IDs + INSERT OR IGNORE preserve all later edits. */
export function demoScenarios() {
  const users:Row[]=staffSpecs.map(([name,job_title,department,role],i)=>({id:`demo-staff-${i+1}`,name,email:`${name.toLowerCase().replaceAll(" ",".")}.demo@example.com`,job_title,department,role,dealer_name:dealers[0],status:i===11?"Inactive":"Active",date_created:"2025-01-02",date_added:i===10?"":"2025-01-03",sample:true,demo_version:demoVersion}));
  const customers:Row[]=Array.from({length:60},(_,i)=>{
    const [first_name,last_name]=names[i%20].split(" ");const [city,state,zip]=locations[i%locations.length];
    const module_count=16+(i%13),module_watts=430+(i%3)*10;
    return {id:`demo-customer-${i+1}`,first_name,last_name,name:`${first_name} ${last_name}`,email:`${first_name.toLowerCase()}.${last_name.toLowerCase()}.solar${i+1}@example.com`,phone:`(202) 555-${String(100+i).padStart(4,"0")}`,address1:`${120+i*7} ${["Sunrise","Cedar","Juniper","Meadow","Sunset"][i%5]} ${i%2?"Drive":"Lane"}`,address2:i%11===0?"Unit 2":"",city,state,zip,dealer_name:dealers[i%4],account_status:i%17===0?"INACTIVE":"ACTIVE",customer_since:"2025-01-01",household_id:`DEMO-HH-${String(i+1).padStart(4,"0")}`,system_size_kw:Number((module_count*module_watts/1000).toFixed(2)),module_count,module_model:`AX-Demo ${module_watts} W`,battery_model:i%3===0?"AX-Store Demo 10":"None",preferred_reward_type:i%3===0?"Physical":"Virtual",risk_level:"LOW",sample:true,demo_version:demoVersion};
  });
  const rebateStatuses=["REBATE_REGISTRATION","PENDING","PENDING","APPROVED","APPROVED","FUNDED","FUNDED","SHIPPED","SHIPPED","DECLINED","DECLINED","PENDING"];
  const rebates:Row[]=Array.from({length:72},(_,i)=>{
    const customer=customers[i%customers.length],status=rebateStatuses[i%12],year=i<24?2025:2026;
    const sale=`${year}-${String(2+i%6).padStart(2,"0")}-05`,submitted=datePlus(sale,status==="REBATE_REGISTRATION"?7:35),reviewed=["APPROVED","FUNDED","SHIPPED","DECLINED"].includes(status),paid=["FUNDED","SHIPPED"].includes(status),rebate_amount=[250,500,750,1000,1250,1500][i%6];
    return {...Object.fromEntries(["first_name","last_name","email","phone","address1","address2","city","state","zip","dealer_name"].map(k=>[k,customer[k]])),id:`demo-rebate-${i+1}`,customer_id:customer.id,household_id:customer.household_id,tracking_number:String(6100000000+i),status,rebate_code:year===2025?"AxiaLoyalty2025":i%2?"AxiaFall2026":"AxiaStorage2026",rebate_amount,date_of_sale:sale,date_submitted:submitted,date_approved_declined:reviewed?datePlus(submitted,5+i%5):"",approved_declined_by:reviewed?users[i%3].name:"",decline_reason:status==="DECLINED"?(i%2?"Invalid Date of Sale":"System has not passed Permission To Operate (PTO) yet"):"",date_funded:paid?datePlus(submitted,12):"",date_shipped:status==="SHIPPED"?datePlus(submitted,14):"",pto_date:status==="REBATE_REGISTRATION"?"":datePlus(sale,30),installation_complete_date:status==="REBATE_REGISTRATION"?"":datePlus(sale,27),sales_rep_name:["Jordan Lee","Taylor Brooks","Drew Parker"][i%3],certified_by:customer.name,reward_type:status==="SHIPPED"?"Physical":customer.preferred_reward_type,financier:["Cash","Solar loan","Lease"][i%3],system_size_kw:customer.system_size_kw,module_model:customer.module_model,module_serial:`DEMO-MOD-${String(100000+i)}`,invoice_number:`DEMO-INV-${year}-${String(i+1).padStart(4,"0")}`,risk_level:"LOW",fraud_review_status:"NOT_FLAGGED",payment_hold:false,sample:true,demo_version:demoVersion};
  });
  const referralStatuses=["PENDING","INSTALLATION_COMPLETE","PROCESSED","SHIPPED","DISQUALIFIED","PROCESSED"];
  const referrals:Row[]=Array.from({length:36},(_,i)=>{
    const referrer=customers[i%12],referee=customers[24+i],status=referralStatuses[i%6],year=i<12?2025:2026,submitted=`${year}-${String(2+i%6).padStart(2,"0")}-08`,installed=["INSTALLATION_COMPLETE","PROCESSED","SHIPPED"].includes(status),paid=["PROCESSED","SHIPPED"].includes(status);
    const r:Row={id:`demo-referral-${i+1}`,customer_id:referrer.id,referee_customer_id:referee.id,tracking_number:String(6200000000+i),referee_tracking_number:String(6300000000+i),status,campaign_name:year===2025?"Axia Neighbor Rewards 2025":"Axia Bright Connections 2026",referral_code:`DEMO-SOLAR-${String(i+1).padStart(4,"0")}`,referral_source:i%3?"Consumer Site":"Dealer Partner",referral_source_name:i%3?"Axia Rewards":referee.dealer_name,amount:i%4===0?1250:1000,referee_amount:i%4===0?750:500,sales_rep_name:"Jamie Sullivan",dealer_name:referee.dealer_name,referral_lead:"Homeowner",date_submitted:submitted,disqualified_date:status==="DISQUALIFIED"?datePlus(submitted,9):"",installation_complete_date:installed?datePlus(submitted,30):"",email_sent_date:installed?datePlus(submitted,31):"",redemption_date:paid?datePlus(submitted,32):"",funded_date:paid?datePlus(submitted,38):"",shipped_date:status==="SHIPPED"?datePlus(submitted,40):"",reward_type:status==="SHIPPED"?"Physical":paid?"Virtual":"",sample:true,demo_version:demoVersion};
    for(const [side,c] of [["referrer",referrer],["referee",referee]] as const){for(const k of ["first_name","last_name","email","phone","city","state","zip"])r[`${side}_${k}`]=c[k];r[`${side}_address_line_1`]=c.address1;r[`${side}_address_line_2`]=c.address2;}
    return r;
  });
  const riskTypes=[
    ["Duplicate claim","Same invoice number appears in two demo submissions.","Compare invoice, household and sale date before approving."],
    ["Address mismatch","Installation address differs from the submitted reward address.","Verify the installation address and authorized card recipient."],
    ["Repeated module serial","Module serial appears on another demo household.","Ask the dealer to verify the module serial and installation record."],
    ["Unusual submission velocity","Four requests from one demo household were submitted within 24 hours.","Check whether purchases are distinct and eligible."],
    ["PTO document inconsistency","The demo PTO record predates the installation milestone.","Request a corrected PTO document from the installer."],
    ["Reward account mismatch","The reward recipient name differs from the solar contract holder.","Confirm the intended recipient through program support."],
  ];
  const mixedYears=(status:string,count:number)=>{const current=rebates.filter(r=>r.status===status&&r.date_submitted.startsWith("2026")),previous=rebates.filter(r=>r.status===status&&r.date_submitted.startsWith("2025"));return Array.from({length:Math.max(current.length,previous.length)},(_,i)=>[current[i],previous[i]]).flat().filter(Boolean).slice(0,count);};
  const targets=[...mixedYears("PENDING",10),...mixedYears("DECLINED",4),...mixedYears("APPROVED",2),...mixedYears("FUNDED",2)];
  const fraud:Row[]=targets.map((r,i)=>{
    const [case_type,description,recommendation]=riskTypes[i%6],status=i<6?"OPEN":i<10||i>=16?"UNDER_REVIEW":i<14?"CONFIRMED":"CLEARED",risk_level=status==="CLEARED"?"LOW":i%3===0?"HIGH":"MEDIUM";
    let evidence=description,related_tracking_number="";
    const counterpart=rebates.filter(other=>!targets.includes(other))[i];
    if(i%6===0){counterpart.invoice_number=r.invoice_number;related_tracking_number=counterpart.tracking_number;evidence=`Invoice ${r.invoice_number} also appears on demo claim ${related_tracking_number}. Compare the two purchase records.`;}
    if(i%6===1){r.verified_installation_address=r.address1;r.address1="999 Alternate Demo Way";evidence=`Submitted reward address: ${r.address1}. Verified demo installation address: ${r.verified_installation_address}.`;}
    if(i%6===2){counterpart.module_serial=r.module_serial;related_tracking_number=counterpart.tracking_number;evidence=`Serial ${r.module_serial} also appears on demo claim ${related_tracking_number}, which belongs to a different customer.`;}
    if(i%6===3){evidence=`Four illustrative submissions are recorded for household ${r.household_id} in the scenario's simulated 24-hour activity log.`;r.submission_velocity_24h=4;}
    if(i%6===4){r.pto_date=datePlus(r.date_of_sale,-3);evidence=`The submitted demo PTO date (${r.pto_date}) predates the sale (${r.date_of_sale}) and installation (${r.installation_complete_date}).`;}
    if(i%6===5){r.reward_recipient_name="Alternate Demo Recipient";evidence=`Reward recipient ${r.reward_recipient_name} does not match contract holder ${r.first_name} ${r.last_name}.`;}
    if(status==="CLEARED"&&i%6===2){counterpart.module_serial+="-CORRECTED";evidence="The initial serial match was an installer transcription error. Corrected demo documentation established separate purchases.";}
    if(status==="CONFIRMED")r.decline_reason=i%6===0?"Duplicate rebate submitted":i%6===4?"System has not passed Permission To Operate (PTO) yet":"Address doesn't match customer records";
    const id=`demo-fraud-${i+1}`;r.fraud_case_id=id;r.fraud_review_status=status;r.risk_level=risk_level;r.payment_hold=["OPEN","UNDER_REVIEW","CONFIRMED"].includes(status);r.fraud_reason=case_type;
    const customer=customers.find(c=>c.id===r.customer_id)!;if(risk_level==="HIGH"||customer.risk_level==="LOW")customer.risk_level=risk_level;
    return {id,case_number:`DEMO-FR-${String(i+1).padStart(4,"0")}`,customer_id:customer.id,customer_name:customer.name,email:customer.email,rebate_id:r.id,tracking_number:r.tracking_number,related_tracking_number,case_type,status,risk_level,amount_at_risk:r.rebate_amount,assigned_to:users[5+i%2].name,date_opened:datePlus(r.date_submitted,2),date_closed:["CONFIRMED","CLEARED"].includes(status)?datePlus(r.date_submitted,5):"",evidence,recommendation,payment_hold:r.payment_hold,source:"Seeded demo scenario",history:[{date:datePlus(r.date_submitted,2),actor:"Demo rules",action:`Flagged for ${case_type.toLowerCase()}`},{date:datePlus(r.date_submitted,3),actor:users[5+i%2].name,action:status==="OPEN"?"Awaiting initial review":status==="CLEARED"?"Documentation verified; no fraud established":status==="CONFIRMED"?"Duplicate or ineligible claim confirmed in demo review":"Review in progress; reward held"}],sample:true,demo_version:demoVersion};
  });
  const payments:Row[]=[];
  const addPayment=(r:Row,source:string,side="Customer")=>{
    const referral=source==="Referral",customer=customers.find(c=>c.id===(side==="Referee"?r.referee_customer_id:r.customer_id))!,funded=!!(r.date_funded||r.funded_date);
    const status=funded?"PAID":r.payment_hold?"ON_HOLD":referral?"SCHEDULED":["SCHEDULED","PROCESSING","FAILED","RETURNED"][payments.length%4];
    const paidDate=r.date_funded||r.funded_date||"";const amount=referral?(side==="Referee"?r.referee_amount:r.amount):r.rebate_amount;
    payments.push({id:`demo-payment-${payments.length+1}`,payment_reference:`DEMO-PAY-${String(payments.length+1).padStart(5,"0")}`,customer_id:customer.id,customer_name:customer.name,email:customer.email,source,recipient_type:side,related_id:r.id,related_tracking_number:side==="Referee"?r.referee_tracking_number:r.tracking_number,amount,currency:"USD",status,reward_type:r.reward_type||customer.preferred_reward_type,date_created:datePlus(r.date_submitted,7),date_scheduled:datePlus(r.date_submitted,12),date_paid:paidDate,date_submitted:r.date_submitted,failure_reason:status==="FAILED"?"Demo funding batch rejected; retry required":status==="RETURNED"?"Demo mailing address could not be verified":"",hold_reason:status==="ON_HOLD"?r.fraud_reason:"",attempt_count:status==="FAILED"?2:1,fraud_case_id:r.fraud_case_id||"",dealer_name:r.dealer_name,state:customer.state,sample:true,demo_version:demoVersion});
  };
  for(const r of rebates)if(["APPROVED","FUNDED","SHIPPED"].includes(r.status)||(r.status==="PENDING"&&r.payment_hold))addPayment(r,"Rebate");
  for(const r of referrals)if(["INSTALLATION_COMPLETE","PROCESSED","SHIPPED"].includes(r.status)){addPayment(r,"Referral","Referrer");addPayment(r,"Referral","Referee");}
  const rewards:Row[]=payments.filter(p=>p.status==="PAID").map((p,i)=>{
    const expiry=datePlus(p.date_paid,180),expired=expiry<"2026-10-23",blocked=!!fraud.find(f=>f.rebate_id===p.related_id&&f.status==="UNDER_REVIEW");
    const status=blocked?"BLOCKED":expired?"EXPIRED":p.reward_type==="Physical"?"SHIPPED":["ISSUED","ACTIVATED","PARTIALLY_SPENT","REISSUED"][i%4];
    const spent=status==="PARTIALLY_SPENT"?Math.round(p.amount*.42*100)/100:status==="EXPIRED"&&i%2?p.amount:0;
    return {id:`demo-reward-${i+1}`,reward_reference:`DEMO-CARD-${String(i+1).padStart(5,"0")}`,customer_id:p.customer_id,customer_name:p.customer_name,email:p.email,payment_id:p.id,payment_reference:p.payment_reference,related_tracking_number:p.related_tracking_number,reward_type:p.reward_type,status,issued_amount:p.amount,remaining_balance:Number((p.amount-spent).toFixed(2)),last_four:String(1000+i*37).slice(-4),date_issued:p.date_paid,expiry_date:expiry,date_activated:["ACTIVATED","PARTIALLY_SPENT"].includes(status)?datePlus(p.date_paid,2):"",date_shipped:p.reward_type==="Physical"?datePlus(p.date_paid,2):"",reissue_reason:status==="REISSUED"?"Demo virtual-to-physical conversion; no additional payment":"",provider:"Demo Visa Rewards",sample:true,demo_version:demoVersion};
  });
  const report_runs:Row[]=Array.from({length:12},(_,i)=>({id:`demo-report-run-${i+1}`,report_name:["All Status Rebate Report","Referrer Report","Payment Reconciliation","Fraud Review Summary"][i%4],requested_by:users[7+i%2].name,status:i===11?"FAILED":"COMPLETED",date_created:`2026-10-${String(10+i).padStart(2,"0")}`,start_date:"2026-01-01",end_date:"2026-09-30",rows_exported:i===11?0:[48,24,68,18][i%4],format:"CSV",note:i===11?"Demo export interrupted; rerun required":"Illustrative export history; no downloadable file is attached.",sample:true,demo_version:demoVersion}));
  return {customers,users,rebates,referrals,payments,rewards,fraud,report_runs,codes:[{id:"demo-code-fall",rebate_code:"AxiaFall2026",rebate_amount:1000,active:true},{id:"demo-code-storage",rebate_code:"AxiaStorage2026",rebate_amount:1500,active:true},{id:"demo-code-legacy",rebate_code:"AxiaLoyalty2025",rebate_amount:750,active:false}],campaigns:[{id:"demo-campaign-bright",campaign_name:"Axia Bright Connections 2026",amount:1000,active:true},{id:"demo-campaign-neighbor",campaign_name:"Axia Neighbor Rewards 2025",amount:1000,active:false}]};
}
