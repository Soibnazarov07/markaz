'use strict';
/* v5: real manual tuition ledger, profiles, announcements, and academic reporting. */
const V5 = { payments:[], invoices:[], users:[], month:'' };
const v5Today=()=>new Date(Date.now()+5*3600000).toISOString().slice(0,10);
const v5Month=()=>v5Today().slice(0,7);
const v5Cash=x=>opCash(x);
const v5T=(arr)=>opTable(...arr);
const v5Who=()=>S.user&&['admin','super_admin','accountant'].includes(S.user.role);
const v5PayLink=()=>v5Who()?'#/ops/manual-payments':S.user?.role==='student'?'#/ops/payments':S.user?.role==='parent'?'#/ops/parent':'#/ops';
const v5Tabs=()=>opMenu([['#/ops','Kabinet'],[v5PayLink(),'To‘lovlar'],['#/ops/announcements','E’lonlar'],...(v5Who()?[['#/ops/report','Hisobotlar'],['#/ops/profiles','Profil boshqaruvi']]:[])]);
const v5Status=r=>r.voided_at?'<span class="op-warning">Bekor qilingan</span>':'<span class="op-ok">Tasdiqlangan</span>';
async function v5ManualPayments(){
 if(needLogin())return;if(!v5Who()){location.hash='#/ops/payments';return;}
 const [rows,invoices,users,courses]=await Promise.all([api('/ops/manual-payments'),api('/ops/invoices'),api('/ops/people'),api('/courses')]);
 V5.payments=rows;V5.invoices=invoices;V5.users=users;
 const unpaid=invoices.filter(x=>x.status==='open'&&x.balance>0).map(x=>({id:x.id,name:`#${x.id} — ${x.student_name} (${v5Cash(x.balance)} qarz)`}));
 const f=opForm('v5Payment',`${opSelect('student_id',users.filter(x=>x.role==='student'),'O‘quvchi',false)}<label class="op-field"><span>Ochiq hisob (ixtiyoriy)</span><select class="in" name="invoice_id"><option value="">Yangi to‘lov / avtomatik hisob</option>${unpaid.map(i=>`<option value="${i.id}">${opEsc(i.name)}</option>`).join('')}</select></label><label class="op-field"><span>Kurs (ixtiyoriy, yangi hisob uchun)</span><select class="in" name="course_id"><option value="">Umumiy to‘lov</option>${courses.filter(c=>c.price>0).map(c=>`<option value="${c.id}">${opEsc(c.title)} — ${v5Cash(c.price)}</option>`).join('')}</select></label>${opField('Haqiqiy to‘langan summa (UZS)','amount','number','required min="1" max="1000000000" step="1"')}${opField('To‘lov qilingan sana','paid_on','date',`required value="${v5Today()}"`)}<label class="op-field"><span>Usul</span><select class="in" name="method"><option value="cash">Naqd</option><option value="bank_transfer">Bank o‘tkazmasi</option></select></label>${opField('Kvitansiya / chekning raqami (ixtiyoriy)','reference','text','maxlength="100" placeholder="Avtomatik raqam yaratish mumkin"')}${opField('Izoh / qaysi oy uchun','note','text','maxlength="500"')}`,'To‘lovni tasdiqlab saqlash');
 view(opHead('FINANCE • MANUAL LEDGER','O‘quvchilar to‘lovlari','Administrator o‘quvchi, summa, sana, usul va izohni kiritadi. Bank/Click/Uzum bilan bog‘lanmaydi.')+v5Tabs()+`<div class="cms-surface" style="padding:16px;margin-bottom:18px"><strong>Moliyaviy izchillik</strong><p class="muted">To‘lovni faqat pul qabul qilinganidan so‘ng kiriting. Noto‘g‘ri yozuvni o‘chirmasdan sabab bilan bekor qilish mumkin. Kurs uchun to‘liq to‘lovdan so‘ng unga kirish ochiladi.</p></div>`+
 f+`<div class="row between" style="margin:25px 0"><h2 class="h2" style="margin:0">To‘lovlar tarixi</h2><a class="btn" href="#/ops/report">Oylik hisobot ↗</a></div>`+
 opTable(['#','O‘quvchi','Qancha','Qachon','Usul','Hujjat','Holat','Amal'],rows.map(r=>[
 String(r.id),opEsc(r.student_name),v5Cash(r.amount),opEsc(r.paid_on||String(r.created_at).slice(0,10)),r.method==='cash'?'Naqd':'Bank',opEsc(r.reference),v5Status(r),!r.voided_at&&['admin','super_admin'].includes(S.user.role)?`<button class="btn sm danger" data-act="v5Void" data-id="${r.id}">Bekor qilish</button>`:'—'
 ])));
}
async function v5MyPayments(){if(needLogin())return;
 if(v5Who()){location.hash='#/ops/manual-payments';return;}
 const rows=await api('/ops/manual-payments');
 view(opHead('STUDENT • FINANCE','Mening to‘lovlarim','To‘langan sana, summa, usul va to‘lov holati. Ma’lumotni administrator kiritadi.')+v5Tabs()+
 opTable(['Sana','Summa','Usul','Hujjat','Izoh','Holat'],rows.map(r=>[opEsc(r.paid_on||String(r.created_at).slice(0,10)),v5Cash(r.amount),r.method==='cash'?'Naqd':'Bank',opEsc(r.reference),opEsc(r.note||r.invoice_description),v5Status(r)])));
}
forms.v5Payment=f=>guard(async()=>{
 const b=Object.fromEntries(new FormData(f));if(!b.invoice_id)delete b.invoice_id;if(!b.course_id)delete b.course_id;
 if(!confirm(`O‘quvchidan ${v5Cash(Number(b.amount))} haqiqatan olinganmi? Sana: ${b.paid_on}.`))return;
 const d=await api('/ops/manual-payments','POST',b);toast(d.access_granted?'To‘lov saqlandi va kurs ochildi':'To‘lov saqlandi. Hujjat: '+d.reference,'ok');v5ManualPayments();
});
actions.v5Void=el=>{const reason=prompt('Nega bu to‘lovni bekor qilmoqchisiz? (kamida 10 ta belgi)');if(!reason)return;guard(async()=>{await api('/ops/manual-payments/'+el.dataset.id+'/void','POST',{reason});toast('To‘lov bekor qilindi','ok');v5ManualPayments();});};
async function v5Report(){if(needLogin())return;if(!v5Who())throw Error('Ruxsat yo‘q');const month=V5.month||v5Month();const [d,sum]=await Promise.all([api('/ops/manual-payments/report?month='+encodeURIComponent(month)),api('/v5/reports/summary?month='+encodeURIComponent(month))]);
 V5.month=month;
 view(opHead('BUSINESS INTELLIGENCE','Oylik moliyaviy hisobot','Barcha raqamlar serverdagi haqiqiy kvitansiya va hisob-fakturalardan olinadi.')+v5Tabs()+
 `<form data-form="v5Report" class="op-form glass" style="max-width:550px">${opField('Oy','month','month',`required value="${opEsc(month)}"`)}<button class="btn primary">Ko‘rsatish</button><button type="button" class="btn" data-act="v5Csv">CSV yuklash</button></form>`+
 `<div class="op-kpis">${[['Oy tushumi',sum.income],['Oylik xarajat',sum.expenses],['Jami qarzdorlik',sum.debts],['Sof farq',sum.income-sum.expenses]].map(([k,v])=>`<div class="op-kpi"><small>${opEsc(k)}</small><strong>${v5Cash(v)}</strong></div>`).join('')}</div>`+
 `<div class="op-kpis">${[['O‘quvchilar',sum.students],['O‘qituvchilar',sum.teachers],['Guruhlar',sum.groups],['Davomat',sum.attendance_total?Math.round(100*sum.present/sum.attendance_total)+'%':'—']].map(([k,v])=>`<div class="op-kpi"><small>${opEsc(k)}</small><strong>${opEsc(v)}</strong></div>`).join('')}</div>`+
 `<h2 class="h2">Qarzdor o‘quvchilar</h2>`+opTable(['O‘quvchi','Izoh','Muddat','Qoldiq'],sum.unpaid.map(x=>[opEsc(x.student_name),opEsc(x.description),opEsc(x.due_on),v5Cash(x.debt)])));
}
forms.v5Report=f=>{V5.month=f.elements.month.value;v5Report();};
actions.v5Csv=()=>guard(async()=>{
 const r=await fetch('/api/ops/manual-payments/export.csv?month='+encodeURIComponent(V5.month||v5Month()),{headers:{Authorization:'Bearer '+S.token}});
 if(!r.ok){const e=await r.json();throw Error(e.error||'Hisobot yuklanmadi');}
 const b=await r.blob(),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='tolovlar-'+V5.month+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
async function v5Profiles(){if(needLogin())return;if(!['admin','super_admin'].includes(S.user.role))return;const data=await api('/v5/profiles');
 view(opHead('CRM • STUDENTS & STAFF','Foydalanuvchi profillari','Telefon, tug‘ilgan sana, o‘qish holati va mutaxassislikni serverda tahrirlash.')+v5Tabs()+
 opTable(['Ism','Email','Rol','Telefon','Holat','Amal'],data.rows.map(u=>[opEsc(u.name),opEsc(u.email),opEsc(u.role),opEsc(u.phone||'—'),opEsc(u.status||'active'),`<a class="btn sm" href="#/ops/profile/${u.id}">Tahrirlash</a>`])));
}
async function v5Profile(uid){if(needLogin())return;const p=await api('/v5/profiles/'+uid);view(opHead('PEOPLE • PROFILE','Foydalanuvchi profili',p.name+' · '+p.email)+v5Tabs()+
 opForm('v5Profile',`<input type="hidden" name="id" value="${p.id}">${opField('Telefon','phone','tel',`value="${opEsc(p.phone||'')}"`)}${opField('Tug‘ilgan sana','birth_date','date',`value="${opEsc(p.birth_date||'')}"`)}${opField('Ota-ona telefoni','guardian_phone','tel',`value="${opEsc(p.guardian_phone||'')}"`)}${opField('Mutaxassislik','specialization','text',`value="${opEsc(p.specialization||'')}"`)}${opField('Manzil','address','text',`value="${opEsc(p.address||'')}"`)}<label class="op-field"><span>Holat</span><select class="in" name="status">${['active','pending','frozen','graduated','inactive'].map(s=>`<option ${p.status===s?'selected':''} value="${s}">${s}</option>`).join('')}</select></label>${opField('Profil haqida','public_bio','text',`value="${opEsc(p.public_bio||'')}"`)}`,'Profilni saqlash'));
}
forms.v5Profile=f=>guard(async()=>{const b=Object.fromEntries(new FormData(f));await api('/v5/profiles/'+b.id,'PUT',b);toast('Profil saqlandi','ok');v5Profile(b.id);});
async function v5Announcements(){if(needLogin())return;const [rows,groups]=await Promise.all([api('/v5/announcements'),opGroups()]);view(opHead('COMMUNICATION • NEWS','E’lonlar','Barcha foydalanuvchilarga yoki ruxsatli guruh a’zolariga e’lon yuborish.')+v5Tabs()+
 (opStaff()?opForm('v5Announce',`${opField('Sarlavha','title','text','required minlength="3"')}<label class="op-field"><span>Guruh</span><select class="in" name="group_id">${['admin','super_admin'].includes(S.user.role)?'<option value="">Barcha foydalanuvchilar</option>':''}${groups.map(g=>`<option value="${g.id}">${opEsc(g.name)}</option>`).join('')}</select></label><label class="op-field"><span>Matn</span><textarea class="in" name="message" maxlength="3000" minlength="5" required></textarea></label>`,'E’lon yuborish'):'')+
 `<div class="op-stack">${rows.map(x=>`<div class="cms-surface"><small class="muted">${opEsc(x.group_name||'Umumiy')} • ${opEsc(x.author_name)} • ${opEsc(x.published_at)}</small><h3>${opEsc(x.title)}</h3><p style="white-space:pre-wrap">${opEsc(x.message)}</p></div>`).join('')||'<div class="cms-surface muted">E’lonlar yo‘q</div>'}</div>`);
}
forms.v5Announce=f=>guard(async()=>{const b=Object.fromEntries(new FormData(f));if(!b.group_id)delete b.group_id;await api('/v5/announcements','POST',b);toast('E’lon saqlandi','ok');v5Announcements();});
async function v5AttendanceCode(){if(needLogin())return;view(opHead('ATTENDANCE • CHECK IN','Darsda qatnashish','O‘qituvchi bergan bir martalik qisqa muddatli kodni kiriting.')+v5Tabs()+
 opForm('v5Redeem',`${opField('Dars ID','session_id','number','min="1" required')}${opField('Dars kodi','code','text','maxlength="10" minlength="10" required')}`,'Davomatdan o‘tish'));
}
forms.v5Redeem=f=>guard(async()=>{await api('/v5/attendance/redeem','POST',Object.fromEntries(new FormData(f)));toast('Davomat saqlandi','ok');v5AttendanceCode();});
async function v5MakeCode(){if(needLogin())return;const sessions=await api('/v5/attendance/sessions');
 view(opHead('ATTENDANCE • CODE','Davomat kodi chiqarish','Mavjud dars uchun 3 daqiqa amal qiladigan kod yarating.')+v5Tabs()+
 opForm('v5MakeCode',`${opSelect('session_id',sessions.map(x=>({id:x.id,name:'#'+x.id+' — '+x.group_name+' — '+x.session_date+' — '+x.topic})),'Dars')}`,'Kod yaratish')+
 `<div id="v5CodeResult" class="cms-surface">${sessions.length?'Darsni tanlang.':'Avval guruh davomatidan dars seansini yarating.'}</div>`);
}
forms.v5MakeCode=f=>guard(async()=>{const d=await api('/v5/attendance/'+f.elements.session_id.value+'/code','POST');$('#v5CodeResult').textContent='Kod: '+d.code+' | Tugash: '+new Date(d.expires_at).toLocaleTimeString('uz-UZ');});
// Manual enrollment request: send real CRM lead instead of unsupported payment checkout.
const v5OldEnroll=actions.enroll;
actions.enroll=el=>{
 const c=COURSE&&COURSE.id==el.dataset.id?COURSE:null;
 if(c&&c.price>0&&!c.manager&&!c.enrolled){if(needLogin())return;
  modal(`<h2>Kursga yozilish</h2><p class="muted">Kurs: ${opEsc(c.title)} • ${v5Cash(c.price)}</p>${opForm('v5Lead',`<input type="hidden" name="courseId" value="${c.id}"><label class="op-field"><span>Telefon raqamingiz</span><input class="in" name="phone" required placeholder="+998901234567" maxlength="25"></label><label class="op-field"><span><input type="checkbox" name="consent" required> Telefon orqali bog‘lanishga roziman</span></label>`,'Ariza yuborish')}`);return;
 }
 return v5OldEnroll(el);
};
forms.v5Lead=f=>guard(async()=>{const b=Object.fromEntries(new FormData(f));await api('/public/leads','POST',{...b,name:S.user.name,courseId:Number(b.courseId),consent:true});closeModal();toast('Arizangiz adminga yuborildi','ok');});
// Payment history overrides the old Payme tab without altering its other navigation.
for(const r of routes)if(String(r[0])===String(/^#\/payments$/)){r[1]=v5MyPayments;break;}
for(const r of routes)if(String(r[0])===String(/^#\/ops\/parent\/(\d+)$/)){
 const old=r[1];r[1]=async id=>{await old(id);const payments=await api('/ops/parent/children/'+id+'/payments');$('#view').insertAdjacentHTML('beforeend','<h2 class="h2">To‘lovlar tarixi</h2>'+opTable(['Sana','Summa','Usul','Hujjat','Holat'],payments.map(r=>[opEsc(r.paid_on||r.created_at),v5Cash(r.amount),opEsc(r.method),opEsc(r.reference),v5Status(r)])));};break;
}
const v5Nav=renderNav;
renderNav=function(){v5Nav();if(!S.user)return;const nav=$('#dock');if(!nav)return;
nav.insertAdjacentHTML('beforeend',`<div class="sidebar-caption" style="margin-top:17px">EDUSPHERE V5</div><a class="nl" href="${v5PayLink()}">◈ &nbsp; To‘lovlar</a><a class="nl" href="#/ops/announcements">♧ &nbsp; E’lonlar</a>${v5Who()?'<a class="nl" href="#/ops/report">▤ &nbsp; Hisobotlar</a>':''}${S.user.role==='student'?'<a class="nl" href="#/ops/check-in">✓ &nbsp; Davomat kodi</a>':''}`);
};
routes.push([/^#\/ops\/manual-payments$/,v5ManualPayments],[/^#\/ops\/payments$/,v5MyPayments],[/^#\/ops\/report$/,v5Report],[/^#\/ops\/profiles$/,v5Profiles],[/^#\/ops\/profile\/(\d+)$/,v5Profile],[/^#\/ops\/announcements$/,v5Announcements],[/^#\/ops\/check-in$/,v5AttendanceCode],[/^#\/ops\/make-code$/,v5MakeCode]);

// ================== Extended examination center ==================
const EX5={current:null,attempt:null,questions:[]};
async function ex5List(){if(needLogin())return;const all=await api('/v5/exams');const teacher=opStaff();
 const [courses,groups]=teacher?await Promise.all([api('/courses'),api('/manage/groups')]):[[],[]];
 view(opHead('ASSESSMENT • TEST ENGINE','Kengaytirilgan imtihonlar','Testlar bazada saqlanadi: vaqt, savollar, javoblar va natijalar serverda tekshiriladi.')+v5Tabs()+
 (teacher?opForm('ex5Create',`${opField('Test nomi','title','text','required minlength="3"')}${opSelect('course_id',courses.map(x=>({id:x.id,name:x.title})),'Kurs')}<label class="op-field"><span>Test ko‘rinishi</span><select name="mode" class="in"><option value="registered">Ro‘yxatdan o‘tgan o‘quvchilar</option><option value="course_group">Faqat belgilangan guruh</option></select></label><label class="op-field"><span>Guruh (guruh testi uchun)</span><select class="in" name="group_id"><option value="">Tanlanmagan</option>${groups.map(g=>`<option value="${g.id}">${opEsc(g.name)}</option>`).join('')}</select></label>${opField('Vaqt (daqiqa)','duration_minutes','number','min="1" max="240" value="30"')}${opField('Maksimal urinish','max_attempts','number','min="1" max="30" value="1"')}<label class="op-field"><span>Natija</span><select class="in" name="result_policy"><option value="immediate">Avtomatik tekshirganda ko‘rsatish</option><option value="teacher">Ustoz ruxsati bilan</option></select></label>`,'Imtihon qoralamasini yaratish'):'')+
 `<div class="op-grid">${all.map(e=>`<a class="op-tile" href="#/ops/exams/${e.id}"><small class="eyebrow">${opEsc(e.course_title)} • ${opEsc(e.status)}</small><h3>${opEsc(e.title)}</h3><p>${e.question_count} savol · ${e.duration_minutes} daqiqa · ${e.max_attempts} urinish</p><span class="op-link">${teacher?'Savollar va natijalar':'Testni ochish'} →</span></a>`).join('')||'<p>Hozircha test yo‘q</p>'}</div>`);
}
forms.ex5Create=f=>guard(async()=>{const b=Object.fromEntries(new FormData(f));if(!b.group_id)delete b.group_id;const d=await api('/v5/exams','POST',b);toast('Imtihon yaratildi','ok');location.hash='#/ops/exams/'+d.id;});
async function ex5Detail(id){if(needLogin())return;const list=await api('/v5/exams');const e=list.find(x=>x.id==id);if(!e)throw Error('Test topilmadi');EX5.current=e;
 const teacher=opStaff(),rows=teacher?await api('/v5/exams/'+e.id+'/attempts'):[];
 view(opHead('EXAM • '+e.status.toUpperCase(),e.title,`${e.question_count} savol · ${e.duration_minutes} daqiqa · ${e.max_attempts} urinish`)+
 opMenu([['#/ops/exams','← Imtihonlar']])+
 (teacher?`<div class="cms-surface"><p class="muted">Savollarni qo‘shing, so‘ng testni e’lon qiling. To‘g‘ri javoblar o‘quvchiga test vaqtida berilmaydi.</p>${e.status==='draft'?'<button class="btn primary" data-act="ex5Publish" data-id="'+e.id+'">Testni e’lon qilish</button>':''}</div>`+
 (e.status==='draft'?opForm('ex5Question',`<input type="hidden" name="exam_id" value="${e.id}">${opField('Savol','prompt','text','required minlength="3"')}<label class="op-field"><span>Savol turi</span><select name="type" class="in"><option value="single">Bir javobli</option><option value="multiple">Bir nechta javobli</option><option value="true_false">To‘g‘ri / noto‘g‘ri</option><option value="short">Qisqa javob</option><option value="essay">Yozma savol</option></select></label>${opField('Variantlar (bir qatorda, | bilan ajrating)','options','text','placeholder="A|B|C|D"')}${opField('To‘g‘ri javob (single: 1; multiple: 1,3; true_false: true; short: matn)','answer','text')}${opField('Ball','points','number','min="1" max="100" value="1"')}`,'Savolni saqlash'):'')+
 `<p><a class="btn sm" href="#/workspace/exam-import/${e.id}">CSV savollar importi ↗</a></p><h2 class="h2">Urinishlar</h2>`+opTable(['O‘quvchi','Holat','Ball','Yuborgan','Amal'],rows.map(x=>[opEsc(x.student_name),opEsc(x.status),x.released?`${x.earned_points}/${x.total_points}`:'Yashirin',opEsc(x.submitted_at||'—'),`<button class="btn sm" data-act="ex5Grade" data-id="${x.id}">Tekshirish</button>`])):
 `<div class="cms-surface" style="max-width:750px"><h3>Qoidalar</h3><p class="muted">Savollarni berilgan vaqtda bajaring. Javoblarni saqlang va yakunda topshiring. Vaqt tugasa server urinishni yakunlaydi.</p><button class="btn primary" data-act="ex5Start" data-id="${e.id}">Testni boshlash ↗</button></div>`));
}
forms.ex5Question=f=>guard(async()=>{const b=Object.fromEntries(new FormData(f)),type=b.type;let options=[],answer;
 if(type==='single'||type==='multiple'){
  options=b.options.split('|').map(x=>x.trim()).filter(Boolean);
  const n=b.answer.split(',').map(x=>Number(x.trim())-1);
  answer=type==='single'?n[0]:n;
 }else if(type==='true_false')answer=b.answer.trim().toLowerCase()==='true';
 else if(type==='short')answer=b.answer;
 else answer=null;
 await api('/v5/exams/'+b.exam_id+'/questions','POST',{type,prompt:b.prompt,options,answer,points:Number(b.points)});
 toast('Savol qo‘shildi','ok');ex5Detail(b.exam_id);
});
actions.ex5Publish=el=>guard(async()=>{await api('/v5/exams/'+el.dataset.id+'/publish','PATCH',{});toast('Test e’lon qilindi','ok');ex5Detail(el.dataset.id);});
actions.ex5Start=el=>guard(async()=>{const d=await api('/v5/exams/'+el.dataset.id+'/start','POST',{});location.hash='#/ops/attempt/'+d.id;});
async function ex5Attempt(aid){if(needLogin())return;const a=await api('/v5/attempts/'+aid);EX5.attempt=a;
 const remaining=Math.ceil((Date.parse(a.deadline_at)-Date.now())/1000);
 view(opHead('EXAM • ATTEMPT','Test topshirish',`${a.questions.length} savol · ${a.status==='active'?'Qolgan vaqt: '+Math.max(0,remaining)+' soniya':'Tugatilgan'}`)+opMenu([['#/ops/exams','Imtihonlar']])+
 (a.released?`<div class="cms-surface"><b>Natija: ${a.earned_points}/${a.total_points} ball</b></div>`:'')+
 `<div class="op-stack">${a.questions.map((q,i)=>{const ans=a.answers.find(x=>x.question_id===q.id),v=ans?.value;
 const opts=q.type==='single'||q.type==='multiple'?q.options.map((option,j)=>`<label class="v5-option"><input name="q${q.id}" type="${q.type==='single'?'radio':'checkbox'}" value="${j}" ${q.type==='single'&&v===j||q.type==='multiple'&&Array.isArray(v)&&v.includes(j)?'checked':''} ${a.status!=='active'?'disabled':''}> ${opEsc(option)}</label>`).join(''):
 q.type==='true_false'?['true','false'].map(o=>`<label class="v5-option"><input type="radio" name="q${q.id}" value="${o}" ${String(v)===o?'checked':''} ${a.status!=='active'?'disabled':''}> ${o==='true'?'To‘g‘ri':'Noto‘g‘ri'}</label>`).join(''):`<textarea class="in" name="text" rows="3" maxlength="2500" ${a.status!=='active'?'disabled':''}>${opEsc(v||'')}</textarea>`;
 return `<form class="cms-surface" data-form="ex5Answer" data-id="${q.id}"><input type="hidden" name="attempt_id" value="${a.id}"><h3>${i+1}. ${opEsc(q.prompt)}</h3><p class="muted">${q.points} ball · ${opEsc(q.type)}</p><div class="v5-options">${opts}</div>${a.status==='active'?'<button class="btn sm primary" type="submit">Javobni saqlash</button>':''}${ans?'<small class="muted"> Saqlangan</small>':''}</form>`;}).join('')}</div>`+
 (a.status==='active'?`<button class="btn primary" data-act="ex5Submit" data-id="${a.id}">Testni yakunlash</button>`:(a.released?'':'<div class="cms-surface muted">Natija o‘qituvchi ruxsatidan keyin chiqadi yoki yozma javob tekshirilmoqda.</div>')));
}
forms.ex5Answer=f=>guard(async()=>{const a=EX5.attempt,q=a.questions.find(x=>x.id==f.dataset.id);if(!q)return;
 let val;if(q.type==='single')val=Number(f.querySelector('input:checked')?.value);
 else if(q.type==='multiple')val=[...f.querySelectorAll('input:checked')].map(x=>Number(x.value));
 else if(q.type==='true_false')val=f.querySelector('input:checked')?.value==='true';
 else val=f.querySelector('textarea')?.value||'';
 if(q.type==='single'&&!f.querySelector('input:checked')||q.type==='true_false'&&!f.querySelector('input:checked'))throw Error('Avval variant tanlang');
 await api('/v5/attempts/'+a.id+'/answers/'+q.id,'PUT',{value:val});toast('Javob saqlandi','ok');ex5Attempt(a.id);
});
actions.ex5Submit=el=>guard(async()=>{if(!confirm('Testni yakunlaysizmi?'))return;await api('/v5/attempts/'+el.dataset.id+'/submit','POST',{});toast('Test topshirildi','ok');ex5Attempt(el.dataset.id);});
actions.ex5Grade=el=>guard(async()=>{const a=await api('/v5/attempts/'+el.dataset.id);EX5.attempt=a;modal(`<h2>Natijani tekshirish</h2><p>${a.status} • ${a.earned_points??'Natija kutilyapti'}/${a.total_points??'—'}</p><div class="op-stack">${a.questions.filter(q=>q.type==='essay').map(q=>{const ans=a.answers.find(x=>x.question_id===q.id);return `<div class="cms-surface"><b>${opEsc(q.prompt)}</b><p>${opEsc(ans?.value||'Javob yo‘q')}</p>${ans?opForm('ex5GradeAnswer',`<input type="hidden" name="attempt_id" value="${a.id}"><input type="hidden" name="question_id" value="${q.id}">${opField('Ball','score','number',`required min="0" max="${q.points}" value="${ans.score??0}"`)}${opField('Izoh','feedback','text',`value="${opEsc(ans.feedback||'')}"`)}`,'Baholash'):''}</div>`;}).join('')}</div><button class="btn primary" data-act="ex5Release" data-id="${a.id}">Natijani e’lon qilish</button>`);});
forms.ex5GradeAnswer=f=>guard(async()=>{const b=Object.fromEntries(new FormData(f));await api('/v5/attempts/'+b.attempt_id+'/grade','PATCH',{question_id:b.question_id,score:Number(b.score),feedback:b.feedback});closeModal();toast('Baho saqlandi','ok');ex5Detail(EX5.current.id);});
actions.ex5Release=el=>guard(async()=>{await api('/v5/attempts/'+el.dataset.id+'/release','POST',{});closeModal();toast('Natija ochildi','ok');ex5Detail(EX5.current.id);});
const ex5Nav=renderNav;
renderNav=function(){ex5Nav();if(!S.user)return;$('#dock')?.insertAdjacentHTML('beforeend','<a class="nl" href="#/ops/exams">✓ &nbsp; Kengaytirilgan imtihonlar</a>');};
routes.push([/^#\/ops\/exams$/,ex5List],[/^#\/ops\/exams\/(\d+)$/,ex5Detail],[/^#\/ops\/attempt\/(\d+)$/,ex5Attempt]);

