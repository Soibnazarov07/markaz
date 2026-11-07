'use strict';
/** BOUNDED GET-only load probe. Use against staging, NOT production without authorization. */
const {performance}=require('node:perf_hooks');
const base=String(process.env.BASE_URL||'').replace(/\/$/,'');
const concurrency=Math.min(30,Math.max(1,Number(process.env.LOAD_CONCURRENCY||5)));
const total=Math.min(600,Math.max(1,Number(process.env.LOAD_REQUESTS||100)));
if(!/^https?:\/\//.test(base)){console.error('BASE_URL talab qilinadi (masalan http://localhost:3000)');process.exit(2);}
if(!process.env.ALLOW_PRODUCTION_LOAD && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)){
 console.error('Tashqi domenda yuklama sinovi uchun ALLOW_PRODUCTION_LOAD=1 kerak. Faqat o‘zingizga tegishli staging xizmatida ishga tushiring.');process.exit(2);
}
(async()=>{
 const times=[],codes={},errors=[];let next=0;
 async function worker(){while(next<total){const n=next++;const started=performance.now();try{
  const c=new AbortController();const timer=setTimeout(()=>c.abort(),9000);
  try{const res=await fetch(base+(n%3===0?'/api/health':n%3===1?'/api/stats':'/api/courses'),{signal:c.signal,cache:'no-store'});codes[res.status]=(codes[res.status]||0)+1;await res.arrayBuffer();}finally{clearTimeout(timer)}
 }catch(e){errors.push(String(e.message))}times.push(performance.now()-started)}}
 const begin=performance.now();await Promise.all(Array.from({length:concurrency},()=>worker()));
 times.sort((a,b)=>a-b);const p=(x)=>Math.round(times[Math.min(times.length-1,Math.ceil(x*times.length)-1)]||0);
 const elapsed=(performance.now()-begin)/1000;
 console.log(JSON.stringify({base,requests:total,concurrency,seconds:+elapsed.toFixed(2),rps:+(total/elapsed).toFixed(1),http_status:codes,network_errors:errors.length,p50_ms:p(.50),p95_ms:p(.95),p99_ms:p(.99)},null,2));
 if(errors.length||Object.entries(codes).some(([status,n])=>Number(status)>=400&&n))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
