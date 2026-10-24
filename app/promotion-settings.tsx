"use client";

import React,{useEffect,useMemo,useRef,useState} from "react";
import {Check,ChevronRight,LoaderCircle,Plus,Search} from "lucide-react";
import {decisionContext,evaluate,recommendationLabel,type Evaluation} from "../lib/decision";
import {defaultPromotionPolicy,FINANCING_OPTIONS,policyFor,promotionSchema,type PromotionPolicy} from "../lib/promotion-policy";
import {money,type Row} from "../lib/program";
import {api,Empty,Title} from "./admin-ui";

type Props={data:Row;go:(path:string)=>void;reload:()=>Promise<void>;notify:(text:string)=>void;readOnly:boolean};
type Draft={rebate_code:string;title:string;rebate_amount:number;start_date:string;end_date:string;active:boolean;policy:PromotionPolicy};
const label=(ev:Evaluation)=>recommendationLabel[ev.recommendation];

export default function PromotionSettings(props:Props){
  const {data,readOnly}=props;
  const initial=new URLSearchParams(typeof window==="undefined"?"":window.location.search).get("code");
  const [selected,setSelected]=useState<string>(data.codes.find((c:Row)=>c.rebate_code===initial)?.id||data.codes.find((c:Row)=>c.id==="promo-plus")?.id||data.codes[0]?.id||"new");
  const [search,setSearch]=useState("");
  const editorDirty=useRef(false);
  const directory=useRef<HTMLDivElement>(null);
  const select=(id:string)=>{if(id===selected)return;if(editorDirty.current&&!window.confirm("Discard unsaved promotion settings?"))return;editorDirty.current=false;setSelected(id);};
  const code=data.codes.find((c:Row)=>c.id===selected);
  const visible:Row[]=data.codes.filter((c:Row)=>`${c.rebate_code} ${c.title||""}`.toLowerCase().includes(search.toLowerCase())).sort((a:Row,b:Row)=>a.rebate_code.localeCompare(b.rebate_code));
  useEffect(()=>{directory.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:"nearest"});},[selected]);
  return <>
    <Title title="Promotion settings" sub="Set the eligibility rules for each rebate code."><button className="button" disabled={readOnly} onClick={()=>select("new")}><Plus size={16}/>New promotion</button></Title>
    <div className="promotion-layout">
      <aside className="promotion-directory" aria-label="Promotion codes">
        <label className="promotion-search"><Search size={16}/><input aria-label="Search promotion codes" placeholder="Find a promotion code" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <p className="promotion-count">{visible.length} promotion{visible.length===1?"":"s"}</p>
        <div className="promotion-code-list" ref={directory}>{visible.map(c=>{const p=policyFor(c);return <button key={c.id} className={c.id===selected?"current":""} aria-pressed={c.id===selected} onClick={()=>select(c.id)}>
          <span><strong>{c.rebate_code}</strong><small>{c.title||"Standard eligibility"}</small></span><ChevronRight size={16}/>
          <span className="promotion-list-meta">{money(c.rebate_amount)} · {p.submission_window_days} days · {p.min_system_size_kw?`${p.min_system_size_kw} kW minimum`:"No size minimum"}</span>
          <span className={`pill ${c.active?"approved":"neutral"}`}>{c.active?"Active":"Inactive"}</span>{!p.auto_approve&&<span className="promotion-manual">Manual approval</span>}
        </button>;})}</div>
        {!visible.length&&<p className="promotion-count">No codes match. Try another search.</p>}
      </aside>
      <PromotionEditor key={`${selected}-${code?.policy_revision||0}`} {...props} code={code} onSaved={id=>{editorDirty.current=false;setSelected(id);}} onDirty={value=>{editorDirty.current=value;}}/>
    </div>
  </>;
}

