require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'markaz.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS courses(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
  category TEXT DEFAULT 'Umumiy', level TEXT DEFAULT 'Boshlang''ich', price INTEGER DEFAULT 0,
  cover TEXT DEFAULT '📘', published INTEGER DEFAULT 1,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS lessons(
  id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL, content TEXT DEFAULT '', video_url TEXT DEFAULT '', position INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS enrollments(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, course_id));
CREATE TABLE IF NOT EXISTS progress(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, PRIMARY KEY(user_id, lesson_id));
CREATE TABLE IF NOT EXISTS tests(
  id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS questions(
  id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  text TEXT NOT NULL, options TEXT NOT NULL, answer INTEGER NOT NULL, position INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS results(
  id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, score INTEGER, total INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
`);

const getSetting = (k, d = '') => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? r.value : d; };
const setSetting = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);

if (!getSetting('center_name')) setSetting('center_name', "O'quv Markaz");
if (!getSetting('tagline')) setSetting('tagline', "Bilimni zamonaviy usulda oling: onlayn kurslar, real vaqtdagi testlar va AI ustoz bitta joyda.");

let SECRET = process.env.JWT_SECRET || getSetting('jwt_secret');
if (!SECRET) { SECRET = crypto.randomBytes(32).toString('hex'); setSetting('jwt_secret', SECRET); }

/* ---------- Boshlang'ich ma'lumotlar ---------- */
(function seed() {
  if (!db.prepare("SELECT 1 FROM users WHERE role='admin'").get()) {
    db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(
      'Administrator', (process.env.ADMIN_EMAIL || 'admin@markaz.uz').toLowerCase(),
      bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin12345', 10), 'admin');
    console.log('Admin yaratildi:', process.env.ADMIN_EMAIL || 'admin@markaz.uz');
  }
  if (db.prepare('SELECT COUNT(*) n FROM courses').get().n === 0) {
    const t = db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)')
      .run('Aziza Karimova', 'teacher@markaz.uz', bcrypt.hashSync('teacher123', 10), 'teacher');
    const tid = t.lastInsertRowid;
    const mk = (title, description, category, level, price, cover, lessons, test) => {
      const c = db.prepare('INSERT INTO courses(title,description,category,level,price,cover,teacher_id) VALUES(?,?,?,?,?,?,?)')
        .run(title, description, category, level, price, cover, tid).lastInsertRowid;
      lessons.forEach((l, i) => db.prepare('INSERT INTO lessons(course_id,title,content,position) VALUES(?,?,?,?)').run(c, l[0], l[1], i + 1));
      const tt = db.prepare('INSERT INTO tests(course_id,title) VALUES(?,?)').run(c, test.title).lastInsertRowid;
      test.q.forEach((q, i) => db.prepare('INSERT INTO questions(test_id,text,options,answer,position) VALUES(?,?,?,?,?)').run(tt, q[0], JSON.stringify(q[1]), q[2], i));
    };
    mk("Ingliz tili: boshlang'ich daraja", "Noldan A2 darajagacha: talaffuz, so'z boyligi va kundalik suhbat.", 'Tillar', "Boshlang'ich", 250000, '🗣️',
      [["Alifbo va talaffuz", "Ingliz alifbosida 26 ta harf bor. Birinchi darsda har bir harfning nomi va tovushini mashq qilamiz."],
       ["Salomlashish va tanishuv", "Hello, Hi, Good morning — salomlashish iboralari. My name is ... — o'zingizni tanishtirish."],
       ["Present Simple", "Odatiy va doimiy harakatlar uchun ishlatiladi: I work, she works. He/She/It bilan fe'lga -s qo'shiladi."]],
      { title: 'Present Simple testi', q: [
        ["She ___ to school every day.", ['go', 'goes', 'going', 'gone'], 1],
        ["I ___ a student.", ['is', 'are', 'am', 'be'], 2],
        ["Ingliz alifbosida nechta harf bor?", ['24', '26', '28', '30'], 1]] });
    mk("Matematika: abituriyentlar uchun", "Algebra va geometriya bo'yicha qisqa va tushunarli kurs.", 'Aniq fanlar', "O'rta", 300000, '🧮',
      [["Tenglamalar", "Chiziqli tenglama ax + b = 0 ko'rinishida bo'ladi. Yechim: x = -b/a."],
       ["Kvadrat tenglama", "ax² + bx + c = 0 uchun diskriminant D = b² − 4ac. D > 0 bo'lsa, ikkita ildiz bor."]],
      { title: 'Algebra testi', q: [
        ["2x + 6 = 14 bo'lsa, x nechaga teng?", ['2', '3', '4', '5'], 2],
        ["x² − 5x + 6 = 0 ildizlari?", ['1 va 6', '2 va 3', '−2 va −3', '3 va 4'], 1]] });
    mk("Python dasturlash asoslari", "Dasturlashni noldan boshlang: o'zgaruvchilar, shartlar, sikllar va funksiyalar.", 'IT', "Boshlang'ich", 0, '🐍',
      [["Birinchi dastur", "print('Salom, dunyo!') — ekranga matn chiqaradi."],
       ["O'zgaruvchilar va turlar", "Python'da int, float, str va bool turlari bor. Misol: yosh = 18"],
       ["Shartlar va sikllar", "if / elif / else shartlar uchun, for va while sikllar uchun ishlatiladi."]],
      { title: 'Python asoslari testi', q: [
        ["Ekranga chiqarish funksiyasi qaysi?", ['echo()', 'print()', 'write()', 'show()'], 1],
        ["Qaysi biri matn (str) turi?", ['42', '3.14', "'salom'", 'True'], 2]] });
    console.log('Namunaviy kurslar qo\'shildi (teacher@markaz.uz / teacher123)');
  }
})();

/* ---------- App ---------- */
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const clean = (s, max = 200) => String(s ?? '').trim().slice(0, max);

function auth(required = true) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (t) {
      try {
        const p = jwt.verify(t, SECRET);
        const u = db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(p.id);
        if (u) req.user = u;
      } catch { /* yaroqsiz token */ }
    }
    if (required && !req.user) return bad(res, 'Avval tizimga kiring', 401);
    next();
  };
}
const role = (...r) => (req, res, next) => (r.includes(req.user.role) ? next() : bad(res, "Ruxsat yo'q", 403));
const sign = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: '30d' });

const getCourse = id => db.prepare('SELECT * FROM courses WHERE id=?').get(id);
const isManager = (c, u) => !!u && (u.role === 'admin' || (u.role === 'teacher' && c.teacher_id === u.id));
const isEnrolled = (c, u) => !!u && !!db.prepare('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?').get(u.id, c.id);

const COURSE_SQL = `
SELECT c.*, u.name AS teacher_name,
 (SELECT COUNT(*) FROM lessons WHERE course_id=c.id) AS lessons_count,
 (SELECT COUNT(*) FROM tests WHERE course_id=c.id) AS tests_count,
 (SELECT COUNT(*) FROM enrollments WHERE course_id=c.id) AS students_count
FROM courses c LEFT JOIN users u ON u.id=c.teacher_id`;

/* realtime yordamchilar */
const online = () => io.engine.clientsCount;
const broadcastCourses = () => { io.emit('courses:changed'); io.emit('stats:changed'); };
function activity(text, teacherId) {
  const payload = { text, ts: Date.now() };
  let r = io.to('admins');
  if (teacherId) r = r.to('user:' + teacherId);
  r.emit('activity', payload);
}

/* ---------- Ochiq API ---------- */
app.get('/api/settings', (req, res) => res.json({ name: getSetting('center_name'), tagline: getSetting('tagline') }));

app.get('/api/stats', (req, res) => {
  const n = q => db.prepare(q).get().n;
  res.json({
    online: online(),
    courses: n('SELECT COUNT(*) n FROM courses WHERE published=1'),
    students: n("SELECT COUNT(*) n FROM users WHERE role='student'"),
    teachers: n("SELECT COUNT(*) n FROM users WHERE role='teacher'"),
    tests: n('SELECT COUNT(*) n FROM tests')
  });
});

app.post('/api/auth/register', wrap((req, res) => {
  const name = clean(req.body.name, 80), email = clean(req.body.email, 120).toLowerCase(), password = String(req.body.password || '');
  if (name.length < 2) return bad(res, 'Ismni kiriting');
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, "Email noto'g'ri");
  if (password.length < 6) return bad(res, "Parol kamida 6 ta belgi bo'lsin");
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return bad(res, "Bu email band");
  const id = db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(name, email, bcrypt.hashSync(password, 10), 'student').lastInsertRowid;
  const user = db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(id);
  io.emit('stats:changed');
  activity(`Yangi o'quvchi ro'yxatdan o'tdi: ${name}`);
  res.json({ token: sign(user), user });
}));

