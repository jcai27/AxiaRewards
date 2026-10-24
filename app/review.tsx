"use client";

import React, {useEffect,useRef,useState} from "react";
import {Ban,Check,ChevronLeft,LoaderCircle,Search,X} from "lucide-react";
import {money,declineReasons,type Row} from "../lib/program";
import {relatedClaims,recommendationLabel,RULES,type Evaluation} from "../lib/decision";
import {api,dateLabel,Empty,Modal,Pill} from "./admin-ui";
import {RecTag,sourceLabel,useDecisions} from "./decisioning";

type Go=(p:string)=>void;
type PageProps={data:Row,go:Go,reload:()=>Promise<void>,notify:(s:string)=>void,readOnly:boolean};
const approvedStatuses=["APPROVED","FUNDED","SHIPPED"];
const fullName=(r:Row)=>`${r.first_name} ${r.last_name}`;
// Conditions keep their position in RULES, so "condition 12" means the same check on every rebate.
const conditionNumber=(id:string)=>RULES.findIndex(rule=>rule.id===id)+1;
const statusWord={pass:"Satisfied",fail:"Not satisfied",warn:"Needs review"} as const;
const firstFinding=(ev:Evaluation)=>ev.checks.find(c=>c.status==="fail")||ev.checks.find(c=>c.status==="warn");

function outcome(r:Row,ev:Evaluation,automationOn:boolean){
  if(r.status==="PENDING"){
    const fail=ev.checks.find(c=>c.status==="fail"),warns=ev.checks.filter(c=>c.status==="warn");
    if(ev.recommendation==="DECLINE")return {tone:"decline",title:"Held · suggest decline",detail:`${ev.declineReason} · condition ${conditionNumber(fail!.id)}`};
    if(ev.recommendation==="REVIEW")return {tone:"review",title:"Held · needs review",detail:warns.map(w=>`${conditionNumber(w.id)} ${w.label.toLowerCase()}`).join(" · ")};
    if(r.payment_hold)return {tone:"review",title:"Held · fraud-review hold",detail:"Approval is blocked until the fraud case is closed"};
    return {tone:"ready",title:"Meets every condition",detail:automationOn?"Approved on the next engine run, or approve it now":"Automatic approval is paused for the program or this promotion; approve manually to release"};
  }
  if(approvedStatuses.includes(r.status))return {tone:"approved",title:"Approved",detail:`${r.approved_declined_by||"Recorded"} · ${dateLabel(r.date_approved_declined)}${r.program_invoice_number?` · ${r.program_invoice_number}`:""}`};
  if(r.status==="DECLINED")return {tone:"decline",title:"Declined",detail:`${r.decline_reason||"No reason recorded"} · ${dateLabel(r.date_approved_declined)}`};
  return {tone:"review",title:"Registered before installation",detail:"Waiting for installation, PTO and the customer's finalization"};
}

/* ---------------- Decision record ---------------- */

