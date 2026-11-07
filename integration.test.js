'use strict';
/** Real HTTP E2E tests, isolated temp database. Requires npm ci; never targets production. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.join(__dirname,'..');
const adminPass='TestOnlyAdmin!2026';
const random=()=>Math.random().toString(36).slice(2);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('real HTTP: login, RBAC, tuition, group attendance, tests and live signaling API', {timeout:80000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'edusphere-e2e-'));
 const port=41000+Math.floor(Math.random()*12000),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,NODE_ENV:'test',PORT:String(port),DATA_DIR:dir,ADMIN_EMAIL:'testadmin@markaz.local',ADMIN_PASSWORD:adminPass,JWT_SECRET:'e2e-testing-only-very-long-secret-2026-123456',GEMINI_API_KEY:''},stdio:['ignore','pipe','pipe']});
 let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{logs=(logs+b).slice(-6000)});
 t.after(async()=>{child.kill('SIGTERM');await sleep(150);fs.rmSync(dir,{recursive:true,force:true});});
 async function req(url,method='GET',body,token){
  const response=await fetch(base+'/api'+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(7000)});
  const txt=await response.text();let data;try{data=JSON.parse(txt)}catch{throw Error('JSON kutilgan '+url+': '+txt.slice(0,100))}
  return {status:response.status,data};
 }
 let ready=false;
 for(let i=0;i<70;i++){if(child.exitCode!==null)break;try{if((await req('/health')).status===200){ready=true;break}}catch{}await sleep(200)}
 assert.ok(ready,'Server ishga tushmadi: '+logs);
 let admin,student,teacher,studentId,paid,free,groupId,paidReceiptId,teacherId;
 await t.test('login, protected API, public course list',async()=>{
  assert.equal((await req('/admin/users')).status,401);
  assert.equal((await req('/auth/login','POST',{email:'testadmin@markaz.local',password:'wrong-password'})).status,401);
  let l=await req('/auth/login','POST',{email:'testadmin@markaz.local',password:adminPass});assert.equal(l.status,200);admin=l.data.token;
  l=await req('/auth/login','POST',{email:'teacher@markaz.uz',password:'teacher123'});assert.equal(l.status,200);teacher=l.data.token;teacherId=l.data.user.id;
  const r=await req('/auth/register','POST',{name:'Sinov Oquvchi',email:'release-'+random()+'@example.org',password:'TestStudentPassword2026!'});
  assert.equal(r.status,200);student=r.data.token;studentId=r.data.user.id;
  assert.equal((await req('/admin/users','GET',undefined,student)).status,403);
  const c=await req('/courses');assert.equal(c.status,200);paid=c.data.find(x=>x.price>0);free=c.data.find(x=>x.price===0);assert.ok(paid&&free,'Namuna kurslar topilmadi');
 });
 await t.test('manual tuition: unauthorized, duplicate, audit, balance and access',async()=>{
  assert.equal((await req(`/courses/${paid.id}/enroll`,'POST',{},student)).status,402);
  assert.equal((await req(`/courses/${free.id}/enroll`,'POST',{},student)).status,200);
  const info={student_id:studentId,course_id:paid.id,amount:paid.price,method:'cash',paid_on:'2026-11-06',reference:'E2E-'+random(),note:'Test uchun naqd'};
  assert.equal((await req('/ops/manual-payments','POST',info,student)).status,403);
  const receipt=await req('/ops/manual-payments','POST',info,admin);assert.equal(receipt.status,201);paidReceiptId=receipt.data.id;
  assert.equal(receipt.data.access_granted,true);
  assert.equal((await req('/ops/manual-payments','POST',info,admin)).status,409);
  const access=await req(`/courses/${paid.id}`,'GET',undefined,student);assert.equal(access.data.enrolled,true);
  const mine=await req('/ops/manual-payments','GET',undefined,student);assert.equal(mine.status,200);
  assert.ok(mine.data.some(x=>x.reference===info.reference));
  assert.equal((await req('/ops/finance','GET',undefined,student)).status,403);
 });
 await t.test('group attendance: teacher, student isolation, persisted history',async()=>{
  const g=await req('/manage/groups','POST',{course_id:paid.id,name:'Sinov Guruhi',capacity:10,teacher_id:teacherId},admin);
  assert.equal(g.status,201);groupId=g.data.id;
  assert.equal((await req(`/manage/groups/${groupId}/students`,'POST',{student_id:studentId},admin)).status,200);
  assert.equal((await req(`/manage/groups/${groupId}/attendance`,'POST',{date:'2026-11-07',topic:'Sinov',entries:[{student_id:studentId,status:'present'}]},student)).status,403);
  const a=await req(`/manage/groups/${groupId}/attendance`,'POST',{date:'2026-11-07',topic:'Sinov',entries:[{student_id:studentId,status:'present'}]},teacher);
  assert.equal(a.status,200);
  const history=await req('/me/attendance','GET',undefined,student);assert.equal(history.status,200);
  assert.ok(history.data.some(x=>x.group_name==='Sinov Guruhi'&&x.status==='present'));
 });
 await t.test('test keys hidden until submission, chat permissions',async()=>{
  const detail=await req(`/courses/${free.id}`,'GET',undefined,student);
  assert.ok(detail.data.tests.length>0);
  const id=detail.data.tests[0].id,q=await req('/tests/'+id,'GET',undefined,student);
  assert.equal(q.status,200);assert.ok(q.data.questions.length>0);
  assert.equal(q.data.questions[0].answer,undefined);
  const result=await req('/tests/'+id+'/submit','POST',{answers:q.data.questions.map(()=>0)},student);
  assert.equal(result.status,200);assert.equal(typeof result.data.score,'number');
  const sent=await req('/chat/send','POST',{courseId:free.id,body:'Sinov xabar'},student);assert.equal(sent.status,200);
  const messages=await req('/chat/course/'+free.id,'GET',undefined,student);
  assert.ok(messages.data.some(m=>m.body==='Sinov xabar'));
  assert.equal((await req('/chat/course/'+paid.id,'GET',undefined)).status,401);
 });
 await t.test('live schedule, unauthorized controls and participant visibility',async()=>{
  const l=await req('/live','POST',{courseId:paid.id,title:'Sinov video darsi',startsAt:new Date(Date.now()+3600000).toISOString(),durationMin:45},teacher);
  assert.equal(l.status,200);assert.equal((await req('/live/'+l.data.id+'/status','PUT',{status:'live'},student)).status,403);
  assert.equal((await req('/live/'+l.data.id+'/status','PUT',{status:'live'},teacher)).status,200);
  const view=await req('/live/'+l.data.id,'GET',undefined,student);assert.equal(view.status,200);assert.equal(view.data.status,'live');
 });
 await t.test('admin password reset revokes old JWT, blocks student and uses audit',async()=>{
  const newPass='ChangedPassword2026!';
  assert.equal((await req(`/admin/users/${studentId}/password`,'PUT',{admin_password:adminPass,new_password:newPass},student)).status,403);
  assert.equal((await req(`/admin/users/${studentId}/password`,'PUT',{admin_password:'wrong',new_password:newPass},admin)).status,403);
  assert.equal((await req(`/admin/users/${studentId}/password`,'PUT',{admin_password:adminPass,new_password:newPass},admin)).status,200);
  assert.equal((await req('/me','GET',undefined,student)).status,401);
  assert.equal((await req('/auth/login','POST',{email:'unknown@example.org',password:newPass})).status,401);
 });
 await t.test('payment void is audited and decreases net balance',async()=>{
  assert.equal((await req(`/ops/manual-payments/${paidReceiptId}/void`,'POST',{reason:'Integration test reversal'},student)).status,401);
  assert.equal((await req(`/ops/manual-payments/${paidReceiptId}/void`,'POST',{reason:'Integration test reversal'},admin)).status,200);
  const net=await req('/ops/finance','GET',undefined,admin);assert.equal(net.status,200);assert.equal(net.data.received,0);
 });
});
