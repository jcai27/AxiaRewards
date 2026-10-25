"use client";
import React,{useState} from "react";
import {ArrowUpRight,CreditCard,Eye,LoaderCircle,Mail,Send,ShieldCheck} from "lucide-react";
import {money,type Row} from "../lib/program";
import {withBase} from "../lib/base-path";
import {api,dateLabel,Empty,Modal,Pill,Title} from "./admin-ui";

type Props={data:Row;go:(p:string)=>void;reload:()=>Promise<void>;notify:(s:string)=>void;readOnly:boolean};
function Metric({label,value,detail}:{label:string,value:string,detail:string}){return <div className="stat scenario-metric"><span className="stat-label">{label}</span><strong>{value}</strong><p className="stat-note">{detail}</p></div>;}

/** Digital Visa card delivery: one simulated card and email per approved rebate. */
export function CardDelivery({data,go,reload,notify,readOnly}:Props){
  const emails:Row[]=[...(data.card_emails||[])].sort((a,b)=>b.created.localeCompare(a.created));
  const cards=new Map<string,Row>((data.rewards||[]).map((c:Row)=>[c.id,c]));
  const [preview,setPreview]=useState<Row|null>(null),[busy,setBusy]=useState("");
  const digital=emails.filter(e=>e.reward_type==="Virtual"),activated=emails.filter(e=>cards.get(e.reward_id)?.status==="ACTIVATED");
  async function resend(e:Row){setBusy(e.id);try{const r=await api({action:"send-card",tracking_number:e.tracking_number});notify(`Card email resent to ${e.to} (send ${r.sends}).`);await reload();}catch(err){notify((err as Error).message);}finally{setBusy("");}}
  return <><Title title="Card delivery" sub="Digital Visa Prepaid cards emailed to customers when their rebate is approved."/>
    <div className="scenario-notice"><ShieldCheck size={17}/><span>Demo issuer: cards and emails are simulated. No funds move and no email leaves the program. A live issuer (for example Tremendous or Tango) would fund the card and send this email.</span></div>
    <div className="scenario-metrics"><Metric label="Cards issued" value={String(emails.length)} detail="One per approved rebate"/><Metric label="Emailed digitally" value={String(digital.length)} detail={`${emails.length-digital.length} physical cards mailing`}/><Metric label="Activated" value={String(activated.length)} detail="Customer opened the claim link"/><Metric label="Value issued" value={money(emails.reduce((s,e)=>s+Number(e.amount),0))} detail="Simulated card loads"/></div>
    <section className="panel data-panel"><div className="table-scroll"><table><thead><tr><th>Sent</th><th>Customer</th><th>Email</th><th>Rebate</th><th className="num">Amount</th><th>Card</th><th>Delivery</th><th></th></tr></thead><tbody>{emails.map(e=>{const c=cards.get(e.reward_id);return <tr key={e.id}>
      <td>{dateLabel(e.last_sent||e.created)}{Number(e.sends)>1&&<small className="muted"> · sent {e.sends}×</small>}</td><td>{e.customer_name}</td><td>{e.to}</td>
      <td><button className="tracking-link" onClick={()=>go(`/rebate/${e.tracking_number}`)}>{e.tracking_number}</button></td><td className="num"><b className="amount-cell">{money(e.amount)}</b></td>
      <td>{c?<><Pill status={c.status}/> <small>•••• {c.last_four}</small></>:"—"}</td><td>{e.reward_type==="Virtual"?"Email":"Mail"} · {e.status}</td>
      <td><div className="row-actions"><button className="text-button" onClick={()=>setPreview(e)}><Eye size={13}/> Preview</button>{e.reward_type==="Virtual"&&!readOnly&&<button className="text-button" disabled={busy===e.id} onClick={()=>resend(e)}>{busy===e.id?<LoaderCircle className="spin" size={13}/>:<Send size={13}/>} Resend</button>}</div></td></tr>;})}</tbody></table></div>
      {!emails.length&&<Empty title="No cards issued yet" text="Approve a rebate and its Visa Prepaid card email appears here."/>}
    </section>
    {preview&&<Modal title="Card email preview" onClose={()=>setPreview(null)}><CardEmail email={preview} card={cards.get(preview.reward_id)}/></Modal>}
  </>;
}