app.post('/api/auth/login', wrap((req, res) => {
  const email = clean(req.body.email, 120).toLowerCase(), password = String(req.body.password || '');
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !bcrypt.compareSync(password, u.password)) return bad(res, "Email yoki parol noto'g'ri", 401);
  const user = { id: u.id, name: u.name, email: u.email, role: u.role };
  res.json({ token: sign(user), user });
}));

app.get('/api/me', auth(), (req, res) => res.json(req.user));

app.get('/api/courses', (req, res) => {
  res.json(db.prepare(COURSE_SQL + ' WHERE c.published=1 ORDER BY c.id DESC').all());
});

app.get('/api/courses/:id', auth(false), wrap((req, res) => {
  const c = db.prepare(COURSE_SQL + ' WHERE c.id=?').get(req.params.id);
  if (!c) return bad(res, 'Kurs topilmadi', 404);
  const manager = isManager(c, req.user);
  if (!c.published && !manager) return bad(res, 'Kurs topilmadi', 404);
  const enrolled = isEnrolled(c, req.user);
  const access = manager || enrolled;
  const done = new Set(req.user ? db.prepare('SELECT lesson_id FROM progress WHERE user_id=?').all(req.user.id).map(r => r.lesson_id) : []);
  const lessons = db.prepare('SELECT * FROM lessons WHERE course_id=? ORDER BY position,id').all(c.id).map(l => ({
    id: l.id, title: l.title, position: l.position, done: done.has(l.id), locked: !access,
    content: access ? l.content : '', video_url: access ? l.video_url : ''
  }));
  const tests = db.prepare('SELECT t.id,t.title,(SELECT COUNT(*) FROM questions WHERE test_id=t.id) AS questions_count FROM tests t WHERE t.course_id=? ORDER BY t.id').all(c.id);
  if (req.user) {
    const best = db.prepare('SELECT test_id, MAX(score) s, total FROM results WHERE user_id=? GROUP BY test_id').all(req.user.id);
    tests.forEach(t => { const b = best.find(x => x.test_id === t.id); if (b) t.best = { score: b.s, total: b.total }; });
  }
  res.json({ ...c, enrolled, manager, lessons, tests });
}));

