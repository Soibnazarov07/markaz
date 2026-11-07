'use strict';
/** One-shot health monitor for Railway Cron / external scheduler. Never leaks credentials. */
require('dotenv').config();
const url=process.env.HEALTH_URL;
if(!url||!/^https:\/\//.test(url)){console.error('HEALTH_URL HTTPS manzili talab qilinadi');process.exit(2);}
(async()=>{
 let msg='';try{const c=new AbortController(),t=setTimeout(()=>c.abort(),8000);
  const r=await fetch(url,{signal:c.signal,cache:'no-store'});clearTimeout(t);const d=await r.json();if(!r.ok||d.status!=='ok')throw Error('Server javobi '+r.status);console.log('HEALTH OK',d.time);return;
 }catch(e){msg=`EduSphere health xatosi: ${String(e.message).slice(0,180)}`;console.error(msg);process.exitCode=1;}
})();
