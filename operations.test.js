'use strict';
/* Real HTTP integration tests; run with npm ci && npm test on a machine with npm packages installed. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.join(__dirname,'..');
test('operations: parent isolation, homework, schedules, money, certificate & tickets',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'edu-v4-')),port=51000+Math.floor(Math.random()*4000),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,NODE_ENV:'test',PORT:String(port),DATA_DIR:tmp,JWT_SECRET:'x'.repeat(48),ADMIN_EMAIL:'admin@markaz.uz',ADMIN_PASSWORD:'test-password-12345'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(tmp,{recursive:true,force:true});});
 let ok=false;for(let i=0;i<75;i++){try{if((await fetch(base+'/api/stats')).ok){ok=true;break;}}catch{}await new Promise(r=>setTimeout(r,180));}
 assert.ok(ok,'Server did not start '+logs);
 const api=async(url,method='GET',body,token)=>{const r=await fetch(base+'/api'+url,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const admin=(await api('/auth/login','POST',{email:'admin@markaz.uz',password:'test-password-12345'})).data.token;assert.ok(admin);
 const student=(await api('/auth/register','POST',{email:'student-ops@local.test',name:'Student Ops',password:'strong-test-123'})).data;
 const other=(await api('/auth/register','POST',{email:'other-ops@local.test',name:'Another Student',password:'strong-test-123'})).data;
 const make=async(role,name,email)=>{const r=await api('/admin/users','POST',{name,email,role,password:'strong-test-123'},admin);assert.equal(r.status,200);return (await api('/auth/login','POST',{email,password:'strong-test-123'})).data;};
 const parent=await make('parent','Parent Ops','parent-ops@local.test');
 const accountant=await make('accountant','Accountant Ops','accountant-ops@local.test');
 await t.test('parent cannot see another student; admin links explicitly',async()=>{
  assert.equal((await api('/ops/parent/children/'+student.user.id,'GET',undefined,parent.token)).status,403);
  assert.equal((await api('/ops/parents/link','POST',{parent_id:parent.user.id,student_id:student.user.id},student.token)).status,403);
  assert.equal((await api('/ops/parents/link','POST',{parent_id:parent.user.id,student_id:student.user.id},admin)).status,200);
  const list=(await api('/ops/parent/children','GET',undefined,parent.token)).data;assert.equal(list.length,1);assert.equal(list[0].id,student.user.id);
  assert.equal((await api('/ops/parent/children/'+other.user.id,'GET',undefined,parent.token)).status,403);
 });
 const free=(await api('/courses')).data.find(x=>x.price===0);assert.ok(free,'test seed must have a free course');
 assert.equal((await api('/courses/'+free.id+'/enroll','POST',{},student.token)).status,200);
 const group=(await api('/manage/groups','POST',{name:'Ops Group',course_id:free.id,capacity:20},admin)).data.id;
 assert.ok(group);assert.equal((await api('/manage/groups/'+group+'/students','POST',{student_id:student.user.id},admin)).status,200);
 await t.test('homework submissions are limited to enrolled group; grading is staff only',async()=>{
  const due=new Date(Date.now()+86400000).toISOString(),a=await api('/ops/assignments','POST',{group_id:group,title:'My Assignment',description:'Explain',due_at:due,max_score:10},admin);
  assert.equal(a.status,201);const id=a.data.id;
  assert.equal((await api('/ops/assignments/'+id+'/submit','POST',{answer:'I did it'},other.token)).status,403);
  assert.equal((await api('/ops/assignments/'+id+'/submit','POST',{answer:'Hello!'},student.token)).status,200);
  const sub=(await api('/ops/assignments/'+id+'/submissions','GET',undefined,admin)).data;
  assert.equal(sub.length,1);assert.equal((await api('/ops/submissions/'+sub[0].id+'/grade','PATCH',{score:8},student.token)).status,403);
  assert.equal((await api('/ops/submissions/'+sub[0].id+'/grade','PATCH',{score:8},admin)).status,200);
  assert.equal((await api('/ops/parent/children/'+student.user.id,'GET',undefined,parent.token)).data.grades[0].score,8);
 });
 await t.test('scheduler blocks teacher overlapping room',async()=>{
  const b={group_id:group,topic:'Lesson',room:'A-12',starts_at:'2027-03-03T09:00:00.000Z',ends_at:'2027-03-03T11:00:00.000Z'};
  assert.equal((await api('/ops/schedule','POST',b,admin)).status,201);
  assert.equal((await api('/ops/schedule','POST',{...b,topic:'Overlap',starts_at:'2027-03-03T10:00:00.000Z'},admin)).status,409);
  assert.equal((await api('/ops/schedule','POST',{...b,topic:'Next',starts_at:'2027-03-03T11:00:00.000Z',ends_at:'2027-03-03T12:00:00.000Z'},admin)).status,201);
 });
 await t.test('invoices and manually verified receipts are permissioned and idempotent',async()=>{
  assert.equal((await api('/ops/invoices','POST',{student_id:student.user.id,description:'Month fee',amount:100000,due_on:'2027-03-30'},student.token)).status,403);
  const invoice=await api('/ops/invoices','POST',{student_id:student.user.id,description:'Month fee',amount:100000,due_on:'2027-03-30'},accountant.token);
  assert.equal(invoice.status,201);const id=invoice.data.id;
  assert.equal((await api('/ops/receipts','POST',{invoice_id:id,amount:40000,method:'cash',reference:'CASH-OPS-001'},student.token)).status,403);
  assert.equal((await api('/ops/receipts','POST',{invoice_id:id,amount:40000,method:'cash',reference:'CASH-OPS-001'},accountant.token)).status,201);
  assert.equal((await api('/ops/receipts','POST',{invoice_id:id,amount:40000,method:'cash',reference:'CASH-OPS-001'},accountant.token)).status,409);
  assert.equal((await api('/ops/receipts','POST',{invoice_id:id,amount:70000,method:'cash',reference:'CASH-OPS-002'},accountant.token)).status,400);
  const my=(await api('/ops/invoices','GET',undefined,student.token)).data.find(x=>x.id===id);assert.equal(my.paid,40000);assert.equal(my.balance,60000);
  const finance=(await api('/ops/finance','GET',undefined,accountant.token)).data;assert.ok(finance.received>=40000);
 });
 await t.test('certificates and user-owned support tickets',async()=>{
  const cert=await api('/ops/certificates','POST',{student_id:student.user.id,course_id:free.id},admin);assert.equal(cert.status,201);
  const check=await api('/public/certificate/'+cert.data.public_id);assert.equal(check.status,200);assert.equal(check.data.student_name,'Student Ops');
  assert.equal((await api('/ops/certificates','POST',{student_id:other.user.id,course_id:free.id},admin)).status,400);
  const ticket=await api('/ops/tickets','POST',{subject:'Help needed',message:'Could you help?'},student.token);assert.equal(ticket.status,201);
  assert.equal((await api('/ops/tickets','GET',undefined,other.token)).data.length,0);
  assert.equal((await api('/ops/tickets/'+ticket.data.id,'PATCH',{status:'resolved',admin_reply:'Done'},admin)).status,200);
 });
});