/* ---------- O'quvchi ---------- */
app.post('/api/courses/:id/enroll', auth(), wrap((req, res) => {
  const c = getCourse(req.params.id);
  if (!c || !c.published) return bad(res, 'Kurs topilmadi', 404);
  const r = db.prepare('INSERT OR IGNORE INTO enrollments(user_id,course_id) VALUES(?,?)').run(req.user.id, c.id);
  if (r.changes) {
    activity(`${req.user.name} «${c.title}» kursiga yozildi`, c.teacher_id);
    io.emit('courses:changed'); io.emit('stats:changed');
  }
  res.json({ ok: true });
}));

app.get('/api/my', auth(), (req, res) => {
  const courses = db.prepare(COURSE_SQL + ' JOIN enrollments e ON e.course_id=c.id WHERE e.user_id=? ORDER BY e.id DESC').all(req.user.id)
    .map(c => ({
      ...c,
      done: db.prepare('SELECT COUNT(*) n FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE p.user_id=? AND l.course_id=?').get(req.user.id, c.id).n
    }));
  const results = db.prepare(`SELECT r.id,r.score,r.total,r.created_at,t.title AS test_title,t.id AS test_id,c.title AS course_title
    FROM results r JOIN tests t ON t.id=r.test_id JOIN courses c ON c.id=t.course_id WHERE r.user_id=? ORDER BY r.id DESC LIMIT 30`).all(req.user.id);
  res.json({ courses, results });
});

