'use strict';
/* EduSphere v6 — seven-role workspace. Every submit calls an authenticated backend API. */
const V6={branches:[],groups:[],people:[],exams:[],files:[],current:null};
const v6Admin=()=>S.user&&['admin','super_admin'].includes(S.user.role);
const v6Teacher=()=>S.user&&['teacher','admin','super_admin'].includes(S.user.role);
const v6Financial=()=>S.user&&['admin','super_admin','accountant'].includes(S.user.role);
const v6Money=x=>new Intl.NumberFormat('uz-UZ').format(x||0)+' so‘m';
const v6Links=items=>`<div class="v6-link-grid">${items.map(([href,label,desc,icon])=>`<a class="v6-link" href="${href}"><span class="v6-icon">${icon||'↗'}</span><b>${esc(label)}</b><small>${esc(desc)}</small></a>`).join('')}</div>`;
function v6Menu(){return opMenu([['#/workspace','Bosh panel'],['#/ops/manual-payments','To‘lovlar'],['#/ops/assignments','Uy vazifalari'],['#/ops/exams','Imtihonlar'],['#/messages','Chat'],['#/workspace/notifications','Xabarnomalar']]);}
async function v6Workspace(){if(needLogin())return;const r=S.user.role;
 if(r==='branch_manager'){
  const branches=await api('/v6/branches/my');V6.branches=branches;
  view(opHead('BRANCH MANAGER','Filial boshqaruvi','Siz faqat biriktirilgan filiallar statistikasini ko‘ra olasiz.')+`<div class="op-grid">${branches.map(b=>`<a class="op-tile" href="#/workspace/branch/${b.id}"><span class="op-icon">🏢</span><h3>${esc(b.name)}</h3><p>${esc(b.address||'')}</p></a>`).join('')||'<p>Filialga biriktirilmagansiz. Administratorga murojaat qiling.</p>'}</div>`+v6Links([['#/workspace/groups','Guruhlarim','Filialdagi guruhlar','☷'],['#/workspace/schedule','Dars jadvali','Takrorlanuvchi jadval','▦']]));return;
 }
 if(r==='teacher'){
  const d=await api('/v6/teacher/dashboard');
  view(opHead('TEACHER WORKSPACE','O‘qituvchi kabineti','Guruhlar, o‘quvchilar, topshiriqlar va darslar bitta panelda.')+
  `<div class="op-kpis">${[['Guruhlar',d.groups.length],['O‘quvchilar',d.total_students],['Darslar',d.groups.reduce((a,x)=>a+x.sessions,0)],['Uy vazifalari',d.groups.reduce((a,x)=>a+x.assignments,0)]].map(([k,v])=>`<div class="op-kpi"><small>${k}</small><strong>${v}</strong></div>`).join('')}</div>`+
  opTable(['Guruh','O‘quvchilar','Darslar','Uy vazifalari'],d.groups.map(x=>[esc(x.name),String(x.student_count),String(x.sessions),String(x.assignments)]))+
  v6Links([['#/ops/assignments','Uy vazifasi','Yaratish va baholash','▤'],['#/ops/exams','Imtihonlar','Savol banki va tekshirish','☑'],['#/workspace/groups','Guruhlar','Ro‘yxatlar','☷'],['#/workspace/schedule','Dars jadvali','Reja va to‘qnashuvlar','▦'],['#/live','Jonli dars','Video xona','◉'],['#/messages','Xabarlar','Guruh va shaxsiy chat','✉'],['#/workspace/achievements','Yutuqlar','O‘quvchilar XP','★']]));return;
 }
 if(r==='parent'){
  const kids=await api('/v6/parent/dashboard');
  view(opHead('PARENT WORKSPACE','Ota-ona kabineti','Faqat akkauntingizga biriktirilgan farzandlar ko‘rsatiladi.')+
  `<div class="op-grid">${kids.map(c=>`<a class="op-tile" href="#/ops/parent/${c.id}"><span class="op-icon">♙</span><h3>${esc(c.name)}</h3><p>Davomat: ${c.total?Math.round(100*c.present/c.total):0}%</p><p>Qarzdorlik: ${v6Money(c.debt)}</p><span class="op-link">Batafsil ↗</span></a>`).join('')||'<div class="cms-surface">Admin hali farzand akkauntini biriktirmagan.</div>'}</div>`+v6Links([['#/ops/parent','Farzandlarim','Natija, davomat va to‘lov','♙'],['#/ops/tickets','Yordam','Administratorga murojaat','✉'],['#/workspace/notifications','Bildirishnomalar','Xabar sozlamalari','◉']]));return;
 }
 if(r==='accountant'){
  const data=await api('/ops/finance');
  view(opHead('ACCOUNTANT WORKSPACE','Buxgalter kabineti','To‘lovlarni admin/buxgalter qo‘lda, hujjat asosida qayd etadi.')+
  `<div class="op-kpis">${[['Hisoblangan',data.invoiced],['Qabul qilingan',data.received],['Qarzdorlik',data.outstanding],['Xarajatlar',data.expenses]].map(([k,v])=>`<div class="op-kpi"><small>${k}</small><strong>${v6Money(v)}</strong></div>`).join('')}</div>`+
  v6Links([['#/ops/manual-payments','To‘lov kiritish','Summa, sana, usul va kvitansiya','💳'],['#/ops/invoices','Hisob-fakturalar','Qarzdorlik va to‘lovlar','▤'],['#/ops/report','Oylik hisobot','CSV eksport','▦'],['#/ops/salary','O‘qituvchi ish haqi','Hisoblangan maosh','♙']]));return;
 }
 if(r==='student'){
  view(opHead('STUDENT WORKSPACE','O‘quvchi kabineti','O‘qish, uy vazifalari, to‘lovlar va natijalar.')+v6Links([['#/me','Mening kurslarim','Darslar va progress','▤'],['#/ops/assignments','Uy vazifalarim','Javob yuborish','✎'],['#/ops/exams','Imtihonlar','Vaqtli testlar','☑'],['#/ops/payments','To‘lov tarixi','Qachon va qancha to‘langani','◈'],['#/workspace/achievements','XP va yutuqlar','O‘qish natijalari','★'],['#/messages','O‘qituvchiga yozish','Chat','✉'],['#/workspace/notifications','Bildirishnomalar','Xabarlar','◉']]));return;
 }
 const [stats,branches]=await Promise.all([api('/admin/stats'),api('/v6/branches/my')]);V6.branches=branches;
 view(opHead('MANAGEMENT • '+r.toUpperCase(),r==='super_admin'?'Super administrator':'Administrator kabineti','Ta’lim markazining asosiy modullari va faoliyati.')+
 `<div class="op-kpis">${[['O‘quvchilar',stats.students],['O‘qituvchilar',stats.teachers],['Kurslar',stats.courses],['Yozilganlar',stats.enrollments]].map(([k,v])=>`<div class="op-kpi"><small>${k}</small><strong>${v}</strong></div>`).join('')}</div>`+
 v6Links([['#/admin','Administrator','Foydalanuvchilar va kurslar','◈'],['#/admin/cms','Kontent CMS','Logo, maqola va reklama','▤'],['#/ops/manual-payments','To‘lovlar','Summalar va sana bilan','💳'],['#/ops/report','Moliyaviy hisobot','Qarzdorlik va tushum','▦'],['#/workspace/branches','Filiallar','Filial vakolatlari','▧'],['#/workspace/staff','Xodimlar','Rollarni biriktirish','♙'],['#/workspace/groups','Guruhlar','Import va ko‘chirish','☷'],['#/workspace/schedule','Jadval','Haftalik takrorlanuvchi','▦'],['#/ops/exams','Imtihonlar','Savollar va urinishlar','☑'],['#/ops/parents','Ota-onalar','Farzand biriktirish','♙'],['#/workspace/achievements','Reyting','Yutuqlar va XP','★'],['#/workspace/audit','Xavfsizlik jurnali','Audit izi','⌁'],['#/ops/tickets','Murojaatlar','Qo‘llab-quvvatlash','✉']])+`<div class="cms-surface" style="margin-top:18px">${branches.length} ta filial ro‘yxatga olingan.</div>`);
}
async function v6Branch(id){if(needLogin())return;const d=await api('/v6/branches/'+id+'/overview');
 view(opHead('FILIAL',d.branch.name,d.branch.address||'Filial statistikasi')+`<div class="op-kpis"><div class="op-kpi"><small>Guruhlar</small><strong>${d.groups.length}</strong></div><div class="op-kpi"><small>O‘quvchilar</small><strong>${d.total_students}</strong></div></div>`+opTable(['Guruh','Kurs','Ustoz','O‘quvchilar','Sig‘im'],d.groups.map(g=>[esc(g.name),esc(g.course_title),esc(g.teacher_name||'—'),String(g.students),String(g.capacity)]))+`<a class="btn" href="#/workspace">← Bosh panel</a>`);
}
async function v6Branches(){if(needLogin())return;const branches=await api('/v6/branches/my');V6.branches=branches;
 view(opHead('BRANCH MANAGEMENT','Filiallar','Filiallar kesimida boshqaruv va ma’lumot ajratish.')+`<div class="op-grid">${branches.map(b=>`<a class="op-tile" href="#/workspace/branch/${b.id}"><span class="op-icon">▧</span><h3>${esc(b.name)}</h3><p>${esc(b.address||'')}</p></a>`).join('')}</div>`);
}
async function v6Staff(){if(needLogin())return;if(!v6Admin())throw Error('Ruxsat yo‘q');const [users,branches]=await Promise.all([api('/admin/users'),api('/v6/branches/my')]);V6.people=users;V6.branches=branches;
 const users2=users.filter(u=>['branch_manager','teacher'].includes(u.role));
 view(opHead('RBAC • STAFF','Xodim va filial vakolatlari','Super admin faqat xavfsiz CLI orqali yaratiladi. Filial boshqaruvchisi boshqa filialni ko‘ra olmaydi.')+
 opForm('v6Staff',`${opSelect('user_id',users2,'Xodim')}${opSelect('branch_id',branches,'Filial')}`,'Filialga biriktirish')+
 opTable(['Foydalanuvchi','Email','Rol'],users.map(u=>[esc(u.name),esc(u.email),esc(u.role)]))+
 `<p class="muted">Yangi xodim yaratish yoki rolini o‘zgartirish: <a class="op-link" href="#/admin">Administrator → Foydalanuvchilar</a>.</p>`);
}
forms.v6Staff=f=>guard(async()=>{await api('/v6/staff/branch','POST',Object.fromEntries(new FormData(f)));toast('Xodim filialga biriktirildi','ok');v6Staff();});
async function v6Groups(){if(needLogin())return;const groups=await api('/v6/groups/mine');V6.groups=groups;
 view(opHead('ACADEMIC MANAGEMENT','Guruhlar','O‘quvchilarning guruhdan guruhga o‘tish tarixi saqlanadi.')+
 opTable(['Guruh','Kurs','Ustoz','Amal'],groups.map(g=>[esc(g.name),esc(g.course_title),esc(g.teacher_name||'—'),`<a class="btn sm" href="#/workspace/import/${g.id}">CSV import</a>`]))+
 (v6Teacher()||S.user.role==='branch_manager'?opForm('v6Transfer',`${opField('O‘quvchi ID','student_id','number','required min="1"')}${opSelect('from_group',groups,'Eski guruh')}${opSelect('to_group',groups,'Yangi guruh')}${opField('Ko‘chirish izohi','note','text','maxlength="300"')}`,'O‘quvchini ko‘chirish'):'')+
 (v6Admin()?'<a href="#/ops" class="btn">Guruhlarni boshqarish ↗</a>':''));
}
forms.v6Transfer=f=>guard(async()=>{const b=Object.fromEntries(new FormData(f));if(!confirm('Guruh o‘zgartirilsinmi?'))return;await api('/v6/groups/transfer','POST',b);toast('O‘quvchi ko‘chirildi','ok');v6Groups();});
async function v6Import(groupId){if(needLogin())return;if(!v6Teacher()&&S.user.role!=='branch_manager')throw Error('Ruxsat yo‘q');
 view(opHead('CSV BULK IMPORT','Guruhga CSV orqali qo‘shish','Birinchi qatorda student_id; keyingi qatorda mavjud o‘quvchi IDlari bo‘lsin. Avval tekshirib ko‘ring.')+
 `<form class="op-form glass" data-form="v6Import" data-id="${groupId}"><label class="op-field" style="grid-column:1/-1">CSV matni<textarea class="in" name="csv" rows="8" maxlength="200000" required placeholder="student_id&#10;12&#10;17&#10;20"></textarea></label><button class="btn" type="button" data-act="v6Preview" data-id="${groupId}">Tekshirish</button><button class="btn primary">Bazaga yozish</button></form><div id="v6ImportStatus"></div>`);
}
async function v6ImportSubmit(f,preview){const out=await api('/v6/groups/'+f.dataset.id+'/import','POST',{csv:f.elements.csv.value,preview});if(out.errors?.length){$('#v6ImportStatus').textContent=JSON.stringify(out.errors,null,2);throw Error('CSVdagi xatolarni tuzating');}if(preview)$('#v6ImportStatus').textContent=`Mavjud ID: ${out.valid}; yangi qo‘shiladigan: ${out.new_students}`;else {toast('O‘quvchilar qo‘shildi: '+out.added,'ok');location.hash='#/workspace/groups';}}
forms.v6Import=f=>guard(()=>v6ImportSubmit(f,false));actions.v6Preview=()=>{const f=$('[data-form="v6Import"]');guard(()=>v6ImportSubmit(f,true));};
async function v6Schedule(){if(needLogin())return;const [jobs,groups]=await Promise.all([api('/v6/schedule/repeat'),api('/v6/groups/mine')]);V6.groups=groups;const days=['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
 view(opHead('CALENDAR • RECURRING','Takroriy dars jadvali','Bir ustoz yoki xona uchun vaqt to‘qnashuviga yo‘l qo‘yilmaydi.')+
 (v6Teacher()||S.user.role==='branch_manager'?opForm('v6Repeat',`${opSelect('group_id',groups,'Guruh')}<label class="op-field"><span>Hafta kuni</span><select class="in" name="weekday">${days.map((d,i)=>`<option value="${i}">${d}</option>`).join('')}</select></label>${opField('Boshlanish','start_time','time','required')}${opField('Tugash','end_time','time','required')}${opField('Mavzu','topic','text','required minlength="3"')}${opField('Xona','room','text','maxlength="70"')}`,'Dars vaqtini saqlash'):'')+
 opTable(['Guruh','Kun','Soat','Xona','Mavzu'],jobs.map(j=>[esc(j.group_name),esc(days[j.weekday]),esc(j.start_time+'–'+j.end_time),esc(j.room||'—'),esc(j.topic)])));
}
forms.v6Repeat=f=>guard(async()=>{const b=Object.fromEntries(new FormData(f));b.weekday=Number(b.weekday);await api('/v6/schedule/repeat','POST',b);toast('Dars jadvali saqlandi','ok');v6Schedule();});
async function v6Files(kind,id){if(needLogin())return;V6.current={kind,id};const files=await api('/v6/files/'+kind+'/'+id);V6.files=files;
 view(opHead('PRIVATE STORAGE','Biriktirilgan fayllar',`Obyekt: ${kind} #${id}. Faqat tegishli foydalanuvchilar ochishi mumkin.`)+
 `<div class="cms-surface"><label class="op-field">PDF yoki rasm (5MB gacha)<input class="in" id="v6Upload" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"></label><button class="btn primary" style="margin-top:12px" data-act="v6Upload">Yuklash</button></div>`+
 opTable(['Fayl','Hajm','Sana','Ochish'],files.map(f=>[esc(f.filename),String(Math.ceil(f.size_bytes/1024))+' KB',esc(f.created_at),`<button class="btn sm" data-act="v6Download" data-id="${f.id}">Yuklab olish</button>`])));
}
actions.v6Upload=()=>guard(async()=>{const file=$('#v6Upload')?.files[0],data=V6.current;if(!file||!data)throw Error('Faylni tanlang');if(file.size>5*1024*1024)throw Error('5 MB limit');const ext=file.name.split('.').pop().toLowerCase()==='jpeg'?'jpg':file.name.split('.').pop().toLowerCase();const r=await fetch(`/api/v6/files/${data.kind}/${data.id}`,{method:'POST',headers:{'Authorization':'Bearer '+S.token,'Content-Type':'application/octet-stream','X-File-Name':file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),'X-File-Ext':ext},body:file});const d=await r.json();if(!r.ok)throw Error(d.error||'Fayl yuklanmadi');toast('Fayl saqlandi','ok');v6Files(data.kind,data.id);});
actions.v6Download=el=>guard(async()=>{const r=await fetch('/api/v6/files/'+el.dataset.id+'/download',{headers:{Authorization:'Bearer '+S.token}});if(!r.ok)throw Error((await r.json()).error||'Fayl ochilmadi');const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='hujjat-'+el.dataset.id;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);});
async function v6Achievements(){if(needLogin())return;const admin=v6Admin(),student=S.user.role==='student';const [my,top,people]=await Promise.all([student?api('/v6/achievements'):Promise.resolve([]),api('/v6/leaderboard'),admin?api('/ops/people'):Promise.resolve([])]);
 view(opHead('STUDENT ACHIEVEMENTS','Yutuqlar va reyting','Ballar faqat ustoz yoki administrator tomonidan haqiqiy yozuv sifatida beriladi.')+
 (student?opTable(['Yutuq','XP','Izoh'],my.map(x=>[esc(x.code),String(x.points),esc(x.details)])):'')+
 (v6Teacher()?opForm('v6Award',`${opField('O‘quvchi ID','student_id','number','required min="1"')}${opField('Yutuq kodi','code','text','required placeholder="first_exam"')}${opField('XP','points','number','required min="0" max="1000"')}${opField('Izoh','details','text','maxlength="300"')}`,'Yutuq berish'):'')+
 `<h2 class="h2">Eng faol o‘quvchilar</h2>`+opTable(['Taxallus','XP'],top.map(x=>[esc(x.nickname),String(x.points)])));
}
forms.v6Award=f=>guard(async()=>{const b=Object.fromEntries(new FormData(f));b.points=Number(b.points);await api('/v6/achievements','POST',b);toast('XP saqlandi','ok');v6Achievements();});
async function v6ExamImport(id){if(needLogin())return;if(!v6Teacher())throw Error('Ruxsat yo‘q');view(opHead('QUESTION BANK • CSV','Savollarni import qilish','Avval CSV tarkibini tekshiring; barcha savollar bir tranzaksiyada qo‘shiladi.')+
 `<div class="cms-surface"><p class="muted">Sarlavha: type,prompt,options,answer,points. Masalan: single,"2+2?","3|4|5",2,1</p></div>`+
 `<form class="op-form glass" data-form="v6ExamImport" data-id="${id}"><label class="op-field" style="grid-column:1/-1">CSV matni<textarea class="in" name="csv" rows="8" maxlength="200000" required></textarea></label><button type="button" class="btn" data-act="v6ExamPreview">Tekshirish</button><button class="btn primary">Savollarni qo‘shish</button></form><div id="v6ExamStatus"></div>`);
}
async function v6ExamImportSubmit(f,preview){const d=await api('/v6/exams/'+f.dataset.id+'/questions/import','POST',{csv:f.elements.csv.value,preview});if(d.errors?.length){$('#v6ExamStatus').textContent=JSON.stringify(d.errors,null,2);throw Error('CSV xatosi');}if(preview)$('#v6ExamStatus').textContent='Yaroqli savollar: '+d.count;else{toast(d.added+' savol saqlandi','ok');location.hash='#/ops/exams/'+f.dataset.id;}}
forms.v6ExamImport=f=>guard(()=>v6ExamImportSubmit(f,false));actions.v6ExamPreview=()=>guard(()=>v6ExamImportSubmit($('[data-form="v6ExamImport"]'),true));
async function v6Notifications(){if(needLogin())return;const p=await api('/v6/notifications/preferences');
 view(opHead('ALERT PREFERENCES','Bildirishnoma sozlamalari','Platforma ichidagi xabarlar bo‘yicha afzalliklar.')+opForm('v6Prefs',`${[['chat','Xabarlar'],['academic','Dars va baholar'],['billing','To‘lovlar']].map(([k,label])=>`<label class="op-field">${label}<select class="in" name="${k}"><option value="1" ${p[k]?'selected':''}>Yoqilgan</option><option value="0" ${p[k]?'':'selected'}>O‘chirilgan</option></select></label>`).join('')}`,'Saqlash')+`<a class="btn" href="#/notifications">Bildirishnomalar tarixi ↗</a>`);
}
forms.v6Prefs=f=>guard(async()=>{const b=Object.fromEntries(new FormData(f));Object.keys(b).forEach(k=>b[k]=Number(b[k]));await api('/v6/notifications/preferences','PUT',b);toast('Sozlamalar saqlandi','ok');});
async function v6Audit(){if(needLogin())return;if(!v6Admin())throw Error('Ruxsat yo‘q');const rows=await api('/v6/security/audit');view(opHead('SECURITY AUDIT','Faoliyat tarixi','Yangi boshqaruv amallari foydalanuvchi va vaqt bilan yoziladi.')+opTable(['Vaqt','Xodim','Amal','Tur','ID','Izoh'],rows.map(a=>[esc(a.created_at),esc(a.actor_name||''),esc(a.action),esc(a.target),String(a.target_id||''),esc(a.details||'')])));}
// Interactive links for uploads from homework and exam editors without changing existing form semantics.
const v6OldNav=renderNav;
renderNav=function(){v6OldNav();if(S.user){$('#dock')?.insertAdjacentHTML('beforeend',`<a class="nl ${location.hash==='#/workspace'?'on':''}" href="#/workspace">▦ &nbsp; ${esc(({super_admin:'Super admin',admin:'Boshqaruv',branch_manager:'Filialim',teacher:'Ustoz kabineti',student:'O‘quvchi kabineti',parent:'Ota-ona kabineti',accountant:'Buxgalteriya'})[S.user.role]||'Kabinet')}</a>`);}};
// Keep old functionality reachable; all 7 roles get their dedicated page.
routes.push([/^#\/workspace$/,v6Workspace],[/^#\/workspace\/branch\/(\d+)$/,v6Branch],[/^#\/workspace\/branches$/,v6Branches],[/^#\/workspace\/staff$/,v6Staff],[/^#\/workspace\/groups$/,v6Groups],[/^#\/workspace\/schedule$/,v6Schedule],[/^#\/workspace\/import\/(\d+)$/,v6Import],[/^#\/workspace\/files\/(homework|material|chat)\/(\d+)$/,v6Files],[/^#\/workspace\/achievements$/,v6Achievements],[/^#\/workspace\/exam-import\/(\d+)$/,v6ExamImport],[/^#\/workspace\/notifications$/,v6Notifications],[/^#\/workspace\/audit$/,v6Audit]);

async function v6Mfa(){if(needLogin())return;const status=await api('/v6/mfa/status');
 view(opHead('ACCOUNT PROTECTION','Ikki bosqichli himoya (2FA)','Google Authenticator yoki boshqa TOTP ilovasi bilan 6 xonali kod ishlatiladi.')+
 `<div class="cms-surface" style="max-width:760px"><p>Holat: <b>${status.enabled?'🟢 Yoqilgan':'🟠 O‘chirilgan'}</b></p>${status.enabled?opForm('v6MfaDisable',`${opField('Authenticator kodi','code','text','required pattern="[0-9]{6}" maxlength="6"')}${opField('Joriy parol','password','password','required')}`,'2FAni o‘chirish'):`<button class="btn primary" data-act="v6MfaSetup">2FA sozlash</button><div id="v6MfaSetup"></div>`}</div>`);
}
actions.v6MfaSetup=()=>guard(async()=>{const d=await api('/v6/mfa/setup','POST',{});$('#v6MfaSetup').innerHTML=`<div class="cms-surface" style="margin:15px 0"><p>Authenticator ilovasiga quyidagi maxfiy kalitni qo‘shing. Uni hech kimga yubormang:</p><pre class="v6-secret">${esc(d.secret)}</pre>${opForm('v6MfaEnable',`${opField('Ilovadagi 6 xonali kod','code','text','required pattern="[0-9]{6}" maxlength="6"')}`,'2FAni faollashtirish')}</div>`;});
forms.v6MfaEnable=f=>guard(async()=>{await api('/v6/mfa/enable','POST',{code:f.elements.code.value});toast('2FA yoqildi','ok');v6Mfa();});
forms.v6MfaDisable=f=>guard(async()=>{if(!confirm('2FAni o‘chirishga rozimisiz?'))return;await api('/v6/mfa/disable','POST',Object.fromEntries(new FormData(f)));toast('2FA o‘chirildi','ok');v6Mfa();});
routes.push([/^#\/workspace\/mfa$/,v6Mfa]);
const v6SecNav=renderNav;
renderNav=function(){v6SecNav();if(S.user)$('#dock')?.insertAdjacentHTML('beforeend','<a class="nl" href="#/workspace/mfa">⌁ &nbsp; 2FA himoya</a>');};

actions.v6InvoicePrint=el=>guard(async()=>{const r=await fetch('/api/v6/invoices/'+el.dataset.id+'/print',{headers:{Authorization:'Bearer '+S.token}});if(!r.ok)throw Error((await r.json()).error||'Hujjat ochilmadi');const url=URL.createObjectURL(new Blob([await r.text()],{type:'text/html'}));window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);});
