'use strict';
/* UI extension: public pages, management analytics, payments, chat and P2P live classes. */
const U = { room:null, chatScope:null, chatId:null, chatItems:[], live:null, stream:null, peers:new Map(), screenTrack:null, notices:0, cameraOn:true, micOn:true };
const statusBadge = s => `<span class="status ${esc(s)}">${({paid:"To'langan",pending:'Kutilmoqda',cancelled:'Bekor qilingan',live:'Jonli efir',scheduled:'Rejalashtirilgan',ended:'Yakunlangan'})[s] || esc(s)}</span>`;
const tabTitle = t => ({'#/':'Bosh sahifa','#/courses':'Kurslar','#/me':'Shaxsiy kabinet','#/teacher':"O'qituvchi paneli",'#/admin':'Boshqaruv markazi','#/live':'Jonli darslar','#/messages':'Xabarlar','#/notifications':'Bildirishnomalar','#/payments':"To'lovlar"})[t] || (t.startsWith('#/live/')?'Video xona':t.startsWith('#/course/')?'Kurs ma’lumotlari':t.startsWith('#/manage/')?'Kursni boshqarish':'Platforma');
const originalNav = renderNav;
renderNav = function () {
  originalNav();
  const u=S.user, links=[['#/live','◉','Jonli darslar'],['#/messages','✉','Xabarlar'],['#/notifications','♧','Bildirishnomalar'],['#/payments','▤',"To'lovlar"]];
  const dock=$('#dock');
  if(u) dock.insertAdjacentHTML('beforeend',links.map(([href,ico,label])=>`<a class="nl ${location.hash===href||location.hash.startsWith(href+'/')?'on':''}" href="${href}"><span style="width:19px;text-align:center;font-size:18px;line-height:1">${ico}</span><span>${label}</span></a>`).join(''));
  const page=$('#currentPage');if(page) page.textContent=tabTitle(location.hash||'#/');
};
actions.menuToggle=()=>$('#sidebar').classList.toggle('expanded');
document.addEventListener('click',e=>{ if(e.target.closest('.sidebar a')) $('#sidebar')?.classList.remove('expanded'); if(e.target.closest('.workspace') && !e.target.closest('.menu-toggle')) $('#sidebar')?.classList.remove('expanded'); });
const startConn = connectSocket;
connectSocket = function() {
  startConn();
  socket.__academyEnhanced = true;
  socket.on('chat:new',m=>{
    const belongs=U.chatScope==='course' ? Number(m.course_id)===Number(U.chatId) : U.chatScope==='direct' && ((m.sender_id==U.chatId&&m.recipient_id==S.user?.id)||(m.sender_id==S.user?.id&&m.recipient_id==U.chatId));
    if(belongs && !U.chatItems.some(x=>x.id===m.id)) {U.chatItems.push(m); drawMessages();}
  });
  socket.on('notify',n=>{ U.notices++; toast(n.text,'ok');if(CUR.name==='notificationsPage') route(true); });
  socket.on('live:changed',()=>{if(CUR.name==='liveListPage')route(true);});
  socket.on('live:status',data=>{
    if(!U.live||U.live.id!==data.id)return;
    U.live.status=data.status;
    const badge=$('#liveStatus');if(badge)badge.innerHTML=statusBadge(data.status);
    if(data.status==='ended'){toast('Dars yakunlandi');leaveCall(false);}
  });
  socket.on('live:signal',async({from,signal,name})=>{
    if(!U.live)return;
    try{
      const pc=makePeer(from,name);
      if(signal.description){
        await pc.setRemoteDescription(signal.description);
        if(signal.description.type==='offer'){
          const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
          socket.emit('live:signal',{lessonId:U.live.id,target:from,signal:{description:pc.localDescription}});
        }
      }
      if(signal.candidate){
        if(pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
        else (pc.pendingCandidates ||= []).push(signal.candidate);
      }
      if(pc.remoteDescription && pc.pendingCandidates){
        for(const candidate of pc.pendingCandidates) await pc.addIceCandidate(candidate).catch(()=>{});
        pc.pendingCandidates=[];
      }
    }catch(e){console.error('WebRTC signal:',e);toast('Video aloqa xatosi: '+e.message,'err');}
  });
  socket.on('live:peer-joined',({socketId,name})=>{if(U.live) toast((name||'Ishtirokchi')+' qo‘shildi');});
  socket.on('live:peer-left',({socketId})=>removePeer(socketId));
};

// New custom dashboard.
async function dashboard() {
  const [stats,courses,my,live]=await Promise.all([api('/stats'),api('/courses'), S.user?api('/my').catch(()=>null):null,S.user?api('/live').catch(()=>[]):[]]);
  const first=S.user ? esc(S.user.name.split(' ')[0]) : 'Xush kelibsiz';
  const upcoming=(live||[]).filter(l=>l.status!=='ended').sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).slice(0,3);
  view(`<div class="welcome"><div class="welcome-panel"><div class="eyebrow">✦ TA'LIMNING YANGI BOSQICHI</div><h1>${first}, kelajak sari bir qadam oldinda bo'ling.</h1><p>${esc(S.settings.tagline)}</p><div class="row"><a class="btn primary" href="#/courses">Kurslarni o'rganish →</a>${S.user?'<a class="btn" href="#/live">◉ Jonli darslar</a>':'<a class="btn" href="#/login">Ro‘yxatdan o‘tish</a>'}</div></div>
    <div class="glass insights"><div class="insights-head"><b>Hozir platformada</b><span>● REAL VAQT</span></div><strong class="online-number" data-live="online">${stats.online}</strong><span class="muted">faol foydalanuvchi / mehmon</span><div class="mini-chart"></div><div class="row between"><small class="muted">Jonli hisoblagich</small><small style="color:var(--ok);font-weight:800">● ONLINE</small></div></div></div>
    <div class="dash-stats">${[['◫',stats.courses,'Faol kurslar'],['♙',stats.students,"O'quvchilar"],['♢',stats.teachers,"O'qituvchilar"],['✓',stats.tests,'Testlar']].map(([icon,v,label])=>`<div class="glass dash-stat"><div class="emblem">${icon}</div><div><b>${v}</b><small>${label}</small></div></div>`).join('')}</div>
    ${my?.courses?.length?`<div class="section-title"><h2>O'qishni davom ettiring</h2><a href="#/me">Barchasi →</a></div><div class="grid">${my.courses.slice(0,3).map(courseCard).join('')}</div>`:''}
    ${upcoming.length?`<div class="section-title"><h2>Yaqinlashayotgan jonli darslar</h2><a href="#/live">Jadval →</a></div><div class="live-list">${upcoming.map(l=>liveCard(l)).join('')}</div>`:''}
    <div class="section-title"><h2>Tavsiya etilgan kurslar</h2><a href="#/courses">Barcha kurslar →</a></div>
    ${courses.length?`<div class="grid">${courses.slice(0,6).map(courseCard).join('')}</div>`:'<div class="glass empty-state">Hozircha kurslar e’lon qilinmagan.</div>'}
    <div class="section-title"><h2>Platforma imkoniyatlari</h2></div>
    <div class="feat"><div class="glass"><div class="ico" style="background:#4669cb">◉</div><h3>Jonli video dars</h3><p class="muted">Kamera, mikrofon, ekran ulashish va videomuloqot.</p></div><div class="glass"><div class="ico" style="background:#0a8e7b">✉</div><h3>Real vaqt xabarlari</h3><p class="muted">Kurs guruhlari va shaxsiy suhbatlar saqlanadi.</p></div><div class="glass"><div class="ico" style="background:#9d67c8">✓</div><h3>Natijalar va to'lovlar</h3><p class="muted">Testlar, davomad va tasdiqlangan to'lovlar shaxsiy kabinetda.</p></div></div>`);
}
routes[0][1]=dashboard;

// Authentication: distinct professional sign-in panel, shared original login form processing.
authForm=function(){const reg=AUTHMODE==='register';return `<div class="auth-shell"><div class="auth-banner"><div class="eyebrow">◈ O'QUV MARKAZI PLATFORMASI</div><h1>Bilim olish uchun qulay muhit.</h1><p>Kurslaringiz, jonli darslar, natijalar va o'qituvchilar bilan muloqot — barchasi bir sahifada.</p><div class="dash-stats" style="grid-template-columns:1fr 1fr;margin-top:30px"><div class="glass pad"><b>🔒</b><p class="muted">Xavfsiz kirish</p></div><div class="glass pad"><b>◉</b><p class="muted">Jonli aloqa</p></div></div></div>
<div class="glass auth-panel"><div class="eyebrow">HISOBINGIZ</div><h2>${reg?"Ro'yxatdan o'tish":'Xush kelibsiz!'}</h2><p class="muted" style="margin-bottom:24px">${reg?'Platformada o‘qishni boshlash uchun hisob oching':'Hisobingizga kirish uchun ma’lumotlarni kiriting'}</p><form data-form="auth">
${reg?'<div class="fg"><label class="f">Ism va familiya</label><input class="in" name="name" required minlength="2" autocomplete="name"></div>':''}<div class="fg"><label class="f">Email manzil</label><input class="in" name="email" type="email" required autocomplete="email" placeholder="ism@example.com"></div><div class="fg"><label class="f">Parol</label><input class="in" name="password" type="password" minlength="6" required autocomplete="${reg?'new-password':'current-password'}" placeholder="••••••••"></div><button class="btn primary" type="submit">${reg?'Hisob yaratish →':'Tizimga kirish →'}</button></form><div class="auth-switch">${reg?'Hisobingiz bormi?':'Hali hisobingiz yo‘qmi?'} <button data-act="authmode" data-m="${reg?'login':'register'}">${reg?'Kirish':"Ro'yxatdan o'tish"}</button></div></div></div>`;};
// Existing course access buttons route paid courses through actual Payme checkout.
const oldCoursePage=coursePage;
async function proCoursePage(id){
  await oldCoursePage(id);
  if(!COURSE || COURSE.id!=id) return;
  if(COURSE.price>0 && !COURSE.enrolled && !COURSE.manager){
    const enrollBtn=$('[data-act="enroll"]');
    if(enrollBtn) enrollBtn.textContent=S.user?`Payme orqali to'lash • ${money(COURSE.price)}`:'Kirish va to‘lash';
    $('#view').insertAdjacentHTML('beforeend','<div class="payment-note">🔒 Pullik kurs faqat haqiqiy to‘lov Payme tomonidan tasdiqlangach ochiladi. To‘lov linki tizim tomonidan yaratiladi.</div>');
  }
  if(COURSE.enrolled||COURSE.manager) $('#view').insertAdjacentHTML('beforeend',`<div class="section-title"><h2>Kurs guruhiga qo'shiling</h2></div><div class="glass pad row between"><div><b>✉ Kurs a'zolari bilan yozishish</b><p class="muted">Savollar va topshiriqlarni muhokama qiling</p></div><a class="btn primary" href="#/messages/course/${COURSE.id}">Suhbatni ochish →</a></div>`);
}
for(const r of routes)if(String(r[0]).includes('course\\/')){r[1]=proCoursePage;break;}
actions.enroll=el=>guard(async()=>{
  if(needLogin())return;
  const c=COURSE&&COURSE.id==el.dataset.id?COURSE:await api('/courses/'+el.dataset.id);
  if(c.price>0 && !c.manager && !c.enrolled){
    if(!confirm(`${c.title} kursi uchun ${money(c.price)} to'loviga o'tasizmi?`))return;
    const r=await api('/payments/checkout','POST',{courseId:c.id});
    location.href=r.checkoutUrl;
  }else{await api(`/courses/${c.id}/enroll`,'POST');toast('Kursga yozildingiz!','ok');route(true);}
});

