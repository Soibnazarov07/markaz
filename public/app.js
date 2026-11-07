'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = p => (p > 0 ? String(p).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm" : 'Bepul');
const GRAD = ['#30417c,#5676c6','#205b68,#3a9d9f','#71548c,#aa7fb9','#4e567c,#8b9ccb','#305b67,#79a2aa','#605a7f,#9690b2','#376870,#71aa98','#345080,#6a84bc'];
const grad = id => `linear-gradient(135deg,${GRAD[id % GRAD.length]})`;
const fmtDate = d => new Date(d.replace(' ', 'T') + 'Z').toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short' });

const IC = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  board: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'
};
const icon = n => `<svg class="ic" viewBox="0 0 24 24">${IC[n]}</svg>`;

const S = { token: localStorage.getItem('t'), user: null, settings: { name: "O'quv Markaz", tagline: '' }, chat: [], feed: [] };
let CUR = { name: '', args: [] }, COURSE = null, socket = null, MG = { id: 0, tab: 'info' }, AD = { tab: 'stats' }, AUTHMODE = 'login';

/* ---------- yordamchilar ---------- */
async function api(url, method = 'GET', body) {
  const r = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Xatolik yuz berdi');
  return d;
}
const view = html => { $('#view').innerHTML = html; };
function toast(text, type = '') {
  const t = document.createElement('div');
  t.className = 'toast glass ' + type; t.textContent = text;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
function modal(html) {
  closeModal();
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="sheet glass">${html}</div>`;
  o.addEventListener('mousedown', e => { if (e.target === o) closeModal(); });
  document.body.appendChild(o);
  return o.firstElementChild;
}
const closeModal = () => $$('.overlay').forEach(x => x.remove());
function md(s) {
  let t = esc(s);
  t = t.replace(/```([\s\S]*?)```/g, (m, c) => `<pre>${c.trim()}</pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/^#{1,3} (.+)$/gm, '<b>$1</b>').replace(/^[-*] (.+)$/gm, '• $1');
  return t;
}
function videoHtml(u) {
  if (!u) return '';
  const y = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  if (y) return `<div class="vid"><iframe src="https://www.youtube.com/embed/${y[1]}" allowfullscreen loading="lazy"></iframe></div>`;
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(u)) return `<div class="vid"><video src="${esc(u)}" controls></video></div>`;
  if (/^https?:\/\//.test(u)) return `<p><a class="btn sm" target="_blank" rel="noopener" href="${esc(u)}">Videoni ochish</a></p>`;
  return '';
}
const needLogin = () => { if (!S.user) { location.hash = '#/login'; return true; } return false; };
const isStaff = () => S.user && (S.user.role === 'teacher' || ['admin','super_admin'].includes(S.user.role));

/* ---------- sozlama, nav ---------- */
function applySettings() {
  $('#brandName').textContent = S.settings.name;
  document.title = S.settings.name;
}
function renderNav() {
  const u = S.user;
  const items = [['#/', 'home', 'Bosh sahifa'], ['#/courses', 'book', 'Kurslar']];
  if (u) items.push(['#/me', 'user', 'Kabinet']);
  if (isStaff()) items.push(['#/teacher', 'board', "O'qituvchi"]);
  if (u && ['admin','super_admin'].includes(u.role)) items.push(['#/admin', 'shield', 'Admin']);
  const h = location.hash || '#/';
  $('#dock').innerHTML = items.map(([href, ic, label]) => {
    const on = href === '#/' ? (h === '#/' || h === '#') : (h === href || h.startsWith(href + '/') || (href === '#/teacher' && h.startsWith('#/manage')));
    return `<a class="nl ${on ? 'on' : ''}" href="${href}">${icon(ic)}<span>${label}</span></a>`;
  }).join('');
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#right').innerHTML = `<button class="btn sm" data-act="theme" aria-label="Mavzu">${icon(dark ? 'sun' : 'moon')}</button>` +
    (u ? `<span class="avatar">${esc(u.name[0].toUpperCase())}</span><span class="uname">${esc(u.name.split(' ')[0])}</span><button class="btn sm" data-act="logout">Chiqish</button>`
      : `<a class="btn primary sm" href="#/login">Kirish</a>`);
}

/* ---------- realtime ---------- */
function connectSocket() {
  if (socket) socket.disconnect();
  socket = io({ auth: { token: S.token, visitorId: sessionStorage.getItem('visitorId') || (function(){const id=(globalThis.crypto?.randomUUID?.()||('v'+Date.now()+'-'+Math.random().toString(36).slice(2)));sessionStorage.setItem('visitorId',id);return id})() } });
  socket.on('online', ({ count }) => {
    $$('[data-live="online"]').forEach(el => { if (el.textContent != count) { el.textContent = count; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } });
  });
  socket.on('stats:changed', refreshStats);
  socket.on('courses:changed', softRefresh);
  socket.on('settings:changed', async () => { S.settings = await api('/settings'); applySettings(); softRefresh(); });
  socket.on('activity', a => {
    S.feed.unshift(a); S.feed = S.feed.slice(0, 30);
    const f = $('#feed'); if (f) f.innerHTML = feedHtml();
    toast(a.text);
  });
  socket.on('result', r => { /* natija foydalanuvchining o'z sahifasida ko'rsatiladi */ });
  socket.on('security:session-revoked', () => { localStorage.removeItem('t'); S.token = null; S.user = null; socket?.disconnect(); renderNav(); location.hash = '#/login'; toast('Administrator parolni yangiladi. Qayta kiring.', 'ok'); });
  socket.on('role:changed', async () => { try { S.user = await api('/me'); renderNav(); toast("Rolingiz o'zgartirildi", 'ok'); softRefresh(); } catch { } });
}
async function refreshStats() {
  if (!$('[data-stat]')) return;
  try {
    const st = await api('/stats');
    $$('[data-stat]').forEach(el => { const v = st[el.dataset.stat]; if (el.textContent != v) { el.textContent = v; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } });
  } catch { }
}
function softRefresh() {
  if ($('.overlay')) return;
  if (['testPage', 'loginPage', 'managePage'].includes(CUR.name)) return;
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $('#view').contains(a)) return;
  route(true);
}
const feedHtml = () => S.feed.length
  ? S.feed.map(a => `<div>${esc(a.text)} <span class="muted">· ${new Date(a.ts).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</span></div>`).join('')
  : '<div class="muted">Hozircha yangi hodisa yo\'q. Yangi yozilishlar va test natijalari shu yerda real vaqtda chiqadi.</div>';

