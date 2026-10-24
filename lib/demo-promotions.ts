import {defaultPromotionPolicy} from "./promotion-policy";
import type {Row} from "./program";

/** Stable, additive fixtures. Each browser can edit these without reseeding over its changes. */
export function demoPromotions(today:string){
  const base=defaultPromotionPolicy();
  const codes:Row[]=[
    {id:"promo-flex",rebate_code:"AXIA-FLEX-2026",title:"Flexible solar offer",rebate_amount:750,active:true,start_date:"2025-01-01",end_date:"2027-12-31",policy_revision:1,policy:{...base,submission_window_days:180}},
    {id:"promo-plus",rebate_code:"AXIA-PLUS-2026",title:"Larger systems in CA & AZ",rebate_amount:1500,active:true,start_date:"2025-01-01",end_date:"2027-12-31",policy_revision:1,policy:{...base,submission_window_days:60,min_system_size_kw:6,eligible_states:["CA","AZ"],allowed_financiers:["Cash","Solar loan"]}},
    {id:"promo-storage",rebate_code:"AXIA-STORAGE-2026",title:"Premium solar • manual approval",rebate_amount:2000,active:true,start_date:"2025-01-01",end_date:"2027-12-31",policy_revision:1,policy:{...base,auto_approve:false,submission_window_days:30,min_system_size_kw:8,eligible_states:["CA","NY"],allowed_financiers:["Cash","Solar loan"],late_submission_action:"DECLINE"}},
  ];
  const before=(days:number)=>new Date(Date.parse(today)-days*86400000).toISOString().slice(0,10);
  const cases=[
    [0,"Morgan","Flexible offer passes",5,"TX",45,"Cash"],
    [1,"Jordan","Same size, stricter promotion",5,"TX",45,"Cash"],
    [1,"Avery","Plus offer passes",8,"CA",20,"Solar loan"],
    [1,"Riley","Past the 60-day deadline",8,"AZ",75,"Cash"],
    [2,"Taylor","Qualifies, manual approval",10,"CA",20,"Cash"],
    [2,"Casey","Past the 30-day deadline",10,"NY",45,"Cash"],
  ] as const;
  const rebates:Row[]=cases.map(([ci,first,note,size,state,gap,financier],i)=>{
    const code=codes[ci],serial=`PROMO-DEMO-${i+1}`;
    return {id:`promotion-demo-${i+1}`,tracking_number:String(7200000001+i),status:"PENDING",first_name:first,last_name:"Promotion Demo",email:`promotion-demo-${i+1}@example.com`,phone:"(555) 010-7200",address1:`${7200+i} Promotion Way`,address2:"",city:state==="CA"?"San Diego":state==="AZ"?"Phoenix":state==="NY"?"Albany":"Austin",state,zip:state==="CA"?"92101":state==="AZ"?"85001":state==="NY"?"12207":"78701",rebate_code:code.rebate_code,rebate_amount:code.rebate_amount,date_of_sale:before(gap+30),date_submitted:today,pto_date:before(gap),installation_complete_date:before(gap+2),proof_of_purchase:before(gap+30),crm_install_status:"INSTALLED",crm_source:"demo-simulated",crm_synced:today,module_serial:serial,system_size_kw:size,financier,certified_by:`${first} Promotion Demo`,sales_rep_name:"Jordan Lee",dealer_name:"Axia By QCells",reward_type:"Virtual",risk_level:"LOW",payment_hold:false,sample:true,promotion_demo:true,demo_note:note};
  });
  return {codes,rebates,serials:rebates.map(r=>({id:`serial-${r.module_serial}`,serial:r.module_serial,file_date:today}))};
}
