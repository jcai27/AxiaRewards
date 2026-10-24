import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.match(new URL(base).hostname,/^(127\.0\.0\.1|localhost)$/,'Run these mutating checks only against a local database.');
const executablePath=process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const runId=Date.now();let checks=0;
function pass(name){checks++;console.log(`PASS ${name}`);}
async function post(body,status=200){const r=await context.request.post(base+'/api/program',{data:body});assert.equal(r.status(),status,await r.text());return r.json();}
async function admin(){return (await context.request.get(base+'/api/program')).json();}
const claim=(tag,overrides={})=>({first_name:'Decision',last_name:`Test ${tag}`,email:`${tag}-${runId}@example.com`,phone:'(555) 010-4433',address1:`${runId%10000000} ${tag} Road`,city:'San Diego',state:'CA',zip:'92101',rebate_code:'AxiaSummer2026',dealer_name:'Axia By QCells',date_of_sale:'2026-09-01',pto_date:'2026-10-01',sales_rep_name:'Jordan Lee',certified_by:'Decision Test',reward_type:'Virtual',financier:'Cash',certified:true,preinstallation:false,...overrides});
try{
  await page.goto(base+'/signin-with-chatgpt?return_to=%2Fhome');await page.getByRole('heading',{name:'Automated decisions',exact:true}).waitFor();
  const before=await admin();assert.ok(before.automation,'admin payload reports automation state');
  let clean;
  try{
    await post({action:'set-automation',enabled:true});
    clean=await post({action:'submit-rebate',data:claim('clean')},201);assert.equal(clean.status,'APPROVED');
    const record=(await admin()).rebates.find(r=>r.tracking_number===clean.tracking_number);
    assert.equal(record.decision.source,'auto');assert.equal(record.decision.recommendation,'APPROVE');assert.deepEqual(record.decision.failed,[]);
    pass('a completed project that meets every threshold is approved on submission');

    await post({action:'set-automation',enabled:false});
    const paused=await post({action:'submit-rebate',data:claim('paused')},201);assert.equal(paused.status,'PENDING');
    pass('pausing automation leaves qualifying rebates in the review queue');
  }finally{await post({action:'set-automation',enabled:before.automation.enabled});}

  const badFinancier=await post({action:'submit-rebate',data:claim('financier',{financier:'Personal check'})},201);assert.equal(badFinancier.status,'PENDING');
  const late=await post({action:'submit-rebate',data:claim('late',{date_of_sale:'2026-01-05',pto_date:'2026-02-01'})},201);assert.equal(late.status,'PENDING');
  pass('rebates failing a threshold are held, never declined automatically');

  let data=await admin();const bad=data.rebates.find(r=>r.tracking_number===badFinancier.tracking_number),lateRow=data.rebates.find(r=>r.tracking_number===late.tracking_number);
  const mismatch=await post({action:'apply-recommendations',items:[{id:bad.id,recommendation:'APPROVE'}]});assert.equal(mismatch.applied,0);assert.equal(mismatch.skipped,1);
  const review=await post({action:'apply-recommendations',items:[{id:lateRow.id,recommendation:'DECLINE'}]});assert.equal(review.applied,0);
  pass('the server re-checks engine suggestions and refuses stale or mismatched ones');
  const applied=await post({action:'apply-recommendations',items:[{id:bad.id,recommendation:'DECLINE'}]});assert.equal(applied.applied,1);
  data=await admin();const declined=data.rebates.find(r=>r.id===bad.id);
  assert.equal(declined.status,'DECLINED');assert.equal(declined.decline_reason,'Invalid financier option');assert.equal(declined.decision.source,'engine');
  assert.equal((await post({action:'track',tracking_number:badFinancier.tracking_number})).decline_reason,'Invalid financier option');
  pass('accepting a decline suggestion records the engine reason and shows it in tracking');

  await page.goto(base+`/pending-rebates`);await page.getByRole('textbox',{name:'Search rebates',exact:true}).fill(late.tracking_number);await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByRole('cell',{name:'Filed within 180 days of PTO'}).click();
  await page.getByRole('heading',{name:'Decision Test late',exact:true}).waitFor();await page.getByRole('heading',{name:'Automated decision',exact:true}).waitFor();
  await page.getByText(/Submitted 2\d\d days after PTO/).waitFor();
  pass('clicking a queue row opens the rebate with every threshold explained');

  const today=data.today;
  const invoiceResult=await post({action:'create-invoice',from:today,to:today},201);const invoice=invoiceResult.invoice;
  assert.match(invoice.invoice_number,/^INV-\d{4}-\d{4}$/);assert.equal(invoice.status,'DRAFT');
  assert.ok(invoice.lines.some(l=>l.tracking_number===clean.tracking_number),'the auto-approved rebate is on the invoice');
  assert.equal(invoice.total,Number(invoice.lines.reduce((s,l)=>s+l.amount,0).toFixed(2)));
  data=await admin();assert.equal(data.rebates.find(r=>r.tracking_number===clean.tracking_number).program_invoice_number,invoice.invoice_number);
  await post({action:'create-invoice',from:today,to:today},400);
  pass('invoices bill approved rebates once and link each rebate to its invoice');

  await page.goto(base+`/invoices/${invoice.invoice_number}`);await page.getByRole('heading',{name:'Invoice',exact:true}).waitFor();
  await page.getByRole('button',{name:clean.tracking_number,exact:true}).waitFor();await page.getByRole('button',{name:'Print or save PDF'}).waitFor();
  pass('the invoice document lists its approved rebates');

  await post({action:'update-invoice',id:invoice.id,status:'PAID'},409);
  await post({action:'update-invoice',id:invoice.id,status:'ISSUED'});await post({action:'update-invoice',id:invoice.id,status:'PAID'});
  await post({action:'update-invoice',id:invoice.id,status:'VOID'},409);
  pass('invoice status follows draft, issued, paid and cannot be voided once paid');

  const voidable=(await post({action:'create-invoice',from:today,to:today},400));assert.match(voidable.error,/No approved rebates/);
  const extra=await post({action:'submit-rebate',data:claim('void')},201);
  if(extra.status==='APPROVED'){
    const second=(await post({action:'create-invoice',from:today,to:today},201)).invoice;
    await post({action:'update-invoice',id:second.id,status:'VOID'});
    data=await admin();assert.equal(data.rebates.find(r=>r.tracking_number===extra.tracking_number).program_invoice_id,undefined);
    pass('voiding an invoice releases its rebates to be invoiced again');
  }

  await page.setViewportSize({width:390,height:844});
  for(const path of [`/rebate/${late.tracking_number}`,`/invoices/${invoice.invoice_number}`,'/decision-rules','/invoices']){await page.goto(base+path);await page.waitForLoadState('networkidle');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,path);}
  pass('decision and invoice pages fit a 390px mobile viewport');
  assert.deepEqual(errors,[]);pass('no browser JavaScript errors');
  console.log(`${checks} decision checks passed.`);
}finally{await browser.close();}
