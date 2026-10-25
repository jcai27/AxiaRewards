"use client";

import React, {useEffect,useMemo,useState} from "react";
import {ArrowRight,CalendarDays,Check,ChevronLeft,ChevronRight,Download,FileText,LoaderCircle,Pause,Play,Printer,Search,X} from "lucide-react";
import {money,declineReasons,rebateFields,fieldKey,csv,type Row} from "../lib/program";
import {decisionContext,evaluate,recommendationLabel,RULES,type Evaluation,type Recommendation} from "../lib/decision";
import {invoiceable,invoiceCsv,invoiceTransitions,PAYMENT_TERMS_DAYS} from "../lib/invoice";
import {withBase} from "../lib/base-path";
import {api,dateLabel,download,Empty,Modal,Pagination,Pill,Title} from "./admin-ui";

type Go=(p:string)=>void;
type PageProps={data:Row,go:Go,reload:()=>Promise<void>,notify:(s:string)=>void,readOnly:boolean};
const approvedStatuses=["APPROVED","FUNDED","SHIPPED"];
const sum=(rows:Row[],key="rebate_amount")=>rows.reduce((s,r)=>s+(Number(r[key])||0),0);
const fullName=(r:Row)=>`${r.first_name} ${r.last_name}`;

/** Engine evaluations for the loaded data, computed lazily and cached per rebate. */
export function useDecisions(data:Row){
  return useMemo(()=>{
    const ctx=decisionContext({rebates:data.rebates,codes:data.codes,customers:data.customers,serial_file:data.serial_file},data.today||new Date().toISOString().slice(0,10));
    const cache=new Map<string,Evaluation>();
    const get=(r:Row)=>{let e=cache.get(r.id);if(!e){e=evaluate(r,ctx);cache.set(r.id,e);}return e;};
    return {ctx,get};
  },[data]);
}

const recClass:Record<Recommendation,string>={APPROVE:"approved",DECLINE:"declined",REVIEW:"medium"};
export function RecTag({rec}:{rec:Recommendation}){return <span className={`pill ${recClass[rec]}`}>{recommendationLabel[rec]}</span>;}
export const sourceLabel=(r:Row)=>r.decision?.source==="auto"?"Automatic":r.decision?.source==="engine"?"Engine suggestion":r.decision?.source==="manual"?"Manual":r.approved_declined_by?"Manual (legacy)":"—";
const firstFinding=(ev:Evaluation)=>ev.checks.find(c=>c.status==="fail")||ev.checks.find(c=>c.status==="warn");

/* ---------------- Automation control ---------------- */