app.post('/api/lessons/:id/complete', auth(), wrap((req, res) => {
  const l = db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);
  if (!l) return bad(res, 'Dars topilmadi', 404);
  const c = getCourse(l.course_id);
  if (!isManager(c, req.user) && !isEnrolled(c, req.user)) return bad(res, "Avval kursga yoziling", 403);
  db.prepare('INSERT OR IGNORE INTO progress(user_id,lesson_id) VALUES(?,?)').run(req.user.id, l.id);
  res.json({ ok: true });
}));

app.get('/api/tests/:id', auth(), wrap((req, res) => {
  const t = db.prepare('SELECT * FROM tests WHERE id=?').get(req.params.id);
  if (!t) return bad(res, 'Test topilmadi', 404);
  const c = getCourse(t.course_id);
  if (!isManager(c, req.user) && !isEnrolled(c, req.user)) return bad(res, "Testni topshirish uchun kursga yoziling", 403);
  const questions = db.prepare('SELECT id,text,options FROM questions WHERE test_id=? ORDER BY position,id').all(t.id)
    .map(q => ({ id: q.id, text: q.text, options: JSON.parse(q.options) }));
  res.json({ id: t.id, title: t.title, course_id: c.id, course_title: c.title, questions });
}));

app.post('/api/tests/:id/submit', auth(), wrap((req, res) => {
  const t = db.prepare('SELECT * FROM tests WHERE id=?').get(req.params.id);
  if (!t) return bad(res, 'Test topilmadi', 404);
  const c = getCourse(t.course_id);
  if (!isManager(c, req.user) && !isEnrolled(c, req.user)) return bad(res, "Kursga yoziling", 403);
  const qs = db.prepare('SELECT * FROM questions WHERE test_id=? ORDER BY position,id').all(t.id);
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  let score = 0;
  qs.forEach((q, i) => { if (Number(answers[i]) === q.answer) score++; });
  db.prepare('INSERT INTO results(test_id,user_id,score,total) VALUES(?,?,?,?)').run(t.id, req.user.id, score, qs.length);
  activity(`${req.user.name} «${t.title}» testini yakunladi: ${score}/${qs.length}`, c.teacher_id);
  io.to('user:' + req.user.id).emit('result', { score, total: qs.length });
  res.json({ score, total: qs.length, correct: qs.map(q => q.answer) });
}));

/* ---------- O'qituvchi / Admin: kurslarni boshqarish ---------- */
const staff = [auth(), role('teacher', 'admin')];

app.get('/api/manage/courses', ...staff, (req, res) => {
  const sql = COURSE_SQL + (req.user.role === 'admin' ? '' : ' WHERE c.teacher_id=?') + ' ORDER BY c.id DESC';
  res.json(req.user.role === 'admin' ? db.prepare(sql).all() : db.prepare(sql).all(req.user.id));
});

function courseFields(b, old = {}) {
  const title = clean(b.title ?? old.title, 120);
  if (title.length < 2) return null;
  return {
    title,
    description: clean(b.description ?? old.description, 1000),
    category: clean(b.category ?? old.category, 40) || 'Umumiy',
    level: clean(b.level ?? old.level, 30) || "Boshlang'ich",
    price: Math.max(0, parseInt(b.price ?? old.price, 10) || 0),
    cover: clean(b.cover ?? old.cover, 8) || '📘',
    published: (b.published ?? old.published) ? 1 : 0
  };
}

app.post('/api/courses', ...staff, wrap((req, res) => {
  const f = courseFields(req.body);
  if (!f) return bad(res, 'Kurs nomini kiriting');
  const id = db.prepare('INSERT INTO courses(title,description,category,level,price,cover,published,teacher_id) VALUES(?,?,?,?,?,?,?,?)')
    .run(f.title, f.description, f.category, f.level, f.price, f.cover, f.published, req.user.id).lastInsertRowid;
  broadcastCourses();
  res.json({ id });
}));

const ownCourse = (req, res) => {
  const c = getCourse(req.params.id);
  if (!c) { bad(res, 'Kurs topilmadi', 404); return null; }
  if (!isManager(c, req.user)) { bad(res, "Bu kurs sizniki emas", 403); return null; }
  return c;
};