function PromotionEditor({code,data,go,reload,notify,readOnly,onSaved,onDirty}:Props&{code?:Row;onSaved:(id:string)=>void;onDirty:(dirty:boolean)=>void}){
  const [draft,setDraft]=useState<Draft>(()=>({rebate_code:code?.rebate_code||"",title:code?.title||code?.rebate_code||"",rebate_amount:Number(code?.rebate_amount)||750,start_date:code?.start_date||`${data.today.slice(0,4)}-01-01`,end_date:code?.end_date||`${data.today.slice(0,4)}-12-31`,active:code?.active??true,policy:code?policyFor(code):defaultPromotionPolicy()}));
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [statesText,setStatesText]=useState(draft.policy.eligible_states.join(", "));
  const update=<K extends keyof Draft>(key:K,value:Draft[K])=>setDraft(v=>({...v,[key]:value}));
  const policy=<K extends keyof PromotionPolicy>(key:K,value:PromotionPolicy[K])=>setDraft(v=>({...v,policy:{...v.policy,[key]:value}}));
  const parsed=promotionSchema.safeParse(draft);
  const pending:Row[]=data.rebates.filter((r:Row)=>r.status==="PENDING"&&r.rebate_code===code?.rebate_code);
  const preview=useMemo(()=>{
    const valid=promotionSchema.safeParse(draft);if(!valid.success)return [];
    const before=decisionContext(data as {rebates:Row[];codes:Row[];customers:Row[];serial_file:string[]},data.today);
    const after=decisionContext({...data,rebates:data.rebates,codes:[...data.codes.filter((c:Row)=>c.id!==code?.id),{...code,...valid.data}]},data.today);
    return data.rebates.filter((r:Row)=>r.status==="PENDING"&&r.rebate_code===code?.rebate_code).map((r:Row)=>({rebate:r,before:evaluate(r,before),after:evaluate(r,after)})) as {rebate:Row;before:Evaluation;after:Evaluation}[];
  },[draft,data,code]);
  const qualifies=preview.filter(x=>x.after.recommendation==="APPROVE").length;
  const changed=preview.filter(x=>x.before.recommendation!==x.after.recommendation).length;
  const [sampleId,setSampleId]=useState("");
  const sample=preview.find(x=>x.rebate.id===sampleId)||preview.find(x=>x.rebate.promotion_demo)||preview[0];
  const dirty=JSON.stringify(draft)!==JSON.stringify({rebate_code:code?.rebate_code||"",title:code?.title||code?.rebate_code||"",rebate_amount:Number(code?.rebate_amount)||750,start_date:code?.start_date||`${data.today.slice(0,4)}-01-01`,end_date:code?.end_date||`${data.today.slice(0,4)}-12-31`,active:code?.active??true,policy:code?policyFor(code):defaultPromotionPolicy()});
  useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
  async function save(e:React.FormEvent){
    e.preventDefault();setError("");if(!parsed.success){setError(parsed.error.issues.map(i=>i.message).join(" "));return;}
    setBusy(true);
    try{const result=await api({action:"save-promotion",id:code?.id,expected_revision:Number(code?.policy_revision)||0,data:parsed.data});await reload();onSaved(result.promotion.id);notify(`Settings saved for ${result.promotion.rebate_code}. Pending recommendations updated.`);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div className="promotion-editor">
    <form onSubmit={save}>
      <header className="promotion-heading"><div><h2>{code?code.rebate_code:"New promotion"}</h2><p>{code?`Revision ${Number(code.policy_revision)||0}${code.policy_updated_by?` · Saved by ${code.policy_updated_by}`:code.policy?" · Configured eligibility":" · Standard settings until customized"}`:"Create a separate offer with its own eligibility settings."}</p></div>{code&&<button className="button secondary compact" type="button" onClick={()=>{if(!dirty||window.confirm("Discard unsaved promotion settings and open the review queue?"))go(`/pending-rebates?code=${encodeURIComponent(code.rebate_code)}`);}}>Review {pending.length} pending</button>}</header>
      <fieldset disabled={readOnly||busy} className="promotion-fields">
        <section className="promotion-section"><h3>Promotion details</h3><div className="promotion-field-grid">
          <label className="field"><span>Promotion code</span><input required maxLength={100} value={draft.rebate_code} disabled={!!code} onChange={e=>update("rebate_code",e.target.value)}/><small>{code?"Code is fixed after creation; create another promotion to use a different code.":"Use letters, numbers, hyphens or underscores."}</small></label>
          <label className="field"><span>Promotion name</span><input required maxLength={120} value={draft.title} onChange={e=>update("title",e.target.value)}/></label>
          <label className="field"><span>Rebate amount ($)</span><input type="number" min="0.01" max="100000" step="0.01" required value={draft.rebate_amount||""} onChange={e=>update("rebate_amount",Number(e.target.value))}/><small>Existing claims keep their requested amount.</small></label>
          <label className="promotion-check"><input type="checkbox" checked={draft.active} onChange={e=>update("active",e.target.checked)}/><span><b>Promotion is active</b><small>Inactive codes cannot receive new submissions.</small></span></label>
          <label className="field"><span>Eligible sales from</span><input type="date" required value={draft.start_date} onChange={e=>update("start_date",e.target.value)}/></label>
          <label className="field"><span>Eligible sales through</span><input type="date" required min={draft.start_date} value={draft.end_date} onChange={e=>update("end_date",e.target.value)}/></label>
        </div></section>
        <section className="promotion-section"><h3>Eligibility thresholds</h3><div className="promotion-field-grid">
          <label className="field"><span>Submission deadline (days after PTO)</span><input type="number" min="1" max="730" required value={draft.policy.submission_window_days||""} onChange={e=>policy("submission_window_days",Number(e.target.value))}/></label>
          <label className="field"><span>If submitted after the deadline</span><select value={draft.policy.late_submission_action} onChange={e=>policy("late_submission_action",e.target.value as "REVIEW"|"DECLINE")}><option value="REVIEW">Hold for review</option><option value="DECLINE">Hold and suggest decline</option></select></label>
          <label className="field"><span>Minimum system size (kW)</span><input type="number" min="0" max="1000" step="0.1" required value={draft.policy.min_system_size_kw} onChange={e=>policy("min_system_size_kw",Number(e.target.value))}/><small>Set to 0 for no minimum. Missing size data is held for review.</small></label>
          <label className="field"><span>If size, state or financing is ineligible</span><select value={draft.policy.eligibility_action} onChange={e=>policy("eligibility_action",e.target.value as "REVIEW"|"DECLINE")}><option value="REVIEW">Hold for review</option><option value="DECLINE">Hold and suggest decline</option></select></label>
        </div>
          <label className="field"><span>Eligible states</span><input aria-describedby="promotion-states-help" value={statesText} placeholder="All states" onChange={e=>{setStatesText(e.target.value);policy("eligible_states",[...new Set(e.target.value.toUpperCase().split(",").map(s=>s.trim()).filter(Boolean))]);}}/><small id="promotion-states-help">Comma-separated state abbreviations, such as CA, AZ. Leave empty for all states.</small></label>
          <fieldset className="promotion-options"><legend>Allowed financing</legend>{FINANCING_OPTIONS.map(f=><label key={f}><input type="checkbox" checked={draft.policy.allowed_financiers.includes(f)} onChange={e=>policy("allowed_financiers",e.target.checked?[...draft.policy.allowed_financiers,f]:draft.policy.allowed_financiers.filter(x=>x!==f))}/>{f}</label>)}</fieldset>
        </section>
        <section className="promotion-section"><h3>Evidence and approval</h3><div className="promotion-evidence">
          {([["require_proof","Signed proof of purchase"],["require_crm","Installation verified in Creatio"],["require_serial","Match in the daily serial file"]] as const).map(([key,title])=><label className="promotion-check" key={key}><input type="checkbox" checked={draft.policy[key]} onChange={e=>policy(key,e.target.checked)}/><span>{title}</span></label>)}
          <label className="promotion-check"><input type="checkbox" checked={draft.policy.auto_approve} onChange={e=>policy("auto_approve",e.target.checked)}/><span><b>Automatically approve qualifying rebates</b><small>Also requires the program-wide automation setting to be on.</small></span></label>
        </div><p className="form-note">PTO, date consistency, duplicate screening, fraud holds and risk checks always apply. Nothing is declined automatically.</p></section>
      </fieldset>
      {readOnly&&<p className="promotion-notice">View-only access. An administrator with full access can change these settings.</p>}
      {error&&<div className="alert error" role="alert">{error}</div>}
      {!parsed.success&&dirty&&<p className="promotion-validation" role="status">Preview unavailable: {parsed.error.issues.map(i=>`${i.path.join(".")}: ${i.message}`).join(" ")}</p>}
      <footer className="promotion-save"><p>{dirty?"Unsaved changes":"Saved settings"} · Saving updates pending recommendations. Completed decisions stay unchanged. Use the engine to approve the backlog.</p><button type="submit" className="button" disabled={readOnly||busy||!parsed.success||(!dirty&&!!code)}>{busy?<LoaderCircle size={16} className="spin"/>:<Check size={16}/>}Save promotion</button></footer>
    </form>
    <section className="promotion-preview" aria-labelledby="promotion-preview-title">
      <div className="promotion-preview-head"><h3 id="promotion-preview-title">Preview eligibility</h3><span className="tag">{dirty?"Unsaved settings":"Saved settings"}</span></div>
      <p>Compare pending rebates using this code before you save. This preview never changes a rebate.</p>
      {parsed.success&&preview.length>0?<>
        <div className="promotion-impact" role="status"><strong>{qualifies} of {preview.length} meet every threshold</strong><span>{changed} outcome{changed===1?"":"s"} would change</span><span>{draft.policy.auto_approve?(data.automation?.enabled===false?"Program automation is paused":"Automatic approval enabled for this code"):"Manual approval for this code"}</span></div>
        <label className="field"><span>Preview rebate</span><select value={sample?.rebate.id||""} onChange={e=>setSampleId(e.target.value)}>{preview.map(x=><option key={x.rebate.id} value={x.rebate.id}>{x.rebate.first_name} {x.rebate.last_name} · {x.rebate.tracking_number}</option>)}</select></label>
        {sample&&<><div className="promotion-example"><b>{sample.rebate.demo_note||`${sample.rebate.first_name} ${sample.rebate.last_name}`}</b><span>{sample.rebate.system_size_kw||"Unknown"} kW · {sample.rebate.state} · {sample.rebate.financier}</span><span>Saved: {label(sample.before)} <ChevronRight size={14}/> Preview: <strong>{label(sample.after)}</strong></span></div>
          <ol className="promotion-checks">{sample.after.checks.filter(c=>["window","system","state","financier","proof","crm","serial"].includes(c.id)).map(c=><li key={c.id}><div><b>{c.label}</b><small>{c.detail}</small></div><span className={`condition-result result-${c.status}`}>{c.notRequired?"Not required":c.status==="pass"?"Satisfied":c.status==="fail"?"Not satisfied":"Needs review"}</span></li>)}</ol></>}
      </>:<Empty title={parsed.success?"No pending rebates for this code":"Complete the settings to preview"} text={parsed.success?"Pending claims appear here when submitted with this promotion code.":"Fix the highlighted settings above to evaluate pending rebates."}/>}
    </section>
  </div>;
}
