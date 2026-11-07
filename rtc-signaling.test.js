'use strict';
/** Real two-socket Socket.IO signaling test against an isolated local server.
 * It does NOT certify microphone/camera/media transport or TURN/NAT connectivity.
 * Requires Node 22+ (built-in WebSocket) and installed npm dependencies. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const root=path.join(__dirname,'..');
async function json(base,url,{method='GET',body,token}={}){
  const r=await fetch(base+'/api'+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(4000)});
  return {code:r.status,data:await r.json()};
}
function peer(base,token){
  const ws=new WebSocket(base.replace(/^http/,'ws')+'/socket.io/?EIO=4&transport=websocket');
  let ready=false,closed=false;const packets=[],waiters=[];
  const send=x=>{if(ws.readyState===WebSocket.OPEN)ws.send(x)};
  const resolveWaiters=()=>{for(const w of [...waiters]){const i=packets.findIndex(w.match);if(i>=0){const p=packets.splice(i,1)[0];waiters.splice(waiters.indexOf(w),1);clearTimeout(w.timer);w.resolve(p)}}};
  const next=(match,timeout=6000)=>new Promise((resolve,reject)=>{
    const w={match,resolve,reject,timer:null};w.timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(new Error('Socket packet timeout'))},timeout);waiters.push(w);resolveWaiters();
  });
  ws.addEventListener('message',evt=>{
    const msg=String(evt.data);
    if(msg.startsWith('0'))return send('40'+JSON.stringify(token?{token}:{}));
    if(msg==='2')return send('3');
    if(msg.startsWith('40'))ready=true;
    packets.push(msg);resolveWaiters();
  });
  ws.addEventListener('close',()=>{closed=true;});
  return {ws,send,next,close:()=>ws.close(),isReady:()=>ready,isClosed:()=>closed};
}

test('two authenticated peers exchange signaling; unauthorized peer is rejected', {timeout:40000,skip:typeof WebSocket==='undefined'?'Requires Node 22+ global WebSocket':false},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'edusphere-rtc-'));
 const port=43000+Math.floor(Math.random()*10000),base='http://127.0.0.1:'+port;
 const env={...process.env,PORT:String(port),DATA_DIR:dir,NODE_ENV:'test',ADMIN_EMAIL:'rtc-admin@markaz.local',ADMIN_PASSWORD:'RTCAdminPass2026!',JWT_SECRET:'only-test-secret-very-long-and-do-not-use-in-production',GEMINI_API_KEY:''};
 const server=spawn(process.execPath,['server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let logs='';for(const s of [server.stdout,server.stderr])s.on('data',d=>logs=(logs+d).slice(-2500));
 const sockets=[];
 t.after(async()=>{sockets.forEach(s=>s.close());server.kill();await sleep(120);fs.rmSync(dir,{recursive:true,force:true});});
 let up=false;for(let i=0;i<70;i++){if(server.exitCode!==null)break;try{const r=await json(base,'/health');if(r.code===200){up=true;break;}}catch{}await sleep(150)}
 assert.ok(up,'Test server failed: '+logs);
 const admin=await json(base,'/auth/login',{method:'POST',body:{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD}});
 assert.equal(admin.code,200);
 const teacher=await json(base,'/auth/login',{method:'POST',body:{email:'teacher@markaz.uz',password:'teacher123'}});
 assert.equal(teacher.code,200);
 const student=await json(base,'/auth/register',{method:'POST',body:{name:'RTC Student',email:'rtc-'+Date.now()+'@example.org',password:'RTCStudentPass2026!'}});
 assert.equal(student.code,200);
 const courses=await json(base,'/courses');const free=courses.data.find(c=>c.price===0);assert.ok(free);
 assert.equal((await json(base,`/courses/${free.id}/enroll`,{method:'POST',body:{},token:student.data.token})).code,200);
 const lesson=await json(base,'/live',{method:'POST',body:{courseId:free.id,title:'RTC signaling check',startsAt:new Date(Date.now()+3600000).toISOString(),durationMin:45},token:teacher.data.token});
 assert.equal(lesson.code,200,JSON.stringify(lesson.data));
 assert.equal((await json(base,'/live/'+lesson.data.id+'/status',{method:'PUT',body:{status:'live'},token:teacher.data.token})).code,200);
 const first=peer(base,student.data.token),second=peer(base,teacher.data.token),guest=peer(base,null);
 sockets.push(first,second,guest);
 await Promise.all([first,second,guest].map(s=>s.next(x=>x.startsWith('40'))));
 guest.send('421["live:join",{"lessonId":'+lesson.data.id+'}]');
 const refused=await guest.next(x=>x.startsWith('431'));
 assert.match(refused,/error/i,'Unauthenticated peer must be rejected');
 first.send('421["live:join",{"lessonId":'+lesson.data.id+'}]');
 const firstAck=await first.next(x=>x.startsWith('431'));assert.match(firstAck,/"ok":true/);
 second.send('421["live:join",{"lessonId":'+lesson.data.id+'}]');
 const secondAck=await second.next(x=>x.startsWith('431'));const body=JSON.parse(secondAck.slice(3));assert.equal(body[0].ok,true);assert.equal(body[0].peers.length,1);
 const firstId=body[0].peers[0];
 const joined=await first.next(x=>x.startsWith('42["live:peer-joined"'));assert.ok(joined);
 second.send('42'+JSON.stringify(['live:signal',{lessonId:lesson.data.id,target:firstId,signal:{description:{type:'offer',sdp:'minimal-test-signal'}}}]));
 const signal=await first.next(x=>x.startsWith('42["live:signal"'));assert.match(signal,/minimal-test-signal/);
 console.log('PASS: authenticated signaling; guest rejected; room isolation; peer delivery (no media certification)');
});
