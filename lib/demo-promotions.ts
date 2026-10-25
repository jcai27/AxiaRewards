import {defaultPromotionPolicy,rebateAmountFor} from "./promotion-policy";
import {ENFIN_SOURCE} from "./enfin";
import type {Row} from "./program";

/** Stable, additive fixtures. Each browser can edit these without reseeding over its changes. */
export function demoPromotions(today:string){
  const base=defaultPromotionPolicy();
  const codes:Row[]=[
    {id:"promo-flex",rebate_code:"AXIA-FLEX-2026",title:"Flexible solar offer",rebate_amount:750,active:true,start_date:"2025-01-01",end_date:"2027-12-31",policy_revision:1,policy:{...base,submission_window_days:180}},
    {id:"promo-plus",rebate_code:"AXIA-PLUS-2026",title:"Larger systems in CA & AZ",rebate_amount:1500,active:true,start_date:"2025-01-01",end_date:"2027-12-31",policy_revision:1,policy:{...base,submission_window_days:60,min_system_size_kw:6,eligible_states:["CA","AZ"],allowed_financiers:["Cash","Solar loan"]}},
    {id:"promo-storage",rebate_code:"AXIA-STORAGE-2026",title:"Premium solar • manual approval",rebate_amount:2000,active:true,start_date:"2025-01-01",end_date:"2027-12-31",policy_revision:1,policy:{...base,auto_approve:false,submission_window_days:30,min_system_size_kw:8,eligible_states:["CA","NY"],allowed_financiers:["Cash","Solar loan"],late_submission_action:"DECLINE"}},
    {id:"promo-enfin",rebate_code:"AXIA-ENFIN-2026",title:"EnFin only • 6× monthly payment",rebate_amount:1000,active:true,start_date:"2025-01-01",end_date:"2027-12-31",policy_revision:1,policy:{...base,allowed_financiers:["EnFin"],amount_mode:"PAYMENT_MULTIPLE",payment_multiplier:6,min_rebate_amount:500,max_rebate_amount:2500}},
  ];
  const before=(days:number)=>new Date(Date.parse(today)-days*86400000).toISOString().slice(0,10);
  const cases=[
    [0,"Morgan","Flexible offer passes",5,"TX",45,"Cash"],
    [1,"Jordan","Same size, stricter promotion",5,"TX",45,"Cash"],
    [1,"Avery","Plus offer passes",8,"CA",20,"Solar loan"],
    [1,"Riley","Past the 60-day deadline",8,"AZ",75,"Cash"],
    [2,"Taylor","Qualifies, manual approval",10,"CA",20,"Cash"],
    [2,"Casey","Past the 30-day deadline",10,"NY",45,"Cash"],
    [3,"Quinn","EnFin financing passes",7,"TX",20,"EnFin"],
    [3,"Parker","Cash is not allowed on the EnFin offer",7,"TX",20,"Cash"],
    [0,"Drew","Original claim, already approved",6,"TX",40,"Cash"],
    [0,"Drew","Same address and code as an approved claim",6,"TX",25,"Cash"],
    [3,"Drew","Same address, different code",6,"TX",20,"EnFin"],
    [3,"Rowan","6× payment is over the maximum, so it is capped",7,"TX",20,"EnFin"],
  ] as const;
  const rebates:Row[]=cases.map(([ci,first,note,size,state,gap,financier],i)=>{
    const code=codes[ci],serial=`PROMO-DEMO-${i+1}`;
    return {id:`promotion-demo-${i+1}`,tracking_number:String(7200000001+i),status:"PENDING",first_name:first,last_name:"Promotion Demo",email:`promotion-demo-${i+1}@example.com`,phone:"(555) 010-7200",address1:`${7200+i} Promotion Way`,address2:"",city:state==="CA"?"San Diego":state==="AZ"?"Phoenix":state==="NY"?"Albany":"Austin",state,zip:state==="CA"?"92101":state==="AZ"?"85001":state==="NY"?"12207":"78701",rebate_code:code.rebate_code,rebate_amount:code.rebate_amount,date_of_sale:before(gap+30),date_submitted:today,pto_date:before(gap),installation_complete_date:before(gap+2),proof_of_purchase:before(gap+30),crm_install_status:"INSTALLED",crm_source:"demo-simulated",crm_synced:today,module_serial:serial,system_size_kw:size,financier,certified_by:`${first} Promotion Demo`,sales_rep_name:"Jordan Lee",dealer_name:"Axia By QCells",reward_type:"Virtual",risk_level:"LOW",payment_hold:false,sample:true,promotion_demo:true,demo_note:note};
  });
  // The last three share one household, written two ways, to show duplicate screening.
  Object.assign(rebates[8],{status:"APPROVED",date_approved_declined:before(30),approved_declined_by:"Promotion Demo Reviewer",address1:"7300 North Duplicate Lane"});
  Object.assign(rebates[9],{address1:"7300 N. Duplicate Ln"});
  Object.assign(rebates[10],{address1:"7300 N Duplicate Lane"});
  // Monthly payments as EnFin would report them: $285.50 pays 6× = $1,713; $462.25 would pay $2,773.50 and is capped at $2,500.
  const payments:Record<number,number>={6:285.5,10:310,11:462.25};
  for(const r of rebates){
    const payment=payments[rebates.indexOf(r)];
    if(payment)Object.assign(r,{enfin_monthly_payment:payment,enfin_source:ENFIN_SOURCE,enfin_synced:today});
    const code=codes.find(c=>c.rebate_code===r.rebate_code)!,due=rebateAmountFor(code,r);
    Object.assign(r,{rebate_amount:due.amount,rebate_calculated_amount:due.calculated??due.amount,rebate_capped:due.capped||""});
  }
  return {codes,rebates,serials:rebates.map(r=>({id:`serial-${r.module_serial}`,serial:r.module_serial,file_date:today}))};
}