function CardEmail({email,card}:{email:Row,card?:Row}){
  const link=card?withBase(`/my-visa-card?claim=${card.claim_token}`):"";
  return <div className="card-email"><dl className="card-email-head"><div><dt>To</dt><dd>{email.to}</dd></div><div><dt>Subject</dt><dd>{email.subject}</dd></div></dl>
    <div className="card-email-body"><p>Hi {String(email.customer_name).split(" ")[0]},</p><p>Thank you for going solar with Axia. Your rebate <b>{email.tracking_number}</b> has been approved and your <b>{money(email.amount)}</b> Axia Visa Prepaid Card is {email.reward_type==="Virtual"?"ready to use":"on its way by mail"}.</p>
      {email.reward_type==="Virtual"&&card&&<p><a className="button" href={link} target="_blank" rel="noopener">View and activate my card <ArrowUpRight size={15}/></a></p>}
      <p className="form-note">{card?<>Card ending {card.last_four} · valid through {dateLabel(card.expiry_date)}. </>:null}Questions? Reply to this email or visit Contact Us with your tracking number.</p></div></div>;
}

const STATUSES=["Received","In progress","Resolved"];
/** Customer support inbox for rebate and card questions submitted through Contact Us. */
export function SupportInbox({data,go,reload,notify,readOnly}:Props){
  const tickets:Row[]=[...(data.support||[])].sort((a,b)=>b.date_submitted.localeCompare(a.date_submitted));
  const [filter,setFilter]=useState("Open"),[open,setOpen]=useState<Row|null>(null);
  const shown=tickets.filter(t=>filter==="All"||(filter==="Open"?t.status!=="Resolved":t.status===filter));
  const count=(s:string)=>tickets.filter(t=>t.status===s).length;
  return <><Title title="Customer support" sub="Rebate and Visa card questions from customers, answered by program staff."/>
    <div className="scenario-notice"><ShieldCheck size={17}/><span>Demo inbox: replies are saved to the request and recorded as simulated emails. Card balance and transaction questions would normally go to the card issuer&rsquo;s cardholder support.</span></div>
    <div className="scenario-metrics"><Metric label="New" value={String(count("Received"))} detail="Waiting for a first reply"/><Metric label="In progress" value={String(count("In progress"))} detail="Replied, not yet resolved"/><Metric label="Resolved" value={String(count("Resolved"))} detail="Closed requests"/><Metric label="Card questions" value={String(tickets.filter(t=>t.subject==="Visa card support").length)} detail="Visa card support subject"/></div>
    <section className="panel data-panel"><div className="tabs">{["Open","Received","In progress","Resolved","All"].map(s=><button key={s} className={filter===s?"active":""} onClick={()=>setFilter(s)}>{s}<span>{s==="All"?tickets.length:s==="Open"?tickets.length-count("Resolved"):count(s)}</span></button>)}</div>
      <div className="table-scroll"><table><thead><tr><th>Reference</th><th>Received</th><th>Customer</th><th>Subject</th><th>Rebate</th><th>Status</th><th></th></tr></thead><tbody>{shown.map(t=><tr key={t.id}>
        <td><button className="tracking-link" onClick={()=>setOpen(t)}>{t.reference}</button></td><td>{dateLabel(t.date_submitted)}</td><td>{t.name}<small className="muted"> · {t.email}</small></td><td>{t.subject}</td>
        <td>{linkedRebate(t,data)?<button className="tracking-link" onClick={()=>go(`/rebate/${linkedRebate(t,data)!.tracking_number}`)}>{linkedRebate(t,data)!.tracking_number}</button>:"—"}</td><td><Pill status={t.status.toUpperCase().replace(" ","_")}/></td>
        <td><button className="text-button" onClick={()=>setOpen(t)}>Open <ArrowUpRight size={13}/></button></td></tr>)}</tbody></table></div>
      {!shown.length&&<Empty title="Nothing here" text="No support requests match this filter."/>}
    </section>
    {open&&<Ticket key={open.id} ticket={tickets.find(t=>t.id===open.id)||open} data={data} go={go} reload={reload} notify={notify} readOnly={readOnly} onClose={()=>setOpen(null)}/>}
  </>;
}