export function DecisionRecord({rebate:r,data,go,reload,notify,readOnly,onDecided,linkToRecord=false}:PageProps&{rebate:Row,onDecided?:(r:Row)=>void,linkToRecord?:boolean}){
  const {get}=useDecisions(data);
  const current=get(r);
  const recorded=r.status!=="PENDING"&&r.status!=="REBATE_REGISTRATION"&&Array.isArray(r.decision?.checks);
  const ev:Evaluation=recorded?{...current,checks:r.decision.checks,promotion:r.decision.promotion_policy,recommendation:r.decision.recommendation,version:r.decision.engine_version}:current;
  const result=outcome(r,ev,data.automation?.enabled!==false&&ev.promotion?.settings.auto_approve!==false);
  const [confirm,setConfirm]=useState<""|"APPROVED"|"DECLINED">(""),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const reasonValue=reason||ev.declineReason||"";
  const groups=[...new Set(RULES.map(rule=>rule.group))];
  const overrides=confirm!==""&&ev.recommendation!==(confirm==="APPROVED"?"APPROVE":"DECLINE");
  async function decide(){
    setBusy(true);setError("");
    try{
      await api({action:"review",ids:[r.id],status:confirm,reasons:{[r.id]:reasonValue}});
      notify(`Rebate ${r.tracking_number} ${confirm==="APPROVED"?"approved":"declined"}.`);
      setConfirm("");onDecided?.(r);await reload();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <article className="record" aria-label={`Decision record for rebate ${r.tracking_number}`}>
    <header className="record-head"><h2>Rebate decision record</h2><span>Axia Rebate Program · {ev.version}</span></header>
    <dl className="record-ref">
      <div><dt>Rebate</dt><dd>{r.tracking_number}</dd></div>
      <div><dt>Amount</dt><dd>{money(r.rebate_amount)}</dd></div>
      <div><dt>Campaign</dt><dd><button className="tracking-link" onClick={()=>go(`/promotion-codes?code=${encodeURIComponent(r.rebate_code)}`)}>{r.rebate_code}</button></dd></div>
      <div><dt>Submitted</dt><dd>{dateLabel(r.date_submitted)}</dd></div>
    </dl>
    <div className="record-re"><p>Re: <b>{fullName(r)}</b>, {[r.address1,r.city].filter(Boolean).join(", ")}, {r.state} {r.zip}</p>{linkToRecord&&<button className="text-button" onClick={()=>go(`/rebate/${r.tracking_number}`)}>Open full record</button>}{ev.promotion&&<small>Promotion settings revision {ev.promotion.revision} · {recorded?"Recorded at decision":r.status==="PENDING"?"Current eligibility":"Current eligibility; original checks were not recorded"}</small>}</div>
    <div className="record-body">{groups.map(g=><section className="record-group" key={g} aria-label={g}>
      <h3>{g}</h3>
      <ol>{ev.checks.filter(c=>RULES.find(rule=>rule.id===c.id)?.group===g).map(c=><li key={c.id} className={`cond cond-${c.status}`}>
        <span className="cond-n">{conditionNumber(c.id)}</span>
        <div><b>{c.label}</b><small>{c.detail}</small></div>
        <span className="cond-status">{c.notRequired?"Not required":statusWord[c.status]}</span>
      </li>)}</ol>
    </section>)}</div>
    <div className={`record-outcome outcome-${result.tone}`} role="status"><b>{result.title}</b><span>{result.detail}</span></div>
    {r.status==="PENDING"&&!readOnly&&<div className="record-actions">
      {!!r.payment_hold&&<p className="approval-blocked">Approval blocked: clear the fraud-review hold before approving this rebate.</p>}
      <button className="button secondary decline-action" onClick={()=>{setError("");setConfirm("DECLINED");}}><Ban size={16}/> Decline rebate</button>
      <button className="button" disabled={!!r.payment_hold} title={r.payment_hold?"A fraud-review hold blocks approval":undefined} onClick={()=>{setError("");setConfirm("APPROVED");}}><Check size={16}/> {ev.recommendation==="APPROVE"?"Approve rebate":"Approve anyway"}</button>
    </div>}
    {confirm&&<Modal title={confirm==="APPROVED"?"Approve this rebate?":"Decline this rebate?"} onClose={()=>!busy&&setConfirm("")}>
      <p className="modal-description">{confirm==="APPROVED"?`${money(r.rebate_amount)} for ${fullName(r)} will be approved and added to the next weekly invoice.`:`${fullName(r)}'s rebate will be declined. The reason appears when they track their request.`}{overrides&&<> This differs from the engine ({recommendationLabel[ev.recommendation].toLowerCase()}) and is recorded as an override.</>}</p>
      {confirm==="DECLINED"&&<label className="field"><span>Decline reason <em>*</em></span><select value={reasonValue} onChange={e=>setReason(e.target.value)}><option value="">Select a reason</option>{declineReasons.map(x=><option key={x}>{x}</option>)}</select></label>}
      {error&&<div className="alert error">{error}</div>}
      <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={()=>setConfirm("")}>Cancel</button><button className={`button ${confirm==="DECLINED"?"danger":""}`} disabled={busy||(confirm==="DECLINED"&&!reasonValue)} onClick={decide}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}Confirm {confirm==="APPROVED"?"approval":"decline"}</button></div>
    </Modal>}
  </article>;
}

/* ---------------- Review queue ---------------- */

const PAGE=40;

export function ReviewQueue({data,go,reload,notify,readOnly}:PageProps){
  const {get}=useDecisions(data);
  const queueRef=useRef<HTMLUListElement>(null),deskRef=useRef<HTMLElement>(null);
  const params=new URLSearchParams(typeof window==="undefined"?"":window.location.search);
  const [search,setSearch]=useState(params.get("tracking")||""),[term,setTerm]=useState(params.get("tracking")||"");
  const [rec,setRec]=useState(params.get("rec")||"all"),[rule,setRule]=useState(params.get("rule")||"");
  const [selectedId,setSelectedId]=useState<string|null>(null),[checked,setChecked]=useState<string[]>([]),[limit,setLimit]=useState(PAGE);
  const [bulk,setBulk]=useState<""|"SUGGESTED"|"APPROVED"|"DECLINED">(""),[bulkReason,setBulkReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const promotionCode=params.get("code")||"";
  const matches=(r:Row)=>(!promotionCode||r.rebate_code===promotionCode)&&(!term||Object.values(r).filter(v=>typeof v!=="object").join(" ").toLowerCase().includes(term.toLowerCase()));
  const held:Row[]=data.rebates.filter((r:Row)=>r.status==="PENDING"&&matches(r)).sort((a:Row,b:Row)=>a.date_submitted.localeCompare(b.date_submitted)||a.tracking_number.localeCompare(b.tracking_number));
  const counts={all:held.length,decline:0,review:0,approve:0} as Record<string,number>;
  for(const r of held)counts[get(r).recommendation.toLowerCase()]++;
  const filtered=held.filter(r=>(rec==="all"||get(r).recommendation.toLowerCase()===rec)&&(!rule||get(r).checks.some(c=>c.id===rule&&c.status!=="pass")));
  const selected=filtered.find(r=>r.id===selectedId)||filtered[0];
  const shown=filtered.slice(0,limit);
  const selectedRows:Row[]=data.rebates.filter((r:Row)=>checked.includes(r.id));
  const suggestions=selectedRows.filter(r=>{const ev=get(r);return ev.recommendation==="DECLINE"||(ev.recommendation==="APPROVE"&&!r.payment_hold);});
  const ruleInfo=RULES.find(x=>x.id===rule);
  const move=(step:number)=>{const i=filtered.findIndex(r=>r.id===selected?.id),index=Math.min(filtered.length-1,Math.max(0,i+step));const next=filtered[index];if(next){setLimit(v=>Math.max(v,index+1));setSelectedId(next.id);}};
  const advancePast=(r:Row)=>{const i=filtered.findIndex(x=>x.id===r.id);setLimit(v=>Math.max(v,i+2));setSelectedId((filtered[i+1]||filtered[i-1])?.id||null);};
  useEffect(()=>{
    if(!window.matchMedia("(min-width:1025px)").matches)return;
    queueRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({block:"nearest"});
    deskRef.current?.querySelector(".record-body")?.scrollTo({top:0});
  },[selected?.id]);
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(t.closest("input,select,textarea,dialog")||e.metaKey||e.ctrlKey||e.altKey)return;
      if(e.key==="j"||e.key==="ArrowDown"){e.preventDefault();move(1);}else if(e.key==="k"||e.key==="ArrowUp"){e.preventDefault();move(-1);}};
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  });
  const toggle=(id:string)=>setChecked(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
  const needsReason=selectedRows.filter(r=>!get(r).declineReason);
  async function applyBulk(){
    setBusy(true);setError("");
    try{
      if(bulk==="SUGGESTED"){const d=await api({action:"apply-recommendations",items:suggestions.map(r=>({id:r.id,recommendation:get(r).recommendation}))});notify(`${d.applied} engine suggestion${d.applied===1?"":"s"} applied.${d.skipped?` ${d.skipped} skipped because they changed.`:""}`);}
      else{const d=await api({action:"review",ids:checked,status:bulk,reasons:Object.fromEntries(selectedRows.map(r=>[r.id,get(r).declineReason||bulkReason]))});notify(`${d.count} rebate${d.count!==1?"s":""} ${bulk==="APPROVED"?"approved":"declined"}.`);}
      setChecked([]);setBulk("");await reload();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const setFilter=(v:string)=>{setRec(v);setLimit(PAGE);setChecked([]);setSelectedId(null);};
  return <div className="review">
    <section className="queue" aria-labelledby="queue-title">
      <div className="queue-head"><h1 id="queue-title">Review queue</h1>{promotionCode&&<p>Promotion: <b>{promotionCode}</b> ? <button className="text-button" onClick={()=>go("/pending-rebates")}>All codes</button></p>}<p>{counts.all.toLocaleString()} rebate{counts.all===1?"":"s"} held for a person · longest waiting first</p>
        <p className={`queue-auto ${data.automation?.enabled===false?"off":""}`}><i aria-hidden="true"/>Automatic approval {data.automation?.enabled===false?"paused":"on"} · <button className="text-button" onClick={()=>go("/decision-rules")}>Rules</button></p></div>
      <form className="queue-search" onSubmit={e=>{e.preventDefault();setTerm(search.trim());setLimit(PAGE);setChecked([]);setSelectedId(null);}}>
        <div className="search-input"><Search size={16}/><input aria-label="Search rebates" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, tracking number, code…"/>{search&&<button type="button" aria-label="Clear search" onClick={()=>{setSearch("");setTerm("");}}><X size={14}/></button>}</div>
        <button className="button compact">Search</button>
      </form>
      <div className="queue-filters" role="group" aria-label="Filter by engine finding">
        {[["all","All"],["decline","Suggest decline"],["review","Needs review"],...(counts.approve?[["approve","Ready"]]:[])].map(([v,label])=><button key={v} className={rec===v?"active":""} aria-pressed={rec===v} onClick={()=>setFilter(v)}>{label}<span>{counts[v].toLocaleString()}</span></button>)}
      </div>
      {ruleInfo&&<div className="queue-rule"><span className="filter-chip">Condition {conditionNumber(ruleInfo.id)}: {ruleInfo.label}<button aria-label="Clear condition filter" onClick={()=>setRule("")}><X size={13}/></button></span></div>}
      {!readOnly&&<div className={`queue-bulk ${checked.length?"active":""}`}>
        <span>{checked.length} selected</span>
        <button className="button secondary compact" disabled={!suggestions.length} onClick={()=>{setError("");setBulk("SUGGESTED");}}>Apply engine suggestion</button>
        <button className="approve-button" disabled={!checked.length} onClick={()=>{setError("");setBulk("APPROVED");}}><Check size={14}/> Approve</button>
        <button className="decline-button" disabled={!checked.length} onClick={()=>{setError("");setBulk("DECLINED");}}><X size={14}/> Decline</button>
      </div>}
      <ul className="queue-list" ref={queueRef}>{shown.map(r=>{const ev=get(r),finding=firstFinding(ev),on=selected?.id===r.id;return <li key={r.id} className={`q-item ${on?"selected":""} ${checked.includes(r.id)?"checked":""}`}>
        {!readOnly&&<input type="checkbox" aria-label={`Select rebate ${r.tracking_number}`} checked={checked.includes(r.id)} onChange={()=>toggle(r.id)}/>}
        <button className="q-open" aria-current={on?"true":undefined} onClick={()=>{if(window.matchMedia("(max-width:1024px)").matches)go(`/rebate/${r.tracking_number}`);else setSelectedId(r.id);}}>
          <span className="q-name">{fullName(r)}</span><RecTag rec={ev.recommendation}/>
          <span className="q-sub">{r.tracking_number} · {finding?finding.label:"All conditions met"}</span><span className="q-amt">{money(r.rebate_amount)}</span>
        </button>
      </li>;})}</ul>
      {filtered.length>limit&&<button className="queue-more" onClick={()=>setLimit(limit+PAGE)}>Show {Math.min(PAGE,filtered.length-limit)} more of {(filtered.length-limit).toLocaleString()}</button>}
      {!filtered.length&&<Empty title={term?"No held rebates match":"Nothing is waiting"} text={term?"Try another name, tracking number or code.":"Every held rebate in this view has been decided."}/>}
      <p className="queue-keys">Press <kbd>J</kbd> and <kbd>K</kbd> to move through the queue.</p>
    </section>
    <section className="desk" aria-label="Selected rebate" ref={deskRef}>
      {selected?<DecisionRecord key={selected.id} rebate={selected} data={data} go={go} reload={reload} notify={notify} readOnly={readOnly} onDecided={advancePast} linkToRecord/>:<Empty title="No rebate selected" text="Held rebates appear on the left."/>}
    </section>
    {bulk&&<Modal title={bulk==="SUGGESTED"?"Apply engine suggestions?":`${bulk==="APPROVED"?"Approve":"Decline"} selected rebates?`} onClose={()=>!busy&&setBulk("")}>
      <p className="modal-description">{bulk==="SUGGESTED"
        ?<>{suggestions.filter(r=>get(r).recommendation==="APPROVE").length} will be approved and {suggestions.filter(r=>get(r).recommendation==="DECLINE").length} declined with the engine&apos;s reason. {checked.length-suggestions.length>0&&<>{checked.length-suggestions.length} need a person&apos;s judgment and will be left alone. </>}The engine re-checks each rebate before saving.</>
        :<>{checked.length} rebate{checked.length!==1?"s":""} will be marked {bulk.toLowerCase()} with your name and today&apos;s date.</>}</p>
      {bulk==="DECLINED"&&needsReason.length>0&&<label className="field"><span>Reason for the {needsReason.length} without a suggested reason <em>*</em></span><select value={bulkReason} onChange={e=>setBulkReason(e.target.value)}><option value="">Select a reason</option>{declineReasons.map(x=><option key={x}>{x}</option>)}</select></label>}
      {error&&<div className="alert error">{error}</div>}
      <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={()=>setBulk("")}>Cancel</button><button className={`button ${bulk==="DECLINED"?"danger":""}`} disabled={busy||(bulk==="DECLINED"&&needsReason.length>0&&!bulkReason)} onClick={applyBulk}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}{bulk==="SUGGESTED"?`Apply ${suggestions.length}`:`Confirm ${bulk==="APPROVED"?"approval":"decline"}`}</button></div>
    </Modal>}
  </div>;
}

/* ---------------- Full rebate record ---------------- */

function Facts({items}:{items:[string,React.ReactNode][]}){return <dl className="facts">{items.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v===""||v===undefined||v===null?"—":v}</dd></div>)}</dl>;}

