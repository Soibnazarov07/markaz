'use strict';
/** Timed, persisted examinations with server-side grading & teacher release. */
module.exports=function installExams({app,db,auth,role}){
 db.exec(`
 CREATE TABLE IF NOT EXISTS v5_exams(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,course_id INTEGER NOT NULL REFERENCES courses(id),group_id INTEGER REFERENCES study_groups(id),owner_id INTEGER NOT NULL REFERENCES users(id),
 mode TEXT NOT NULL DEFAULT 'registered' CHECK(mode IN ('registered','course_group')),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK(duration_minutes BETWEEN 1 AND 240),max_attempts INTEGER NOT NULL DEFAULT 1 CHECK(max_attempts BETWEEN 1 AND 30),
 result_policy TEXT NOT NULL DEFAULT 'immediate' CHECK(result_policy IN ('immediate','teacher')),
 opens_at TEXT,closes_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS v5_exam_questions(id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL REFERENCES v5_exams(id) ON DELETE CASCADE,
 type TEXT NOT NULL CHECK(type IN ('single','multiple','true_false','short','essay')),prompt TEXT NOT NULL,options_json TEXT NOT NULL DEFAULT '[]',answer_json TEXT NOT NULL DEFAULT 'null',
 points INTEGER NOT NULL DEFAULT 1 CHECK(points BETWEEN 1 AND 100),sort_order INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS v5_exam_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL REFERENCES v5_exams(id),student_id INTEGER NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','pending','graded')),
 started_at TEXT NOT NULL,deadline_at TEXT NOT NULL,submitted_at TEXT,total_points INTEGER NOT NULL DEFAULT 0,earned_points INTEGER NOT NULL DEFAULT 0,
 released INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS v5_exam_answers(attempt_id INTEGER NOT NULL REFERENCES v5_exam_attempts(id) ON DELETE CASCADE,question_id INTEGER NOT NULL REFERENCES v5_exam_questions(id),
 value_json TEXT NOT NULL,score INTEGER,feedback TEXT NOT NULL DEFAULT '',PRIMARY KEY(attempt_id,question_id));
 CREATE INDEX IF NOT EXISTS idx_v5_exam_student ON v5_exam_attempts(student_id,exam_id);
 `);
 const reject=(res,m,c=400)=>res.status(c).json({error:m});
 const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
 const trim=(s,n=500)=>String(s??'').trim().slice(0,n);
 const own=(u,e)=>['admin','super_admin'].includes(u.role)||u.role==='teacher'&&db.prepare('SELECT 1 FROM courses WHERE id=? AND teacher_id=?').get(e.course_id,u.id);
 const access=(u,e)=>u.role==='student'&&e.status==='published'&&(!e.opens_at||Date.parse(e.opens_at)<=Date.now())&&(!e.closes_at||Date.parse(e.closes_at)>=Date.now())&&
 (e.mode==='registered'||e.group_id&&db.prepare('SELECT 1 FROM group_students WHERE student_id=? AND group_id=?').get(u.id,e.group_id));
 const tryWrap=f=>(req,res,next)=>{try{f(req,res);}catch(e){if(String(e.code||'').startsWith('SQLITE_CONSTRAINT'))return reject(res,'Ma’lumotlar cheklovi',409);next(e);}};
 const exam=x=>db.prepare('SELECT * FROM v5_exams WHERE id=?').get(id(x));
 const questions=x=>db.prepare('SELECT * FROM v5_exam_questions WHERE exam_id=? ORDER BY sort_order,id').all(x);
 app.get('/api/v5/exams',auth(),tryWrap((req,res)=>{
  const all=db.prepare("SELECT e.id,e.title,e.course_id,e.group_id,e.mode,e.status,e.duration_minutes,e.max_attempts,e.result_policy,e.opens_at,e.closes_at,c.title course_title,(SELECT COUNT(*) FROM v5_exam_questions q WHERE q.exam_id=e.id) question_count FROM v5_exams e JOIN courses c ON c.id=e.course_id ORDER BY e.id DESC LIMIT 150").all();
  res.json(all.filter(e=>['admin','super_admin'].includes(req.user.role)||req.user.role==='teacher'&&db.prepare('SELECT 1 FROM courses WHERE id=? AND teacher_id=?').get(e.course_id,req.user.id)||access(req.user,e)));
 }));
 app.post('/api/v5/exams',auth(),role('admin','teacher'),tryWrap((req,res)=>{
  const courseId=id(req.body.course_id),groupId=req.body.group_id?id(req.body.group_id):null,course=db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);
  const title=trim(req.body.title,140),duration=Number(req.body.duration_minutes||30),maximum=Number(req.body.max_attempts||1),mode=trim(req.body.mode,20),policy=trim(req.body.result_policy,20);
  if(!course||!(['admin','super_admin'].includes(req.user.role)||course.teacher_id===req.user.id))return reject(res,'Kursga huquq yo‘q',403);
  if(groupId&&!db.prepare('SELECT 1 FROM study_groups WHERE id=? AND course_id=?').get(groupId,courseId))return reject(res,'Guruh kursga mos emas');
  if(title.length<3||!Number.isInteger(duration)||duration<1||duration>240||!Number.isInteger(maximum)||maximum<1||maximum>30||!['registered','course_group'].includes(mode)||!['immediate','teacher'].includes(policy)||mode==='course_group'&&!groupId)return reject(res,'Test sozlamalari noto‘g‘ri');
  const r=db.prepare('INSERT INTO v5_exams(title,course_id,group_id,owner_id,mode,duration_minutes,max_attempts,result_policy) VALUES(?,?,?,?,?,?,?,?)').run(title,courseId,groupId,req.user.id,mode,duration,maximum,policy);
  res.status(201).json({id:Number(r.lastInsertRowid)});
 }));
 app.post('/api/v5/exams/:id/questions',auth(),role('admin','teacher'),tryWrap((req,res)=>{
  const e=exam(req.params.id);if(!e||!own(req.user,e))return reject(res,'Ruxsat yo‘q',403);
  if(e.status!=='draft')return reject(res,'Savol qo‘shish uchun test qoralama bo‘lishi kerak',409);
  const type=trim(req.body.type,20),prompt=trim(req.body.prompt,2000),points=Number(req.body.points||1);
  let options=req.body.options,answer=req.body.answer;
  if(!['single','multiple','true_false','short','essay'].includes(type)||prompt.length<3||!Number.isInteger(points)||points<1||points>100)return reject(res,'Savol ma’lumoti noto‘g‘ri');
  if(type==='single'||type==='multiple'){
    if(!Array.isArray(options)||options.length<2||options.length>8||options.some(x=>typeof x!=='string'||!x.trim()||x.length>250))return reject(res,'2–8 ta variant kiriting');
    if(type==='single'&&(!Number.isInteger(answer)||answer<0||answer>=options.length))return reject(res,'To‘g‘ri variant indeksini kiriting');
    if(type==='multiple'&&(!Array.isArray(answer)||!answer.length||answer.some(x=>!Number.isInteger(x)||x<0||x>=options.length)||new Set(answer).size!==answer.length))return reject(res,'To‘g‘ri variantlar indeksini kiriting');
  }else if(type==='true_false'){
    options=['To‘g‘ri','Noto‘g‘ri'];if(typeof answer!=='boolean')return reject(res,'Javob true yoki false bo‘lishi kerak');
  }else if(type==='short'){
    options=[];if(typeof answer!=='string'||answer.trim().length<1||answer.length>180)return reject(res,'Qisqa javobni kiriting');
  }else{options=[];answer=null;}
  const r=db.prepare('INSERT INTO v5_exam_questions(exam_id,type,prompt,options_json,answer_json,points,sort_order) VALUES(?,?,?,?,?,?,?)').run(e.id,type,prompt,JSON.stringify(options),JSON.stringify(answer),points,Number(req.body.sort_order)||0);
  res.status(201).json({id:Number(r.lastInsertRowid)});
 }));
 app.patch('/api/v5/exams/:id/publish',auth(),role('admin','teacher'),tryWrap((req,res)=>{
  const e=exam(req.params.id);if(!e||!own(req.user,e))return reject(res,'Ruxsat yo‘q',403);
  if(!questions(e.id).length)return reject(res,'Avval kamida bitta savol qo‘shing');
  db.prepare("UPDATE v5_exams SET status='published' WHERE id=?").run(e.id);res.json({ok:true});
 }));
 const fullAttempt=x=>db.prepare('SELECT a.*,e.course_id,e.group_id,e.mode,e.result_policy,e.status exam_status FROM v5_exam_attempts a JOIN v5_exams e ON e.id=a.exam_id WHERE a.id=?').get(id(x));
 const answerValue=v=>JSON.stringify(v??null).slice(0,3000);
 const scoreAnswer=(q,v)=>{
  const key=JSON.parse(q.answer_json);
  if(q.type==='essay')return null;
  if(q.type==='single')return Number(v)===key?q.points:0;
  if(q.type==='true_false')return v===key?q.points:0;
  if(q.type==='multiple')return Array.isArray(v)&&JSON.stringify([...v].sort((a,b)=>a-b))===JSON.stringify([...key].sort((a,b)=>a-b))?q.points:0;
  if(q.type==='short')return typeof v==='string'&&v.trim().toLocaleLowerCase('uz')===key.trim().toLocaleLowerCase('uz')?q.points:0;
  return 0;
 };
 const finalize=db.transaction(a=>{
  const qs=questions(a.exam_id),answers=db.prepare('SELECT question_id,value_json FROM v5_exam_answers WHERE attempt_id=?').all(a.id),map=new Map(answers.map(x=>[x.question_id,JSON.parse(x.value_json)]));
  let earned=0,pending=false,total=0;
  for(const q of qs){total+=q.points;const v=map.get(q.id);if(v===undefined)continue;const score=scoreAnswer(q,v);if(score===null)pending=true;else earned+=score;
   db.prepare('UPDATE v5_exam_answers SET score=? WHERE attempt_id=? AND question_id=?').run(score,a.id,q.id);
  }
  db.prepare('UPDATE v5_exam_attempts SET status=?,submitted_at=CURRENT_TIMESTAMP,total_points=?,earned_points=?,released=? WHERE id=?').run(pending?'pending':'graded',total,earned,!pending&&db.prepare('SELECT result_policy FROM v5_exams WHERE id=?').get(a.exam_id).result_policy==='immediate'?1:0,a.id);
 });
 app.post('/api/v5/exams/:id/start',auth(),role('student'),tryWrap((req,res)=>{
  const e=exam(req.params.id);if(!e||!access(req.user,e))return reject(res,'Test yopiq yoki sizga ruxsat berilmagan',403);
  const earlier=db.prepare("SELECT * FROM v5_exam_attempts WHERE exam_id=? AND student_id=? ORDER BY id DESC").all(e.id,req.user.id);
  const active=earlier.find(x=>x.status==='active'&&Date.parse(x.deadline_at)>Date.now());if(active)return res.json({id:active.id,resumed:true});
  // Expired unfinished attempts count towards attempt limit, and are finalized before a restart.
  for(const a of earlier.filter(x=>x.status==='active'))finalize(a);
  if(earlier.length>=e.max_attempts)return reject(res,'Urinishlar soni tugagan',403);
  const start=new Date(),deadline=new Date(Math.min(Date.now()+e.duration_minutes*60000,e.closes_at?Date.parse(e.closes_at):Infinity));
  const r=db.prepare('INSERT INTO v5_exam_attempts(exam_id,student_id,started_at,deadline_at) VALUES(?,?,?,?)').run(e.id,req.user.id,start.toISOString(),deadline.toISOString());
  res.status(201).json({id:Number(r.lastInsertRowid),deadline_at:deadline.toISOString()});
 }));
 app.get('/api/v5/attempts/:id',auth(),tryWrap((req,res)=>{
  const a=fullAttempt(req.params.id);if(!a)return reject(res,'Urinish topilmadi',404);
  if(req.user.id!==a.student_id&&!(['admin','super_admin'].includes(req.user.role)||req.user.role==='teacher'&&db.prepare('SELECT 1 FROM courses WHERE id=? AND teacher_id=?').get(a.course_id,req.user.id)))return reject(res,'Ruxsat yo‘q',403);
  const rows=questions(a.exam_id).map(q=>({id:q.id,type:q.type,prompt:q.prompt,options:JSON.parse(q.options_json),points:q.points}));
  const saved=db.prepare('SELECT question_id,value_json,score,feedback FROM v5_exam_answers WHERE attempt_id=?').all(a.id).map(r=>({...r,value:JSON.parse(r.value_json)}));
  const view={id:a.id,status:a.status,deadline_at:a.deadline_at,submitted_at:a.submitted_at,questions:rows,answers:saved,released:!!a.released};
  if(a.released||['admin','super_admin'].includes(req.user.role)||req.user.role==='teacher'&&req.user.id!==a.student_id){view.earned_points=a.earned_points;view.total_points=a.total_points;}
  res.json(view);
 }));
 app.put('/api/v5/attempts/:id/answers/:qid',auth(),role('student'),tryWrap((req,res)=>{
  const a=fullAttempt(req.params.id),qid=id(req.params.qid),q=db.prepare('SELECT * FROM v5_exam_questions WHERE id=?').get(qid);
  if(!a||a.student_id!==req.user.id||a.status!=='active'||Date.parse(a.deadline_at)<=Date.now())return reject(res,'Test vaqti tugagan yoki urinish yopilgan',403);
  if(!q||q.exam_id!==a.exam_id)return reject(res,'Savol mos kelmadi',403);
  const v=req.body.value;
  if(q.type==='single'&&(!Number.isInteger(v)||v<0||v>=JSON.parse(q.options_json).length))return reject(res,'Variantni tanlang');
  if(q.type==='multiple'&&(!Array.isArray(v)||v.some(x=>!Number.isInteger(x)||x<0||x>=JSON.parse(q.options_json).length)||new Set(v).size!==v.length))return reject(res,'Variantlar noto‘g‘ri');
  if(q.type==='true_false'&&typeof v!=='boolean')return reject(res,'True/false tanlang');
  if(['short','essay'].includes(q.type)&&(typeof v!=='string'||v.length>2500))return reject(res,'Matn noto‘g‘ri');
  db.prepare('INSERT INTO v5_exam_answers(attempt_id,question_id,value_json) VALUES(?,?,?) ON CONFLICT(attempt_id,question_id) DO UPDATE SET value_json=excluded.value_json,score=NULL,feedback=\'\'').run(a.id,q.id,answerValue(v));res.json({ok:true});
 }));
 app.post('/api/v5/attempts/:id/submit',auth(),role('student'),tryWrap((req,res)=>{
  const a=fullAttempt(req.params.id);if(!a||a.student_id!==req.user.id)return reject(res,'Ruxsat yo‘q',403);
  if(a.status==='active')finalize(a);
  const done=fullAttempt(a.id);res.json({ok:true,status:done.status,released:!!done.released,...(done.released?{earned_points:done.earned_points,total_points:done.total_points}:{})});
 }));
 app.get('/api/v5/exams/:id/attempts',auth(),role('admin','teacher'),tryWrap((req,res)=>{
  const e=exam(req.params.id);if(!e||!own(req.user,e))return reject(res,'Ruxsat yo‘q',403);
  res.json(db.prepare('SELECT a.*,u.name student_name FROM v5_exam_attempts a JOIN users u ON u.id=a.student_id WHERE exam_id=? ORDER BY a.id DESC LIMIT 250').all(e.id));
 }));
 app.patch('/api/v5/attempts/:id/grade',auth(),role('admin','teacher'),tryWrap((req,res)=>{
  const a=fullAttempt(req.params.id);if(!a||!own(req.user,{course_id:a.course_id}))return reject(res,'Ruxsat yo‘q',403);
  if(a.status==='active')return reject(res,'Test yakunlanmagan');
  const q=db.prepare('SELECT * FROM v5_exam_questions WHERE id=? AND exam_id=?').get(id(req.body.question_id),a.exam_id),points=Number(req.body.score);
  if(!q||q.type!=='essay'||!Number.isInteger(points)||points<0||points>q.points)return reject(res,'Baho noto‘g‘ri');
  const ans=db.prepare('SELECT 1 FROM v5_exam_answers WHERE attempt_id=? AND question_id=?').get(a.id,q.id);if(!ans)return reject(res,'Javob topilmadi',404);
  db.transaction(()=>{
   db.prepare('UPDATE v5_exam_answers SET score=?,feedback=? WHERE attempt_id=? AND question_id=?').run(points,trim(req.body.feedback,1000),a.id,q.id);
   const stats=db.prepare('SELECT COUNT(*) n,COALESCE(SUM(score),0) score FROM v5_exam_answers WHERE attempt_id=? AND score IS NULL').get(a.id);
   const total=db.prepare('SELECT COALESCE(SUM(points),0) n FROM v5_exam_questions WHERE exam_id=?').get(a.exam_id).n;
   const earned=db.prepare('SELECT COALESCE(SUM(score),0) n FROM v5_exam_answers WHERE attempt_id=?').get(a.id).n;
   db.prepare('UPDATE v5_exam_attempts SET status=?,total_points=?,earned_points=? WHERE id=?').run(stats.n?'pending':'graded',total,earned,a.id);
  })();res.json({ok:true});
 }));
 app.post('/api/v5/attempts/:id/release',auth(),role('admin','teacher'),tryWrap((req,res)=>{
  const a=fullAttempt(req.params.id);if(!a||!own(req.user,{course_id:a.course_id}))return reject(res,'Ruxsat yo‘q',403);
  if(a.status!=='graded')return reject(res,'Avval barcha esse javoblarini baholang');
  db.prepare('UPDATE v5_exam_attempts SET released=1 WHERE id=?').run(a.id);res.json({ok:true});
 }));
};
