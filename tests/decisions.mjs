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
  await page.getByRole('button',{name:/Decision Test late.*Filed within 180 days of PTO/}).click();
  const record=page.getByRole('article',{name:`Decision record for rebate ${late.tracking_number}`});await record.waitFor();
  await record.getByText('Decision Test late').waitFor();await record.getByRole('heading',{name:'Rebate decision record',exact:true}).waitFor();
  await record.getByText('Held · needs review').waitFor();
  await page.getByText(/Submitted 2\d\d days after PTO/).waitFor();
  pass('selecting a held rebate opens its decision record with every condition explained');
  await page.goto(base+`/rebate/${late.tracking_number}`);await page.getByRole('heading',{name:'Rebate decision record',exact:true}).waitFor();await page.getByRole('heading',{name:'Installation and purchase',exact:true}).waitFor();
  pass('the full rebate record shows the decision letter and its data');

  const outside=await post({action:'submit-rebate',data:claim('campaign',{date_of_sale:'2025-10-01',pto_date:'2025-11-01'})},201);assert.equal(outside.status,'PENDING');
  data=await admin();const outsideRow=data.rebates.find(r=>r.tracking_number===outside.tracking_number);
  assert.equal(outsideRow.crm_source,'demo-simulated');assert.ok(data.serial_file.includes(outsideRow.module_serial),'new claims join the serial file');
  pass('a sale outside the campaign dates is held instead of approved');
  await page.goto(base+'/pending-rebates?rule=campaign');await page.getByRole('heading',{name:'Review queue',exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Search rebates',exact:true}).fill(outside.tracking_number);await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByRole('button',{name:/Decision Test campaign/}).click();
  const held=page.getByRole('article',{name:`Decision record for rebate ${outside.tracking_number}`});await held.waitFor();
  await held.getByText('Sale outside campaign dates · condition 5').waitFor();
  await held.getByRole('button',{name:'Decline rebate',exact:true}).click();
  assert.equal(await page.getByRole('dialog').getByRole('combobox').inputValue(),'Sale outside campaign dates');
  await page.getByRole('button',{name:'Confirm decline',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
  await held.waitFor({state:'detached'});
  assert.equal(await page.getByRole('button',{name:/Decision Test campaign/}).count(),0,'the decided rebate leaves the queue');
  assert.equal((await post({action:'track',tracking_number:outside.tracking_number})).decline_reason,'Sale outside campaign dates');
  pass('deciding from the decision record saves the engine reason and moves on to the next held rebate');

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

  await page.goto(base+'/pending-rebates');await page.locator('.q-open[aria-current="true"]').waitFor();
  await page.locator('.record-body').evaluate(el=>el.scrollTop=el.scrollHeight);
  await page.keyboard.press('j');
  assert.equal(await page.locator('.record-body').evaluate(el=>el.scrollTop),0,'a new selection starts at the first condition');
  for(let i=0;i<44;i++)await page.keyboard.press('j');
  assert.ok(await page.locator('.q-open').count()>40,'keyboard navigation reveals rows beyond the initial page');
  assert.equal(await page.locator('.q-open[aria-current="true"]').evaluate(el=>{const r=el.getBoundingClientRect(),q=el.closest('.queue-list').getBoundingClientRect();return r.top>=q.top-1&&r.bottom<=q.bottom+1;}),true,'selected row stays visible');
  assert.equal(await page.locator('.record-actions').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),true,'decision actions stay visible');
  pass('keyboard navigation keeps decision actions and queue selection visible beyond the first 40 rows');

  await page.setViewportSize({width:390,height:844});
  for(const path of [`/rebate/${late.tracking_number}`,`/invoices/${invoice.invoice_number}`,'/decision-rules','/invoices']){await page.goto(base+path);await page.waitForLoadState('networkidle');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,path);}
  pass('decision and invoice pages fit a 390px mobile viewport');
  assert.deepEqual(errors,[]);pass('no browser JavaScript errors');
  console.log(`${checks} decision checks passed.`);
}finally{await browser.close();}
