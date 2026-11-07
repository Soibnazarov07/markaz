'use strict';
const crypto=require('crypto');
/** Anonymous and registered public multiple-choice tests (separate from course exams). */
module.exports=function({app,db,auth,role,io}){
  db.exec(`
    CREATE TABLE IF NOT EXISTS public_quizzes(
      id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Umumiy', level TEXT NOT NULL DEFAULT 'Boshlang‘ich',
      duration_sec INTEGER NOT NULL DEFAULT 600, status TEXT NOT NULL DEFAULT 'draft',
      guest_allowed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(status IN ('draft','published','archived')));
    CREATE TABLE IF NOT EXISTS public_quiz_questions(
      id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL REFERENCES public_quizzes(id) ON DELETE CASCADE,
      question TEXT NOT NULL, options_json TEXT NOT NULL, correct_index INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS public_quiz_attempts(
      id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL REFERENCES public_quizzes(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      started_at_ms INTEGER NOT NULL, deadline_ms INTEGER NOT NULL, finished_at_ms INTEGER,
      score INTEGER, total INTEGER, answers_json TEXT, state TEXT NOT NULL DEFAULT 'in_progress',
      CHECK(state IN ('in_progress','graded','expired')));
    CREATE INDEX IF NOT EXISTS idx_public_quiz_attempts_quiz ON public_quiz_attempts(quiz_id,id);
  `);
  const fail=(res,message,code=400)=>res.status(code).json({error:message});
  const run=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
  const admin=[auth(),role('admin')];
  const pk=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;};
  const trim=(s,n=140)=>String(s??'').trim().slice(0,n);
  const hash=t=>crypto.createHash('sha256').update(String(t||'')).digest('hex');
  const attempts=new Map();function rate(k,max=12){const now=Date.now();const a=(attempts.get(k)||[]).filter(t=>now-t<60000);a.push(now);attempts.set(k,a);return a.length>max;}
  setInterval(()=>attempts.clear(),600000).unref();
  const listSql=`SELECT q.id,q.title,q.description,q.category,q.level,q.duration_sec,q.status,q.guest_allowed,
    (SELECT COUNT(*) FROM public_quiz_questions WHERE quiz_id=q.id) AS questions_count,
    (SELECT COUNT(*) FROM public_quiz_attempts WHERE quiz_id=q.id AND state='graded') AS attempts_count
    FROM public_quizzes q`;
  app.get('/api/public/quizzes',(_req,res)=>res.json(db.prepare(listSql+" WHERE status='published' ORDER BY id DESC LIMIT 100").all()));
  app.get('/api/admin/quizzes',...admin,(_req,res)=>res.json(db.prepare(listSql+' ORDER BY id DESC LIMIT 200').all()));
  app.get('/api/admin/quizzes/:id',...admin,(req,res)=>{
    const id=pk(req.params.id);const quiz=db.prepare('SELECT * FROM public_quizzes WHERE id=?').get(id);
    if(!quiz)return fail(res,'Test topilmadi',404);
    quiz.questions=db.prepare('SELECT question,options_json,correct_index,position FROM public_quiz_questions WHERE quiz_id=? ORDER BY position').all(id).map(x=>({text:x.question,options:JSON.parse(x.options_json),answer:x.correct_index}));
    res.json(quiz);
  });
  function validate(b){
    const o={title:trim(b.title,160),description:trim(b.description,500),category:trim(b.category,80)||'Umumiy',level:trim(b.level,80)||'Boshlang‘ich',duration_sec:Number(b.duration_sec),status:trim(b.status,20)||'draft',guest_allowed:b.guest_allowed===true?1:0};
    const q=b.questions;
    if(o.title.length<3||!Number.isSafeInteger(o.duration_sec)||o.duration_sec<30||o.duration_sec>14400||!['draft','published','archived'].includes(o.status))throw Error('Test nomi, status yoki davomiylik noto‘g‘ri');
    if(!Array.isArray(q)||q.length<1||q.length>60)throw Error('Testda 1–60 ta savol bo‘lishi kerak');
    o.questions=q.map(x=>{const text=trim(x.text,900),opts=x.options,answer=Number(x.answer);if(text.length<3||!Array.isArray(opts)||opts.length!==4||opts.some(v=>typeof v!=='string'||!trim(v,300))||!Number.isInteger(answer)||answer<0||answer>3)throw Error('Savol, javob variantlari yoki to‘g‘ri javob xato');return {text,options:opts.map(v=>trim(v,300)),answer};});
    return o;
  }
  const saveQ=db.prepare('INSERT INTO public_quiz_questions(quiz_id,question,options_json,correct_index,position) VALUES(?,?,?,?,?)');
  function saveQuiz(b,id){const data=validate(b);const {questions,...row}=data;return db.transaction(()=>{
    if(id){const r=db.prepare('UPDATE public_quizzes SET title=@title,description=@description,category=@category,level=@level,duration_sec=@duration_sec,status=@status,guest_allowed=@guest_allowed WHERE id=@id').run({...row,id});if(!r.changes)return null;db.prepare('DELETE FROM public_quiz_questions WHERE quiz_id=?').run(id);}
    else id=Number(db.prepare('INSERT INTO public_quizzes(title,description,category,level,duration_sec,status,guest_allowed) VALUES(@title,@description,@category,@level,@duration_sec,@status,@guest_allowed)').run(row).lastInsertRowid);
    data.questions.forEach((q,i)=>saveQ.run(id,q.text,JSON.stringify(q.options),q.answer,i));return id;
  })();}
  app.post('/api/admin/quizzes',...admin,run((req,res)=>{let id;try{id=saveQuiz(req.body||{});}catch(e){return fail(res,e.message);}io.emit('quizzes:changed');res.status(201).json({id});}));
  app.put('/api/admin/quizzes/:id',...admin,run((req,res)=>{if(!pk(req.params.id))return fail(res,'Test ID noto‘g‘ri');let id;try{id=saveQuiz(req.body||{},pk(req.params.id));}catch(e){return fail(res,e.message);}if(!id)return fail(res,'Test topilmadi',404);io.emit('quizzes:changed');res.json({id});}));
  app.delete('/api/admin/quizzes/:id',...admin,(req,res)=>{const r=db.prepare('DELETE FROM public_quizzes WHERE id=?').run(pk(req.params.id));if(!r.changes)return fail(res,'Test topilmadi',404);io.emit('quizzes:changed');res.json({ok:true});});
  // Auth is optional; guests can start only public quizzes explicitly enabled for guests.
  app.post('/api/public/quizzes/:id/start',auth(false),run((req,res)=>{
    if(rate('start:'+req.ip,8))return fail(res,'Juda ko‘p urinish, keyinroq urinib ko‘ring',429);
    const quiz=db.prepare("SELECT * FROM public_quizzes WHERE id=? AND status='published'").get(pk(req.params.id));
    if(!quiz)return fail(res,'Test topilmadi',404);if(!quiz.guest_allowed&&!req.user)return fail(res,'Avval ro‘yxatdan o‘ting',401);
    const questions=db.prepare('SELECT id,question,options_json FROM public_quiz_questions WHERE quiz_id=? ORDER BY position').all(quiz.id).map(q=>({id:q.id,text:q.question,options:JSON.parse(q.options_json)}));
    if(!questions.length)return fail(res,'Testda savollar mavjud emas');
    const token=crypto.randomBytes(32).toString('base64url');const started=Date.now(),deadline=started+quiz.duration_sec*1000;
    const id=db.prepare('INSERT INTO public_quiz_attempts(quiz_id,token_hash,user_id,started_at_ms,deadline_ms) VALUES(?,?,?,?,?)').run(quiz.id,hash(token),req.user?.id||null,started,deadline).lastInsertRowid;
    res.status(201).json({attemptId:Number(id),token,deadline,quiz:{id:quiz.id,title:quiz.title,description:quiz.description},questions});
  }));
  app.post('/api/public/quizzes/:id/submit',auth(false),run((req,res)=>{
    if(rate('submit:'+req.ip,35))return fail(res,'Juda ko‘p so‘rov',429);
    const att=db.prepare('SELECT * FROM public_quiz_attempts WHERE quiz_id=? AND token_hash=?').get(pk(req.params.id),hash(req.body?.token));
    if(!att)return fail(res,'Urinish topilmadi',404);
    if(att.user_id&&att.user_id!==req.user?.id)return fail(res,'Bu urinish sizga tegishli emas',403);
    if(att.state!=='in_progress')return res.json({score:att.score||0,total:att.total||0,state:att.state,alreadySubmitted:true});
    const now=Date.now(),q=db.prepare('SELECT correct_index FROM public_quiz_questions WHERE quiz_id=? ORDER BY position').all(att.quiz_id);
    if(!Array.isArray(req.body?.answers)||req.body.answers.length!==q.length||req.body.answers.some(x=>x!==null&&(!Number.isInteger(x)||x<0||x>3)))return fail(res,'Javoblar formati noto‘g‘ri');
    const expired=now>att.deadline_ms+3000;
    const score=expired?0:q.reduce((sum,x,i)=>sum+(x.correct_index===req.body.answers[i]?1:0),0);
    const state=expired?'expired':'graded';
    const result=db.prepare("UPDATE public_quiz_attempts SET finished_at_ms=?,score=?,total=?,answers_json=?,state=? WHERE id=? AND state='in_progress'").run(now,score,q.length,JSON.stringify(req.body.answers),state,att.id);
    if(!result.changes){const latest=db.prepare('SELECT score,total,state FROM public_quiz_attempts WHERE id=?').get(att.id);return res.json({...latest,alreadySubmitted:true});}
    res.json({score,total:q.length,state,alreadySubmitted:false});
  }));
  app.get('/api/admin/quizzes/:id/attempts',...admin,(req,res)=>res.json(db.prepare('SELECT a.id,a.user_id,u.name,a.score,a.total,a.state,a.started_at_ms,a.finished_at_ms FROM public_quiz_attempts a LEFT JOIN users u ON u.id=a.user_id WHERE a.quiz_id=? ORDER BY a.id DESC LIMIT 300').all(pk(req.params.id))));
};