app.put('/api/courses/:id', ...staff, wrap((req, res) => {
  const c = ownCourse(req, res); if (!c) return;
  const f = courseFields(req.body, c);
  if (!f) return bad(res, 'Kurs nomini kiriting');
  db.prepare('UPDATE courses SET title=?,description=?,category=?,level=?,price=?,cover=?,published=? WHERE id=?')
    .run(f.title, f.description, f.category, f.level, f.price, f.cover, f.published, c.id);
  broadcastCourses();
  res.json({ ok: true });
}));

app.delete('/api/courses/:id', ...staff, wrap((req, res) => {
  const c = ownCourse(req, res); if (!c) return;
  db.prepare('DELETE FROM courses WHERE id=?').run(c.id);
  broadcastCourses();
  res.json({ ok: true });
}));

app.post('/api/courses/:id/lessons', ...staff, wrap((req, res) => {
  const c = ownCourse(req, res); if (!c) return;
  const title = clean(req.body.title, 120);
  if (!title) return bad(res, 'Dars nomini kiriting');
  const pos = db.prepare('SELECT COALESCE(MAX(position),0)+1 p FROM lessons WHERE course_id=?').get(c.id).p;
  db.prepare('INSERT INTO lessons(course_id,title,content,video_url,position) VALUES(?,?,?,?,?)')
    .run(c.id, title, clean(req.body.content, 20000), clean(req.body.video_url, 300), pos);
  broadcastCourses();
  res.json({ ok: true });
}));

app.delete('/api/lessons/:id', ...staff, wrap((req, res) => {
  const l = db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);
  if (!l) return bad(res, 'Dars topilmadi', 404);
  if (!isManager(getCourse(l.course_id), req.user)) return bad(res, "Ruxsat yo'q", 403);
  db.prepare('DELETE FROM lessons WHERE id=?').run(l.id);
  broadcastCourses();
  res.json({ ok: true });
}));

function validQuestions(list) {
  if (!Array.isArray(list) || !list.length || list.length > 100) return null;
  const out = [];
  for (const q of list) {
    const text = clean(q.text, 500);
    const options = Array.isArray(q.options) ? q.options.map(o => clean(o, 200)).filter(Boolean) : [];
    const answer = parseInt(q.answer, 10);
    if (!text || options.length < 2 || options.length > 6 || !(answer >= 0 && answer < options.length)) return null;
    out.push({ text, options, answer });
  }
  return out;
}

app.post('/api/courses/:id/tests', ...staff, wrap((req, res) => {
  const c = ownCourse(req, res); if (!c) return;
  const title = clean(req.body.title, 120);
  const qs = validQuestions(req.body.questions);
  if (!title) return bad(res, 'Test nomini kiriting');
  if (!qs) return bad(res, "Savollar to'liq emas: matn, kamida 2 ta variant va to'g'ri javob kerak");
  db.transaction(() => {
    const tid = db.prepare('INSERT INTO tests(course_id,title) VALUES(?,?)').run(c.id, title).lastInsertRowid;
    qs.forEach((q, i) => db.prepare('INSERT INTO questions(test_id,text,options,answer,position) VALUES(?,?,?,?,?)').run(tid, q.text, JSON.stringify(q.options), q.answer, i));
  })();
  broadcastCourses();
  res.json({ ok: true });
}));

app.delete('/api/tests/:id', ...staff, wrap((req, res) => {
  const t = db.prepare('SELECT * FROM tests WHERE id=?').get(req.params.id);
  if (!t) return bad(res, 'Test topilmadi', 404);
  if (!isManager(getCourse(t.course_id), req.user)) return bad(res, "Ruxsat yo'q", 403);
  db.prepare('DELETE FROM tests WHERE id=?').run(t.id);
  broadcastCourses();
  res.json({ ok: true });
}));

