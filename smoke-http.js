'use strict';
/** Read-only HTTP smoke test. Start the server or set BASE_URL to staging HTTPS domain. */
require('dotenv').config();
const BASE = String(process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const timeout = Number(process.env.SMOKE_TIMEOUT_MS || 12000);
async function check(path, {method='GET',body,token}={}) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetch(BASE+path,{method,signal:controller.signal,
      headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},
      body:body?JSON.stringify(body):undefined});
    const contentType=response.headers.get('content-type')||'';
    const result=contentType.includes('application/json')?await response.json():null;
    return {status:response.status,result,contentType};
  } finally {clearTimeout(timer);}
}
async function main(){
  for(const path of ['/api/health','/api/stats','/api/settings','/api/courses']){
    const r=await check(path);if(r.status!==200 || !r.result)throw Error(`${path}: kutilgan JSON 200, olindi ${r.status}`);
    console.log('OK',path);
  }
  const missing=await check('/api/not-existing-release-smoke-route');
  if(missing.status!==404 || !missing.result?.error)throw Error('Noma’lum API 404 JSON qaytarmadi');
  console.log('OK unknown API = JSON 404');
  if(process.env.ADMIN_EMAIL&&process.env.ADMIN_PASSWORD){
    const login=await check('/api/auth/login',{method:'POST',body:{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,totp:process.env.SMOKE_TOTP||undefined}});
    if(login.status!==200||!login.result?.token)throw Error(`Admin login muvaffaqiyatsiz (HTTP ${login.status}). Eski bazada admin paroli boshqa bo‘lishi mumkin.`);
    const token=login.result.token;
    for(const path of ['/api/me','/api/admin/users','/api/ops/finance','/api/ops/manual-payments']){
      const r=await check(path,{token});if(r.status!==200)throw Error(`${path}: HTTP ${r.status}`);
      console.log('OK',path);
    }
  }else console.log('SKIP admin-login tests: ADMIN_EMAIL/ADMIN_PASSWORD berilmagan');
  console.log('PASS: read-only HTTP smoke tests');
}
main().catch(e=>{console.error('FAIL:',e.message);process.exitCode=1;});
