import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.match(new URL(base).hostname,/^(127\.0\.0\.1|localhost)$/);
const run=Date.now();
async function request(body,status=200,admin=false){const r=await fetch(base+'/api/program',{method:'POST',headers:{'Content-Type':'application/json',...(admin?{Cookie:'__sites_local_auth=1'}:{})},body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
const input={first_name:'Case',last_name:'Test',email:`workflow-${run}@example.com`,phone:'(555) 010-5050',address1:'456 Solar Street',city:'Phoenix',state:'AZ',zip:'85001',rebate_code:'6-moSpring',dealer_name:'Axia By QCells',date_of_sale:'2026-09-02',pto_date:'2026-10-02',sales_rep_name:'Jordan Lee',certified_by:'Case Test',reward_type:'Physical',financier:'Cash',certified:true,preinstallation:false};
await request({action:'submit-rebate',data:{...input,date_of_sale:'2099-01-01'}},400);
await request({action:'submit-rebate',data:{...input,pto_date:'2026-08-01'}},400);
await request({action:'submit-rebate',data:{...input,rebate_code:'DOES-NOT-EXIST'}},400);
const first=await request({action:'submit-rebate',data:input},201);assert.equal(first.status,'PENDING');
const second=await request({action:'submit-rebate',data:{...input,email:`workflow2-${run}@example.com`}},201);
const read=await fetch(base+'/api/program',{headers:{Cookie:'__sites_local_auth=1'}});const data=await read.json();const records=[first,second].map(s=>data.rebates.find(r=>r.tracking_number===s.tracking_number));
await request({action:'review',ids:records.map(r=>r.id),status:'DECLINED',reasons:{[records[0].id]:'Invalid Date of Sale'}},400,true);
assert.equal((await request({action:'track',tracking_number:first.tracking_number})).status,'PENDING');
const reasons=Object.fromEntries(records.map(r=>[r.id,'Invalid Date of Sale']));
const reviewed=await request({action:'review',ids:records.map(r=>r.id),status:'DECLINED',reasons},200,true);assert.equal(reviewed.count,2);
for(const s of [first,second]){const tracked=await request({action:'track',tracking_number:s.tracking_number});assert.equal(tracked.status,'DECLINED');assert.equal(tracked.decline_reason,'Invalid Date of Sale');}
const concurrent={...input,email:`concurrent-${run}@example.com`};const submissions=await Promise.all([1,2].map(()=>fetch(base+'/api/program',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit-rebate',data:concurrent})})));assert.deepEqual(submissions.map(r=>r.status).sort(),[201,409]);
await request({action:'update-referral',id:'referral-2',status:'INSTALLATION_COMPLETE'},200,true);
await request({action:'update-referral',id:'referral-2',status:'PROCESSED',reward_type:''},400,true);
await request({action:'update-referral',id:'referral-2',status:'PROCESSED',reward_type:'Physical'},200,true);
await request({action:'update-referral',id:'referral-2',status:'SHIPPED',reward_type:'Physical'},200,true);
const referral=await request({action:'track',tracking_number:'2000000001'});assert.equal(referral.status,'SHIPPED');assert.ok(referral.date_funded);assert.ok(referral.date_shipped);
const forged=await fetch(base+'/api/program',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://unrelated.example'},body:JSON.stringify({action:'track',tracking_number:first.tracking_number})});assert.equal(forged.status,403);
console.log('PASS installed submissions, date/code validation, all-or-nothing decline validation, two-record decline, concurrent duplicate protection, referral payment lifecycle, and cross-origin write rejection.');
