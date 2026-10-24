import assert from 'node:assert/strict';
const base=process.env.ROLE_TEST_URL||'http://127.0.0.1:8787';
assert.match(new URL(base).hostname,/^(127\.0\.0\.1|localhost)$/,'Role checks must only run against a local built Worker.');
const owner={'oai-authenticated-user-id':'local_seedy','oai-authenticated-user-email':'seedy@sites.test'};
const run=Date.now();const viewer={'oai-authenticated-user-id':`viewer-${run}`,'oai-authenticated-user-email':`viewer-${run}@example.com`};
async function request(headers,body,status=200){const r=await fetch(base+'/api/program',{headers:{...headers,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
await request({},undefined,401);
const invite=await request(owner,{action:'save-user',data:{name:'View Only Test',email:viewer['oai-authenticated-user-email'],role:'Client View Only',status:'Active',dealer_name:'Axia By QCells'}});
const token=new URL(invite.invitation_url).searchParams.get('token');
await request({...viewer,'oai-authenticated-user-email':'wrong@example.com'},{action:'accept-invite',token},403);
await request(viewer,{action:'accept-invite',token});
await request(viewer,{action:'accept-invite',token},400);
const data=await request(viewer);assert.equal(data.currentUser.role,'Client View Only');
for(const body of [{action:'review',ids:['rebate-52'],status:'APPROVED'},{action:'upload',kind:'codes',csv:'rebate_code,rebate_amount\nNOT-ALLOWED,50'},{action:'save-user',data:{}},{action:'save-promotion',expected_revision:0,data:{}},{action:'update-referral',id:'referral-2',status:'DISQUALIFIED'},{action:'resend-invite',id:invite.user.id}])await request(viewer,body,403);
await request(owner,{action:'save-user',id:invite.user.id,data:{name:'View Only Test',email:viewer['oai-authenticated-user-email'],role:'Client View Only',status:'Inactive',dealer_name:'Axia By QCells'}});
await request(viewer,undefined,403);
console.log('PASS invitation email binding, one-time acceptance, view-only reads, six write restrictions, and inactive account rejection.');
