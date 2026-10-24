import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "../../chatgpt-auth";
import { seedData, declineReasons, parseCSV, type Row } from "../../../lib/program";

export const dynamic = "force-dynamic";
const db = () => { if(!env.DB) throw new Error("Program database is not configured.");return env.DB; };
const today = () => new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const ok=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const fail=(message:string,status=400)=>Object.assign(new Error(message),{status});
async function rows(kind:string):Promise<Row[]> {const r=await db().prepare("SELECT data FROM records WHERE kind = ?").bind(kind).all<{data:string}>();return r.results.map(x=>JSON.parse(x.data));}
async function row(id:string,kind:string):Promise<Row|undefined>{const r=await db().prepare("SELECT data FROM records WHERE id=? AND kind=?").bind(id,kind).first<{data:string}>();return r?JSON.parse(r.data):undefined;}
function statement(kind:string,r:Row,replace=true){return db().prepare(`${replace?"INSERT":"INSERT OR IGNORE"} INTO records (id,kind,data,tracking_number,purchase_key) VALUES (?,?,?,?,?)${replace?" ON CONFLICT(id) DO UPDATE SET data=excluded.data,tracking_number=excluded.tracking_number,purchase_key=excluded.purchase_key WHERE records.kind=excluded.kind":""}`).bind(r.id,kind,JSON.stringify(r),r.tracking_number||null,kind==="rebates"?`${r.email.toLowerCase()}|${r.rebate_code}|${r.date_of_sale}`:null);}
async function log(actor:string,action:string){await db().prepare("INSERT INTO audit (id,actor,action,created) VALUES (?,?,?,?)").bind(crypto.randomUUID(),actor,action,new Date().toISOString()).run();}
async function seed(){
  if(await db().prepare("SELECT value FROM settings WHERE key='seed_v1'").first())return;
  const data=seedData();const statements=Object.entries(data).flatMap(([kind,list])=>list.map(r=>statement(kind,r,false)));
  for(let i=0;i<statements.length;i+=80)await db().batch(statements.slice(i,i+80));
  await db().prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('seed_v1','complete')").run();
}
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
  if(url.searchParams.get("view")==="public") {const config=env as unknown as Record<string,string>;return ok({codes:(await rows("codes")).filter(c=>c.active),cardholder_url:config.CARDHOLDER_URL||null,support_phone:config.SUPPORT_PHONE||null,cardholder_phone:config.CARDHOLDER_PHONE||null});}
  const currentUser=await admin();const [rebates,referrals,users,codes,campaigns]=await Promise.all([rows("rebates"),rows("referrals"),rows("users"),rows("codes"),rows("campaigns")]);
  return ok({rebates,referrals,users,codes,campaigns,currentUser});
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
    const code=(await rows("codes")).find(c=>c.rebate_code===input.rebate_code&&c.active);if(!code)throw fail("This rebate code is not active. Contact your sales representative.");
    const duplicate=await db().prepare("SELECT data FROM records WHERE kind='rebates' AND lower(json_extract(data,'$.email'))=? AND json_extract(data,'$.rebate_code')=? AND json_extract(data,'$.date_of_sale')=?").bind(input.email.toLowerCase(),input.rebate_code,input.date_of_sale).first<{data:string}>();
    if(duplicate)throw fail("A request already exists for this purchase. Use Track Payment or contact support.",409);
    const r={...input,id:crypto.randomUUID(),tracking_number:await uniqueTracking(),status:input.preinstallation?"REBATE_REGISTRATION":"PENDING",rebate_amount:Number(code.rebate_amount),date_submitted:today()};
    const saved=await statement("rebates",r,false).run();if(!saved.meta.changes)throw fail("A request for this purchase was just submitted. Please track your existing request.",409);await log(input.email,`Submitted rebate ${r.id}`);return ok({tracking_number:r.tracking_number,status:r.status},201);
  }
  if(action==="track"){
    const found=await lookup(String(body.tracking_number));const r=found.data;
    return ok({kind:found.kind,tracking_number:body.tracking_number,status:r.status,amount:found.kind==="rebates"?r.rebate_amount:body.tracking_number===r.referee_tracking_number?r.referee_amount:r.amount,date_submitted:r.date_submitted,date_approved_declined:r.date_approved_declined,installation_complete_date:r.installation_complete_date,date_funded:r.date_funded||r.funded_date,date_shipped:r.date_shipped||r.shipped_date,reward_type:r.reward_type,decline_reason:r.decline_reason});
  }
  if(action==="finalize"){
    const found=await lookup(String(body.tracking_number));const r=found.data;
    if(found.kind!=="rebates"||r.status!=="REBATE_REGISTRATION")throw fail("This request is not awaiting installation. Track your payment for the latest status.");
    if(email.parse(body.email).toLowerCase()!==r.email.toLowerCase())throw fail("The email does not match this registration.",403);
    const pto=date.parse(body.pto_date);if(pto>today()||pto<r.date_of_sale)throw fail("Enter a valid PTO date on or after your date of sale.");
    const old=JSON.stringify(r);r.pto_date=pto;r.status="PENDING";r.installation_complete_date=today();const updated=await db().prepare("UPDATE records SET data=? WHERE id=? AND kind='rebates' AND data=?").bind(JSON.stringify(r),r.id,old).run();if(!updated.meta.changes)throw fail("This request changed while you were editing. Check its latest status.",409);await log(r.email,`Finalized rebate ${r.id}`);return ok({tracking_number:r.tracking_number,status:r.status});
  }
  if(action==="contact"){
    const data=z.object({name:text,email,subject:z.enum(["Rebate question","Referral question","Tracking number assistance","Visa card support","Other"]),message:z.string().trim().min(10).max(5000)}).parse(body.data);
    const reference=crypto.randomUUID().slice(0,8).toUpperCase();await statement("messages",{...data,id:crypto.randomUUID(),reference,date_submitted:today(),status:"Received"},false).run();return ok({reference});
  }
  if(action==="accept-invite"){
    const user=await getChatGPTUser();if(!user)throw fail("Sign in with the invited email to accept this invitation.",401);
    const token=z.string().regex(/^[a-f0-9]{64}$/).parse(body.token);const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,"0")).join("");
    const invite=(await rows("invitations")).find(i=>i.hash===hash&&i.expires>Date.now());if(!invite)throw fail("This invitation has expired or already been used.");
    const membership=await row(invite.user_id,"users");if(!membership||membership.sample||membership.status!=="Active"||membership.email.toLowerCase()!==user.email.toLowerCase())throw fail("Sign in using the email address on the invitation.",403);
    membership.user_id=user.userId;membership.date_added=today();await db().batch([statement("users",membership),db().prepare("DELETE FROM records WHERE id=? AND kind='invitations'").bind(invite.id)]);return ok({accepted:true});
  }
  const actor=await admin(true);
  if(action==="review"){
    const ids=z.array(z.string()).min(1).max(100).parse(body.ids);const status=z.enum(["APPROVED","DECLINED"]).parse(body.status);
    if(new Set(ids).size!==ids.length)throw fail("Select distinct requests.");
    const selected=await Promise.all(ids.map(id=>row(id,"rebates")));
    if(selected.some(r=>!r||r.status!=="PENDING"))throw fail("One or more requests are no longer pending. Refresh the list.",409);
    if(status==="DECLINED"&&selected.some(r=>!declineReasons.includes(body.reasons?.[r!.id])))throw fail("Choose a decline reason for every selected rebate.");
    const updates=selected.map(r=>{const old=JSON.stringify(r);const next={...r,status,date_approved_declined:today(),approved_declined_by:actor.name,decline_reason:status==="DECLINED"?body.reasons[r!.id]:""};return db().prepare("UPDATE records SET data=? WHERE id=? AND kind='rebates' AND data=?").bind(JSON.stringify(next),r!.id,old);});
    const results=await db().batch(updates);const count=results.reduce((n,r)=>n+(r.meta.changes||0),0);await log(actor.email,`${status}: ${count} rebates`);return ok({count});
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
    const records=parsed.map((r,i)=>{if(!r[key]||r[key].length>100||!r[amountKey]||!Number.isFinite(Number(r[amountKey]))||Number(r[amountKey])<=0||Number(r[amountKey])>100000)throw fail(`Row ${i+2}: include a ${key} and a valid positive ${amountKey}.`);if(seen.has(r[key]))throw fail(`Row ${i+2}: duplicate ${key}.`);seen.add(r[key]);if(r.active&&!/^(true|false|1|0|yes|no)$/i.test(r.active))throw fail(`Row ${i+2}: active must be true or false.`);return {id:existing.find(x=>x[key]===r[key])?.id||crypto.randomUUID(),[key]:r[key],[amountKey]:Number(Number(r[amountKey]).toFixed(2)),active:!r.active||/^(true|1|yes)$/i.test(r.active)};});
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
