'use strict';
/** Real local persistence rehearsal: add a student and payment, restart process, verify DB survived.
 * DATA_DIR is ALWAYS a random temporary directory. This never touches Railway production data. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const root=path.join(__dirname,'..');
const ADMIN='PersistenceTestPassword2026!';
async function query(base,endpoint,method='GET',body,token){const r=await fetch(base+'/api'+endpoint,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)});return {status:r.status,data:await r.json()}}
test('manual payment and user remain after isolated server restart', {timeout:60000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'edusphere-persist-'));
 const port=45000+Math.floor(Math.random()*7000),base='http://127.0.0.1:'+port;
 const env={...process.env,NODE_ENV:'test',PORT:String(port),DATA_DIR:dir,ADMIN_EMAIL:'persist-admin@example.org',ADMIN_PASSWORD:ADMIN,JWT_SECRET:'local-persistence-test-secret-32-plus-2026',GEMINI_API_KEY:''};
 let server=null,logs='';
 const launch=async()=>{
   server=spawn(process.execPath,['server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
   for(const s of [server.stdout,server.stderr])s.on('data',x=>logs=(logs+x).slice(-4000));
   for(let i=0;i<75;i++){if(server.exitCode!==null)break;try{if((await query(base,'/health')).status===200)return;}catch{}await sleep(170)}
   assert.fail('Unable to launch: '+logs);
 };
 const stop=async()=>{if(server&&server.exitCode===null){server.kill('SIGTERM');for(let i=0;i<40;i++){if(server.exitCode!==null)break;await sleep(50)}if(server.exitCode===null)server.kill('SIGKILL');}server=null;};
 t.after(async()=>{await stop();fs.rmSync(dir,{recursive:true,force:true});});
 await launch();
 let a=await query(base,'/auth/login','POST',{email:env.ADMIN_EMAIL,password:ADMIN});assert.equal(a.status,200);const admin=a.data.token;
 let s=await query(base,'/auth/register','POST',{name:'Persisted Student',email:'persist-student@example.org',password:'PersistStudentPassword2026!'});assert.equal(s.status,200);const studentId=s.data.user.id;
 const payment=await query(base,'/ops/manual-payments','POST',{student_id:studentId,amount:115000,method:'cash',paid_on:'2026-11-07',reference:'PERSIST-LOCAL-TEST-1001',note:'Test payment'},admin);
 assert.equal(payment.status,201,JSON.stringify(payment.data));
 await stop();assert.ok(fs.existsSync(path.join(dir,'markaz.db')));
 await launch();
 a=await query(base,'/auth/login','POST',{email:env.ADMIN_EMAIL,password:ADMIN});assert.equal(a.status,200);
 const users=await query(base,'/admin/users','GET',undefined,a.data.token);assert.ok(users.data.some(x=>x.id===studentId));
 const receipts=await query(base,'/ops/manual-payments','GET',undefined,a.data.token);assert.equal(receipts.status,200);
 assert.ok(receipts.data.some(x=>x.student_id===studentId&&x.amount===115000&&x.reference==='PERSIST-LOCAL-TEST-1001'));
 console.log('PASS local process restart persistence: student and manual receipt retained');
});
