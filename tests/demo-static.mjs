// Checks the browser-only GitHub Pages build. Run `npm run build:demo` and
// `npm run preview:demo` first; DEMO_URL overrides the preview address.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=(process.env.DEMO_URL||'http://127.0.0.1:4173/AxiaRewards').replace(/\/$/,'');
const executablePath=process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!/401|Unauthorized|Failed to load resource/.test(m.text()))errors.push(m.text());});
const runId=Date.now();let checks=0;
function pass(name){checks++;console.log(`PASS ${name}`);}
for(let i=0;i<30;i++){try{const r=await fetch(base+'/');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,1000));}
try{
  await page.goto(base+'/');await page.getByRole('heading',{name:/Claim your Axia/}).waitFor();
  await page.getByRole('img',{name:'Axia by Qcells'}).first().waitFor();
  pass('consumer home renders with the Axia logo');

  await page.getByRole('button',{name:'Redeem your rebate',exact:true}).click();
  await page.getByRole('button',{name:/Yes, I'm all set/}).click();
  await page.getByRole('button',{name:/No, let's get started/}).click();
  const fields={first_name:'Static',last_name:`Demo ${runId}`,email:`static-${runId}@example.com`,phone:'(555) 010-2211',address1:`${runId%10000000} Pages Way`,city:'San Diego',zip:'92101',date_of_sale:'2026-09-01',pto_date:'2026-10-01',sales_rep_name:'Jordan Lee',certified_by:'Static Demo'};
  for(const [name,value] of Object.entries(fields))await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('[name="state"]').selectOption('CA');await page.locator('[name="rebate_code"]').fill('axiasummer2026');await page.locator('[name="financier"]').selectOption('Cash');await page.locator('[name="certified"]').check();
  await page.getByRole('button',{name:/Submit my rebate/}).click();
  await page.getByRole('heading',{name:"You're on your way to a reward.",exact:true}).waitFor();
  const tracking=await page.locator('.tracking-result strong').innerText();assert.match(tracking,/^\d{10}$/);
  await page.locator('.submission-success .pill.approved').waitFor();
  pass('a completed project submitted in the browser is approved automatically');

  await page.goto(base+'/track-payment');await page.locator('[name="tracking_number"]').fill(tracking);await page.getByRole('button',{name:'Track payment',exact:true}).click();
  await page.locator('.track-result .pill.approved').waitFor();
  pass('tracking reads the rebate back from the in-browser database');

  await page.goto(base+'/home');await page.getByRole('heading',{name:'Administrator access'}).waitFor();
  await page.getByRole('link',{name:/Sign in/}).click();await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();
  await page.fill('#username','demo');await page.fill('#password','wrong');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('alert').waitFor();
  await page.fill('#password','demo');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:'Automated decisions',exact:true}).waitFor();assert.ok(page.url().endsWith('/AxiaRewards/home'),page.url());
  pass('demo/demo signs in to the admin portal and wrong passwords are refused');

  await page.getByRole('link',{name:/Review queue/}).click();await page.getByRole('heading',{name:'Review queue',exact:true}).waitFor();
  assert.ok(page.url().includes('/AxiaRewards/pending-rebates'),page.url());
  await page.locator('.q-open').nth(1).click();
  await page.getByRole('heading',{name:'Rebate decision record',exact:true}).waitFor();
  await page.locator('.q-item.selected').nth(0).waitFor();
  pass('the review queue opens a rebate with its threshold checks');

  await page.goto(base+'/promotion-codes?code=AXIA-PLUS-2026');
  await page.getByRole('heading',{name:'Promotion settings',exact:true}).waitFor();
  assert.equal(await page.getByRole('spinbutton',{name:'Submission deadline (days after PTO)'}).inputValue(),'60');
  await page.getByRole('spinbutton',{name:'Submission deadline (days after PTO)'}).fill('30');
  await page.locator('.promotion-preview').getByText('Filed within 30 days of PTO',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Save promotion',exact:true}).click();
  await page.locator('.promotion-heading p').filter({hasText:'Revision 2'}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'Promotion settings',exact:true}).waitFor();
  assert.equal(await page.getByRole('spinbutton',{name:'Submission deadline (days after PTO)'}).inputValue(),'30');
  pass('per-promotion settings preview, save and persist in the browser demo');
  await page.getByRole('button',{name:/^AXIA-FLEX-2026/}).click();
  assert.equal(await page.getByRole('spinbutton',{name:'Submission deadline (days after PTO)'}).inputValue(),'180');
  await page.getByRole('button',{name:/^AXIA-STORAGE-2026/}).click();
  assert.equal(await page.getByRole('checkbox',{name:/Automatically approve qualifying rebates/}).isChecked(),false);
  pass('demo promotion codes keep independent thresholds and approval modes');

  await page.goto(base+'/invoices');await page.getByRole('heading',{name:'Invoices',exact:true}).waitFor();
  await page.getByRole('button',{name:'Create invoice',exact:true}).click();
  await page.getByRole('heading',{name:'Invoice',exact:true}).waitFor();
  const number=page.url().split('/').pop();assert.match(number,/^INV-\d{4}-\d{4}$/);
  await page.getByRole('button',{name:tracking,exact:true}).waitFor();
  pass('creating an invoice bills the browser-approved rebate');

  await page.reload();await page.getByRole('heading',{name:'Invoice',exact:true}).waitFor();
  await page.goto(base+'/invoices');await page.getByRole('button',{name:number,exact:true}).waitFor();
  pass('data persists across reloads in this browser');

  await page.setViewportSize({width:390,height:844});
  for(const path of ['/','/rebate-request','/home','/pending-rebates',`/invoices/${number}`]){await page.goto(base+path);await page.waitForLoadState('networkidle');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,path);}
  pass('demo pages fit a 390px mobile viewport');

  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Reset demo',exact:true}).click();
  await page.getByRole('heading',{name:/Claim your Axia/}).waitFor();
  await page.goto(base+'/home');await page.getByRole('heading',{name:'Administrator access'}).waitFor();
  pass('resetting the demo clears data and signs out');
  assert.deepEqual(errors,[]);pass('no browser JavaScript errors');
  console.log(`${checks} static demo checks passed.`);
}finally{await browser.close();}