export function RebateDetail({tracking,data,go,reload,notify,readOnly}:PageProps&{tracking:string}){
  const {ctx}=useDecisions(data);
  const r:Row|undefined=data.rebates.find((x:Row)=>x.tracking_number===tracking);
  if(!r)return <><button className="back-link" onClick={()=>go("/pending-rebates")}><ChevronLeft size={15}/> Review queue</button><Empty title="Rebate not found" text={`No rebate has tracking number ${tracking}.`}/></>;
  const related=relatedClaims(r,ctx);
  const customer=r.customer_id?data.customers?.find((c:Row)=>c.id===r.customer_id):undefined;
  const fraud=r.fraud_case_id?data.fraud?.find((f:Row)=>f.id===r.fraud_case_id):undefined;
  const invoice=r.program_invoice_id?data.invoices?.find((i:Row)=>i.id===r.program_invoice_id):undefined;
  const sameCustomer:Row[]=r.customer_id?data.rebates.filter((x:Row)=>x.customer_id===r.customer_id&&x.id!==r.id):[];
  const relatedRows=[...related.address.map(x=>[x,"Same address and code"]),...related.invoice.map(x=>[x,"Same purchase invoice"]),...related.serial.map(x=>[x,"Same module serial"]),...sameCustomer.map(x=>[x,"Same customer"])] as [Row,string][];
  return <>
    <button className="back-link" onClick={()=>window.history.length>1?window.history.back():go("/pending-rebates")}><ChevronLeft size={15}/> Back</button>
    <h1 className="sr-only">{fullName(r)}, rebate {r.tracking_number}</h1>
    <div className="detail-layout">
      <div className="detail-main"><DecisionRecord rebate={r} data={data} go={go} reload={reload} notify={notify} readOnly={readOnly}/></div>
      <aside className="detail-side">
        <section className="panel"><div className="panel-heading"><h3>Customer</h3>{customer&&<button className="text-button" onClick={()=>go(`/customers?q=${customer.id}`)}>Profile</button>}</div>
          <Facts items={[["Name",fullName(r)],["Email",r.email],["Phone",r.phone],["Address",[r.address1,r.address2].filter(Boolean).join(", ")],["City, state, ZIP",`${r.city}, ${r.state} ${r.zip}`],["Reward type",r.reward_type]]}/></section>
        <section className="panel"><div className="panel-heading"><h3>Installation and purchase</h3></div>
          <Facts items={[["Dealer",r.dealer_name],["Sales representative",r.sales_rep_name],["Date of sale",dateLabel(r.date_of_sale)],["Contract signed",r.proof_of_purchase?dateLabel(r.proof_of_purchase):"Not received"],["Creatio status",r.crm_install_status?`${String(r.crm_install_status).toLowerCase().replace("_"," ")}${r.crm_source==="demo-simulated"?" (simulated)":""}`:"Not received"],["PTO date",dateLabel(r.pto_date)],["Financing",r.financier],["Module serial",r.module_serial],["System size",r.system_size_kw?`${r.system_size_kw} kW`:""],["Purchase invoice",r.invoice_number]]}/></section>
        <section className="panel"><div className="panel-heading"><h3>Decision and invoice</h3></div>
          <Facts items={[["Status",<Pill key="s" status={r.status}/>],["Decided by",r.approved_declined_by],["How",sourceLabel(r)],["Weekly invoice",invoice?<button key="i" className="tracking-link" onClick={()=>go(`/invoices/${invoice.invoice_number}`)}>{invoice.invoice_number}</button>:approvedStatuses.includes(r.status)?"Not yet invoiced":"After approval"]]}/></section>
        <section className="panel"><div className="panel-heading"><h3>Risk</h3></div>
          <Facts items={[["Risk level",<Pill key="r" status={r.risk_level||"NOT_ASSESSED"}/>],["Fraud case",fraud?<button key="f" className="tracking-link" onClick={()=>go(`/fraud-review?q=${fraud.id}`)}>{fraud.case_number}</button>:"None"],["Payment hold",r.payment_hold?"Yes, approval blocked":"No"]]}/></section>
        <section className="panel"><div className="panel-heading"><h3>Related claims</h3><span className="tag">{relatedRows.length}</span></div>
          {relatedRows.length?<ul className="related-list">{relatedRows.map(([x,why])=><li key={x.id+why}><button className="tracking-link" onClick={()=>go(`/rebate/${x.tracking_number}`)}>{x.tracking_number}</button><span>{why}</span><Pill status={x.status}/></li>)}</ul>:<p className="side-body muted">No other claims share this address, invoice, serial or customer.</p>}
        </section>
      </aside>
    </div>
  </>;
}