// Payme order list: server-confirmed status only.
async function paymentsPage(){if(needLogin())return;const orders=await api('/payments/my');
view(`<div class="pagehead"><div><div class="eyebrow">BILLING · PAYME</div><h1>To'lovlar tarixi</h1><p class="muted">Kurslar uchun yuborilgan to‘lov so‘rovlari va ularning tasdiqlangan holatlari.</p></div><a href="#/courses" class="btn primary">+ Kurs tanlash</a></div>
<div class="glass pad tw">${orders.length?`<table><thead><tr><th>Buyurtma</th><th>Kurs nomi</th><th>Summa</th><th>Holat</th><th>Sana</th><th></th></tr></thead><tbody>${orders.map(o=>`<tr><td><b>#${o.id}</b></td><td>${esc(o.course_title)}</td><td><b>${money(o.amount)}</b></td><td>${statusBadge(o.status)}</td><td class="muted">${fmtDate(o.created_at)}</td><td><a class="btn sm" href="#/course/${o.course_id}">Kurs →</a></td></tr>`).join('')}</tbody></table>`:'<div class="empty-state"><strong>Hozircha to‘lovlar mavjud emas.</strong>Kursni tanlab to‘lov yaratishingiz mumkin.</div>'}</div><p class="payment-note">To‘lov natijasi brauzer qaytishiga emas, Payme Business serverining autentifikatsiyalangan tasdig‘iga asoslanadi. Yangi to‘lov tasdiqlangan bo‘lsa sahifani yangilang.</p>`);
}
routes.push([/^#\/payments$/,paymentsPage]);

// Notification center
async function notificationsPage(){if(needLogin())return;const list=await api('/notifications');view(`<div class="pagehead"><div><div class="eyebrow">XABARLAR MARKAZI</div><h1>Bildirishnomalar</h1></div><button class="btn" data-act="markNotices">Hammasini o‘qilgan deb belgilash</button></div><div class="glass pad stack">${list.length?list.map(n=>`<a href="${/^#\/[\w\-/]+$/.test(n.href)?esc(n.href):'#/me'}" class="item"><span class="emblem" style="background:#4b66e01a;padding:11px;border-radius:10px">◈</span><span class="grow"><b>${esc(n.text)}</b><small style="display:block" class="muted">${fmtDate(n.created_at)} ${n.read_at?'':' · Yangi'}</small></span><span>→</span></a>`).join(''):'<div class="empty-state">Hozircha bildirishnomalar yo‘q.</div>'}</div>`);}
routes.push([/^#\/notifications$/,notificationsPage]);
actions.markNotices=()=>guard(async()=>{await api('/notifications/read','POST');toast('O‘qilgan deb belgilandi','ok');notificationsPage();});

// Contacts, course chat and direct messaging.
function drawMessages(){const el=$('#messagesStream');if(!el)return;el.innerHTML=U.chatItems.length?U.chatItems.map(m=>`<div class="bubble ${m.sender_id===S.user?.id?'self':''}"><small>${esc(m.sender_name)} · ${fmtDate(m.created_at)}</small><p>${esc(m.body)}</p></div>`).join(''):'<div class="empty-state">Bu suhbatda hozircha xabar yo‘q. Birinchi xabarni yozing.</div>';el.scrollTop=el.scrollHeight;}
async function messagesPage(type,id){
  if(needLogin())return;
  if(U.chatScope==='course'&&U.chatId)socket?.emit('course:leave',{courseId:U.chatId});
  const [contacts,mine,managed]=await Promise.all([api('/contacts'),api('/my'),isStaff()?api('/manage/courses'):[]]);
  const courses=[...new Map([...mine.courses,...managed].map(c=>[c.id,c])).values()];
  const targetType=type==='course'?'course':'direct',targetId=Number(id)||null;
  const ok=targetType==='course'?courses.some(c=>c.id===targetId):contacts.some(c=>c.id===targetId);
  U.chatScope=ok?targetType:null;U.chatId=ok?targetId:null;U.chatItems=[];
  const activeName=U.chatScope?(targetType==='course'?courses.find(c=>c.id===targetId)?.title:contacts.find(c=>c.id===targetId)?.name):'Suhbatni tanlang';
  view(`<div class="pagehead"><div><div class="eyebrow">REAL VAQT · XABARLAR</div><h1>Suhbatlar markazi</h1><p class="muted">Yozishmalar ma'lumotlar bazasida saqlanadi.</p></div></div><div class="messages-layout"><aside class="glass messages-people"><div class="eyebrow" style="padding:8px 12px">KURS GURUHLARI</div>${courses.map(c=>`<a class="contact ${targetType==='course'&&targetId===c.id?'active':''}" href="#/messages/course/${c.id}">◫ ${esc(c.title)}<small>Guruh suhbati</small></a>`).join('')||'<p class="muted" style="padding:12px">Kurslar yo‘q</p>'}<div class="eyebrow" style="padding:20px 12px 8px">SHAXSIY XABARLAR</div>${contacts.map(c=>`<a class="contact ${targetType==='direct'&&targetId===c.id?'active':''}" href="#/messages/${c.id}">♙ ${esc(c.name)}<small>${{student:"O'quvchi",teacher:"O'qituvchi",admin:'Administrator'}[c.role]}</small></a>`).join('')||'<p class="muted" style="padding:12px">Suhbatdoshlar yo‘q</p>'}</aside><section class="glass messages-pane"><div class="messages-header">✉ ${esc(activeName)}</div><div class="messages-stream" id="messagesStream"><div class="empty-state">${U.chatScope?'Yuklanmoqda...':'Chapdan guruh yoki foydalanuvchini tanlang.'}</div></div>${U.chatScope?'<form class="messages-send" data-form="chatSend"><input class="in" name="body" maxlength="2000" required placeholder="Xabar yozing..." autocomplete="off"><button class="btn primary" type="submit">Yuborish ➜</button></form>':''}</section></div>`);
  if(U.chatScope){
    if(targetType==='course')socket?.emit('course:join',{courseId:targetId});
    U.chatItems=await api('/chat/'+(targetType==='course'?'course/':'direct/')+targetId);
    if(U.chatId===targetId)drawMessages();
  }
}
routes.push([/^#\/messages$/,messagesPage]);
routes.push([/^#\/messages\/course\/(\d+)$/,id=>messagesPage('course',id)]);
routes.push([/^#\/messages\/(\d+)$/,id=>messagesPage('direct',id)]);
forms.chatSend=f=>guard(async()=>{
  if(!U.chatScope||!U.chatId)return;
  const input=f.elements.namedItem('body');const val=input.value.trim();if(!val)return;
  input.value='';
  try{const m=await api('/chat/send','POST',{body:val,...(U.chatScope==='course'?{courseId:U.chatId}:{recipientId:U.chatId})});if(!U.chatItems.some(x=>x.id===m.id)){U.chatItems.push(m);drawMessages();}}catch(e){input.value=val;throw e;}
});

// Live schedule and teacher course management.
const liveCard = l => `<div class="glass live-row"><div><b>◉ ${esc(l.title)}</b><small>${esc(l.course_title)} · ${new Date(l.starts_at).toLocaleString('uz-UZ',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} · ${l.duration_min} daqiqa</small></div><div class="row">${statusBadge(l.status)}<a class="btn sm ${l.status==='live'?'primary':''}" href="#/live/${l.id}">${l.status==='live'?'Darsga kirish →':'Batafsil →'}</a></div></div>`;
async function liveListPage(){if(needLogin())return;const lessons=await api('/live');const latest=lessons.slice().sort((a,b)=>new Date(b.starts_at)-new Date(a.starts_at));
view(`<div class="pagehead"><div><div class="eyebrow">VIDEO · WEBRTC</div><h1>Jonli darslar</h1><p class="muted">O‘qituvchi tomonidan tashkil etilgan kamera va mikrofonli darslar.</p></div>${isStaff()?'<button class="btn primary" data-act="scheduleLive">+ Dars rejalash</button>':''}</div>
<div class="dash-stats" style="grid-template-columns:repeat(3,1fr)"><div class="glass dash-stat"><div class="emblem">◉</div><div><b>${latest.filter(l=>l.status==='live').length}</b><small>Hozir jonli</small></div></div><div class="glass dash-stat"><div class="emblem">◷</div><div><b>${latest.filter(l=>l.status==='scheduled').length}</b><small>Rejadagi darslar</small></div></div><div class="glass dash-stat"><div class="emblem">✓</div><div><b>${latest.filter(l=>l.status==='ended').length}</b><small>O'tgan darslar</small></div></div></div>
<div class="section-title"><h2>Darslar jadvali</h2></div><div class="live-list">${latest.length?latest.map(l=>liveCard(l)).join(''):'<div class="glass empty-state"><strong>Hozircha jonli darslar yo‘q</strong>O‘qituvchi yangi dars rejalagach, shu yerda ko‘rinadi.</div>'}</div>
<div class="payment-note">Videomuloqot kam ishtirokchili WebRTC xonalar uchun mo‘ljallangan (8 kishigacha). Internet tarmoqlari cheklangan joylarda TURN server kerak; yirik guruhlar uchun SFU xizmatiga ulash lozim.</div>`);
}
routes.push([/^#\/live$/,liveListPage]);
actions.scheduleLive=()=>guard(async()=>{
  const cs=await api('/manage/courses');if(!cs.length)throw Error('Avval kurs yarating');
  modal(`<h2>Jonli dars rejalash</h2><p class="muted" style="margin-bottom:17px">Dars boshlanganda o‘quvchilarga bildirishnoma yuboriladi.</p><form data-form="scheduleLive"><div class="fg"><label class="f">Kurs</label><select class="in" name="courseId" required>${cs.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('')}</select></div><div class="fg"><label class="f">Dars mavzusi</label><input class="in" name="title" required minlength="3" placeholder="Masalan: Python — amaliy mashg‘ulot"></div><div class="two"><div class="fg"><label class="f">Boshlanish</label><input class="in" type="datetime-local" name="startsAt" required></div><div class="fg"><label class="f">Daqiqalar</label><input class="in" type="number" name="durationMin" value="60" min="10" max="240"></div></div><div class="row between"><button class="btn" type="button" data-act="closeModal">Bekor qilish</button><button class="btn primary" type="submit">Rejalash →</button></div></form>`);
});
forms.scheduleLive=f=>guard(async()=>{
  const d=Object.fromEntries(new FormData(f));d.startsAt=new Date(d.startsAt).toISOString();d.durationMin=Number(d.durationMin);
  const r=await api('/live','POST',d);closeModal();toast('Jonli dars rejalashtirildi','ok');location.hash='#/live/'+r.id;
});

// WebRTC mesh meeting room. Microphone/camera permissions are requested on join only.
function removePeer(id){
  const item=U.peers.get(id);if(!item)return;
  item.pc.close();item.container.remove();U.peers.delete(id);updateParticipants();
}
function updateParticipants(){const el=$('#participantCount');if(el)el.textContent=String(U.peers.size+(U.live?1:0));}
function makePeer(id,name){
  if(U.peers.has(id))return U.peers.get(id).pc;
  const pc=new RTCPeerConnection({iceServers:U.live?.iceServers||[{urls:'stun:stun.l.google.com:19302'}]});
  const container=document.createElement('div');container.className='video-person';container.id='peer-'+id;
  container.innerHTML=`<div class="no-video">♙</div><span class="video-name">${esc(name||'Ishtirokchi')}</span>`;
  $('#videoGrid')?.append(container);
  const remote=new MediaStream();
  const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.srcObject=remote;
  container.prepend(video);
  if(U.stream) U.stream.getTracks().forEach(t=>pc.addTrack(t,U.stream));
  pc.ontrack=ev=>{
    const tracks=ev.streams[0]?.getTracks()||[ev.track];
    for(const t of tracks) if(!remote.getTracks().some(x=>x.id===t.id))remote.addTrack(t);
    container.querySelector('.no-video')?.remove();
    video.play().catch(()=>{});
  };
  pc.onicecandidate=ev=>{if(ev.candidate&&U.live)socket.emit('live:signal',{lessonId:U.live.id,target:id,signal:{candidate:ev.candidate.toJSON()}});};
  pc.onconnectionstatechange=()=>{if(['failed','closed','disconnected'].includes(pc.connectionState))container.style.opacity='.65';else container.style.opacity='1';};
  U.peers.set(id,{pc,container,remote});updateParticipants();return pc;
}
async function startCall(){
  if(!U.live || U.live.status!=='live')return toast('Dars hali boshlanmagan','err');
  if($('#videoGrid'))return;
  const stage=$('#callStage');if(!stage)return;
  stage.innerHTML=`<div class="video-grid" id="videoGrid"><div class="video-person" id="localVideo"><div class="no-video">♙</div><span class="video-name">Siz (mahalliy)</span></div></div><div class="video-controls"><button class="btn" data-act="toggleMic" id="micButton">🎙 Mikrofon</button><button class="btn" data-act="toggleCamera" id="camButton">◉ Kamera</button><button class="btn" data-act="shareScreen">▣ Ekran ulashish</button><button class="btn danger" data-act="leaveCall">✕ Chiqish</button></div>`;
  try{
    U.stream=await navigator.mediaDevices.getUserMedia({video:{width:640,height:360},audio:{echoCancellation:true,noiseSuppression:true}});
    const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.srcObject=U.stream;
    $('#localVideo').prepend(video);$('#localVideo .no-video')?.remove();await video.play().catch(()=>{});
  }catch(e){U.stream=null;toast('Kamera/mikrofonga ruxsat berilmadi. Tinglovchi sifatida ulanmoqdasiz.','err');}
  socket.emit('live:join',{lessonId:U.live.id},async r=>{
    if(!r?.ok){toast(r?.error||'Ulanib bo‘lmadi','err');leaveCall(false);return;}
    for(const peerId of r.peers){
      try{
        const pc=makePeer(peerId);
        const offer=await pc.createOffer();await pc.setLocalDescription(offer);
        socket.emit('live:signal',{lessonId:U.live.id,target:peerId,signal:{description:pc.localDescription}});
      }catch(e){console.error('Peer offer:',e);}
    }
    updateParticipants();toast('Video xonaga ulandingiz','ok');
  });
}
function leaveCall(showToast=true){
  if(U.live)socket?.emit('live:leave');
  for(const id of [...U.peers.keys()])removePeer(id);
  if(U.screenTrack){U.screenTrack.stop();U.screenTrack=null;}
  U.stream?.getTracks().forEach(t=>t.stop());U.stream=null;
  const stage=$('#callStage');if(stage)stage.innerHTML='<div class="glass empty-state"><strong>Video suhbatdan chiqdingiz.</strong><button class="btn primary" data-act="startCall">Qayta ulanish</button></div>';
  if(showToast)toast('Video xonadan chiqdingiz');
}
actions.startCall=()=>guard(startCall);
actions.leaveCall=()=>leaveCall();
actions.toggleMic=()=>{
  const track=U.stream?.getAudioTracks()[0];if(!track)return toast('Mikrofon mavjud emas','err');
  track.enabled=!track.enabled;const b=$('#micButton');if(b)b.textContent=track.enabled?'🎙 Mikrofon yoqilgan':'🔇 Mikrofon o‘chiq';
};
actions.toggleCamera=()=>{
  const track=U.stream?.getVideoTracks()[0];if(!track)return toast('Kamera mavjud emas','err');
  track.enabled=!track.enabled;const b=$('#camButton');if(b)b.textContent=track.enabled?'◉ Kamera yoqilgan':'◌ Kamera o‘chiq';
};
actions.shareScreen=()=>guard(async()=>{
  if(!U.live)return;
  if(U.screenTrack){U.screenTrack.stop();U.screenTrack=null;return;}
  const screen=await navigator.mediaDevices.getDisplayMedia({video:true});
  U.screenTrack=screen.getVideoTracks()[0];
  const original=U.stream?.getVideoTracks()[0];
  const change=track=>Promise.all([...U.peers.values()].map(({pc})=>{const sender=pc.getSenders().find(s=>s.track?.kind==='video');return sender?.replaceTrack(track).catch(()=>{});}));
  await change(U.screenTrack);
  toast('Ekran ulashish boshlandi','ok');
  U.screenTrack.onended=async()=>{U.screenTrack=null;await change(original||null);toast('Ekran ulashish tugadi');};
});
async function videoRoomPage(id){
  if(needLogin())return;
  const l=await api('/live/'+id);U.live=l;
  view(`<div class="pagehead"><div><a class="muted" href="#/live">← Darslar jadvali</a><h1>${esc(l.title)}</h1><p class="muted">${esc(l.course_title)} · ${esc(l.teacher_name||'')}</p></div><div class="call-status"><span id="liveStatus">${statusBadge(l.status)}</span>${l.canManage&&l.status==='scheduled'?`<button class="btn primary" data-act="changeLive" data-id="${l.id}" data-status="live">▶ Darsni boshlash</button>`:''}${l.canManage&&l.status==='live'?`<button class="btn danger" data-act="changeLive" data-id="${l.id}" data-status="ended">Darsni yakunlash</button>`:''}</div></div>
    <div class="video-stage"><div><div id="callStage">${l.status==='live'?'<div class="glass empty-state"><strong>Video darsga qo‘shilish</strong>Kamera va mikrofon uchun ruxsat so‘raladi.<div style="margin-top:15px"><button class="btn primary" data-act="startCall">◉ Ulanish</button></div></div>':`<div class="glass empty-state"><strong>${l.status==='scheduled'?'Dars hali boshlanmagan':'Bu dars yakunlangan'}</strong>${l.status==='scheduled'?new Date(l.starts_at).toLocaleString('uz-UZ'):''}</div>`}</div></div>
    <aside class="glass call-info"><h3>Dars ma’lumotlari</h3><p>Boshlanish: <b>${new Date(l.starts_at).toLocaleString('uz-UZ')}</b></p><p>Davomiylik: <b>${l.duration_min} daqiqa</b></p><p>Ulanganlar: <b id="participantCount">0</b></p><hr style="border:0;border-top:1px solid var(--stroke);margin:17px 0"><h3>Guruh suhbati</h3><p>Savol berish, dars materiallarini ulashish va muhokama qilish.</p><a class="btn sm" style="margin-top:13px;width:100%" href="#/messages/course/${l.course_id}">✉ Xabarlarga o'tish</a><div class="payment-note">Kamera ishlashi uchun HTTPS yoki localhost talab qilinadi. Katta guruhlar uchun SFU xizmatini sozlang.</div></aside></div>`);
}
routes.push([/^#\/live\/(\d+)$/,videoRoomPage]);
actions.changeLive=el=>guard(async()=>{
  const state=el.dataset.status;if(state==='ended'&&!confirm('Darsni yakunlaysizmi?'))return;
  await api('/live/'+el.dataset.id+'/status','PUT',{status:state});toast('Dars holati yangilandi','ok');if(state==='ended')leaveCall(false);videoRoomPage(el.dataset.id);
});
window.addEventListener('hashchange',()=>{
  const h=location.hash;
  if(U.live && h!=='#/live/'+U.live.id){leaveCall(false);U.live=null;}
  if(U.chatScope==='course'&&!h.startsWith('#/messages/course/'+U.chatId)){socket?.emit('course:leave',{courseId:U.chatId});U.chatScope=null;U.chatId=null;}
});

// Admin console: real data and extended management.
async function adminPro(){
  if(needLogin())return;
  if(S.user?.role!=='admin'){view('<div class="glass pad">Administrator huquqi kerak.</div>');return;}
  const tabs=[['stats','Ko‘rsatkichlar'],['users','Foydalanuvchilar'],['courses','Kurslar'],['payments',"To‘lovlar"],['live','Jonli darslar'],['settings','Sozlamalar']];
  let body='';
  if(AD.tab==='stats'){
    const [s,o]=await Promise.all([api('/admin/stats'),api('/admin/overview')]);
    body=`<div class="dash-stats">${[['♙',s.students,"O'quvchilar"],['♛',s.teachers,"O'qituvchilar"],['◫',s.courses,'Barcha kurslar'],['◉',s.online,'Hozir onlayn']].map(([ico,v,n])=>`<div class="glass dash-stat"><div class="emblem">${ico}</div><div><b ${n==='Hozir onlayn'?'data-live="online"':''}>${v}</b><small>${n}</small></div></div>`).join('')}</div>
    <div class="dash-stats" style="grid-template-columns:repeat(3,1fr)">${[['▤',money(o.revenue),'Tasdiqlangan tushum'],['✓',o.paidOrders,"To'langan buyurtmalar"],['◉',o.liveLessons,'Hozirgi videodarslar']].map(([ico,v,n])=>`<div class="glass dash-stat"><div class="emblem">${ico}</div><div><b style="font-size:22px">${v}</b><small>${n}</small></div></div>`).join('')}</div>
    <div class="cols"><section class="glass pad"><div class="panel-topline"><h3>Oxirgi ro‘yxatdan o‘tishlar</h3><span class="muted">Jami ${s.enrollments}</span></div>${s.recentEnrollments.map(x=>`<div class="item"><span class="num">◈</span><span><b>${esc(x.name)}</b><small class="muted" style="display:block">${esc(x.title)}</small></span></div>`).join('')||'<p class="muted">Hozircha yozilish yo‘q</p>'}</section>
    <section class="glass pad"><div class="panel-topline"><h3>Oxirgi test natijalari</h3><b>${s.avg}% o‘rtacha</b></div>${s.recentResults.map(x=>`<div class="item"><span class="num">✓</span><span class="grow"><b>${esc(x.name)}</b><small class="muted" style="display:block">${esc(x.title)}</small></span><span class="status paid">${x.score}/${x.total}</span></div>`).join('')||'<p class="muted">Natijalar hali yo‘q</p>'}</section></div>`;
  }else if(AD.tab==='users'){
    const us=await api('/admin/users');
    body=`<div class="cols"><div class="glass pad tw"><div class="panel-topline"><h3>Foydalanuvchilar</h3><span class="muted">${us.length} ta</span></div><table><thead><tr><th>Ism</th><th>Email</th><th>Rol</th><th>Boshqarish</th></tr></thead><tbody>${us.map(u=>`<tr><td><b>${esc(u.name)}</b></td><td class="muted">${esc(u.email)}</td><td><select class="in" style="min-width:115px;padding:8px" data-role="${u.id}" ${u.id===S.user.id?'disabled':''}>${[['student',"O'quvchi"],['teacher',"O'qituvchi"],['admin','Administrator']].map(([r,n])=>`<option value="${r}" ${u.role===r?'selected':''}>${n}</option>`).join('')}</select></td><td>${u.id!==S.user.id?`<button class="btn sm danger" data-act="delUser" data-id="${u.id}">O'chirish</button>`:''}</td></tr>`).join('')}</tbody></table></div>
    <div class="glass pad"><h3 style="margin-bottom:17px">+ Yangi foydalanuvchi</h3><form data-form="newUser"><div class="fg"><label class="f">Ism va familiya</label><input class="in" name="name" required></div><div class="fg"><label class="f">Email</label><input class="in" name="email" type="email" required></div><div class="fg"><label class="f">Parol</label><input class="in" name="password" type="password" minlength="6" required></div><div class="fg"><label class="f">Rol</label><select class="in" name="role"><option value="teacher">O'qituvchi</option><option value="student">O'quvchi</option><option value="admin">Administrator</option></select></div><button class="btn primary" type="submit">Hisob yaratish</button></form></div></div>`;
  }else if(AD.tab==='courses'){
    const cs=await api('/manage/courses');
    body=`<div class="glass pad tw"><div class="panel-topline"><h3>Kurslarni boshqarish</h3><button class="btn primary" data-act="newCourse">+ Yangi kurs</button></div><table><thead><tr><th>Kurs</th><th>O‘qituvchi</th><th>Narx</th><th>Holat</th><th>Talabalar</th><th>Amallar</th></tr></thead><tbody>${cs.map(c=>`<tr><td><b>${esc(c.cover)} ${esc(c.title)}</b></td><td>${esc(c.teacher_name||'—')}</td><td>${money(c.price)}</td><td>${c.published?'<span class="status paid">E’lon qilingan</span>':'<span class="status pending">Qoralama</span>'}</td><td>${c.students_count}</td><td><a class="btn sm" href="#/manage/${c.id}">Tahrirlash</a> <button class="btn sm danger" data-act="delCourse" data-id="${c.id}">O'chirish</button></td></tr>`).join('')}</tbody></table></div>`;
  }else if(AD.tab==='payments'){
    const orders=await api('/admin/payments');
    body=`<div class="glass pad tw"><div class="panel-topline"><h3>Payme tranzaksiyalari</h3><span class="muted">${orders.length} ta buyurtma</span></div><table><thead><tr><th>ID</th><th>Mijoz</th><th>Kurs</th><th>Summa</th><th>Holat</th><th>Sana</th></tr></thead><tbody>${orders.map(o=>`<tr><td><b>#${o.id}</b></td><td>${esc(o.user_name)}<small class="muted" style="display:block">${esc(o.email)}</small></td><td>${esc(o.course_title)}</td><td>${money(o.amount)}</td><td>${statusBadge(o.status)}</td><td class="muted">${fmtDate(o.created_at)}</td></tr>`).join('')}</tbody></table>${orders.length?'':'<div class="empty-state">Hozircha buyurtmalar yo‘q.</div>'}</div><div class="payment-note">To‘lov holatini administrator qo‘lda “paid” qila olmaydi. Faqat Payme tomonidan to‘g‘ri imzolangan /api/payments/payme so‘rovidagi PerformTransaction tasdiqlaydi.</div>`;
  }else if(AD.tab==='live'){
    const lessons=await api('/live');
    body=`<div class="glass pad"><div class="panel-topline"><h3>Jonli mashg‘ulotlarni boshqarish</h3><button class="btn primary" data-act="scheduleLive">+ Yangi dars</button></div><div class="live-list">${lessons.map(l=>`${liveCard(l)}<div class="row" style="justify-content:flex-end;margin:-7px 5px 12px 0">${l.status==='scheduled'?`<button class="btn sm primary" data-act="changeLive" data-id="${l.id}" data-status="live">Boshlash</button>`:''}${l.status==='live'?`<button class="btn sm danger" data-act="changeLive" data-id="${l.id}" data-status="ended">Tugatish</button>`:''}${l.status!=='live'?`<button class="btn sm danger" data-act="deleteLive" data-id="${l.id}">O'chirish</button>`:''}</div>`).join('')||'<div class="empty-state">Mashg‘ulotlar yo‘q.</div>'}</div></div>`;
  }else{
    body=`<div class="glass pad" style="max-width:720px"><h3 style="margin-bottom:14px">Platforma ma’lumotlari</h3><form data-form="settings"><div class="fg"><label class="f">Platforma nomi</label><input class="in" name="name" required maxlength="60" value="${esc(S.settings.name)}"></div><div class="fg"><label class="f">Tavsif</label><textarea class="in" name="tagline">${esc(S.settings.tagline)}</textarea></div><button class="btn primary" type="submit">O‘zgarishlarni saqlash</button></form><hr style="border:0;border-top:1px solid var(--stroke);margin:23px 0"><h3>Xizmat integratsiyalari</h3><p class="muted" style="margin:10px 0">Payme: merchant kalitlari faqat serverning .env konfiguratsiyasida beriladi. Videodarslar: WebRTC + STUN/TURN. AI: Gemini API.</p><p class="payment-note">Kalitlarni brauzerga, HTMLga yoki GitHubga joylashtirmang. Production uchun HTTPS, TURN, zaxira nusxa va integratsion testlar talab etiladi.</p></div>`;
  }
  view(`<div class="admin-header"><div><div class="eyebrow">MANAGEMENT CONSOLE · ADMIN</div><h1 style="font-size:29px;letter-spacing:-.05em">Boshqaruv markazi</h1><p class="muted">Platforma foydalanuvchilari, kurslar, to‘lovlar va darslar nazorati.</p></div><div class="row"><span class="status paid">● Tizim faol</span><a href="#/" class="btn">Saytga qaytish ↗</a></div></div><nav class="admin-tabs">${tabs.map(([k,n])=>`<button class="${AD.tab===k?'on':''}" data-act="admtab" data-tab="${k}">${n}</button>`).join('')}</nav>${body}`);
}
adminPage=adminPro;
for(const r of routes)if(String(r[0]).includes('admin')){r[1]=adminPro;break;}
actions.deleteLive=el=>guard(async()=>{if(!confirm('Darsni o‘chirasizmi?'))return;await api('/live/'+el.dataset.id,'DELETE');toast('O‘chirildi');adminPro();});

// Guard user session against stale login and use theme consistently.
const oldLogout=actions.logout;
actions.logout=function(){if(U.live)leaveCall(false);U.live=null;U.chatScope=null;oldLogout();};
// Ensure upgraded routes become active even when the original app bootstrap finished
// before this optional extension was evaluated (e.g. fast cache / offline HTML preview).
setTimeout(() => {
  if(socket && !socket.__academyEnhanced) connectSocket();
  route(true);
}, 30);