export function AutomationControl({data,reload,notify,readOnly}:Omit<PageProps,"go">){
  const {get}=useDecisions(data);
  const automation=data.automation||{enabled:true};
  const ready=data.rebates.filter((r:Row)=>r.status==="PENDING"&&!r.payment_hold&&get(r).recommendation==="APPROVE"&&get(r).promotion?.settings.auto_approve).length;
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function toggle(){setBusy(true);try{await api({action:"set-automation",enabled:!automation.enabled});notify(`Automatic approval ${automation.enabled?"paused":"turned on"}.`);await reload();}catch(e){notify((e as Error).message);}finally{setBusy(false);}}
  async function run(){setBusy(true);setError("");try{const r=await api({action:"run-engine"});setConfirm(false);notify(`${r.approved} rebate${r.approved===1?"":"s"} approved automatically.${r.duplicates_declined?` ${r.duplicates_declined} duplicate${r.duplicates_declined===1?"":"s"} declined.`:""} ${r.review+r.decline} held for review.`);await reload();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const last=automation.last_run;
  return <div className={`automation-bar ${automation.enabled?"on":"off"}`}>
    <span className="automation-state"><i aria-hidden="true"/>Automatic approval {automation.enabled?"on":"paused"}</span>
    <p>{automation.enabled?"New and finalized rebates are approved the moment they meet every threshold.":"New rebates wait in the review queue until automation is turned back on."}{last&&<> Last backlog run {dateLabel(last.at)} by {last.by}: {last.approved} approved.</>}</p>
    <div className="automation-actions">
      <button className="button secondary compact" disabled={readOnly||busy} onClick={toggle}>{automation.enabled?<><Pause size={15}/> Pause</>:<><Play size={15}/> Turn on</>}</button>
      <button className="button compact" disabled={readOnly||busy||!ready} onClick={()=>{setError("");setConfirm(true);}}>Approve {ready.toLocaleString()} ready rebate{ready===1?"":"s"}</button>
    </div>
    {confirm&&<Modal title="Run the engine on pending rebates?" onClose={()=>!busy&&setConfirm(false)}>
      <p className="modal-description">{ready.toLocaleString()} pending rebate{ready===1?" meets":"s meet"} every threshold and will be approved now as "{data.automation?.engine_version}". Rebates that fail any threshold stay in the review queue; nothing is declined automatically.</p>
      {error&&<div className="alert error">{error}</div>}
      <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={()=>setConfirm(false)}>Cancel</button><button className="button" disabled={busy} onClick={run}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}Approve {ready.toLocaleString()}</button></div>
    </Modal>}
  </div>;
}

/* ---------------- Dashboard ---------------- */

export function Dashboard({data,go,reload,notify,readOnly}:PageProps){
  const {get}=useDecisions(data);
  const [year,setYear]=useState("2026");
  const rebates:Row[]=data.rebates.filter((r:Row)=>r.date_submitted.startsWith(year));
  const pendingAll:Row[]=data.rebates.filter((r:Row)=>r.status==="PENDING");
  const held={DECLINE:0,REVIEW:0,APPROVE:0} as Record<Recommendation,number>;
  const ruleHits=new Map<string,number>();
  for(const r of pendingAll){const ev=get(r);held[ev.recommendation]++;for(const c of ev.checks)if(c.status!=="pass")ruleHits.set(c.id,(ruleHits.get(c.id)||0)+1);}
  const decided:Row[]=data.rebates.filter((r:Row)=>r.decision&&r.decision.decided_at?.startsWith(year));
  const auto=decided.filter(r=>r.decision.source==="auto"),manual=decided.filter(r=>r.decision.source!=="auto"),overrides=manual.filter(r=>r.decision.agreed===false);
  const ready=data.rebates.filter(invoiceable);
  const pending=rebates.filter(r=>["PENDING","REBATE_REGISTRATION"].includes(r.status)).length,approved=rebates.filter(r=>approvedStatuses.includes(r.status)).length,declined=rebates.filter(r=>r.status==="DECLINED").length;
  const funded=rebates.filter(r=>r.date_funded);
  const decidedYear=rebates.filter(r=>r.date_approved_declined&&r.date_submitted&&r.date_approved_declined>=r.date_submitted);
  const avgDays=decidedYear.length?decidedYear.reduce((s,r)=>s+(Date.parse(r.date_approved_declined)-Date.parse(r.date_submitted))/86400000,0)/decidedYear.length:0;
  const share=(n:number)=>rebates.length?`${n/rebates.length*100}%`:"0%";
  const recent=[...decided].sort((a,b)=>b.decision.decided_at.localeCompare(a.decision.decided_at)).slice(0,8);
  const topRules=[...ruleHits.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
  return <>
    <Title title="Dashboard" sub="Automated rebate decisions and the work waiting for a person."><label className="year-select"><CalendarDays size={15}/><select aria-label="Dashboard year" value={year} onChange={e=>setYear(e.target.value)}><option>2026</option><option>2025</option><option>2024</option></select></label><button className="button compact" onClick={()=>go("/pending-rebates")}>Open review queue <ArrowRight size={15}/></button></Title>
    <section className="dash-section" aria-labelledby="engine-heading">
      <div className="section-head"><h2 id="engine-heading">Automated decisions</h2><button className="stat-link inline" onClick={()=>go("/decision-rules")}>Decision rules <ChevronRight size={14}/></button></div>
      <AutomationControl data={data} reload={reload} notify={notify} readOnly={readOnly}/>
      <div className="stat-strip">
        <div className="stat"><span className="stat-label">Held for review</span><div className="number-row"><strong>{pendingAll.length.toLocaleString()}</strong></div><div className="status-breakdown">
          <button onClick={()=>go("/pending-rebates?rec=decline")}><i className="dot declined"/><span>Suggest decline</span><b>{held.DECLINE.toLocaleString()}</b></button>
          <button onClick={()=>go("/pending-rebates?rec=review")}><i className="dot warn"/><span>Needs review</span><b>{held.REVIEW.toLocaleString()}</b></button>
          {held.APPROVE>0&&<button onClick={()=>go("/pending-rebates?rec=approve")}><i className="dot approved"/><span>Meets all thresholds</span><b>{held.APPROVE.toLocaleString()}</b></button>}
        </div></div>
        <div className="stat"><span className="stat-label">Approved automatically</span><div className="number-row"><strong>{auto.length.toLocaleString()}</strong></div><p className="stat-note">{decided.length?`${Math.round(auto.length/decided.length*100)}% of ${decided.length.toLocaleString()} recorded decisions in ${year}`:`No recorded decisions in ${year} yet`}</p><button className="stat-link" onClick={()=>go("/approved-rebates")}>View approved <ChevronRight size={14}/></button></div>
        <div className="stat"><span className="stat-label">Decided by a person</span><div className="number-row"><strong>{manual.length.toLocaleString()}</strong></div><p className="stat-note">{overrides.length.toLocaleString()} went against the engine's suggestion</p></div>
        <div className="stat"><span className="stat-label">Ready to invoice</span><div className="number-row"><strong>{money(sum(ready))}</strong></div><p className="stat-note">{ready.length.toLocaleString()} approved rebates not yet billed</p><button className="stat-link" onClick={()=>go("/invoices")}>Go to invoices <ChevronRight size={14}/></button></div>
      </div>
    </section>
    <section className="dash-section" aria-labelledby="glance-heading"><div className="section-head"><h2 id="glance-heading">Program at a glance</h2><span>Submitted in {year}</span></div>
      <div className="stat-strip three">
        <div className="stat submissions"><span className="stat-label">Rebate submissions</span><div className="number-row"><strong>{rebates.length.toLocaleString()}</strong></div><div className="segmented-bar" aria-hidden="true"><span className="seg-pending" style={{width:share(pending)}}/><span className="seg-approved" style={{width:share(approved)}}/><span className="seg-declined" style={{width:share(declined)}}/></div><div className="status-breakdown"><button onClick={()=>go("/pending-rebates")}><i className="dot pending"/><span>Pending or registered</span><b>{pending.toLocaleString()}</b></button><button onClick={()=>go("/approved-rebates")}><i className="dot approved"/><span>Approved</span><b>{approved.toLocaleString()}</b></button><button onClick={()=>go("/declined-rebates")}><i className="dot declined"/><span>Declined</span><b>{declined.toLocaleString()}</b></button></div></div>
        <div className="stat"><span className="stat-label">Rebate payments funded</span><div className="number-row"><strong>{money(sum(funded))}</strong></div><p className="stat-note">{funded.length.toLocaleString()} rebates funded</p></div>
        <div className="stat"><span className="stat-label">Average time to decision</span><div className="number-row"><strong>{decidedYear.length?`${avgDays.toFixed(1)} days`:"—"}</strong></div><p className="stat-note">From submission to approval or decline, {decidedYear.length.toLocaleString()} rebates</p></div>
      </div>
    </section>
    <div className="leaderboards">
      <section className="panel"><div className="panel-heading"><h3>Why rebates are held</h3><button className="text-button" onClick={()=>go("/decision-rules")}>All rules</button></div>
        {topRules.length?<div className="table-scroll"><table><thead><tr><th>Threshold not met</th><th>Group</th><th className="num">Rebates</th></tr></thead><tbody>{topRules.map(([id,count])=>{const rule=RULES.find(r=>r.id===id)!;return <tr key={id} className="clickable" onClick={()=>go(`/pending-rebates?rule=${id}`)}><td><button className="tracking-link" onClick={e=>{e.stopPropagation();go(`/pending-rebates?rule=${id}`);}}>{rule.label}</button></td><td className="muted">{rule.group}</td><td className="num"><b>{count.toLocaleString()}</b></td></tr>;})}</tbody></table></div>:<Empty title="Nothing is held" text="Every pending rebate meets all thresholds."/>}
      </section>
      <section className="panel"><div className="panel-heading"><h3>Recent decisions</h3><span className="tag">{year}</span></div>
        {recent.length?<div className="table-scroll"><table><thead><tr><th>Rebate</th><th>Customer</th><th>Outcome</th><th>Decided by</th></tr></thead><tbody>{recent.map(r=><tr key={r.id} className="clickable" onClick={()=>go(`/rebate/${r.tracking_number}`)}><td><button className="tracking-link" onClick={e=>{e.stopPropagation();go(`/rebate/${r.tracking_number}`);}}>{r.tracking_number}</button></td><td>{fullName(r)}</td><td><Pill status={r.status}/></td><td>{sourceLabel(r)}</td></tr>)}</tbody></table></div>:<Empty title="No decisions recorded yet" text="Automatic and manual decisions will appear here."/>}
      </section>
    </div>
  </>;
}

/* ---------------- Rebate lists and review queue ---------------- */

export function Rebates({path,data,reload,notify,go,readOnly}:PageProps&{path:string}){
  const {get}=useDecisions(data);
  const review=path==="/pending-rebates",active=path==="/approved-rebates"?"Approved":path==="/declined-rebates"?"Declined":review?"Pending":"All";
  const params=new URLSearchParams(typeof window==="undefined"?"":window.location.search);
  const [search,setSearch]=useState(""),[term,setTerm]=useState(""),[filter,setFilter]=useState("all"),[page,setPage]=useState(1),[checked,setChecked]=useState<string[]>([]),[reasons,setReasons]=useState<Record<string,string>>({}),[confirm,setConfirm]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [rec,setRec]=useState(params.get("rec")||"all"),[rule,setRule]=useState(params.get("rule")||"");
  useEffect(()=>{const tracking=new URLSearchParams(window.location.search).get("tracking");if(tracking){setSearch(tracking);setTerm(tracking);setFilter("tracking_number");setPage(1);}},[]);
  const inTab=(r:Row)=>active==="All"?true:active==="Pending"?r.status==="PENDING":active==="Approved"?approvedStatuses.includes(r.status):r.status==="DECLINED";
  const matches=(r:Row)=>(filter==="all"?Object.values(r).filter(v=>typeof v!=="object").join(" "):String(r[filter]||"")).toLowerCase().includes(term.toLowerCase());
  const base:Row[]=data.rebates.filter((r:Row)=>inTab(r)&&matches(r));
  const counts={all:base.length,decline:0,review:0,approve:0} as Record<string,number>;
  if(review)for(const r of base)counts[get(r).recommendation.toLowerCase()]++;
  const filtered=base.filter(r=>!review||((rec==="all"||get(r).recommendation.toLowerCase()===rec)&&(!rule||get(r).checks.some(c=>c.id===rule&&c.status!=="pass")))).sort((a,b)=>b.date_submitted.localeCompare(a.date_submitted)||a.id.localeCompare(b.id));
  const shown=filtered.slice((page-1)*10,page*10),eligible=shown.filter(r=>r.status==="PENDING");
  const reasonFor=(r:Row)=>reasons[r.id]??get(r).declineReason??"";
  const toggle=(id:string)=>setChecked(v=>v.includes(id)?v.filter(i=>i!==id):[...v,id]);
  const selected:Row[]=data.rebates.filter((r:Row)=>checked.includes(r.id));
  const suggestions=selected.filter(r=>{const ev=get(r);return ev.recommendation==="DECLINE"||(ev.recommendation==="APPROVE"&&!r.payment_hold);});
  const open=(r:Row)=>go(`/rebate/${r.tracking_number}`);
  async function submit(){
    setBusy(true);setError("");
    try{
      if(confirm==="SUGGESTED"){const d=await api({action:"apply-recommendations",items:suggestions.map(r=>({id:r.id,recommendation:get(r).recommendation}))});notify(`${d.applied} engine suggestion${d.applied===1?"":"s"} applied.${d.skipped?` ${d.skipped} skipped because they changed.`:""}${d.duplicates_declined?` ${d.duplicates_declined} duplicate${d.duplicates_declined===1?"":"s"} declined automatically.`:""}`);}
      else{const d=await api({action:"review",ids:checked,status:confirm,reasons:Object.fromEntries(selected.map(r=>[r.id,reasonFor(r)]))});notify(`${d.count} rebate${d.count!==1?"s":""} ${confirm==="APPROVED"?"approved":"declined"}.${d.duplicates_declined?` ${d.duplicates_declined} duplicate${d.duplicates_declined===1?"":"s"} declined automatically.`:""}`);}
      setChecked([]);setConfirm("");await reload();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const setRecFilter=(v:string)=>{setRec(v);setPage(1);setChecked([]);};
  const ruleInfo=RULES.find(r=>r.id===rule);
  return <>
    <Title title={`${active} Rebates`} sub={review?"Rebates the engine held for a person. Rebates that meet every threshold are approved automatically.":"Every rebate, from submission to invoice."}><button className="button secondary compact" onClick={()=>{download(csv(filtered,rebateFields),"axia-rebates.csv");notify(`Exported ${filtered.length} rebates.`);}}><Download size={15}/> Export</button></Title>
    <div className="panel data-panel">
      <div className="tabs">{["All","Pending","Approved","Declined"].map((t,i)=><button key={t} className={active===t?"active":""} onClick={()=>go(["/rebates","/pending-rebates","/approved-rebates","/declined-rebates"][i])}>{t} Rebates {t==="All"&&<span>{data.rebates.length}</span>}</button>)}</div>
      {review&&<div className="queue-filters" role="group" aria-label="Filter by engine finding">
        {[["all","All held"],["decline","Suggest decline"],["review","Needs review"],...(counts.approve?[["approve","Meets all thresholds"]]:[])].map(([v,label])=><button key={v} className={rec===v?"active":""} aria-pressed={rec===v} onClick={()=>setRecFilter(v)}>{label}<span>{counts[v].toLocaleString()}</span></button>)}
        {ruleInfo&&<span className="filter-chip">Threshold: {ruleInfo.label}<button aria-label="Clear threshold filter" onClick={()=>{setRule("");setPage(1);}}><X size={13}/></button></span>}
      </div>}
      <div className="table-toolbar">
        <form className="search-form" onSubmit={e=>{e.preventDefault();setTerm(search.trim());setPage(1);setChecked([]);}}><label className="sr-only" htmlFor="rebate-search-field">Search field</label><select id="rebate-search-field" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All fields</option>{["First Name","Last Name","Email Address","Rebate Code","Rebate Status Tracking Number","Dealer Name","Status","Risk Level","Fraud Review Status","Customer ID"].map(f=><option key={f} value={fieldKey(f)}>{f}</option>)}</select><div className="search-input"><Search size={16}/><input aria-label="Search rebates" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search rebates…"/>{search&&<button type="button" aria-label="Clear search" onClick={()=>{setSearch("");setTerm("");setPage(1);}}><X size={14}/></button>}</div><button className="button compact">Search</button></form>
        {review&&<div className="bulk-actions"><span>{checked.length} selected</span>
          <button disabled={!suggestions.length||readOnly} className="button secondary compact" onClick={()=>{setError("");setConfirm("SUGGESTED");}}>Apply engine suggestion</button>
          <button disabled={!checked.length||readOnly} className="approve-button" onClick={()=>{setError("");setConfirm("APPROVED");}}><Check size={14}/> Approve</button>
          <button disabled={!checked.length||readOnly} className="decline-button" onClick={()=>{if(selected.some(r=>!reasonFor(r))){notify("Choose a decline reason for every selected rebate.");return;}setError("");setConfirm("DECLINED");}}><X size={14}/> Decline</button>
        </div>}
      </div>
      <div className="table-scroll"><table className="rebate-table"><thead><tr>
        {review&&<th className="checkbox-cell"><input type="checkbox" aria-label="Select all rebates on this page" checked={eligible.length>0&&eligible.every(r=>checked.includes(r.id))} disabled={readOnly||!eligible.length} onChange={e=>setChecked(e.target.checked?Array.from(new Set([...checked,...eligible.map(r=>r.id)])):checked.filter(id=>!eligible.some(r=>r.id===id)))}/></th>}
        <th>Tracking number</th><th>Customer</th>{review?<><th>Engine</th><th>Finding</th></>:<><th>Status</th><th>Decision</th></>}<th className="num">Amount</th><th>Rebate code</th><th>Submitted</th>{review?<><th>Risk</th><th>Decline reason</th></>:<><th>Decided</th><th>Invoice</th></>}
      </tr></thead><tbody>{shown.map(r=>{const ev=get(r),finding=firstFinding(ev);return <tr key={r.id} className={`clickable ${checked.includes(r.id)?"checked-row":""}`} onClick={e=>{if(!(e.target as HTMLElement).closest("input,select,button,a,label"))open(r);}}>
        {review&&<td className="checkbox-cell"><input type="checkbox" aria-label={`Select rebate ${r.tracking_number}`} disabled={readOnly||r.status!=="PENDING"} checked={checked.includes(r.id)} onChange={()=>toggle(r.id)}/></td>}
        <td><button className="tracking-link" onClick={()=>open(r)}>{r.tracking_number}</button></td>
        <td>{fullName(r)}</td>
        {review?<><td><RecTag rec={ev.recommendation}/></td><td className="finding-cell" title={finding?.detail}>{finding?finding.label:"—"}</td></>:<><td><Pill status={r.status}/></td><td>{sourceLabel(r)}</td></>}
        <td className="num"><b className="amount-cell">{money(r.rebate_amount)}</b></td><td>{r.rebate_code}</td><td>{dateLabel(r.date_submitted)}</td>
        {review?<><td><Pill status={r.risk_level||"NOT_ASSESSED"}/></td><td><select className="reason-select" aria-label={`Decline reason for ${r.tracking_number}`} disabled={readOnly} value={reasonFor(r)} onChange={e=>setReasons({...reasons,[r.id]:e.target.value})}><option value="">Select a reason</option>{declineReasons.map(reason=><option key={reason}>{reason}</option>)}</select></td></>
          :<><td>{dateLabel(r.date_approved_declined)}</td><td>{r.program_invoice_number?<button className="tracking-link" onClick={()=>go(`/invoices/${r.program_invoice_number}`)}>{r.program_invoice_number}</button>:"—"}</td></>}
      </tr>;})}</tbody></table></div>
      {!filtered.length&&<Empty title={review&&!term?"Nothing in this view":"No results found"} text={review&&!term?"No held rebates match this filter.":"Try another search or change your filters."}/>}
      <Pagination total={filtered.length} page={page} setPage={setPage}/>
    </div>
    {confirm&&<Modal title={confirm==="SUGGESTED"?"Apply engine suggestions?":`${confirm==="APPROVED"?"Approve":"Decline"} selected rebates?`} onClose={()=>!busy&&setConfirm("")}>
      <p className="modal-description">{confirm==="SUGGESTED"
        ?<>{suggestions.filter(r=>get(r).recommendation==="APPROVE").length} will be approved and {suggestions.filter(r=>get(r).recommendation==="DECLINE").length} declined with the engine's reason. {checked.length-suggestions.length>0&&<>{checked.length-suggestions.length} selected rebate{checked.length-suggestions.length===1?" needs":"s need"} a person's judgment and will be left alone. </>}The engine re-checks each rebate before saving.</>
        :<>{checked.length} rebate request{checked.length!==1?"s":""} will be marked {confirm.toLowerCase()}. This decision will be saved with your name and today's date.</>}</p>
      {error&&<div className="alert error">{error}</div>}
      <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={()=>setConfirm("")}>Cancel</button><button className={`button ${confirm==="DECLINED"?"danger":""}`} disabled={busy} onClick={submit}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}{confirm==="SUGGESTED"?`Apply ${suggestions.length}`:`Confirm ${confirm==="APPROVED"?"approval":"decline"}`}</button></div>
    </Modal>}
  </>;
}

/* ---------------- Decision rules ---------------- */

export function DecisionRules({data,go,reload,notify,readOnly}:PageProps){
  const {get}=useDecisions(data);
  const pending:Row[]=data.rebates.filter((r:Row)=>r.status==="PENDING");
  const hits=new Map<string,{fail:number,warn:number}>();
  for(const r of pending)for(const c of get(r).checks)if(c.status!=="pass"){const h=hits.get(c.id)||{fail:0,warn:0};h[c.status]++;hits.set(c.id,h);}
  const groups=[...new Set(RULES.map(x=>x.group))];
  return <>
    <Title title="Decision rules" sub={`A rebate is approved automatically only when it meets every threshold below. Engine version ${data.automation?.engine_version||""}.`}><button className="button secondary" onClick={()=>go("/promotion-codes")}>Promotion settings <ChevronRight size={15}/></button></Title>
    <AutomationControl data={data} reload={reload} notify={notify} readOnly={readOnly}/>
    {groups.map(g=><section className="panel rules-panel" key={g}><div className="panel-heading"><h3>{g}</h3></div><div className="table-scroll"><table><thead><tr><th className="num">No.</th><th>Condition</th><th>What it checks</th><th>If not met</th><th className="num">Pending rebates held</th></tr></thead><tbody>
      {RULES.filter(x=>x.group===g).map(rule=>{const h=hits.get(rule.id);const n=(h?.fail||0)+(h?.warn||0);return <tr key={rule.id}><td className="num">{RULES.indexOf(rule)+1}</td><td><b>{rule.label}</b></td><td className="wrap">{rule.description}</td><td>{["window","system","state","financier","proof","crm","serial"].includes(rule.id)?<button className="tracking-link" onClick={()=>go("/promotion-codes")}>Per promotion</button>:<span className={`pill ${rule.onFail==="Decline"?"declined":"medium"}`}>{rule.onFail==="Decline"?"Hold, suggest decline":"Hold for review"}</span>}</td><td className="num">{n?<button className="tracking-link" onClick={()=>go(`/pending-rebates?rule=${rule.id}`)}>{n.toLocaleString()}</button>:"0"}</td></tr>;})}
    </tbody></table></div></section>)}
    <p className="form-note">Deadlines, minimum system size, eligible states, financing and required evidence are configured per promotion code in Promotion settings. Shared integrity checks always apply. Nothing is declined automatically.</p>
  </>;
}

/* ---------------- Invoices ---------------- */

function lastWeek(today?:string){const d=new Date((today||new Date().toISOString().slice(0,10))+"T12:00:00");const end=new Date(d);end.setDate(d.getDate()-d.getDay()-1);const start=new Date(end);start.setDate(end.getDate()-6);const iso=(x:Date)=>x.toISOString().slice(0,10);return [iso(start),iso(end)];}

export function Invoices({data,go,reload,notify,readOnly}:PageProps){
  const ready:Row[]=data.rebates.filter(invoiceable);
  const invoices:Row[]=[...(data.invoices||[])].sort((a,b)=>b.invoice_number.localeCompare(a.invoice_number));
  const [from,setFrom]=useState(""),[to,setTo]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const picked=ready.filter(r=>(!from||r.date_approved_declined>=from)&&(!to||r.date_approved_declined<=to));
  const outstanding=invoices.filter(i=>["DRAFT","ISSUED"].includes(i.status)),paid=invoices.filter(i=>i.status==="PAID");
  async function create(){setBusy(true);setError("");try{const d=await api({action:"create-invoice",from,to});notify(`Invoice ${d.invoice.invoice_number} created for ${d.invoice.count} rebates.`);await reload();go(`/invoices/${d.invoice.invoice_number}`);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <>
    <Title title="Invoices" sub="Bill the program funder for approved rebates."/>
    <div className="stat-strip three dash-section">
      <div className="stat"><span className="stat-label">Ready to invoice</span><div className="number-row"><strong>{money(sum(ready))}</strong></div><p className="stat-note">{ready.length.toLocaleString()} approved rebates not yet billed</p></div>
      <div className="stat"><span className="stat-label">Outstanding</span><div className="number-row"><strong>{money(sum(outstanding,"total"))}</strong></div><p className="stat-note">{outstanding.length} draft or issued invoice{outstanding.length===1?"":"s"}</p></div>
      <div className="stat"><span className="stat-label">Paid</span><div className="number-row"><strong>{money(sum(paid,"total"))}</strong></div><p className="stat-note">{paid.length} paid invoice{paid.length===1?"":"s"}</p></div>
    </div>
    <section className="panel invoice-builder"><div className="panel-heading"><h3>Create an invoice</h3></div>
      <div className="side-body">
        <p className="muted">Each week, bill the funder for the previous week's approved rebates. Cards are issued once the invoice is paid.</p>
        <div className="date-filters">
          <button type="button" className="button secondary compact week-preset" onClick={()=>{const [a,b]=lastWeek(data.today);setFrom(a);setTo(b);}}>Last week</button>
          <label className="field"><span>Approved from</span><input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label>
          <label className="field"><span>Approved to</span><input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label>
        </div>
        {error&&<div className="alert error">{error}</div>}
        <div className="report-export"><span><FileText size={16}/><b>{picked.length.toLocaleString()}</b>&nbsp;rebates · <b>{money(sum(picked))}</b></span><button className="button" disabled={readOnly||busy||!picked.length} onClick={create}>{busy?<LoaderCircle className="spin" size={16}/>:<FileText size={16}/>}Create invoice</button></div>
      </div>
    </section>
    <section className="panel data-panel dash-section"><div className="panel-heading"><h3>All invoices</h3><span className="tag">{invoices.length}</span></div>
      {invoices.length?<div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Status</th><th>Approval period</th><th className="num">Rebates</th><th className="num">Total</th><th>Created</th><th>Due</th></tr></thead><tbody>
        {invoices.map(i=><tr key={i.id} className="clickable" onClick={()=>go(`/invoices/${i.invoice_number}`)}><td><button className="tracking-link" onClick={e=>{e.stopPropagation();go(`/invoices/${i.invoice_number}`);}}>{i.invoice_number}</button></td><td><Pill status={i.status}/></td><td>{dateLabel(i.period_start)} – {dateLabel(i.period_end)}</td><td className="num">{i.count}</td><td className="num"><b>{money(i.total)}</b></td><td>{dateLabel(i.date_created)}</td><td>{dateLabel(i.due_date)}</td></tr>)}
      </tbody></table></div>:<Empty title="No invoices yet" text="Create the first invoice from the approved rebates above."/>}
    </section>
  </>;
}

export function InvoicePage({number,data,go,reload,notify,readOnly}:PageProps&{number:string}){
  const invoice:Row|undefined=data.invoices?.find((i:Row)=>i.invoice_number===number);
  const [busy,setBusy]=useState("");
  if(!invoice)return <><button className="back-link" onClick={()=>go("/invoices")}><ChevronLeft size={15}/> Invoices</button><Empty title="Invoice not found" text={`No invoice is numbered ${number}.`}/></>;
  async function update(status:string){if(status==="VOID"&&!window.confirm(`Void ${invoice!.invoice_number}? Its ${invoice!.count} rebates become ready to invoice again.`))return;setBusy(status);try{await api({action:"update-invoice",id:invoice!.id,status});notify(`${invoice!.invoice_number} marked ${status.toLowerCase()}.`);await reload();}catch(e){notify((e as Error).message);}finally{setBusy("");}}
  const next=invoiceTransitions[invoice.status]||[];
  const issued=invoice.date_issued||invoice.date_created;
  return <>
    <div className="invoice-toolbar no-print">
      <button className="back-link" onClick={()=>go("/invoices")}><ChevronLeft size={15}/> Invoices</button>
      <div className="page-actions">
        {!readOnly&&next.includes("ISSUED")&&<button className="button compact" disabled={!!busy} onClick={()=>update("ISSUED")}>Issue invoice</button>}
        {!readOnly&&next.includes("PAID")&&<button className="button compact" disabled={!!busy} onClick={()=>update("PAID")}>Mark paid</button>}
        {!readOnly&&next.includes("VOID")&&<button className="button secondary compact" disabled={!!busy} onClick={()=>update("VOID")}>Void</button>}
        <button className="button secondary compact" onClick={()=>download(invoiceCsv(invoice),`${invoice.invoice_number}.csv`)}><Download size={15}/> CSV</button>
        <button className="button secondary compact" onClick={()=>window.print()}><Printer size={15}/> Print or save PDF</button>
      </div>
    </div>
    <article className={`invoice-doc status-${invoice.status.toLowerCase()}`} aria-label={`Invoice ${invoice.invoice_number}`}>
      <header className="inv-head">
        <div><img className="inv-logo" src={withBase("/axia-logo.png")} alt="Axia by Qcells" width={724} height={312}/><p><b>{invoice.from.name}</b><br/>{invoice.from.detail}</p></div>
        <div className="inv-title"><h1>Invoice</h1><Pill status={invoice.status}/></div>
      </header>
      <section className="inv-meta">
        <div><h2>Bill to</h2><p><b>{invoice.bill_to.name}</b><br/>{invoice.bill_to.detail}</p></div>
        <dl><div><dt>Invoice number</dt><dd>{invoice.invoice_number}</dd></div><div><dt>{invoice.date_issued?"Issued":"Created"}</dt><dd>{dateLabel(issued)}</dd></div><div><dt>Due</dt><dd>{dateLabel(invoice.due_date)}</dd></div><div><dt>Approval period</dt><dd>{dateLabel(invoice.period_start)} – {dateLabel(invoice.period_end)}</dd></div>{invoice.date_paid&&<div><dt>Paid</dt><dd>{dateLabel(invoice.date_paid)}</dd></div>}</dl>
      </section>
      <div className="table-scroll"><table className="inv-lines"><thead><tr><th className="num">#</th><th>Rebate</th><th>Customer</th><th>Rebate code</th><th>Dealer</th><th>Approved</th><th className="num">Amount</th></tr></thead><tbody>
        {invoice.lines.map((l:Row,i:number)=><tr key={l.rebate_id}><td className="num">{i+1}</td><td><button className="tracking-link" onClick={()=>go(`/rebate/${l.tracking_number}`)}>{l.tracking_number}</button></td><td>{l.customer}</td><td>{l.rebate_code}</td><td>{l.dealer_name}</td><td>{dateLabel(l.date_approved)}</td><td className="num">{money(l.amount)}</td></tr>)}
      </tbody></table></div>
      <div className="inv-totals"><dl><div><dt>Approved rebates</dt><dd>{invoice.count}</dd></div><div><dt>Subtotal</dt><dd>{money(invoice.total)}</dd></div><div className="inv-due"><dt>Total due</dt><dd>{money(invoice.status==="PAID"||invoice.status==="VOID"?0:invoice.total)}</dd></div></dl></div>
      <footer className="inv-notes"><p>Payment due within {PAYMENT_TERMS_DAYS} days of issue. Each line is a rebate approved under the program's decision rules ({invoice.engine_version}); open a rebate to see the checks it passed.</p><p>Demo invoice generated from fictional program records. No payment has been requested.</p></footer>
    </article>
  </>;
}
