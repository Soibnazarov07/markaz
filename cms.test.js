'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.join(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'edusphere-cms-'));
const port=47000+Math.floor(Math.random()*5000),base='http://127.0.0.1:'+port;
const api=async(p,method='GET',body,token)=>{const r=await fetch(base+'/api'+p,{method,headers:{'content-type':'application/json',...(token?{'authorization':'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
test('CMS, advertising, branches, leads, public tests, groups & attendance',async t=>{
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:temp,NODE_ENV:'test',ADMIN_EMAIL:'admin@markaz.uz',ADMIN_PASSWORD:'test-password-for-cms',JWT_SECRET:'test-secret-for-cms-123456789123456789'},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  t.after(()=>{child.kill('SIGTERM');fs.rmSync(temp,{recursive:true,force:true});});
  let ready=false;for(let i=0;i<70;i++){try{if((await fetch(base+'/api/public/site')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,180));}
  assert.ok(ready,'Server failed to start: '+logs);
  const admin=(await api('/auth/login','POST',{email:'admin@markaz.uz',password:'test-password-for-cms'})).data.token;
  assert.ok(admin);
  const guest=await api('/admin/articles');assert.equal(guest.status,401);
  const student=(await api('/auth/register','POST',{email:'student-cms@test.local',name:'Demo Student',password:'strong-pass-123'})).data;
  assert.ok(student.token);
  await t.test('branding & private upload, no public access to admin',async()=>{
    const updated=await api('/admin/site','PUT',{name:'Yangi Markaz',phone:'+998 90 123 45 67',telegram:'markaz_test',heroTitle:'IT kurslari',heroSubtitle:'Ta’lim',logo:'',favicon:''},admin);
    assert.equal(updated.status,200);
    assert.equal((await api('/public/site')).data.name,'Yangi Markaz');
    assert.equal((await api('/admin/site','PUT',{name:'No rights'},student.token)).status,403);
    const png='data:image/png;base64,'+Buffer.from('89504e470d0a1a0a'+('00'.repeat(50)),'hex').toString('base64');
    const up=await api('/admin/media','POST',{dataUrl:png},admin);assert.equal(up.status,201);assert.match(up.data.url,/^\/media\//);
    assert.equal((await api('/admin/media','POST',{dataUrl:png},student.token)).status,403);
  });
  await t.test('article publish & visibility',async()=>{
    const draft=await api('/admin/articles','POST',{title:'Ta’lim yangiliklari',slug:'talim-yangiliklari',excerpt:'Tavsif',body:'Maqola matni',category:'Ta’lim',status:'draft'},admin);
    assert.equal(draft.status,201);let list=(await api('/public/articles')).data;assert.ok(!list.some(x=>x.slug==='talim-yangiliklari'));
    const update=await api('/admin/articles/'+draft.data.id,'PUT',{title:'Ta’lim yangiliklari',slug:'talim-yangiliklari',excerpt:'Tavsif',body:'Maqola matni',category:'Ta’lim',status:'published'},admin);
    assert.equal(update.status,200);list=(await api('/public/articles')).data;assert.ok(list.some(x=>x.slug==='talim-yangiliklari'));
    assert.equal((await api('/public/articles/talim-yangiliklari')).data.body,'Maqola matni');
  });
  await t.test('advertising time window and public analytics',async()=>{
    const future=new Date(Date.now()+86400000).toISOString();
    const ad=await api('/admin/ads','POST',{title:'Dars reklama',target_url:'https://example.com',placement:'HOME_TOP_BANNER',status:'published',starts_at:future},admin);assert.equal(ad.status,201);
    let list=(await api('/public/ads?placement=HOME_TOP_BANNER')).data;assert.ok(!list.some(x=>x.id===ad.data.id));
    const fix=await api('/admin/ads/'+ad.data.id,'PUT',{title:'Dars reklama',target_url:'https://example.com',placement:'HOME_TOP_BANNER',status:'published'},admin);assert.equal(fix.status,200);
    list=(await api('/public/ads?placement=HOME_TOP_BANNER')).data;assert.ok(list.some(x=>x.id===ad.data.id));
    assert.equal((await api('/public/ads/'+ad.data.id+'/event','POST',{type:'click'})).status,200);
    const result=(await api('/admin/ads','GET',undefined,admin)).data.find(x=>x.id===ad.data.id);assert.equal(result.clicks,1);
  });
  await t.test('branch, real CRM lead & restricted access',async()=>{
    const b=await api('/admin/branches','POST',{name:'Bosh filial',address:'Toshkent',phone:'+998 90 123 45 67'},admin);assert.equal(b.status,201);
    assert.equal((await api('/public/branches')).data[0].name,'Bosh filial');
    const lead=await api('/public/leads','POST',{name:'Test Mijoz',phone:'+998 99 555 44 33',consent:true});assert.equal(lead.status,201);
    assert.equal((await api('/admin/leads','GET',undefined,student.token)).status,403);
    const leads=(await api('/admin/leads','GET',undefined,admin)).data;assert.ok(leads.some(x=>x.name==='Test Mijoz'));
  });
  await t.test('guest test: server grades, answer key not leaked, repeat is idempotent',async()=>{
    const q=await api('/admin/quizzes','POST',{title:'Python boshlang‘ich',description:'Bitta savol',duration_sec:600,status:'published',guest_allowed:true,questions:[{text:'2 + 3 = ?',options:['3','4','5','6'],answer:2}]},admin);
    assert.equal(q.status,201);
    const list=(await api('/public/quizzes')).data;assert.ok(list.some(x=>x.id===q.data.id));
    const start=await api('/public/quizzes/'+q.data.id+'/start','POST',{});assert.equal(start.status,201);
    assert.equal(start.data.questions[0].answer,undefined);
    const send=await api('/public/quizzes/'+q.data.id+'/submit','POST',{token:start.data.token,answers:[2]});assert.equal(send.status,200);assert.equal(send.data.score,1);
    const again=await api('/public/quizzes/'+q.data.id+'/submit','POST',{token:start.data.token,answers:[0]});assert.equal(again.data.score,1);assert.equal(again.data.alreadySubmitted,true);
    assert.equal((await api('/admin/quizzes','GET',undefined,student.token)).status,403);
  });
  await t.test('group attendance, student only in enrolled course',async()=>{
    const courses=(await api('/courses')).data;const free=courses.find(x=>x.price===0);assert.ok(free);
    await api('/courses/'+free.id+'/enroll','POST',{},student.token);
    const g=await api('/manage/groups','POST',{name:'Sinov guruhi',course_id:free.id,capacity:20},admin);assert.equal(g.status,201);
    const assign=await api('/manage/groups/'+g.data.id+'/students','POST',{student_id:student.user.id},admin);assert.equal(assign.status,200);
    const att=await api('/manage/groups/'+g.data.id+'/attendance','POST',{date:'2026-11-06',topic:'Amaliy dars',entries:[{student_id:student.user.id,status:'present'}]},admin);assert.equal(att.status,200);
    const mine=(await api('/me/attendance','GET',undefined,student.token)).data;assert.ok(mine.some(x=>x.status==='present'));
    assert.equal((await api('/manage/groups','GET',undefined,student.token)).status,403);
  });
});
