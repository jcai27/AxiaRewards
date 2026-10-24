import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {chromium} from 'playwright';

// Load the same pure engine without framework/browser globals or a separate TS runner.
const require=createRequire(import.meta.url);
const moduleURL=(path,replacements=[])=>{
  let source=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  for(const [a,b]of replacements)source=source.replace(a,b);
  return 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
};
const policies=moduleURL('../lib/promotion-policy.ts',[['"zod"',JSON.stringify(pathToFileURL(require.resolve('zod')).href)]]);
const {defaultPromotionPolicy}=await import(policies);
const {decisionContext,evaluate}=await import(moduleURL('../lib/decision.ts',[['"./promotion-policy"',JSON.stringify(policies)]]));
let checks=0;const pass=name=>{console.log('PASS '+name);checks++;};
const defaults=defaultPromotionPolicy();
const code={id:'unit-code',rebate_code:'UNIT',rebate_amount:750,active:true,start_date:'2025-01-01',end_date:'2027-12-31',policy:defaults,policy_revision:1};
const rebate={id:'unit-rebate',rebate_code:'UNIT',rebate_amount:750,date_of_sale:'2026-05-01',pto_date:'2026-08-01',date_submitted:'2026-09-15',proof_of_purchase:'2026-05-01',crm_install_status:'INSTALLED',module_serial:'UNIT-SERIAL',certified_by:'Unit Test',financier:'Cash',system_size_kw:5,state:'TX',risk_level:'LOW'};
const run=(overrides={},claim={})=>{const c={...code,...overrides,policy:{...defaults,...overrides.policy}};const r={...rebate,...claim};return evaluate(r,decisionContext({codes:[c],rebates:[r],serial_file:['UNIT-SERIAL']},'2026-10-24'));};
assert.equal(run().recommendation,'APPROVE');
assert.equal(run({policy:{submission_window_days:30}}).checks.find(c=>c.id==='window').status,'warn');
assert.equal(run({policy:{submission_window_days:30,late_submission_action:'DECLINE'}}).recommendation,'DECLINE');
assert.equal(run({policy:{submission_window_days:45}}).checks.find(c=>c.id==='window').status,'pass');pass('each promotion enforces its own filing window, inclusive boundary and late action');
assert.equal(run({policy:{min_system_size_kw:6}}).checks.find(c=>c.id==='system').status,'fail');
assert.equal(run({policy:{min_system_size_kw:5}}).checks.find(c=>c.id==='system').status,'pass');
assert.equal(run({policy:{min_system_size_kw:6}},{system_size_kw:undefined}).checks.find(c=>c.id==='system').status,'warn');
assert.equal(run({policy:{eligible_states:['CA']}}).checks.find(c=>c.id==='state').status,'fail');
assert.equal(run({policy:{allowed_financiers:['Solar loan']}}).checks.find(c=>c.id==='financier').status,'fail');
assert.equal(run({policy:{min_system_size_kw:6,eligibility_action:'REVIEW'}}).recommendation,'REVIEW');pass('size, states and financing apply per code; missing size needs review');
const optional=run({policy:{require_proof:false,require_crm:false,require_serial:false}},{proof_of_purchase:null,crm_install_status:null,module_serial:null});
assert.equal(optional.recommendation,'APPROVE');assert.ok(optional.checks.find(c=>c.id==='proof').notRequired);
assert.equal(run({policy:{require_proof:false,require_crm:false,require_serial:false}},{payment_hold:true}).recommendation,'REVIEW');
assert.equal(run({policy:{require_proof:false}},{pto_date:null}).recommendation,'DECLINE');pass('optional evidence is explicit while PTO and fraud safeguards remain required');