/** The rebate a request is about: the tracking number given, or the customer's latest rebate by email. */
function linkedRebate(t:Row,data:Row):Row|undefined{
  const rebates:Row[]=data.rebates||[];
  return (t.tracking_number&&rebates.find(r=>r.tracking_number===t.tracking_number))||rebates.filter(r=>String(r.email).toLowerCase()===String(t.email).toLowerCase()).sort((a,b)=>b.date_submitted.localeCompare(a.date_submitted))[0];
}

function Ticket({ticket,data,go,reload,notify,readOnly,onClose}:Props&{ticket:Row,onClose:()=>void}){
  const [status,setStatus]=useState(ticket.status==="Received"?"In progress":ticket.status),[reply,setReply]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const rebate=linkedRebate(ticket,data),card=rebate?(data.rewards||[]).find((c:Row)=>c.id===`reward-${rebate.id}`):undefined;
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{await api({action:"support-update",id:ticket.id,status,reply});notify(`${ticket.reference} ${reply?"replied and ":""}marked ${status.toLowerCase()}.`);setReply("");await reload();}catch(err){setError((err as Error).message);}finally{setBusy(false);}}
  async function sendCard(){if(!rebate)return;setBusy(true);setError("");try{const r=await api({action:"send-card",tracking_number:rebate.tracking_number});notify(r.issued?`Card issued and emailed to ${rebate.email}.`:`Card email resent to ${rebate.email}.`);await reload();}catch(err){setError((err as Error).message);}finally{setBusy(false);}}
  return <Modal title={`${ticket.reference} · ${ticket.subject}`} onClose={onClose}>
    <div className="support-ticket">
      <div className="support-message"><span>{ticket.name} · {ticket.email} · {dateLabel(ticket.date_submitted)}</span><p>{ticket.message}</p></div>
      {(ticket.thread||[]).map((m:Row,i:number)=><div className="support-message reply" key={i}><span>{m.by} · {dateLabel(m.date)}</span><p>{m.text}</p></div>)}
      <div className="support-context">{rebate?<><div><b>Rebate {rebate.tracking_number}</b> <Pill status={rebate.status}/> <span>{money(rebate.rebate_amount)} · {rebate.reward_type||"Virtual"} card</span></div>
        <div>{card?<><CreditCard size={14}/> Card •••• {card.last_four} · <Pill status={card.status}/> · issued {dateLabel(card.date_issued)}</>:<span className="muted">{rebate.status==="APPROVED"?"Approved; no card issued yet.":"No card yet. Cards are issued on approval."}</span>}</div>
        <div className="row-actions"><button className="text-button" onClick={()=>{onClose();go(`/rebate/${rebate.tracking_number}`);}}>Open rebate <ArrowUpRight size={13}/></button>{!readOnly&&(card?card.reward_type==="Virtual":rebate.status==="APPROVED")&&<button className="text-button" disabled={busy} onClick={sendCard}><Mail size={13}/> {card?"Resend card email":"Issue card now"}</button>}</div></>
        :<span className="muted">No rebate found for this email or tracking number.</span>}</div>
      {!readOnly&&<form onSubmit={save}><label className="field"><span>Reply to customer</span><textarea rows={4} maxLength={5000} value={reply} onChange={e=>setReply(e.target.value)} placeholder={`Write to ${ticket.email}…`}/></label>
        <div className="support-actions"><label className="field"><span>Status</span><select value={status} onChange={e=>setStatus(e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>{error&&<div className="alert error">{error}</div>}<button className="button compact" disabled={busy}>{busy?<LoaderCircle className="spin" size={15}/>:<Send size={15}/>}{reply?"Send reply":"Update status"}</button></div></form>}
    </div>
  </Modal>;
}
