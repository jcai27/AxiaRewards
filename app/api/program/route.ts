import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "../../chatgpt-auth";
import { seedData, declineReasons, parseCSV, type Row } from "../../../lib/program";
import { demoScenarios, demoVersion } from "../../../lib/demo-scenarios";
import { decisionContext, evaluate, AUTO_APPROVER, AUTO_DUPLICATE_DECLINER, ENGINE_VERSION, SUBMISSION_WINDOW_DAYS, type Evaluation } from "../../../lib/decision";
import { invoiceable, invoiceLine, invoiceTotal, invoiceTransitions, INVOICE_FROM, INVOICE_TO, PAYMENT_TERMS_DAYS } from "../../../lib/invoice";
import {policyFor,promotionSchema,rebateAmountFor} from "../../../lib/promotion-policy";
import {demoPromotions} from "../../../lib/demo-promotions";
import {ENFIN_SOURCE,simulatedEnfinPayment} from "../../../lib/enfin";
import {issueCard,publicCard} from "../../../lib/reward-cards";
import {demoSupport} from "../../../lib/demo-support";

export const dynamic = "force-dynamic";
const db = () => { if(!env.DB) throw new Error("Program database is not configured.");return env.DB; };
const today = () => new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const ok=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const fail=(message:string,status=400)=>Object.assign(new Error(message),{status});
async function rows(kind:string):Promise<Row[]> {const r=await db().prepare("SELECT data FROM records WHERE kind = ?").bind(kind).all<{data:string}>();return r.results.map(x=>JSON.parse(x.data));}
async function row(id:string,kind:string):Promise<Row|undefined>{const r=await db().prepare("SELECT data FROM records WHERE id=? AND kind=?").bind(id,kind).first<{data:string}>();return r?JSON.parse(r.data):undefined;}
function statement(kind:string,r:Row,replace=true){return db().prepare(`${replace?"INSERT":"INSERT OR IGNORE"} INTO records (id,kind,data,tracking_number,purchase_key) VALUES (?,?,?,?,?)${replace?" ON CONFLICT(id) DO UPDATE SET data=excluded.data,tracking_number=excluded.tracking_number,purchase_key=excluded.purchase_key WHERE records.kind=excluded.kind":""}`).bind(r.id,kind,JSON.stringify(r),["rebates","referrals"].includes(kind)?r.tracking_number||null:null,kind==="rebates"?`${r.email.toLowerCase()}|${r.rebate_code}|${r.date_of_sale}`:null);}
async function log(actor:string,action:string){await db().prepare("INSERT INTO audit (id,actor,action,created) VALUES (?,?,?,?)").bind(crypto.randomUUID(),actor,action,new Date().toISOString()).run();}
async function seed(){
  if(!await db().prepare("SELECT value FROM settings WHERE key='seed_v1'").first()){
    const data=seedData();const statements=Object.entries(data).flatMap(([kind,list])=>list.map(r=>statement(kind,r,false)));
    for(let i=0;i<statements.length;i+=80)await db().batch(statements.slice(i,i+80));
    await db().prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('seed_v1','complete')").run();
  }
  if(!await db().prepare("SELECT value FROM settings WHERE key=?").bind(demoVersion).first()){
    const data=demoScenarios();const statements=Object.entries(data).flatMap(([kind,list])=>list.map(r=>statement(kind,r,false)));
    for(let i=0;i<statements.length;i+=80)await db().batch(statements.slice(i,i+80));
    const summary=JSON.stringify({version:demoVersion,counts:Object.fromEntries(Object.entries(data).map(([kind,list])=>[kind,list.length]))});
    await db().prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").bind(demoVersion,summary).run();
  }
  await repairSeedForDecisions();
  await addSowEvidence();
  if(!await setting("support_demo_v1")){
    await db().batch(demoSupport(today()).map(t=>statement("messages",t,false)));
    await putSetting("support_demo_v1","complete");
  }
  if(!await setting("promotion_policies_demo_v3")){
    // Adds new fixtures, and refreshes earlier ones nobody has edited or decided yet.
    const fixtures=demoPromotions(today());
    const existing=new Map([...await rows("codes"),...await rows("rebates")].map(r=>[r.id,r]));
    const untouched=(kind:string,r:Row)=>{const old=existing.get(r.id);return !!old&&(kind==="codes"?Number(old.policy_revision)===1&&!old.policy_updated_by:kind==="rebates"&&!old.decision&&old.status===r.status);};
    const writes=Object.entries(fixtures).flatMap(([kind,list])=>list.map(r=>statement(kind,r,untouched(kind,r))));
    await db().batch(writes);
    await db().prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('promotion_policies_demo_v3','complete')").run();
  }
}
const withoutInvoice=(r:Row)=>{const next={...r};delete next.program_invoice_id;delete next.program_invoice_number;return next;};
const addDays=(d:string,n:number)=>new Date(Date.parse(d)+n*86400000).toISOString().slice(0,10);
// The original synthetic pending rebates had incoherent dates and amounts, so every one failed the
// decision engine. Rewrite them once into coherent claims with a deliberate mix of exceptions.
// Only untouched seed records still PENDING are updated (compare-and-swap on the stored JSON).
async function repairSeedForDecisions(){
  if(await db().prepare("SELECT value FROM settings WHERE key='decision_demo_v1'").first())return;
  const [all,codeRows]=await Promise.all([rows("rebates"),rows("codes")]);
  const codes=new Map(codeRows.map(c=>[c.rebate_code,c])),byId=new Map(all.map(r=>[r.id,r]));
  const updates=all.filter(r=>/^rebate-\d+$/.test(r.id)&&r.status==="PENDING").map(r=>{
    const i=Number(r.id.slice(7))-1,old=JSON.stringify(r),next:Row={...r,financier:"Cash"};
    next.pto_date=addDays(r.date_submitted,-(3+i%20));next.date_of_sale=addDays(next.pto_date,-(30+i%45));
    next.rebate_amount=Number(codes.get(r.rebate_code)?.rebate_amount??r.rebate_amount);
    if(i%13===0)next.rebate_amount+=250;
    if(i%17===0){next.pto_date=addDays(r.date_submitted,-(SUBMISSION_WINDOW_DAYS+21));next.date_of_sale=addDays(next.pto_date,-40);}
    if(i%29===0)next.financier="Personal check";
    if(i%31===0)next.date_of_sale=addDays(r.date_submitted,9);
    if(i%37===0)next.rebate_code="AxiaWinter2025";
    const twin=i%43===0?byId.get(`rebate-${701+i%169}`):undefined;
    if(twin)Object.assign(next,{address1:twin.address1,city:twin.city,state:twin.state,zip:twin.zip,rebate_code:twin.rebate_code,rebate_amount:Number(codes.get(twin.rebate_code)?.rebate_amount??next.rebate_amount)});
    return db().prepare("UPDATE records SET data=? WHERE id=? AND kind='rebates' AND data=?").bind(JSON.stringify(next),r.id,old);
  });
  for(let i=0;i<updates.length;i+=80)await db().batch(updates.slice(i,i+80));
  await db().prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('decision_demo_v1',?)").bind(String(updates.length)).run();
}
// Campaign windows for the demo codes (the SOW's rebate code template carries start and end dates).
const CAMPAIGN_DATES:Record<string,[string,string]>={"6-moSpring":["2025-12-01","2026-09-30"],"AxiaSummer2026":["2025-12-01","2026-12-31"],"AxiaFall2026":["2026-01-01","2026-12-31"],"AxiaStorage2026":["2026-01-01","2026-12-31"],"AxiaLoyalty2025":["2025-01-01","2025-12-31"]};
const serialFor=(id:string)=>{let h=0;for(const ch of id)h=(h*31+ch.charCodeAt(0))>>>0;return `AX-Q440-${String(100000+h%900000)}`;};
const serialRecord=(serial:string,date:string)=>({id:`serial-${serial}`,serial,file_date:date});
// One-time: give every existing rebate the SOW evidence (proof of purchase, Creatio status,
// module serial and serial file entry), with a deliberate mix of gaps on synthetic pending claims.
async function addSowEvidence(){
  if(await setting("sow_evidence_v1"))return;
  const [all,codes]=await Promise.all([rows("rebates"),rows("codes")]);
  const writes=codes.filter(code=>CAMPAIGN_DATES[code.rebate_code]&&!code.start_date).map(code=>{const [start_date,end_date]=CAMPAIGN_DATES[code.rebate_code];return db().prepare("UPDATE records SET data=? WHERE id=? AND kind='codes' AND data=?").bind(JSON.stringify({...code,start_date,end_date}),code.id,JSON.stringify(code));});
  const serials=new Map<string,string>();
  for(const r of all){
    const seedIndex=/^rebate-\d+$/.test(r.id)&&r.status==="PENDING"?Number(r.id.slice(7))-1:-1,gap=(n:number)=>seedIndex>=0&&seedIndex%n===0;
    const next:Row={...r};
    next.module_serial=r.module_serial||serialFor(r.id);
    next.proof_of_purchase=r.proof_of_purchase??(gap(23)?null:r.date_of_sale||null);
    next.crm_install_status=r.crm_install_status||(r.status==="REBATE_REGISTRATION"||gap(19)?"PENDING":"INSTALLED");
    next.crm_synced=r.crm_synced||r.installation_complete_date||r.date_submitted;
    if(gap(53)){const window=CAMPAIGN_DATES[r.rebate_code];if(window){next.date_of_sale=addDays(window[0],-20);next.pto_date=next.pto_date&&next.pto_date<next.date_of_sale?addDays(next.date_of_sale,30):next.pto_date;}}
    if(!gap(47))serials.set(next.module_serial,next.date_submitted||today());
    writes.push(db().prepare("UPDATE records SET data=? WHERE id=? AND kind='rebates' AND data=?").bind(JSON.stringify(next),r.id,JSON.stringify(r)));
  }
  for(const [serial,date] of serials)writes.push(statement("serials",serialRecord(serial,date),false));
  for(let i=0;i<writes.length;i+=80)await db().batch(writes.slice(i,i+80));
  await putSetting("sow_evidence_v1",String(all.length));
}
async function engine(){const [rebates,codes,customers,serials]=await Promise.all([rows("rebates"),rows("codes"),rows("customers"),rows("serials")]);const ctx=decisionContext({rebates,codes,customers,serial_file:serials.map(s=>s.serial)},today());return {rebates,run:(r:Row)=>evaluate(r,ctx)};}
const setting=async(key:string)=>(await db().prepare("SELECT value FROM settings WHERE key=?").bind(key).first<{value:string}>())?.value;
const putSetting=(key:string,value:string)=>db().prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,value).run();
const automationEnabled=async()=>(await setting("auto_approve"))!=="off";
/** Approve every pending rebate (or just `ids`) that meets all thresholds. Never declines. */
async function autoApprove(ids?:string[]){
  const {rebates,run}=await engine();
  const pending=rebates.filter(r=>r.status==="PENDING"&&(!ids||ids.includes(r.id)));
  const tally={approved:0,review:0,decline:0};
  const updates=pending.flatMap(r=>{
    const ev=run(r);
    if(ev.recommendation!=="APPROVE"||r.payment_hold||!ev.promotion?.settings.auto_approve){tally[ev.recommendation==="DECLINE"?"decline":"review"]++;return [];}
    const next={...r,status:"APPROVED",date_approved_declined:today(),approved_declined_by:AUTO_APPROVER,decline_reason:"",decision:decisionRecord(ev,"auto","APPROVED",AUTO_APPROVER)};
    return [db().prepare("UPDATE records SET data=? WHERE id=? AND kind='rebates' AND data=?").bind(JSON.stringify(next),r.id,JSON.stringify(r))];
  });
  for(let i=0;i<updates.length;i+=80)tally.approved+=(await db().batch(updates.slice(i,i+80))).reduce((n,x)=>n+(x.meta.changes||0),0);
  if(tally.approved)await issueCards(pending.map(r=>r.id));
  return tally;
}
/** Card status for public tracking. Never includes the claim link, which only goes to the customer's email. */
async function cardSummary(rebateId:string){
  const card=rebateId?await row(`reward-${rebateId}`,"rewards"):undefined;
  return card?{card_status:card.status,card_type:card.reward_type,card_issued:card.date_issued}:{};
}
/** Issue a simulated card, and its delivery email, for each of `ids` that is now approved. Safe to repeat. */
async function issueCards(ids:string[]){
  if(!ids.length)return 0;
  const approved=(await Promise.all(ids.map(id=>row(id,"rebates")))).filter((r):r is Row=>!!r&&r.status==="APPROVED");
  const writes=approved.flatMap(r=>{const {reward,email}=issueCard(r,today());return [statement("rewards",reward,false),statement("outbox",email,false)];});
  for(let i=0;i<writes.length;i+=80)await db().batch(writes.slice(i,i+80));
  return approved.length;
}
/** Decline pending rebates (or just `ids`) that duplicate an approved claim at the same address and code, when their promotion allows it. */
async function autoDeclineDuplicates(ids?:string[]){
  const {rebates,run}=await engine();
  const updates=rebates.filter(r=>r.status==="PENDING"&&(!ids||ids.includes(r.id))).flatMap(r=>{
    const ev=run(r),dup=ev.checks.find(c=>c.id==="duplicate");
    if(dup?.status!=="fail"||!ev.promotion?.settings.auto_decline_duplicates)return [];
    const next={...r,status:"DECLINED",date_approved_declined:today(),approved_declined_by:AUTO_DUPLICATE_DECLINER,decline_reason:dup.declineReason||"Duplicate rebate submitted",decision:decisionRecord(ev,"auto","DECLINED",AUTO_DUPLICATE_DECLINER)};
    return [db().prepare("UPDATE records SET data=? WHERE id=? AND kind='rebates' AND data=?").bind(JSON.stringify(next),r.id,JSON.stringify(r))];
  });
  let declined=0;for(let i=0;i<updates.length;i+=80)declined+=(await db().batch(updates.slice(i,i+80))).reduce((n,x)=>n+(x.meta.changes||0),0);
  return declined;
}
const decisionRecord=(ev:Evaluation,source:"auto"|"engine"|"manual",final:string,actor:string)=>({
  engine_version:ev.version,recommendation:ev.recommendation,source,decided_by:actor,decided_at:new Date().toISOString(),
  agreed:ev.recommendation==="REVIEW"?null:(ev.recommendation==="APPROVE")===(final==="APPROVED"),
  failed:ev.checks.filter(c=>c.status==="fail").map(c=>c.id),warned:ev.checks.filter(c=>c.status==="warn").map(c=>c.id),
  promotion_policy:ev.promotion,
  checks:ev.checks,
});
async function admin(write=false){
  const user=await getChatGPTUser();if(!user)throw fail("Sign in to access the administrator module.",401);
  // Initial enrollment is restricted by the owner-private Sites access boundary.
  await db().prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('owner_id',?)").bind(user.userId).run();
  const owner=await db().prepare("SELECT value FROM settings WHERE key='owner_id'").first<{value:string}>();
  if(owner?.value===user.userId)return {name:user.fullName||user.email,email:user.email,role:"Client Ace High",id:user.userId,owner:true};
  const membership=(await rows("users")).find(u=>!u.sample&&u.user_id===user.userId&&u.status==="Active"&&u.date_added);
  if(!membership)throw fail("Your account does not have administrator access.",403);
  if(write&&membership.role!=="Client Ace High")throw fail("Your view-only role cannot make changes.",403);
  return membership;
}
const email=z.string().trim().email().max(200);
const text=z.string().trim().min(1).max(200);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,"Use a valid date.");
const rebateSchema=z.object({first_name:text,last_name:text,email,phone:z.string().trim().regex(/^[+()\d\s.-]{10,25}$/,"Enter a valid phone number."),address1:text,address2:z.string().trim().max(200).optional().default(""),city:text,state:z.string().regex(/^[A-Z]{2}$/),zip:z.string().regex(/^\d{5}(-\d{4})?$/),rebate_code:text,dealer_name:text,date_of_sale:date,pto_date:date.optional(),sales_rep_name:text,certified_by:text,reward_type:z.enum(["Virtual","Physical"]),financier:text,certified:z.literal(true),preinstallation:z.boolean()});
async function uniqueTracking(){for(let i=0;i<10;i++){const n=new Uint32Array(1);crypto.getRandomValues(n);const tracking=String(4000000000+n[0]%5000000000);const exists=await db().prepare("SELECT id FROM records WHERE json_extract(data,'$.tracking_number')=?").bind(tracking).first();if(!exists)return tracking;}throw fail("Please retry your submission.",503);}
async function lookup(tracking:string){if(!/^\d{10}$/.test(tracking))throw fail("Enter a 10-digit tracking number.");const result=await db().prepare("SELECT kind,data FROM records WHERE kind IN ('rebates','referrals') AND (json_extract(data,'$.tracking_number')=? OR json_extract(data,'$.referee_tracking_number')=?) LIMIT 1").bind(tracking,tracking).first<{kind:string,data:string}>();if(!result)throw fail("No request found. Check your tracking number or contact support.",404);return {kind:result.kind,data:JSON.parse(result.data) as Row};}
async function queueInvite(user:Row,origin:string){
  const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);const token=Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,"0")).join("");
  const invitation={id:`invite-${user.id}`,user_id:user.id,hash,expires:Date.now()+7*86400000};
  const link=`${origin}/accept-invite?token=${token}`;
  const message={id:crypto.randomUUID(),to:user.email,subject:"You're invited to Axia Rewards",text:`Hi ${user.name}, accept your administrator invitation within 7 days: ${link}`,status:"Queued",created:new Date().toISOString()};
  await db().batch([statement("invitations",invitation),statement("outbox",message)]);
  const config=env as unknown as Record<string,string>;
  if(config.EMAIL_WEBHOOK_URL){try{const sent=await fetch(config.EMAIL_WEBHOOK_URL,{method:"POST",headers:{"Content-Type":"application/json",...(config.EMAIL_WEBHOOK_TOKEN?{Authorization:`Bearer ${config.EMAIL_WEBHOOK_TOKEN}`}:{})},body:JSON.stringify(message)});if(sent.ok){message.status="Sent";await statement("outbox",message).run();}}catch{/* Remains queued for retry. */}}
  return {delivery:message.status,invitation_url:link};
}
export async function GET(request:Request){try{
  await seed();const url=new URL(request.url);
  if(url.searchParams.get("view")==="public") {const config=env as unknown as Record<string,string>;return ok({cardholder_url:config.CARDHOLDER_URL||null,support_phone:config.SUPPORT_PHONE||null,cardholder_phone:config.CARDHOLDER_PHONE||null});}
  const currentUser=await admin();const [rebates,referrals,users,codes,campaigns,customers,payments,rewards,fraud,report_runs,invoices,support,outbox]=await Promise.all([rows("rebates"),rows("referrals"),rows("users"),rows("codes"),rows("campaigns"),rows("customers"),rows("payments"),rows("rewards"),rows("fraud"),rows("report_runs"),rows("invoices"),rows("messages"),rows("outbox")]);
  const lastRun=await setting("engine_last_run");
  const automation={enabled:await automationEnabled(),engine_version:ENGINE_VERSION,last_run:lastRun?JSON.parse(lastRun):null};
  const serial_file=(await rows("serials")).map(s=>s.serial);
  // Only reward-card emails: invitation emails in the outbox carry sign-in links.
  const card_emails=outbox.filter(m=>m.type==="reward_card");
  return ok({rebates,referrals,users,codes,campaigns,customers,payments,rewards,fraud,report_runs,invoices,support,card_emails,serial_file,automation,currentUser,today:today()});
}catch(e){return handle(e);}}
export async function POST(request:Request){try{
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)throw fail("Request origin is not allowed.",403);
  if(Number(request.headers.get("content-length"))>2_000_000)throw fail("File is too large. Use a file smaller than 2 MB.",413);
  const raw=await request.text();if(raw.length>2_000_000)throw fail("Request is too large.",413);
  const body=JSON.parse(raw);await seed();const action=body.action;
  if(action==="submit-rebate"){
    const input=rebateSchema.parse(body.data);
    if(input.date_of_sale>today())throw fail("Date of sale cannot be in the future.");
    if(!input.preinstallation&&(!input.pto_date||input.pto_date>today()||input.pto_date<input.date_of_sale))throw fail("Enter a valid PTO date on or after your date of sale.");
    // Customers type the code, so match it without regard to case and store the canonical spelling.
    const code=(await rows("codes")).find(c=>c.active&&c.rebate_code.toLowerCase()===input.rebate_code.toLowerCase());if(!code)throw fail(`We don't recognize the rebate code "${input.rebate_code}". Check the code on your contract or contact your sales representative.`);input.rebate_code=code.rebate_code;
    const duplicate=await db().prepare("SELECT data FROM records WHERE kind='rebates' AND lower(json_extract(data,'$.email'))=? AND json_extract(data,'$.rebate_code')=? AND json_extract(data,'$.date_of_sale')=?").bind(input.email.toLowerCase(),input.rebate_code,input.date_of_sale).first<{data:string}>();
    if(duplicate)throw fail("A request already exists for this purchase. Use Track Payment or contact support.",409);
    const enfin=input.financier==="EnFin"?{enfin_monthly_payment:simulatedEnfinPayment(input),enfin_source:ENFIN_SOURCE,enfin_synced:today()}:{};
    const due=rebateAmountFor(code,enfin);
    const r={...input,...enfin,id:crypto.randomUUID(),tracking_number:await uniqueTracking(),status:input.preinstallation?"REBATE_REGISTRATION":"PENDING",rebate_amount:due.amount,rebate_calculated_amount:due.calculated??due.amount,rebate_capped:due.capped||"",date_submitted:today(),module_serial:"",proof_of_purchase:input.date_of_sale,crm_install_status:input.preinstallation?"PENDING":"INSTALLED",crm_synced:today(),crm_source:"demo-simulated"};r.module_serial=serialFor(r.id);
    const saved=await statement("rebates",r,false).run();if(saved.meta.changes)await statement("serials",serialRecord(r.module_serial,today()),false).run();if(!saved.meta.changes)throw fail("A request for this purchase was just submitted. Please track your existing request.",409);await log(input.email,`Submitted rebate ${r.id}`);
    const declined=r.status==="PENDING"&&await autoDeclineDuplicates([r.id])>0;
    const approved=!declined&&r.status==="PENDING"&&await automationEnabled()&&(await autoApprove([r.id])).approved>0;
    return ok({tracking_number:r.tracking_number,status:declined?"DECLINED":approved?"APPROVED":r.status},201);
  }
  if(action==="track"){
    const found=await lookup(String(body.tracking_number));const r=found.data;
    return ok({kind:found.kind,tracking_number:body.tracking_number,status:r.status,amount:found.kind==="rebates"?r.rebate_amount:body.tracking_number===r.referee_tracking_number?r.referee_amount:r.amount,date_submitted:r.date_submitted,date_approved_declined:r.date_approved_declined,installation_complete_date:r.installation_complete_date,date_funded:r.date_funded||r.funded_date,date_shipped:r.date_shipped||r.shipped_date,reward_type:r.reward_type,decline_reason:r.decline_reason,...await cardSummary(found.kind==="rebates"?r.id:"")});
  }
  if(action==="view-card"){
    // A claim link from the card email, or the tracking number with the email it was registered under.
    let card:Row|undefined;
    if(body.claim){const claim=z.string().regex(/^[a-z0-9]{8,40}$/).parse(body.claim);card=(await rows("rewards")).find(c=>c.claim_token===claim);}
    else{const found=await lookup(String(body.tracking_number));if(found.kind==="rebates"&&email.parse(body.email).toLowerCase()===String(found.data.email).toLowerCase())card=await row(`reward-${found.data.id}`,"rewards");}
    if(!card)throw fail("We couldn't find a card for those details. Cards are issued when a rebate is approved.",404);
    if(body.activate&&card.status==="DELIVERED"){const old=JSON.stringify(card);card={...card,status:"ACTIVATED",date_activated:today()};await db().prepare("UPDATE records SET data=? WHERE id=? AND kind='rewards' AND data=?").bind(JSON.stringify(card),card.id,old).run();}
    return ok({card:publicCard(card),...(body.claim?{claim:card.claim_token}:{})});
  }
  if(action==="finalize"){
    const found=await lookup(String(body.tracking_number));const r=found.data;
    if(found.kind!=="rebates"||r.status!=="REBATE_REGISTRATION")throw fail("This request is not awaiting installation. Track your payment for the latest status.");
    if(email.parse(body.email).toLowerCase()!==r.email.toLowerCase())throw fail("The email does not match this registration.",403);
    const pto=date.parse(body.pto_date);if(pto>today()||pto<r.date_of_sale)throw fail("Enter a valid PTO date on or after your date of sale.");
    const old=JSON.stringify(r);r.pto_date=pto;r.status="PENDING";r.installation_complete_date=today();if(r.crm_source==="demo-simulated"){r.crm_install_status="INSTALLED";r.crm_synced=today();}const updated=await db().prepare("UPDATE records SET data=? WHERE id=? AND kind='rebates' AND data=?").bind(JSON.stringify(r),r.id,old).run();if(!updated.meta.changes)throw fail("This request changed while you were editing. Check its latest status.",409);await log(r.email,`Finalized rebate ${r.id}`);
    const declined=await autoDeclineDuplicates([r.id])>0;
    const approved=!declined&&await automationEnabled()&&(await autoApprove([r.id])).approved>0;
    return ok({tracking_number:r.tracking_number,status:declined?"DECLINED":approved?"APPROVED":r.status});
  }
  if(action==="contact"){
    const data=z.object({name:text,email,subject:z.enum(["Rebate question","Referral question","Tracking number assistance","Visa card support","Other"]),tracking_number:z.string().trim().regex(/^(\d{10})?$/,"Enter a 10-digit tracking number.").optional().default(""),message:z.string().trim().min(10).max(5000)}).parse(body.data);
    const reference=crypto.randomUUID().slice(0,8).toUpperCase();await statement("messages",{...data,id:crypto.randomUUID(),reference,date_submitted:today(),status:"Received",thread:[]},false).run();return ok({reference});
  }
  if(action==="accept-invite"){
    const user=await getChatGPTUser();if(!user)throw fail("Sign in with the invited email to accept this invitation.",401);
    const token=z.string().regex(/^[a-f0-9]{64}$/).parse(body.token);const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,"0")).join("");
    const invite=(await rows("invitations")).find(i=>i.hash===hash&&i.expires>Date.now());if(!invite)throw fail("This invitation has expired or already been used.");
    const membership=await row(invite.user_id,"users");if(!membership||membership.sample||membership.status!=="Active"||membership.email.toLowerCase()!==user.email.toLowerCase())throw fail("Sign in using the email address on the invitation.",403);
    membership.user_id=user.userId;membership.date_added=today();await db().batch([statement("users",membership),db().prepare("DELETE FROM records WHERE id=? AND kind='invitations'").bind(invite.id)]);return ok({accepted:true});
  }
  const actor=await admin(true);
  if(action==="support-update"){
    const input=z.object({id:z.string(),status:z.enum(["Received","In progress","Resolved"]),reply:z.string().trim().max(5000).optional().default("")}).parse(body);
    const ticket=await row(input.id,"messages");if(!ticket)throw fail("Support request not found.",404);
    const old=JSON.stringify(ticket),thread=[...(ticket.thread||[])];
    if(input.reply){
      thread.push({from:"Support",by:actor.name,date:today(),text:input.reply});
      await statement("outbox",{id:crypto.randomUUID(),type:"support_reply",to:ticket.email,subject:`Re: ${ticket.subject} [${ticket.reference}]`,text:input.reply,status:"Sent (simulated)",created:new Date().toISOString()},false).run();
    }
    const next={...ticket,status:input.status,thread,updated_by:actor.name,date_updated:today()};
    const saved=await db().prepare("UPDATE records SET data=? WHERE id=? AND kind='messages' AND data=?").bind(JSON.stringify(next),ticket.id,old).run();
    if(!saved.meta.changes)throw fail("This request changed while you were working. Refresh and try again.",409);
    await log(actor.email,`Support ${ticket.reference}: ${input.status}${input.reply?" with reply":""}`);return ok({ticket:next});
  }
  if(action==="send-card"){
    // Resends the card email, or issues the card for an approved rebate that has none yet.
    const found=await lookup(String(body.tracking_number));if(found.kind!=="rebates")throw fail("Cards are sent for rebates only.");
    const r=found.data,emailRow=await row(`reward-email-${r.id}`,"outbox");
    if(!emailRow){if(r.status!=="APPROVED")throw fail("A card is issued once the rebate is approved.",409);await issueCards([r.id]);await log(actor.email,`Issued card for ${r.tracking_number}`);return ok({issued:true});}
    const next={...emailRow,sends:(Number(emailRow.sends)||1)+1,last_sent:new Date().toISOString(),status:emailRow.reward_type==="Virtual"?"Delivered (simulated)":emailRow.status};
    await statement("outbox",next).run();await log(actor.email,`Resent card email for ${r.tracking_number}`);return ok({resent:true,sends:next.sends});
  }
  if(action==="save-promotion"){
    const input=promotionSchema.parse(body.data);
    const expected=z.number().int().nonnegative().parse(body.expected_revision);
    const prior=body.id?await row(z.string().parse(body.id),"codes"):undefined;
    if(body.id&&!prior)throw fail("Promotion not found. Refresh the list.",404);
    if(prior&&prior.rebate_code!==input.rebate_code)throw fail("A saved promotion code cannot be renamed. Create a new promotion instead.");
    if((await rows("codes")).some(c=>c.rebate_code.toLowerCase()===input.rebate_code.toLowerCase()&&c.id!==prior?.id))throw fail("This promotion code already exists.",409);
    if((Number(prior?.policy_revision)||0)!==expected)throw fail("This promotion was changed by another administrator. Reload its settings before saving.",409);
    const next={...prior,...input,id:prior?.id||`promotion-code-${input.rebate_code.toLowerCase()}`,policy_revision:expected+1,policy_updated_at:new Date().toISOString(),policy_updated_by:actor.name};
    if(prior){
      const saved=await db().prepare("UPDATE records SET data=? WHERE id=? AND kind='codes' AND data=?").bind(JSON.stringify(next),prior.id,JSON.stringify(prior)).run();
      if(!saved.meta.changes)throw fail("This promotion changed while saving. Reload its settings.",409);
    }else{const saved=await statement("codes",next,false).run();if(!saved.meta.changes)throw fail("This promotion code was just created by another administrator. Refresh the list.",409);}
    await log(actor.email,`Saved promotion ${input.rebate_code} revision ${next.policy_revision}: ${JSON.stringify({before:prior?{...prior,policy:policyFor(prior)}:null,after:next})}`);
    // Payment-based amounts follow the promotion until a claim is decided.
    if(next.policy.amount_mode==="PAYMENT_MULTIPLE"){
      const reprice=(await rows("rebates")).filter(r=>r.rebate_code===next.rebate_code&&["PENDING","REBATE_REGISTRATION"].includes(r.status)).flatMap(r=>{
        const due=rebateAmountFor(next,r);if(Math.abs(due.amount-Number(r.rebate_amount))<0.005&&(due.capped||"")===(r.rebate_capped||""))return [];
        const updated={...r,rebate_amount:due.amount,rebate_calculated_amount:due.calculated??due.amount,rebate_capped:due.capped||""};
        return [db().prepare("UPDATE records SET data=? WHERE id=? AND kind='rebates' AND data=?").bind(JSON.stringify(updated),r.id,JSON.stringify(r))];
      });
      for(let i=0;i<reprice.length;i+=80)await db().batch(reprice.slice(i,i+80));
    }
    return ok({promotion:next},prior?200:201);
  }
  if(action==="review"){
    const ids=z.array(z.string()).min(1).max(100).parse(body.ids);const status=z.enum(["APPROVED","DECLINED"]).parse(body.status);
    if(new Set(ids).size!==ids.length)throw fail("Select distinct requests.");
    const selected=await Promise.all(ids.map(id=>row(id,"rebates")));
    if(selected.some(r=>!r||r.status!=="PENDING"))throw fail("One or more requests are no longer pending. Refresh the list.",409);
    if(status==="APPROVED"&&selected.some(r=>r?.payment_hold))throw fail("A selected request has an active fraud-review hold and cannot be approved.",409);
    if(status==="DECLINED"&&selected.some(r=>!declineReasons.includes(body.reasons?.[r!.id])))throw fail("Choose a decline reason for every selected rebate.");
    const {run}=await engine();
    const updates=selected.map(r=>{const old=JSON.stringify(r);const next={...r,status,date_approved_declined:today(),approved_declined_by:actor.name,decline_reason:status==="DECLINED"?body.reasons[r!.id]:"",decision:decisionRecord(run(r!),"manual",status,actor.name)};return db().prepare("UPDATE records SET data=? WHERE id=? AND kind='rebates' AND data=?").bind(JSON.stringify(next),r!.id,old);});
    const results=await db().batch(updates);const count=results.reduce((n,r)=>n+(r.meta.changes||0),0);await log(actor.email,`${status}: ${count} rebates`);
    if(status==="APPROVED"&&count)await issueCards(ids);
    const duplicates_declined=status==="APPROVED"&&count?await autoDeclineDuplicates():0;if(duplicates_declined)await log(actor.email,`Declined ${duplicates_declined} duplicate rebates automatically`);
    return ok({count,duplicates_declined});
  }
  if(action==="run-engine"){
    const duplicates_declined=await autoDeclineDuplicates();
    const tally={...await autoApprove(),duplicates_declined};
    const run={...tally,at:new Date().toISOString(),by:actor.name,engine_version:ENGINE_VERSION};
    await putSetting("engine_last_run",JSON.stringify(run));await log(actor.email,`Ran ${ENGINE_VERSION}: ${tally.approved} approved automatically, ${duplicates_declined} duplicates declined`);
    return ok(run);
  }
  if(action==="set-automation"){
    const enabled=z.boolean().parse(body.enabled);await putSetting("auto_approve",enabled?"on":"off");
    await log(actor.email,`Automatic approval turned ${enabled?"on":"off"}`);return ok({enabled});
  }
  if(action==="apply-recommendations"){
    // The client sends what it saw; the server re-evaluates and only applies decisions that still match.
    const items=z.array(z.object({id:z.string(),recommendation:z.enum(["APPROVE","DECLINE"])})).min(1).max(200).parse(body.items);
    if(new Set(items.map(i=>i.id)).size!==items.length)throw fail("Select distinct requests.");
    const {rebates,run}=await engine();const byId=new Map(rebates.map(r=>[r.id,r]));
    const skipped:string[]=[];
    const updates=items.flatMap(item=>{
      const r=byId.get(item.id);const ev=r&&r.status==="PENDING"?run(r):null;
      if(!r||!ev||ev.recommendation!==item.recommendation||(item.recommendation==="APPROVE"&&r.payment_hold)){skipped.push(r?.tracking_number||item.id);return [];}
      const status=item.recommendation==="APPROVE"?"APPROVED":"DECLINED";
      const next={...r,status,date_approved_declined:today(),approved_declined_by:actor.name,decline_reason:status==="DECLINED"?ev.declineReason||"":"",decision:decisionRecord(ev,"engine",status,actor.name)};
      return [db().prepare("UPDATE records SET data=? WHERE id=? AND kind='rebates' AND data=?").bind(JSON.stringify(next),r.id,JSON.stringify(r))];
    });
    const results=updates.length?await db().batch(updates):[];const applied=results.reduce((n,r)=>n+(r.meta.changes||0),0);
    await log(actor.email,`Accepted ${applied} engine recommendations (${ENGINE_VERSION})`);
    if(applied)await issueCards(items.filter(i=>i.recommendation==="APPROVE").map(i=>i.id));
    const duplicates_declined=applied?await autoDeclineDuplicates():0;if(duplicates_declined)await log(actor.email,`Declined ${duplicates_declined} duplicate rebates automatically`);
    return ok({applied,duplicates_declined,skipped:skipped.length+(updates.length-applied),skipped_tracking:skipped});
  }
  if(action==="create-invoice"){
    const range=z.object({from:date.optional().or(z.literal("")),to:date.optional().or(z.literal(""))}).parse(body);
    if(range.from&&range.to&&range.from>range.to)throw fail("The end date must be on or after the start date.");
    const [rebates,invoices]=await Promise.all([rows("rebates"),rows("invoices")]);
    const picked=rebates.filter(r=>invoiceable(r)&&(!range.from||r.date_approved_declined>=range.from)&&(!range.to||r.date_approved_declined<=range.to)).sort((a,b)=>a.date_approved_declined.localeCompare(b.date_approved_declined)||a.tracking_number.localeCompare(b.tracking_number));
    if(!picked.length)throw fail("No approved rebates are waiting to be invoiced for these dates.");
    if(picked.length>1000)throw fail("Invoice at most 1,000 rebates at a time. Narrow the approval dates.");
    const year=today().slice(0,4),seq=invoices.filter(i=>i.invoice_number?.startsWith(`INV-${year}-`)).length+1;
    const lines=picked.map(invoiceLine),dates=picked.map(r=>r.date_approved_declined);
    const invoice={id:crypto.randomUUID(),invoice_number:`INV-${year}-${String(seq).padStart(4,"0")}`,status:"DRAFT",date_created:today(),created_by:actor.name,due_date:addDays(today(),PAYMENT_TERMS_DAYS),period_start:range.from||dates[0],period_end:range.to||dates[dates.length-1],from:INVOICE_FROM,bill_to:INVOICE_TO,lines,count:lines.length,total:invoiceTotal(lines),engine_version:ENGINE_VERSION};
    const links=picked.map(r=>db().prepare("UPDATE records SET data=? WHERE id=? AND kind='rebates' AND data=?").bind(JSON.stringify({...r,program_invoice_id:invoice.id,program_invoice_number:invoice.invoice_number}),r.id,JSON.stringify(r)));
    const linked=[];for(let i=0;i<links.length;i+=80)linked.push(...await db().batch(links.slice(i,i+80)));
    if(linked.some(r=>!r.meta.changes)){
      // Something changed underneath us: undo the links that did land and refuse.
      const fresh=(await rows("rebates")).filter(r=>r.program_invoice_id===invoice.id);
      for(let i=0;i<fresh.length;i+=80)await db().batch(fresh.slice(i,i+80).map(r=>statement("rebates",withoutInvoice(r))));
      throw fail("Some rebates changed while the invoice was being created. Refresh and try again.",409);
    }
    await statement("invoices",invoice,false).run();await log(actor.email,`Created invoice ${invoice.invoice_number} for ${lines.length} rebates`);
    return ok({invoice},201);
  }
  if(action==="update-invoice"){
    const status=z.enum(["ISSUED","PAID","VOID"]).parse(body.status);
    const invoice=await row(String(body.id),"invoices");if(!invoice)throw fail("Invoice not found.",404);
    if(!invoiceTransitions[invoice.status]?.includes(status))throw fail(`A ${invoice.status.toLowerCase()} invoice cannot be marked ${status.toLowerCase()}.`,409);
    const old=JSON.stringify(invoice);const next={...invoice,status,[`date_${status.toLowerCase()}`]:today(),[`${status.toLowerCase()}_by`]:actor.name};
    const updated=await db().prepare("UPDATE records SET data=? WHERE id=? AND kind='invoices' AND data=?").bind(JSON.stringify(next),invoice.id,old).run();
    if(!updated.meta.changes)throw fail("This invoice changed while you were working. Refresh and try again.",409);
    if(status==="VOID"){
      const released=(await rows("rebates")).filter(r=>r.program_invoice_id===invoice.id);
      for(let i=0;i<released.length;i+=80)await db().batch(released.slice(i,i+80).map(r=>statement("rebates",withoutInvoice(r))));
    }
    await log(actor.email,`Invoice ${invoice.invoice_number} marked ${status}`);return ok({invoice:next});
  }
  if(action==="update-referral"){
    const r=await row(String(body.id),"referrals");if(!r)throw fail("Referral not found.",404);
    const old=JSON.stringify(r);const status=z.enum(["PENDING","INSTALLATION_COMPLETE","PROCESSED","SHIPPED","DISQUALIFIED"]).parse(body.status);
    const allowed:Record<string,string[]>={PENDING:["INSTALLATION_COMPLETE","DISQUALIFIED"],INSTALLATION_COMPLETE:["PROCESSED","DISQUALIFIED"],PROCESSED:["SHIPPED"],SHIPPED:[],DISQUALIFIED:["PENDING"]};
    if(status!==r.status&&!allowed[r.status].includes(status))throw fail("Complete the earlier workflow steps before moving to this status.");
    const reward=z.enum(["Virtual","Physical",""]).parse(body.reward_type||r.reward_type||"");
    if(["PROCESSED","SHIPPED"].includes(status)&&!reward)throw fail("Select a reward type before processing payment.");
    if(status==="SHIPPED"&&reward!=="Physical")throw fail("Only physical reward cards can be marked shipped.");
    r.status=status;r.reward_type=reward;
    const dateFields:Record<string,string>={INSTALLATION_COMPLETE:"installation_complete_date",PROCESSED:"funded_date",SHIPPED:"shipped_date",DISQUALIFIED:"disqualified_date"};if(dateFields[status]&&!r[dateFields[status]])r[dateFields[status]]=today();
    const updated=await db().prepare("UPDATE records SET data=? WHERE id=? AND kind='referrals' AND data=?").bind(JSON.stringify(r),r.id,old).run();if(!updated.meta.changes)throw fail("This referral changed while you were editing. Refresh and try again.",409);await log(actor.email,`Referral ${r.id} updated to ${status}`);return ok({updated:true});
  }
  if(action==="upload"){
    const kind=z.enum(["codes","campaigns"]).parse(body.kind);const parsed=parseCSV(z.string().max(1_500_000).parse(body.csv));
    if(parsed.length>1000)throw fail("Upload at most 1,000 rows at a time.");
    const key=kind==="codes"?"rebate_code":"campaign_name",amountKey=kind==="codes"?"rebate_amount":"amount";
    const existing=await rows(kind);const seen=new Set<string>();
    const records=parsed.map((r,i)=>{if(!r[key]||r[key].length>100||!r[amountKey]||!Number.isFinite(Number(r[amountKey]))||Number(r[amountKey])<=0||Number(r[amountKey])>100000)throw fail(`Row ${i+2}: include a ${key} and a valid positive ${amountKey}.`);if(seen.has(r[key]))throw fail(`Row ${i+2}: duplicate ${key}.`);seen.add(r[key]);if(r.active&&!/^(true|false|1|0|yes|no)$/i.test(r.active))throw fail(`Row ${i+2}: active must be true or false.`);const prior=existing.find(x=>x[key]===r[key]);const dates=kind==='codes'?{start_date:r.start_date||prior?.start_date||'',end_date:r.end_date||prior?.end_date||''}:{};if(kind==='codes'&&((dates.start_date&&!date.safeParse(dates.start_date).success)||(dates.end_date&&!date.safeParse(dates.end_date).success)||(dates.start_date&&dates.end_date&&dates.start_date>dates.end_date)))throw fail(`Row ${i+2}: start_date and end_date must be YYYY-MM-DD with the start on or before the end.`);return {...prior,id:prior?.id||crypto.randomUUID(),[key]:r[key],[amountKey]:Number(Number(r[amountKey]).toFixed(2)),active:!r.active||/^(true|1|yes)$/i.test(r.active),...dates,...(kind==="codes"?{policy_revision:(Number(prior?.policy_revision)||0)+1,policy_updated_at:new Date().toISOString(),policy_updated_by:actor.name}:{})};});
    for(let i=0;i<records.length;i+=80)await db().batch(records.slice(i,i+80).map(r=>statement(kind,r)));await log(actor.email,`Imported ${records.length} ${kind}`);return ok({count:records.length});
  }
  if(action==="save-user"){
    const data=z.object({name:text,email,role:z.enum(["Client Ace High","Client View Only"]),status:z.enum(["Active","Inactive"]),dealer_name:text}).parse(body.data);
    const existing=body.id?await row(String(body.id),"users"):undefined;if(body.id&&!existing)throw fail("Administrator not found.",404);
    if(existing?.id===actor.id&&data.status==="Inactive")throw fail("You cannot deactivate your own account.");
    if((await rows("users")).some(u=>u.email.toLowerCase()===data.email.toLowerCase()&&u.id!==existing?.id))throw fail("An administrator with this email already exists.",409);
    if(existing?.date_added&&existing.email.toLowerCase()!==data.email.toLowerCase())throw fail("An accepted account's email cannot be changed.");
    const user={...existing,...data,id:existing?.id||crypto.randomUUID(),date_created:existing?.date_created||today(),date_added:existing?.date_added||""};await statement("users",user).run();await log(actor.email,`${existing?"Updated":"Invited"} administrator ${user.email}`);
    const delivery=!existing?await queueInvite(user,new URL(request.url).origin):{};return ok({user,...delivery});
  }
  if(action==="resend-invite"){const user=await row(String(body.id),"users");if(!user||user.date_added)throw fail("This administrator does not have a pending invitation.");if(user.sample)throw fail("Sample invitations cannot be delivered. Add an administrator with a real email address.");return ok(await queueInvite(user,new URL(request.url).origin));}
  throw fail("Unknown action.");
}catch(e){return handle(e);}}
function handle(error:unknown){if(error instanceof z.ZodError)return ok({error:error.issues.map(i=>`${i.path.join(".")}: ${i.message}`).join(" ")},400);const e=error as Error&{status?:number};if(e instanceof SyntaxError)return ok({error:"Enter valid request data."},400);if(!e.status)console.error("Program API error",e);return ok({error:e.status?e.message:"We couldn't complete that request. Please try again."},e.status||500);}