/* ---------- sahifalar ---------- */
function courseCard(c) {
  return `<article class="cc glass" data-go="#/course/${c.id}">
    <div class="cover" style="background:${grad(c.id)}"><span>${esc(c.cover)}</span><b class="badge">${esc(c.level)}</b></div>
    <div class="cb"><h3>${esc(c.title)}</h3><p class="muted clamp">${esc(c.description)}</p>
    <div class="meta"><span>${c.lessons_count} dars</span><span>${c.tests_count} test</span><span>${c.students_count} o'quvchi</span></div>
    <div class="cf"><span class="muted">${esc(c.teacher_name || '')}</span><b>${money(c.price)}</b></div></div></article>`;
}

async function home() {
  const [st, cs] = await Promise.all([api('/stats'), api('/courses')]);
  view(`
  <section class="hero">
    <div>
      <h1>${esc(S.settings.name)}</h1>
      <p class="lead">${esc(S.settings.tagline)}</p>
      <div class="row"><a class="btn primary" href="#/courses">Kurslarni ko'rish</a><button class="btn" data-act="aiToggle">AI ustoz bilan suhbat</button></div>
    </div>
    <div class="glass pad">
      <div class="live-top"><i class="dot live"></i><span>Hozir saytda</span></div>
      <div class="big" data-live="online">${st.online}</div>
      <div class="muted">kishi onlayn</div>
      <div class="stats">
        <div class="stat sub"><b data-stat="courses">${st.courses}</b><span class="muted">kurs</span></div>
        <div class="stat sub"><b data-stat="students">${st.students}</b><span class="muted">o'quvchi</span></div>
        <div class="stat sub"><b data-stat="teachers">${st.teachers}</b><span class="muted">o'qituvchi</span></div>
        <div class="stat sub"><b data-stat="tests">${st.tests}</b><span class="muted">test</span></div>
      </div>
    </div>
  </section>
  <h2 class="h2">Mashhur kurslar</h2>
  ${cs.length ? `<div class="grid">${cs.slice(0, 6).map(courseCard).join('')}</div>` : '<div class="glass pad center muted">Hozircha kurslar yo\'q.</div>'}
  <h2 class="h2">Nima uchun bizda o'qish qulay</h2>
  <section class="feat">
    <div class="glass"><div class="ico" style="background:linear-gradient(135deg,#0a84ff,#5e5ce6)">${icon('play')}</div><h3>Onlayn darslar</h3><p class="muted">Video va matnli darslar istalgan vaqt, istalgan qurilmada ochiladi. Progress avtomatik saqlanadi.</p></div>
    <div class="glass"><div class="ico" style="background:linear-gradient(135deg,#30d158,#64d2ff)">${icon('chart')}</div><h3>Testlar va natijalar</h3><p class="muted">Test tugashi bilan natija ko'rinadi, o'qituvchi esa o'quvchining ishini darhol ko'radi.</p></div>
    <div class="glass"><div class="ico" style="background:linear-gradient(135deg,#bf5af2,#ff375f)">${icon('spark')}</div><h3>AI ustoz</h3><p class="muted">Kurs tanlashda va mavzuni tushunmaganda AI yordamchidan so'rang. U sizning tilingizda javob beradi.</p></div>
  </section>`);
}

async function coursesPage() {
  const cs = await api('/courses');
  const cats = [...new Set(cs.map(c => c.category))];
  let cat = '', q = '';
  view(`
  <div class="pagehead"><h1>Kurslar</h1><input class="in search" id="q" placeholder="Kurs qidirish..."></div>
  <div class="chips" id="chips" style="margin-bottom:20px"><button class="chip on" data-cat="">Hammasi</button>${cats.map(c => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <div class="grid" id="list"></div>`);
  const draw = () => {
    const l = cs.filter(c => (!cat || c.category === cat) && (c.title + c.description).toLowerCase().includes(q));
    $('#list').innerHTML = l.length ? l.map(courseCard).join('') : '<div class="glass pad muted" style="grid-column:1/-1">Hech narsa topilmadi.</div>';
  };
  draw();
  $('#q').oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  $('#chips').onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; $$('#chips .chip').forEach(x => x.classList.toggle('on', x === b)); draw(); };
}

