'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root=path.join(__dirname,'..');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'academy-pro-test-'));
const port=41000+Math.floor(Math.random()*7000);
const base='http://127.0.0.1:'+port;
const paymeKey='integration-test-key';
let proc;
let adminToken,studentToken,teacherToken;
let paidCourse,freeCourse,orderId;
async function http(url,method='GET',body,token){
  const response=await fetch(base+'/api'+url,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return { status:response.status, data:await response.json() };
}
async function payme(method,params,id=1,badKey=false){
  const result=await fetch(base+'/api/payments/payme',{
    method:'POST',headers:{'content-type':'application/json',authorization:'Basic '+Buffer.from('Paycom:'+(badKey?'wrong':paymeKey)).toString('base64')},
    body:JSON.stringify({method,params,id})
  });
  return {status:result.status,data:await result.json()};
}
test('API / Payme / chats / live scheduling integration', async t=>{
  proc=spawn(process.execPath,['server.js'],{
    cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:data,JWT_SECRET:'integration-only-secret-1234567890123456789012',
      ADMIN_EMAIL:'admin@markaz.uz',ADMIN_PASSWORD:'admin12345',PAYME_MERCHANT_ID:'test-merchant',PAYME_MERCHANT_KEY:paymeKey,
      NODE_ENV:'test',GEMINI_API_KEY:''},stdio:['ignore','pipe','pipe']
  });
  let logs='';proc.stdout.on('data',d=>logs+=d);proc.stderr.on('data',d=>logs+=d);
  t.after(()=>{proc.kill('SIGTERM');try{fs.rmSync(data,{recursive:true,force:true});}catch{}});
  let ready=false;
  for(let i=0;i<55;i++){
    if(proc.exitCode!==null)break;
    try{const r=await fetch(base+'/api/stats');if(r.ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,200));
  }
  assert.ok(ready,'Server did not become ready. Log: '+logs);
  await t.test('public catalog, login and register',async()=>{
    const s=await http('/stats');assert.equal(s.status,200);assert.ok(s.data.courses>=2);
    const courses=(await http('/courses')).data;paidCourse=courses.find(c=>c.price>0);freeCourse=courses.find(c=>c.price===0);
    assert.ok(paidCourse&&freeCourse);
    adminToken=(await http('/auth/login','POST',{email:'admin@markaz.uz',password:'admin12345'})).data.token;
    teacherToken=(await http('/auth/login','POST',{email:'teacher@markaz.uz',password:'teacher123'})).data.token;
    assert.ok(adminToken&&teacherToken);
    const r=await http('/auth/register','POST',{name:'Test Student',email:'test'+Date.now()+'@example.org',password:'StrongPass123'});
    assert.equal(r.status,200);studentToken=r.data.token;assert.equal(r.data.user.role,'student');
  });
  await t.test('paid-course enrollment cannot bypass Payme',async()=>{
    const no=await http('/courses/'+paidCourse.id+'/enroll','POST',{},studentToken);
    assert.equal(no.status,402);
    const yes=await http('/courses/'+freeCourse.id+'/enroll','POST',{},studentToken);
    assert.equal(yes.status,200);
    const checkout=await http('/payments/checkout','POST',{courseId:paidCourse.id},studentToken);
    assert.equal(checkout.status,200);assert.match(checkout.data.checkoutUrl,/checkout\.paycom\.uz/);
    orderId=checkout.data.orderId;assert.ok(orderId>0);
  });
  await t.test('Payme auth, amount, idempotent confirmation and course unlock',async()=>{
    const params={account:{order_id:String(orderId)},amount:paidCourse.price*100};
    const unauth=await payme('CheckPerformTransaction',params,11,true);
    assert.equal(unauth.status,200);assert.equal(unauth.data.error.code,-32504);
    const invalid=await payme('CheckPerformTransaction',{...params,amount:1},12);
    assert.equal(invalid.data.error.code,-31001);
    assert.equal((await payme('CheckPerformTransaction',params,13)).data.result.allow,true);
    const transaction='507f1f77bcf86cd799439010';
    const createParams={...params,id:transaction,time:Date.now()};
    const created=await payme('CreateTransaction',createParams,14);
    assert.equal(created.data.result.state,1);
    assert.equal((await payme('CreateTransaction',createParams,15)).data.result.state,1);
    const performed=await payme('PerformTransaction',{id:transaction},16);
    assert.equal(performed.data.result.state,2);
    assert.equal((await payme('PerformTransaction',{id:transaction},17)).data.result.state,2);
    const course=(await http('/courses/'+paidCourse.id,'GET',undefined,studentToken)).data;
    assert.equal(course.enrolled,true);
    const tx=await payme('CheckTransaction',{id:transaction},18);
    assert.equal(tx.data.result.state,2);
    const orders=(await http('/payments/my','GET',undefined,studentToken)).data;
    assert.ok(orders.some(o=>o.id===orderId && o.status==='paid'));
    const statement=(await payme('GetStatement',{from:0,to:Date.now()+10000},19)).data;
    assert.ok(statement.result.transactions.some(x=>x.id===transaction));
  });
  await t.test('messages authorization and persistence',async()=>{
    const send=await http('/chat/send','POST',{courseId:paidCourse.id,body:'Salom, ustoz!'},studentToken);
    assert.equal(send.status,200);assert.equal(send.data.body,'Salom, ustoz!');
    const messages=await http('/chat/course/'+paidCourse.id,'GET',undefined,studentToken);
    assert.ok(messages.data.some(m=>m.body==='Salom, ustoz!'));
    const contacts=(await http('/contacts','GET',undefined,studentToken)).data;
    assert.ok(contacts.some(u=>u.role==='teacher'));
  });
  await t.test('teacher schedule + start class, enrolled student may view',async()=>{
    const scheduled=await http('/live','POST',{courseId:paidCourse.id,title:'Integratsion sinov darsi',startsAt:new Date(Date.now()+3600000).toISOString(),durationMin:50},teacherToken);
    assert.equal(scheduled.status,200);const id=scheduled.data.id;
    const list=await http('/live','GET',undefined,studentToken);assert.ok(list.data.some(l=>l.id===id));
    const change=await http('/live/'+id+'/status','PUT',{status:'live'},teacherToken);
    assert.equal(change.status,200);
    const detail=await http('/live/'+id,'GET',undefined,studentToken);
    assert.equal(detail.data.status,'live');assert.equal(detail.data.canManage,false);
  });
  await t.test('administrator overview and payment list',async()=>{
    const overview=await http('/admin/overview','GET',undefined,adminToken);
    assert.equal(overview.status,200);assert.ok(overview.data.revenue>=paidCourse.price);
    assert.equal((await http('/admin/payments','GET',undefined,studentToken)).status,403);
    const orders=await http('/admin/payments','GET',undefined,adminToken);
    assert.ok(orders.data.some(o=>o.id===orderId));
  });
});
