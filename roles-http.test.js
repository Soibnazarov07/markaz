'use strict';
/** Isolated real HTTP permission checks for all seven roles.
 * This deliberately boots a NEW temporary database, never a Railway/production DB. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const root=path.join(__dirname,'..');
const ADMIN='TestAdminPassword2026!';
const PASSWORD='TestRolePassword2026!';
async function request(base,endpoint,method='GET',data,token){
 const r=await fetch(base+'/api'+endpoint,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(5000)});
 return {code:r.status,data:await r.json()};
}
test('7 roles cannot read protected resources, and superadmin cannot be self-promoted', {timeout:70000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'edusphere-rbac-'));
 const port=44000+Math.floor(Math.random()*9000),base='http://127.0.0.1:'+port;
 const env={...process.env,NODE_ENV:'test',PORT:String(port),DATA_DIR:dir,ADMIN_EMAIL:'rbac-admin@example.org',ADMIN_PASSWORD:ADMIN,JWT_SECRET:'rbac-long-unique-test-secret-2026-0123456789',GEMINI_API_KEY:''};
 const server=spawn(process.execPath,['server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});let logs='';for(const stream of [server.stdout,server.stderr])stream.on('data',d=>logs=(logs+d).slice(-4500));
 t.after(async()=>{server.kill('SIGTERM');await sleep(150);fs.rmSync(dir,{recursive:true,force:true});});
 let healthy=false;for(let i=0;i<75;i++){if(server.exitCode!==null)break;try{if((await request(base,'/health')).code===200){healthy=true;break}}catch{}await sleep(150)}
 assert.ok(healthy,'Server launch failed: '+logs);
 const login=async(email,password)=>{const r=await request(base,'/auth/login','POST',{email,password});assert.equal(r.code,200,JSON.stringify(r.data));return r.data.token};
 const admin=await login(env.ADMIN_EMAIL,ADMIN);
 const roles=['branch_manager','teacher','student','parent','accountant'];
 const tokens={admin};
 for(const role of roles){
  const email='rbac-'+role+'@example.org';
  const created=await request(base,'/admin/users','POST',{name:'RBAC '+role,email,password:PASSWORD,role},admin);
  assert.equal(created.code,200,`cannot create ${role}: ${JSON.stringify(created.data)}`);
  tokens[role]=await login(email,PASSWORD);
 }
 // No user can become an administrator without a super admin.
 const promote=await request(base,'/admin/users','POST',{name:'Unauthorized admin',email:'unauth-admin@example.org',password:PASSWORD,role:'admin'},admin);
 assert.equal(promote.code,403);
 assert.equal((await request(base,'/admin/users','GET',undefined,tokens.student)).code,403);
 assert.equal((await request(base,'/admin/users','GET',undefined,tokens.teacher)).code,403);
 assert.equal((await request(base,'/ops/finance','GET',undefined,tokens.student)).code,403);
 assert.equal((await request(base,'/ops/finance','GET',undefined,tokens.parent)).code,403);
 assert.equal((await request(base,'/ops/finance','GET',undefined,tokens.teacher)).code,403);
 assert.equal((await request(base,'/ops/finance','GET',undefined,tokens.branch_manager)).code,403);
 assert.equal((await request(base,'/ops/finance','GET',undefined,tokens.accountant)).code,200);
 assert.equal((await request(base,'/v6/branches/999999/overview','GET',undefined,tokens.branch_manager)).code,403);
 assert.equal((await request(base,'/ops/manual-payments','POST',{student_id:2,amount:100,paid_on:'2026-11-07',method:'cash'},tokens.student)).code,403);
 // Bootstrap super admin using the supported CLI and confirm privileged access.
 const boot=spawnSync(process.execPath,['scripts/create-superadmin.js'],{cwd:root,env:{...env,SUPER_ADMIN_EMAIL:'rbac-super@example.org',SUPER_ADMIN_PASSWORD:'SuperTestPassword2026!'},encoding:'utf8'});
 assert.equal(boot.status,0,boot.stderr);
 const superToken=await login('rbac-super@example.org','SuperTestPassword2026!');
 assert.equal((await request(base,'/admin/users','GET',undefined,superToken)).code,200);
 const newAdmin=await request(base,'/admin/users','POST',{name:'Second Admin',email:'rbac-second-admin@example.org',password:PASSWORD,role:'admin'},superToken);
 assert.equal(newAdmin.code,200,JSON.stringify(newAdmin.data));
 console.log('PASS 7 role permission routes, super admin bootstrap, no lateral escalation');
});