async function coursePage(id) {
  const c = await api('/courses/' + id);
  COURSE = c;
  const done = c.lessons.filter(l => l.done).length;
  const pct = c.lessons.length ? Math.round(done / c.lessons.length * 100) : 0;
  const action = c.manager ? `<a class="btn primary" href="#/manage/${c.id}">Boshqarish</a>`
    : c.enrolled ? `<span class="tag ok">Siz yozilgansiz</span>`
      : `<button class="btn primary" data-act="enroll" data-id="${c.id}">${S.user ? 'Kursga yozilish' : 'Kirish va yozilish'}</button>`;
  view(`
  <div class="glass chead">
    <div class="cv" style="background:${grad(c.id)}">${esc(c.cover)}</div>
    <div>
      <div class="row" style="margin-bottom:8px"><span class="tag">${esc(c.category)}</span><span class="tag">${esc(c.level)}</span>${c.published ? '' : '<span class="tag warn">Qoralama</span>'}</div>
      <h1 style="font-size:2rem;margin-bottom:8px">${esc(c.title)}</h1>
      <p class="muted" style="margin-bottom:14px">${esc(c.description)}</p>
      <div class="row between"><div class="muted">O'qituvchi: <b style="color:var(--text)">${esc(c.teacher_name || '—')}</b> · ${c.students_count} o'quvchi · <b style="color:var(--text)">${money(c.price)}</b></div>${action}</div>
      ${c.enrolled && c.lessons.length ? `<div style="margin-top:14px"><div class="bar"><i style="width:${pct}%"></i></div><small class="muted">${done}/${c.lessons.length} dars tugatilgan</small></div>` : ''}
    </div>
  </div>
  <div class="cols">
    <div class="glass pad"><h2 style="margin-bottom:10px;font-size:1.3rem">Darslar</h2>
      ${c.lessons.length ? c.lessons.map((l, i) => `<div class="item" data-act="lesson" data-id="${l.id}"><span class="num ${l.done ? 'done' : ''}">${l.done ? '✓' : i + 1}</span><span class="grow">${esc(l.title)}</span>${l.locked ? icon('lock') : icon('play')}</div>`).join('') : '<p class="muted">Darslar tez orada qo\'shiladi.</p>'}
    </div>
    <div class="glass pad"><h2 style="margin-bottom:10px;font-size:1.3rem">Testlar</h2>
      ${c.tests.length ? c.tests.map(t => `<div class="item sub" style="margin-bottom:8px;cursor:default"><span class="grow"><b>${esc(t.title)}</b><br><small class="muted">${t.questions_count} savol${t.best ? ` · eng yaxshi: ${t.best.score}/${t.best.total}` : ''}</small></span>
        ${(c.enrolled || c.manager) ? `<a class="btn sm primary" href="#/test/${t.id}">Boshlash</a>` : icon('lock')}</div>`).join('') : '<p class="muted">Hozircha test yo\'q.</p>'}
    </div>
  </div>`);
}

function openLesson(id) {
  const l = COURSE.lessons.find(x => x.id == id);
  if (!l) return;
  if (l.locked) { toast('Darsni ko\'rish uchun avval kursga yoziling'); return; }
  modal(`<h2>${esc(l.title)}</h2>${videoHtml(l.video_url)}<div class="md" style="white-space:pre-wrap">${md(l.content) || '<span class="muted">Matn qo\'shilmagan.</span>'}</div>
    <div class="row between" style="margin-top:20px"><button class="btn" data-act="closeModal">Yopish</button>${l.done ? '<span class="tag ok">Tugatilgan</span>' : `<button class="btn primary" data-act="lessonDone" data-id="${l.id}">Tugatdim</button>`}</div>`);
}

async function testPage(id) {
  if (needLogin()) return;
  const t = await api('/tests/' + id);
  view(`
  <div class="pagehead"><div><a class="muted" href="#/course/${t.course_id}">← ${esc(t.course_title)}</a><h1>${esc(t.title)}</h1></div></div>
  <form id="tf">${t.questions.map((q, i) => `<div class="q glass"><h3>${i + 1}. ${esc(q.text)}</h3>${q.options.map((o, j) => `<label class="opt"><input type="radio" name="q${i}" value="${j}"><span>${esc(o)}</span></label>`).join('')}</div>`).join('')}
  <div class="row"><button class="btn primary" type="submit">Yakunlash</button><span class="muted" id="cnt">0/${t.questions.length}</span></div></form>
  <div id="res"></div>`);
  const f = $('#tf');
  f.onchange = e => {
    $$('.opt', f).forEach(o => o.classList.toggle('sel', o.querySelector('input').checked));
    $('#cnt').textContent = `${new Set($$('input:checked', f).map(i => i.name)).size}/${t.questions.length}`;
  };
  f.onsubmit = async e => {
    e.preventDefault();
    const answers = t.questions.map((q, i) => { const c = f.querySelector(`input[name=q${i}]:checked`); return c ? +c.value : -1; });
    if (answers.includes(-1) && !confirm('Ba\'zi savollarga javob bermadingiz. Baribir yakunlaymizmi?')) return;
    try {
      const r = await api(`/tests/${id}/submit`, 'POST', { answers });
      $$('.q', f).forEach((qe, i) => $$('.opt', qe).forEach((o, j) => {
        o.querySelector('input').disabled = true; o.classList.remove('sel');
        if (j === r.correct[i]) o.classList.add('ok'); else if (j === answers[i]) o.classList.add('no');
      }));
      const p = r.total ? Math.round(r.score / r.total * 100) : 0;
      f.querySelector('.row').remove();
      $('#res').innerHTML = `<div class="glass pad center"><div class="ring" style="--p:${p};--c:${p >= 60 ? 'var(--ok)' : p >= 40 ? 'var(--warn)' : 'var(--bad)'}"><span>${p}%</span></div>
        <h2>${r.score} / ${r.total} to'g'ri</h2><p class="muted" style="margin:6px 0 18px">${p >= 80 ? 'Ajoyib natija!' : p >= 60 ? 'Yaxshi, yana biroz mashq qiling.' : 'Darslarni qayta ko\'rib, testni yana topshiring.'}</p>
        <div class="row" style="justify-content:center"><a class="btn" href="#/course/${t.course_id}">Kursga qaytish</a><button class="btn primary" onclick="route()">Qayta topshirish</button></div></div>`;
      $('#res').scrollIntoView({ behavior: 'smooth' });
    } catch (err) { toast(err.message, 'err'); }
  };
}