app.get('/api/courses/:id/students', ...staff, wrap((req, res) => {
  const c = ownCourse(req, res); if (!c) return;
  const students = db.prepare(`SELECT u.id,u.name,u.email,e.created_at AS joined,
    (SELECT COUNT(*) FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE p.user_id=u.id AND l.course_id=?) AS done
    FROM enrollments e JOIN users u ON u.id=e.user_id WHERE e.course_id=? ORDER BY e.id DESC`).all(c.id, c.id);
  const results = db.prepare(`SELECT r.user_id,t.title,MAX(r.score) AS score,r.total FROM results r JOIN tests t ON t.id=r.test_id
    WHERE t.course_id=? GROUP BY r.user_id,r.test_id`).all(c.id);
  const lessons = db.prepare('SELECT COUNT(*) n FROM lessons WHERE course_id=?').get(c.id).n;
  res.json({ lessons, students: students.map(s => ({ ...s, results: results.filter(r => r.user_id === s.id) })) });
}));

/* ---------- Admin ---------- */
const adminOnly = [auth(), role('admin')];

app.get('/api/admin/stats', ...adminOnly, (req, res) => {
  const n = q => db.prepare(q).get().n;
  res.json({
    online: online(),
    students: n("SELECT COUNT(*) n FROM users WHERE role='student'"),
    teachers: n("SELECT COUNT(*) n FROM users WHERE role='teacher'"),
    courses: n('SELECT COUNT(*) n FROM courses'),
    enrollments: n('SELECT COUNT(*) n FROM enrollments'),
    results: n('SELECT COUNT(*) n FROM results'),
    avg: Math.round(db.prepare('SELECT AVG(score*100.0/NULLIF(total,0)) a FROM results').get().a || 0),
    recentEnrollments: db.prepare(`SELECT u.name,c.title,e.created_at FROM enrollments e JOIN users u ON u.id=e.user_id JOIN courses c ON c.id=e.course_id ORDER BY e.id DESC LIMIT 6`).all(),
    recentResults: db.prepare(`SELECT u.name,t.title,r.score,r.total,r.created_at FROM results r JOIN users u ON u.id=r.user_id JOIN tests t ON t.id=r.test_id ORDER BY r.id DESC LIMIT 6`).all()
  });
});

app.get('/api/admin/users', ...adminOnly, (req, res) => {
  res.json(db.prepare('SELECT id,name,email,role,created_at FROM users ORDER BY id DESC').all());
});

app.post('/api/admin/users', ...adminOnly, wrap((req, res) => {
  const name = clean(req.body.name, 80), email = clean(req.body.email, 120).toLowerCase(), password = String(req.body.password || '');
  const r = ['student', 'teacher', 'admin'].includes(req.body.role) ? req.body.role : 'student';
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) return bad(res, "Ism, to'g'ri email va kamida 6 belgili parol kerak");
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return bad(res, 'Bu email band');
  db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(name, email, bcrypt.hashSync(password, 10), r);
  io.emit('stats:changed');
  res.json({ ok: true });
}));

app.put('/api/admin/users/:id/role', ...adminOnly, wrap((req, res) => {
  const r = req.body.role;
  if (!['student', 'teacher', 'admin'].includes(r)) return bad(res, 'Noto\'g\'ri rol');
  if (Number(req.params.id) === req.user.id) return bad(res, "O'z rolingizni o'zgartira olmaysiz");
  db.prepare('UPDATE users SET role=? WHERE id=?').run(r, req.params.id);
  io.emit('stats:changed');
  io.to('user:' + req.params.id).emit('role:changed');
  res.json({ ok: true });
}));

app.delete('/api/admin/users/:id', ...adminOnly, wrap((req, res) => {
  if (Number(req.params.id) === req.user.id) return bad(res, "O'zingizni o'chira olmaysiz");
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  broadcastCourses();
  res.json({ ok: true });
}));

app.put('/api/settings', ...adminOnly, wrap((req, res) => {
  const name = clean(req.body.name, 60), tagline = clean(req.body.tagline, 300);
  if (!name) return bad(res, 'Markaz nomini kiriting');
  setSetting('center_name', name); setSetting('tagline', tagline);
  io.emit('settings:changed');
  res.json({ ok: true });
}));

