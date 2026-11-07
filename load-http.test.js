'use strict';
/** Runs a small, bounded HTTP load check ONLY against an isolated localhost server. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('100+ bounded concurrent requests to local isolated server, no HTTP errors', {timeout:60000}, async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'edusphere-load-'));
 const port=45000+Math.floor(Math.random()*7000),base='http://127.0.0.1:'+port;
 const env={...process.env,NODE_ENV:'test',PORT:String(port),DATA_DIR:dir,ADMIN_EMAIL:'load-admin@example.org',ADMIN_PASSWORD:'TestOnlyAdminPass2026!',JWT_SECRET:'load-only-test-secret-minimum-32-characters',GEMINI_API_KEY:''};
 const server=spawn(process.execPath,['server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});let logs='';for(const s of [server.stdout,server.stderr])s.on('data',x=>logs=(logs+x).slice(-3000));
 t.after(async()=>{server.kill('SIGTERM');await sleep(120);fs.rmSync(dir,{recursive:true,force:true});});
 let ready=false;for(let i=0;i<70;i++){if(server.exitCode!==null)break;try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break}}catch{}await sleep(160)}
 assert.ok(ready,'Isolated server did not start: '+logs);
 const result=spawnSync(process.execPath,['scripts/load-check.js'],{cwd:root,env:{...env,BASE_URL:base,LOAD_REQUESTS:'160',LOAD_CONCURRENCY:'12'},encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
 assert.equal(result.status,0,(result.stderr||'')+' '+(result.stdout||''));
 const output=JSON.parse(result.stdout);
 assert.equal(output.requests,160);assert.equal(output.network_errors,0);
 assert.equal(output.http_status['200'],160);
 assert.ok(output.p95_ms<9000,'Load probe P95 exceeded 9 seconds');
 console.log('LOCAL LOAD BENCHMARK:',JSON.stringify(output));
});