async function mePage() {
  if (needLogin()) return;
  const d = await api('/my');
  view(`
  <div class="pagehead"><h1>Salom, ${esc(S.user.name.split(' ')[0])}</h1><span class="tag">${{ student: "O'quvchi", teacher: "O'qituvchi", admin: 'Administrator' }[S.user.role]}</span></div>
  <h2 style="font-size:1.3rem;margin-bottom:14px">Mening kurslarim</h2>
  ${d.courses.length ? `<div class="grid">${d.courses.map(c => { const p = c.lessons_count ? Math.round(c.done / c.lessons_count * 100) : 0;
    return `<article class="cc glass" data-go="#/course/${c.id}"><div class="cover" style="background:${grad(c.id)};height:90px"><span style="font-size:2.4rem">${esc(c.cover)}</span></div><div class="cb"><h3>${esc(c.title)}</h3><div class="bar" style="margin:12px 0 6px"><i style="width:${p}%"></i></div><small class="muted">${c.done}/${c.lessons_count} dars · ${p}%</small></div></article>`; }).join('')}</div>`
    : '<div class="glass pad center"><p class="muted" style="margin-bottom:14px">Hali birorta kursga yozilmagansiz.</p><a class="btn primary" href="#/courses">Kurslarni ko\'rish</a></div>'}
  <h2 style="font-size:1.3rem;margin:34px 0 14px">Test natijalarim</h2>
  <div class="glass pad tw">${d.results.length ? `<table><tr><th>Test</th><th>Kurs</th><th>Natija</th><th>Sana</th></tr>${d.results.map(r => `<tr><td>${esc(r.test_title)}</td><td class="muted">${esc(r.course_title)}</td><td><span class="tag ${r.total && r.score / r.total >= .6 ? 'ok' : 'warn'}">${r.score}/${r.total}</span></td><td class="muted">${fmtDate(r.created_at)}</td></tr>`).join('')}</table>` : '<p class="muted">Hali test topshirmagansiz.</p>'}</div>`);
}

function authForm() {
  const reg = AUTHMODE === 'register';
  return `<div class="glass pad" style="max-width:440px;margin:30px auto">
    <div class="center" style="margin-bottom:20px"><div class="seg glass"><button class="${reg ? '' : 'on'}" data-act="authmode" data-m="login">Kirish</button><button class="${reg ? 'on' : ''}" data-act="authmode" data-m="register">Ro'yxatdan o'tish</button></div></div>
    <form data-form="auth">
      ${reg ? '<div class="fg"><label class="f">Ism familiya</label><input class="in" name="name" required minlength="2" autocomplete="name"></div>' : ''}
      <div class="fg"><label class="f">Email</label><input class="in" type="email" name="email" required autocomplete="email"></div>
      <div class="fg"><label class="f">Parol</label><input class="in" type="password" name="password" required minlength="12" maxlength="128" autocomplete="${reg ? 'new-password' : 'current-password'}"></div>
      ${!reg?'<div class="fg"><label class="f">Authenticator kodi (2FA yoqilgan bo‘lsa)</label><input class="in" id="mfaCode" name="totp" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="6 xonali kod"></div>':''}
      <button class="btn primary" style="width:100%" type="submit">${reg ? "Ro'yxatdan o'tish" : 'Kirish'}</button>
    </form></div>`;
}
function loginPage() { if (S.user) { location.hash = '#/workspace'; return; } view(authForm()); }