const base=process.env.TEST_URL||'http://127.0.0.1:5173';assert.match(new URL(base).hostname,/^(127\.0\.0\.1|localhost)$/);
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const post=async(body,status=200)=>{const r=await context.request.post(base+'/api/program',{data:body});const d=await r.json();assert.equal(r.status(),status,JSON.stringify(d));return d;};
const admin=async()=>{const r=await context.request.get(base+'/api/program');assert.equal(r.status(),200);return r.json();};
const runId=Date.now();let originalPlus;
try{
  await page.goto(base+'/signin-with-chatgpt?return_to=%2Fpromotion-codes');await page.getByRole('heading',{name:'Promotion settings',exact:true}).waitFor();
  let data=await admin();originalPlus=data.codes.find(c=>c.id==='promo-plus');assert.ok(originalPlus);
  assert.equal(data.codes.find(c=>c.id==='promo-flex').policy.submission_window_days,180);
  assert.equal(data.codes.find(c=>c.id==='promo-storage').policy.auto_approve,false);
  assert.equal(data.rebates.filter(r=>r.promotion_demo).length,6);pass('additive demo includes three distinct policies and six linked claims');

  await page.getByRole('button',{name:/^AXIA-PLUS-2026/}).click();
  const deadline=page.getByRole('spinbutton',{name:'Submission deadline (days after PTO)'});
  await deadline.fill('30');await page.locator('.promotion-preview').getByText('Filed within 30 days of PTO',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Save promotion',exact:true}).click();
  await page.locator('.promotion-heading p').filter({hasText:`Revision ${originalPlus.policy_revision+1}`}).waitFor();
  data=await admin();assert.equal(data.codes.find(c=>c.id==='promo-plus').policy.submission_window_days,30);
  assert.equal(data.codes.find(c=>c.id==='promo-flex').policy.submission_window_days,180);pass('UI previews unsaved thresholds, saves one code and leaves other codes unchanged');
  const payload=c=>({rebate_code:c.rebate_code,title:c.title||c.rebate_code,rebate_amount:c.rebate_amount,start_date:c.start_date,end_date:c.end_date,active:c.active,policy:c.policy||defaults});
  await post({action:'save-promotion',id:originalPlus.id,expected_revision:originalPlus.policy_revision,data:payload(originalPlus)},409);
  const current=data.codes.find(c=>c.id==='promo-plus');
  for(const policy of [{...current.policy,submission_window_days:0},{...current.policy,allowed_financiers:[]},{...current.policy,eligible_states:['XX']}])await post({action:'save-promotion',id:current.id,expected_revision:current.policy_revision,data:{...payload(current),policy}},400);
  pass('server rejects stale settings, invalid thresholds, empty financing and invalid states');

  const promotion={rebate_code:`TEST-${runId}`,title:'Promotion integration test',rebate_amount:750,start_date:'2025-01-01',end_date:'2027-12-31',active:true,policy:{...defaults,auto_approve:false}};
  const created=(await post({action:'save-promotion',expected_revision:0,data:promotion},201)).promotion;
  const claim=tag=>({first_name:'Policy',last_name:'Test '+tag,email:`policy-${runId}-${tag}@example.com`,phone:'555-010-7700',address1:`${runId%1000000} ${tag} Policy Road`,city:'San Diego',state:'CA',zip:'92101',rebate_code:created.rebate_code,dealer_name:'Axia By QCells',date_of_sale:'2026-09-01',pto_date:'2026-10-01',sales_rep_name:'Jordan Lee',certified_by:'Policy Test',reward_type:'Virtual',financier:'Cash',certified:true,preinstallation:false});
  const manual=await post({action:'submit-rebate',data:claim('manual')},201);assert.equal(manual.status,'PENDING');
  await post({action:'run-engine'});data=await admin();const manualRow=data.rebates.find(r=>r.tracking_number===manual.tracking_number);assert.equal(manualRow.status,'PENDING');pass('code-level manual approval survives submission and a program-wide engine run');
  const approved=await post({action:'apply-recommendations',items:[{id:manualRow.id,recommendation:'APPROVE'}]});assert.equal(approved.applied,1);
  await post({action:'save-promotion',id:created.id,expected_revision:created.policy_revision,data:{...promotion,policy:{...defaults,submission_window_days:1}}});
  data=await admin();const decided=data.rebates.find(r=>r.id===manualRow.id);assert.equal(decided.status,'APPROVED');assert.equal(decided.decision.promotion_policy.settings.submission_window_days,180);
  await page.goto(base+'/rebate/'+manual.tracking_number);await page.getByText('Promotion settings revision 1 · Recorded at decision').waitFor();await page.getByText('Filed within 180 days of PTO',{exact:true}).waitFor();pass('completed decisions preserve policy revision and original check evidence after policy edits');
  const held=await post({action:'submit-rebate',data:claim('late')},201);assert.equal(held.status,'PENDING');
  const now=data.codes.find(c=>c.id===created.id);
  await post({action:'upload',kind:'codes',csv:`rebate_code,rebate_amount,active,start_date,end_date\n${created.rebate_code},800,true,2025-01-01,2027-12-31`});data=await admin();assert.deepEqual(data.codes.find(c=>c.id===created.id).policy,now.policy);pass('new claims use saved thresholds and CSV updates preserve per-code policy');

  await page.goto(base+'/promotion-codes?code=AXIA-PLUS-2026');await page.getByRole('button',{name:/Review \d+ pending/}).click();
  await page.getByRole('heading',{name:'Review queue',exact:true}).waitFor();assert.ok((await page.locator('.queue-head').innerText()).includes('AXIA-PLUS-2026'));
  await page.goto(base+'/promotion-codes');await page.setViewportSize({width:390,height:844});await page.getByRole('heading',{name:'Promotion settings',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);pass('promotion links filter the queue and settings fit a 390px viewport');
  assert.deepEqual(errors,[]);pass('promotion editor and previews have no browser errors');
}finally{
  if(originalPlus){const d=await admin(),c=d.codes.find(c=>c.id===originalPlus.id);await post({action:'save-promotion',id:c.id,expected_revision:c.policy_revision,data:{rebate_code:c.rebate_code,title:originalPlus.title,rebate_amount:originalPlus.rebate_amount,start_date:originalPlus.start_date,end_date:originalPlus.end_date,active:originalPlus.active,policy:originalPlus.policy}});}
  await browser.close();
}
console.log(`${checks} promotion checks passed.`);