/* ---------- AI (Claude) ---------- */
async function claude(system, messages, max = 900) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { const e = new Error("AI hali ulanmagan: serverda ANTHROPIC_API_KEY o'rnatilishi kerak"); e.soft = true; throw e; }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: max, system, messages })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'AI xatosi');
  return (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

const hits = new Map();
function limited(key, max = 20) {
  const t = Date.now(), arr = (hits.get(key) || []).filter(x => t - x < 60000);
  arr.push(t); hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();

app.post('/api/ai', auth(false), wrap(async (req, res) => {
  if (limited((req.user ? 'u' + req.user.id : req.ip))) return bad(res, "Juda tez yozyapsiz, bir daqiqa kuting", 429);
  let msgs = (Array.isArray(req.body.messages) ? req.body.messages : []).slice(-12)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length) return bad(res, 'Savol yozing');

  const list = db.prepare('SELECT title,category,level,price FROM courses WHERE published=1 LIMIT 40').all()
    .map(c => `- ${c.title} (${c.category}, ${c.level}, ${c.price ? c.price + " so'm" : 'bepul'})`).join('\n');
  let system = `Sen "${getSetting('center_name')}" o'quv markazining AI yordamchisisan. Foydalanuvchi bilan o'zbek tilida (u boshqa tilda yozsa, shu tilda) qisqa, aniq va do'stona gaplash. Kurs tanlashda yordam ber, o'quv savollariga tushuntirib javob ber. Bilmagan narsani to'qima.\nMarkazdagi kurslar:\n${list || "(hozircha kurs yo'q)"}`;
  const c = req.body.courseId ? getCourse(parseInt(req.body.courseId, 10)) : null;
  if (c && c.published) {
    const ls = db.prepare('SELECT title FROM lessons WHERE course_id=? ORDER BY position').all(c.id).map(l => l.title).join(', ');
    system += `\n\nFoydalanuvchi hozir «${c.title}» kursini ko'ryapti. Tavsif: ${c.description}. Darslar: ${ls || "yo'q"}.`;
  }
  try { res.json({ reply: await claude(system, msgs) }); }
  catch (e) { if (e.soft) return res.json({ reply: e.message }); throw e; }
}));

app.post('/api/ai/generate-test', ...staff, wrap(async (req, res) => {
  const c = getCourse(parseInt(req.body.courseId, 10));
  if (!c || !isManager(c, req.user)) return bad(res, "Ruxsat yo'q", 403);
  if (limited('gen' + req.user.id, 6)) return bad(res, 'Biroz kuting', 429);
  const topic = clean(req.body.topic, 200) || c.title;
  const count = Math.min(Math.max(parseInt(req.body.count, 10) || 5, 1), 15);
  let text;
  try {
    text = await claude("Sen o'quv markaz uchun test savollari tuzuvchi yordamchisan. Faqat JSON qaytar, boshqa matn yozma.",
      [{ role: 'user', content: `Kurs: ${c.title}\nMavzu: ${topic}\n${count} ta ko'p variantli savol tuz (o'zbek tilida, har birida 4 ta variant). Format: [{"text":"savol","options":["A","B","C","D"],"answer":0}] — answer to'g'ri variant indeksi (0-3).` }], 3000);
  } catch (e) { return bad(res, e.message, e.soft ? 503 : 500); }
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  let qs = null;
  try { qs = validQuestions(JSON.parse(text.slice(a, b + 1))); } catch { /* */ }
  if (!qs) return bad(res, "AI javobini o'qib bo'lmadi, qayta urinib ko'ring", 502);
  res.json({ questions: qs });
}));

/* ---------- Realtime ---------- */
io.use((socket, next) => {
  const t = socket.handshake.auth && socket.handshake.auth.token;
  if (t) {
    try {
      const p = jwt.verify(t, SECRET);
      const u = db.prepare('SELECT id,name,role FROM users WHERE id=?').get(p.id);
      if (u) socket.user = u;
    } catch { /* mehmon */ }
  }
  next();
});
io.on('connection', socket => {
  if (socket.user) {
    socket.join('user:' + socket.user.id);
    if (socket.user.role === 'admin') socket.join('admins');
  }
  io.emit('online', { count: online() });
  socket.on('disconnect', () => setTimeout(() => io.emit('online', { count: online() }), 100));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: err.message || 'Server xatosi' }); });

server.listen(PORT, '0.0.0.0', () => console.log(`✅ Sayt ishga tushdi: http://localhost:${PORT}`));