/* ---------- o'qituvchi ---------- */
async function teacherPage() {
  if (needLogin()) return;
  if (!isStaff()) { view('<div class="glass pad center">Bu bo\'lim faqat o\'qituvchilar uchun.</div>'); return; }
  const cs = await api('/manage/courses');
  const students = cs.reduce((a, c) => a + c.students_count, 0);
  view(`
  <div class="pagehead"><h1>O'qituvchi paneli</h1><button class="btn primary" data-act="newCourse">+ Yangi kurs</button></div>
  <div class="kpis"><div class="kpi glass"><b>${cs.length}</b><span class="muted">kurs</span></div><div class="kpi glass"><b>${students}</b><span class="muted">yozilgan o'quvchi</span></div><div class="kpi glass"><b>${cs.reduce((a, c) => a + c.tests_count, 0)}</b><span class="muted">test</span></div></div>
  <div class="cols">
    <div class="glass pad tw"><h2 style="font-size:1.3rem;margin-bottom:8px">Kurslarim</h2>
    ${cs.length ? `<table><tr><th>Kurs</th><th>Dars</th><th>Test</th><th>O'quvchi</th><th></th></tr>${cs.map(c => `<tr><td><b>${esc(c.cover)} ${esc(c.title)}</b>${c.published ? '' : ' <span class="tag warn">Qoralama</span>'}${['admin','super_admin'].includes(S.user.role) ? `<br><small class="muted">${esc(c.teacher_name || '')}</small>` : ''}</td><td>${c.lessons_count}</td><td>${c.tests_count}</td><td>${c.students_count}</td>
      <td style="white-space:nowrap"><a class="btn sm primary" href="#/manage/${c.id}">Boshqarish</a> <button class="btn sm danger" data-act="delCourse" data-id="${c.id}">O'chirish</button></td></tr>`).join('')}</table>` : '<p class="muted">Hali kurs yo\'q. «Yangi kurs» tugmasini bosing.</p>'}</div>
    <div class="glass pad"><h2 style="font-size:1.3rem;margin-bottom:8px">Jonli hodisalar</h2><div class="feed" id="feed">${feedHtml()}</div></div>
  </div>`);
}

function newCourseModal() {
  modal(`<h2>Yangi kurs</h2><form data-form="newCourse">${courseFields({})}<div class="row between"><button type="button" class="btn" data-act="closeModal">Bekor qilish</button><button class="btn primary" type="submit">Yaratish</button></div></form>`);
}
function courseFields(c) {
  const lv = ["Boshlang'ich", "O'rta", 'Yuqori'];
  return `<div class="fg"><label class="f">Kurs nomi</label><input class="in" name="title" required value="${esc(c.title || '')}"></div>
  <div class="fg"><label class="f">Tavsif</label><textarea class="in" name="description">${esc(c.description || '')}</textarea></div>
  <div class="two"><div class="fg"><label class="f">Kategoriya</label><input class="in" name="category" value="${esc(c.category || 'Umumiy')}"></div>
  <div class="fg"><label class="f">Daraja</label><select class="in" name="level">${lv.map(l => `<option ${c.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
  <div class="two"><div class="fg"><label class="f">Narx (so'm, 0 = bepul)</label><input class="in" type="number" min="0" name="price" value="${c.price || 0}"></div>
  <div class="fg"><label class="f">Belgi (emoji)</label><input class="in" name="cover" maxlength="4" value="${esc(c.cover || '📘')}"></div></div>
  <label class="sw fg"><input type="checkbox" name="published" ${c.published === 0 ? '' : 'checked'}><span>Saytda ko'rsatish (e'lon qilish)</span></label>`;
}

async function managePage(id) {
  if (needLogin()) return;
  if (MG.id !== +id) MG = { id: +id, tab: 'info' };
  await renderManage();
}
async function renderManage() {
  const c = await api('/courses/' + MG.id);
  if (!c.manager) { view('<div class="glass pad center">Bu kursni boshqarish huquqingiz yo\'q.</div>'); return; }
  COURSE = c;
  const tabs = [['info', "Ma'lumot"], ['lessons', 'Darslar'], ['tests', 'Testlar'], ['students', "O'quvchilar"]];
  let body = '';
  if (MG.tab === 'info') {
    body = `<form class="glass pad" data-form="editCourse">${courseFields(c)}<button class="btn primary" type="submit">Saqlash</button></form>`;
  } else if (MG.tab === 'lessons') {
    body = `<div class="cols"><div class="glass pad"><h2 style="font-size:1.3rem;margin-bottom:10px">Darslar (${c.lessons.length})</h2>
      ${c.lessons.length ? c.lessons.map((l, i) => `<div class="item sub" style="margin-bottom:8px;cursor:default"><span class="num">${i + 1}</span><span class="grow">${esc(l.title)}</span><button class="btn sm danger" data-act="delLesson" data-id="${l.id}">O'chirish</button></div>`).join('') : '<p class="muted">Hali dars yo\'q.</p>'}</div>
      <form class="glass pad" data-form="lesson"><h2 style="font-size:1.3rem;margin-bottom:10px">Yangi dars</h2>
      <div class="fg"><label class="f">Dars nomi</label><input class="in" name="title" required></div>
      <div class="fg"><label class="f">Video havola (YouTube yoki .mp4, ixtiyoriy)</label><input class="in" name="video_url" placeholder="https://..."></div>
      <div class="fg"><label class="f">Dars matni</label><textarea class="in" name="content" style="min-height:160px"></textarea></div>
      <button class="btn primary" type="submit">Dars qo'shish</button></form></div>`;
  } else if (MG.tab === 'tests') {
    body = `<div class="glass pad"><div class="row between" style="margin-bottom:10px"><h2 style="font-size:1.3rem">Testlar (${c.tests.length})</h2><button class="btn primary" data-act="newTest">+ Yangi test</button></div>
      ${c.tests.length ? c.tests.map(t => `<div class="item sub" style="margin-bottom:8px;cursor:default"><span class="grow"><b>${esc(t.title)}</b><br><small class="muted">${t.questions_count} savol</small></span><a class="btn sm" href="#/test/${t.id}">Sinab ko'rish</a><button class="btn sm danger" data-act="delTest" data-id="${t.id}">O'chirish</button></div>`).join('') : '<p class="muted">Hali test yo\'q.</p>'}</div>`;
  } else {
    const d = await api(`/courses/${MG.id}/students`);
    body = `<div class="glass pad tw"><h2 style="font-size:1.3rem;margin-bottom:8px">O'quvchilar (${d.students.length})</h2>${d.students.length ? `<table><tr><th>Ism</th><th>Email</th><th>Progress</th><th>Test natijalari</th><th>Sana</th></tr>${d.students.map(s => {
      const p = d.lessons ? Math.round(s.done / d.lessons * 100) : 0;
      return `<tr><td><b>${esc(s.name)}</b></td><td class="muted">${esc(s.email)}</td><td style="min-width:130px"><div class="bar"><i style="width:${p}%"></i></div><small class="muted">${s.done}/${d.lessons}</small></td><td>${s.results.length ? s.results.map(r => `<span class="tag ${r.total && r.score / r.total >= .6 ? 'ok' : 'warn'}" title="${esc(r.title)}">${r.score}/${r.total}</span>`).join(' ') : '<span class="muted">—</span>'}</td><td class="muted">${fmtDate(s.joined)}</td></tr>`; }).join('')}</table>` : '<p class="muted">Hali o\'quvchi yozilmagan.</p>'}</div>`;
  }
  view(`<div class="pagehead"><div><a class="muted" href="#/teacher">← Panelga qaytish</a><h1>${esc(c.cover)} ${esc(c.title)}</h1></div><a class="btn" href="#/course/${c.id}">Saytda ko'rish</a></div>
    <div class="seg glass" style="margin-bottom:20px">${tabs.map(([k, n]) => `<button class="${MG.tab === k ? 'on' : ''}" data-act="mtab" data-tab="${k}">${n}</button>`).join('')}</div>${body}`);
}

function qBlock(q = {}) {
  const opts = q.options || ['', '', '', ''];
  while (opts.length < 4) opts.push('');
  const n = 'r' + Math.random().toString(36).slice(2, 8);
  return `<div class="qb sub"><div class="row between fg"><input class="in q-text" style="flex:1" placeholder="Savol matni" value="${esc(q.text || '')}"><button type="button" class="btn sm danger" data-act="qdel">×</button></div>
    ${opts.map((o, i) => `<div class="orow"><input type="radio" name="${n}" value="${i}" ${q.answer === i ? 'checked' : ''} title="To'g'ri javob"><input class="in q-opt" placeholder="Variant ${'ABCD'[i] || i + 1}" value="${esc(o)}"></div>`).join('')}</div>`;
}
function newTestModal() {
  modal(`<h2>Yangi test</h2>
    <div class="fg"><label class="f">Test nomi</label><input class="in" id="tt" placeholder="Masalan: 1-modul testi"></div>
    <div class="glass sub pad" style="margin-bottom:16px;padding:16px"><label class="f">AI bilan savollarni avtomatik yaratish</label>
      <div class="row"><input class="in" id="aiTopic" style="flex:1;min-width:160px" placeholder="Mavzu (bo'sh bo'lsa kurs nomi)"><select class="in" id="aiCount" style="width:90px"><option>3</option><option selected>5</option><option>8</option><option>10</option></select><button class="btn primary" type="button" data-act="aiGen">Yaratish</button></div></div>
    <div id="qs">${qBlock()}</div>
    <p class="muted" style="font-size:.85rem;margin:6px 0 14px">To'g'ri javob yonidagi doirani belgilang.</p>
    <div class="row between"><button class="btn" type="button" data-act="qadd">+ Savol qo'shish</button><div class="row"><button class="btn" type="button" data-act="closeModal">Bekor qilish</button><button class="btn primary" type="button" data-act="saveTest">Saqlash</button></div></div>`);
}
function collectQuestions() {
  const out = [];
  for (const b of $$('#qs .qb')) {
    const text = $('.q-text', b).value.trim();
    const raw = $$('.q-opt', b).map(i => i.value.trim());
    const ch = b.querySelector('input[type=radio]:checked');
    if (!text && raw.every(x => !x)) continue;
    if (!ch) throw new Error('Har bir savolda to\'g\'ri javobni belgilang');
    const idx = +ch.value; const options = [], map = {};
    raw.forEach((o, i) => { if (o) { map[i] = options.length; options.push(o); } });
    if (!(idx in map)) throw new Error('To\'g\'ri javob bo\'sh variantga belgilangan');
    out.push({ text, options, answer: map[idx] });
  }
  if (!out.length) throw new Error('Kamida bitta savol kiriting');
  return out;
}

/* ---------- admin ---------- */
async function adminPage() {
  if (needLogin()) return;
  if (!S.user || !['admin','super_admin'].includes(S.user.role)) { view('<div class="glass pad center">Bu bo\'lim faqat administrator uchun.</div>'); return; }
  const tabs = [['stats', 'Statistika'], ['users', 'Foydalanuvchilar'], ['courses', 'Kurslar'], ['settings', 'Sozlamalar']];
  let body = '';
  if (AD.tab === 'stats') {
    const s = await api('/admin/stats');
    body = `<div class="kpis">${[['online', s.online, 'hozir onlayn'], ['s', s.students, "o'quvchi"], ['t', s.teachers, "o'qituvchi"], ['c', s.courses, 'kurs'], ['e', s.enrollments, 'yozilishlar'], ['r', s.results + ' · ' + s.avg + '%', "testlar · o'rtacha"]].map(([k, v, l]) => `<div class="kpi glass"><b ${k === 'online' ? 'data-live="online"' : ''}>${v}</b><span class="muted">${l}</span></div>`).join('')}</div>
    <div class="cols"><div class="glass pad"><h2 style="font-size:1.3rem;margin-bottom:8px">Jonli hodisalar</h2><div class="feed" id="feed">${feedHtml()}</div></div>
    <div class="glass pad"><h2 style="font-size:1.3rem;margin-bottom:8px">Oxirgi yozilishlar</h2>${s.recentEnrollments.map(e => `<div style="padding:8px 0;border-bottom:1px solid var(--stroke)"><b>${esc(e.name)}</b> <span class="muted">→ ${esc(e.title)}</span></div>`).join('') || '<p class="muted">Hali yo\'q</p>'}
    <h2 style="font-size:1.3rem;margin:18px 0 8px">Oxirgi natijalar</h2>${s.recentResults.map(r => `<div style="padding:8px 0;border-bottom:1px solid var(--stroke)"><b>${esc(r.name)}</b> <span class="muted">${esc(r.title)}</span> <span class="tag ok">${r.score}/${r.total}</span></div>`).join('') || '<p class="muted">Hali yo\'q</p>'}</div></div>`;
  } else if (AD.tab === 'users') {
    const us = await api('/admin/users');
    body = `<div class="cols"><div class="glass pad tw"><h2 style="font-size:1.3rem;margin-bottom:8px">Foydalanuvchilar (${us.length})</h2><table><tr><th>Ism</th><th>Email</th><th>Rol</th><th></th></tr>${us.map(u => `<tr><td><b>${esc(u.name)}</b></td><td class="muted">${esc(u.email)}</td>
      <td><select class="in" style="padding:.4rem .7rem" data-role="${u.id}" ${u.id === S.user.id ? 'disabled' : ''}>${[['student', "O'quvchi"], ['teacher', "O'qituvchi"], ...(S.user.role==='super_admin'?[['admin','Admin']]:[]), ['parent','Ota-ona'], ['accountant','Buxgalter']].map(([v, n]) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${n}</option>`).join('')}</select></td>
      <td><button class="btn sm" type="button" data-act="adminResetPassword" data-id="${u.id}" data-name="${esc(u.name)}" ${u.role==='super_admin'&&S.user.role!=='super_admin'?'disabled':''}>Parolni tiklash</button> ${u.id === S.user.id ? '' : `<button class="btn sm danger" data-act="delUser" data-id="${u.id}">O'chirish</button>`}</td></tr>`).join('')}</table></div>
      <form class="glass pad" data-form="newUser"><h2 style="font-size:1.3rem;margin-bottom:10px">Yangi foydalanuvchi</h2>
      <div class="fg"><label class="f">Ism</label><input class="in" name="name" required></div><div class="fg"><label class="f">Email</label><input class="in" type="email" name="email" required></div>
      <div class="fg"><label class="f">Parol</label><input class="in" name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></div>
      <div class="fg"><label class="f">Rol</label><select class="in" name="role"><option value="teacher">O'qituvchi</option><option value="student">O'quvchi</option>${S.user.role==='super_admin'?'<option value="admin">Admin</option>':''}<option value="parent">Ota-ona</option><option value="accountant">Buxgalter</option><option value="branch_manager">Filial menejeri</option></select></div>
      <button class="btn primary" type="submit">Qo'shish</button></form></div>`;
  } else if (AD.tab === 'courses') {
    const cs = await api('/manage/courses');
    body = `<div class="glass pad tw"><table><tr><th>Kurs</th><th>O'qituvchi</th><th>Holat</th><th>O'quvchi</th><th></th></tr>${cs.map(c => `<tr><td><b>${esc(c.cover)} ${esc(c.title)}</b></td><td class="muted">${esc(c.teacher_name || '—')}</td><td>${c.published ? '<span class="tag ok">E\'lon qilingan</span>' : '<span class="tag warn">Qoralama</span>'}</td><td>${c.students_count}</td><td style="white-space:nowrap"><a class="btn sm primary" href="#/manage/${c.id}">Boshqarish</a> <button class="btn sm danger" data-act="delCourse" data-id="${c.id}">O'chirish</button></td></tr>`).join('')}</table></div>`;
  } else {
    body = `<form class="glass pad" data-form="settings" style="max-width:560px"><h2 style="font-size:1.3rem;margin-bottom:12px">Markaz sozlamalari</h2>
      <div class="fg"><label class="f">Markaz nomi</label><input class="in" name="name" required value="${esc(S.settings.name)}"></div>
      <div class="fg"><label class="f">Bosh sahifadagi qisqa tavsif</label><textarea class="in" name="tagline">${esc(S.settings.tagline)}</textarea></div>
      <button class="btn primary" type="submit">Saqlash</button><p class="muted" style="margin-top:12px;font-size:.88rem">O'zgarish barcha foydalanuvchilarda darhol yangilanadi.</p></form>`;
  }
  view(`<div class="pagehead"><h1>Admin paneli</h1></div><div class="seg glass" style="margin-bottom:20px">${tabs.map(([k, n]) => `<button class="${AD.tab === k ? 'on' : ''}" data-act="admtab" data-tab="${k}">${n}</button>`).join('')}</div>${body}`);
}

/* ---------- AI chat ---------- */
function renderChat() {
  const greet = `<div class="msg a">Salom! Men ${esc(S.settings.name)} AI yordamchisiman. Kurs tanlash yoki darsdagi savollar bo'yicha yordam beraman.</div>`;
  $('#aim').innerHTML = greet + S.chat.map(m => `<div class="msg ${m.role === 'user' ? 'u' : 'a'}">${m.role === 'user' ? esc(m.content) : md(m.content)}</div>`).join('') +
    (S.typing ? '<div class="msg a"><span class="typing"><i></i><i></i><i></i></span></div>' : '');
  $('#aim').scrollTop = 1e6;
}
async function aiSend() {
  const inp = $('#aiIn'), text = inp.value.trim();
  if (!text || S.typing) return;
  inp.value = ''; S.chat.push({ role: 'user', content: text }); S.typing = true; renderChat();
  try {
    const courseId = CUR.name === 'coursePage' ? CUR.args[0] : null;
    const r = await api('/ai', 'POST', { messages: S.chat, courseId });
    S.chat.push({ role: 'assistant', content: r.reply });
  } catch (e) { S.chat.push({ role: 'assistant', content: 'Xatolik: ' + e.message }); }
  S.typing = false; renderChat();
}

/* ---------- harakatlar ---------- */
async function guard(fn) { try { await fn(); } catch (e) { toast(e.message, 'err'); } }

const actions = {
  theme() {
    const r = document.documentElement, d = r.dataset.theme === 'dark' ? 'light' : 'dark';
    r.dataset.theme = d; localStorage.setItem('theme', d); document.querySelectorAll('.theme-public').forEach(x=>x.textContent=d==='dark'?'☀':'☾'); renderNav();
  },
  logout() { localStorage.removeItem('t'); S.token = null; S.user = null; S.chat = []; connectSocket(); renderNav(); location.hash = '#/'; route(); toast('Chiqdingiz'); },
  closeModal,
  aiToggle() { const p = $('#aip'); p.classList.toggle('hide'); if (!p.classList.contains('hide')) { renderChat(); $('#aiIn').focus(); } },
  aiSend,
  authmode(el) { AUTHMODE = el.dataset.m; view(authForm()); },
  enroll(el) { if (needLogin()) return; return guard(async () => { await api(`/courses/${el.dataset.id}/enroll`, 'POST'); toast('Kursga yozildingiz!', 'ok'); route(true); }); },
  lesson(el) { openLesson(el.dataset.id); },
  lessonDone(el) { return guard(async () => { await api(`/lessons/${el.dataset.id}/complete`, 'POST'); closeModal(); toast('Dars tugatildi', 'ok'); route(true); }); },
  newCourse: newCourseModal,
  delCourse(el) { if (!confirm('Kursni butunlay o\'chirasizmi? Barcha darslar va testlar ham o\'chadi.')) return; return guard(async () => { await api('/courses/' + el.dataset.id, 'DELETE'); toast("Kurs o'chirildi"); route(true); }); },
  mtab(el) { MG.tab = el.dataset.tab; return guard(renderManage); },
  delLesson(el) { if (!confirm('Darsni o\'chirasizmi?')) return; return guard(async () => { await api('/lessons/' + el.dataset.id, 'DELETE'); renderManage(); }); },
  delTest(el) { if (!confirm('Testni o\'chirasizmi?')) return; return guard(async () => { await api('/tests/' + el.dataset.id, 'DELETE'); renderManage(); }); },
  newTest: newTestModal,
  qadd() { $('#qs').insertAdjacentHTML('beforeend', qBlock()); },
  qdel(el) { el.closest('.qb').remove(); },
  saveTest(el) {
    return guard(async () => {
      const title = $('#tt').value.trim();
      if (!title) throw new Error('Test nomini kiriting');
      await api(`/courses/${MG.id}/tests`, 'POST', { title, questions: collectQuestions() });
      closeModal(); toast('Test saqlandi', 'ok'); renderManage();
    });
  },
  aiGen(el) {
    el.disabled = true; const old = el.textContent; el.textContent = 'Yaratilyapti...';
    return guard(async () => {
      const r = await api('/ai/generate-test', 'POST', { courseId: MG.id, topic: $('#aiTopic').value, count: $('#aiCount').value });
      const qs = $('#qs');
      $$('.qb', qs).forEach(b => { if (!$('.q-text', b).value.trim()) b.remove(); });
      r.questions.forEach(q => qs.insertAdjacentHTML('beforeend', qBlock(q)));
      toast('AI savollar tayyor. Tekshirib, saqlang', 'ok');
    }).finally(() => { el.disabled = false; el.textContent = old; });
  },
  admtab(el) { AD.tab = el.dataset.tab; return guard(adminPage); },
  adminResetPassword(el) {
    const uid = Number(el.dataset.id);
    if (!Number.isSafeInteger(uid) || uid <= 0) return;
    modal(`<h2>Parolni administrator orqali tiklash</h2><p class="muted" style="margin:12px 0">Foydalanuvchi: <b>${esc(el.dataset.name)}</b>. Yangi parol o‘rnatilsa, foydalanuvchining barcha eski sessiyalari bekor bo‘ladi.</p>
      <form data-form="adminResetPassword" data-id="${uid}">
       <div class="fg"><label class="f">Administratorning joriy paroli</label><input class="in" name="admin_password" type="password" autocomplete="current-password" required></div>
       <div class="fg"><label class="f">Yangi parol (12–128 belgi)</label><input class="in" name="new_password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div>
       <div class="fg"><label class="f">Yangi parolni tasdiqlang</label><input class="in" name="confirm_password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div>
       <label class="row" style="margin-bottom:16px"><input type="checkbox" name="reset_2fa" value="true"> Agar Authenticator kodi yo‘qolgan bo‘lsa, 2FA himoyasini ham tiklash</label>
       <div class="row between"><button class="btn" data-act="closeModal" type="button">Bekor qilish</button><button class="btn primary" type="submit">Parolni almashtirish</button></div>
      </form>`);
  },
  delUser(el) { if (!confirm('Foydalanuvchini o\'chirasizmi?')) return; return guard(async () => { await api('/admin/users/' + el.dataset.id, 'DELETE'); adminPage(); }); }
};

const forms = {
  auth(f) {
    const d = Object.fromEntries(new FormData(f));
    return guard(async () => {
      if(AUTHMODE === 'login'){const otp=document.getElementById('mfaCode');if(otp?.value)d.totp=otp.value;}
      const r = await api(AUTHMODE === 'register' ? '/auth/register' : '/auth/login', 'POST', d);
      S.token = r.token; S.user = r.user; localStorage.setItem('t', r.token);
      connectSocket(); renderNav(); toast(`Xush kelibsiz, ${r.user.name.split(' ')[0]}!`, 'ok');
      location.hash = '#/workspace';
    });
  },
  newCourse(f) {
    const d = Object.fromEntries(new FormData(f)); d.published = f.published.checked;
    return guard(async () => { const r = await api('/courses', 'POST', d); closeModal(); location.hash = '#/manage/' + r.id; });
  },
  editCourse(f) {
    const d = Object.fromEntries(new FormData(f)); d.published = f.published.checked;
    return guard(async () => { await api('/courses/' + MG.id, 'PUT', d); toast('Saqlandi', 'ok'); renderManage(); });
  },
  lesson(f) {
    const d = Object.fromEntries(new FormData(f));
    return guard(async () => { await api(`/courses/${MG.id}/lessons`, 'POST', d); toast("Dars qo'shildi", 'ok'); renderManage(); });
  },
  adminResetPassword(f) {
    return guard(async () => {
      const data = Object.fromEntries(new FormData(f));
      if(data.new_password!==data.confirm_password)throw Error('Yangi parollar mos emas');
      if(!confirm('Tanlangan foydalanuvchining parolini almashtirasizmi?'))return;
      const r=await api('/admin/users/'+f.dataset.id+'/password','PUT',{
        admin_password:data.admin_password, new_password:data.new_password,reset_2fa:data.reset_2fa==='true'
      });
      f.reset();closeModal();toast('Yangi parol saqlandi. Eski sessiyalar bekor qilindi.','ok');
      if(r.logout_required){localStorage.removeItem('t');S.token=null;S.user=null;socket?.disconnect();location.hash='#/login';}
      else adminPage();
    });
  },
  newUser(f) {
    const d = Object.fromEntries(new FormData(f));
    return guard(async () => { await api('/admin/users', 'POST', d); toast("Foydalanuvchi qo'shildi", 'ok'); adminPage(); });
  },
  settings(f) {
    const d = Object.fromEntries(new FormData(f));
    return guard(async () => { await api('/settings', 'PUT', d); S.settings = await api('/settings'); applySettings(); toast('Saqlandi', 'ok'); });
  }
};

document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (a) { const fn = actions[a.dataset.act]; if (fn) fn(a, e); return; }
  const g = e.target.closest('[data-go]');
  if (g) location.hash = g.dataset.go;
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]');
  if (f) { e.preventDefault(); forms[f.dataset.form](f); }
});
document.addEventListener('change', e => {
  const s = e.target.closest('select[data-role]');
  if (s) guard(async () => { await api(`/admin/users/${s.dataset.role}/role`, 'PUT', { role: s.value }); toast('Rol yangilandi', 'ok'); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'aiIn') aiSend();
  if (e.key === 'Escape') closeModal();
});

/* ---------- router ---------- */
const routes = [
  [/^#\/?$/, home], [/^#\/courses$/, coursesPage], [/^#\/course\/(\d+)$/, coursePage], [/^#\/test\/(\d+)$/, testPage],
  [/^#\/me$/, mePage], [/^#\/teacher$/, teacherPage], [/^#\/manage\/(\d+)$/, managePage], [/^#\/admin$/, adminPage], [/^#\/login$/, loginPage]
];
async function route(keepScroll) {
  const h = location.hash || '#/';
  const y = window.scrollY;
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (!m) continue;
    CUR = { name: fn.name, args: m.slice(1) };
    renderNav();
    try { await fn(...m.slice(1)); }
    catch (e) { view(`<div class="glass pad center"><h2>Xatolik</h2><p class="muted" style="margin-top:8px">${esc(e.message)}</p><a class="btn" style="margin-top:16px" href="#/">Bosh sahifa</a></div>`); }
    window.scrollTo(0, keepScroll === true ? y : 0);
    return;
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', () => route());

(async function init() {
  document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark'; document.querySelectorAll('.theme-public').forEach(x=>x.textContent=document.documentElement.dataset.theme==='dark'?'☀':'☾');
  try { S.settings = await api('/settings'); } catch { }
  applySettings();
  if (S.token) {
    try { S.user = await api('/me'); } catch { S.token = null; localStorage.removeItem('t'); }
  }
  connectSocket();
  renderNav();
  route();
})();
