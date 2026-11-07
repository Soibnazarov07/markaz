'use strict';
/** EduSphere v6: additive management, strict per-resource checks, no payment-provider dependency. */
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const express=require('express');
module.exports=function v6({app,db,io,auth,role,DATA_DIR}){
  db.exec(`
  CREATE TABLE IF NOT EXISTS v6_staff_branches(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,branch_id INTEGER NOT NULL REFERENCES cms_branches(id) ON DELETE CASCADE,PRIMARY KEY(user_id,branch_id));
  CREATE TABLE IF NOT EXISTS v6_file_uploads(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('homework','chat','material')),related_id INTEGER NOT NULL,filename TEXT NOT NULL,mime TEXT NOT NULL,storage_key TEXT NOT NULL UNIQUE,size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),sha256 TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS idx_v6_files_related ON v6_file_uploads(kind,related_id);
  CREATE TABLE IF NOT EXISTS v6_message_reads(message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,reader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,read_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(message_id,reader_id));
  CREATE TABLE IF NOT EXISTS v6_homework_attachments(assignment_id INTEGER NOT NULL REFERENCES ops_assignments(id) ON DELETE CASCADE, file_id INTEGER NOT NULL UNIQUE REFERENCES v6_file_uploads(id) ON DELETE CASCADE,PRIMARY KEY(assignment_id,file_id));
  CREATE TABLE IF NOT EXISTS v6_student_achievements(student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,code TEXT NOT NULL,points INTEGER NOT NULL CHECK(points BETWEEN 0 AND 10000),details TEXT NOT NULL DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(student_id,code));
  CREATE TABLE IF NOT EXISTS v6_repeat_jobs(id INTEGER PRIMARY KEY,group_id INTEGER NOT NULL REFERENCES study_groups(id),topic TEXT NOT NULL,weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),start_time TEXT NOT NULL,end_time TEXT NOT NULL,room TEXT DEFAULT '',created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS v6_notification_prefs(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,chat INTEGER NOT NULL DEFAULT 1,academic INTEGER NOT NULL DEFAULT 1,billing INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS v6_group_transfers(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES users(id),from_group INTEGER REFERENCES study_groups(id),to_group INTEGER NOT NULL REFERENCES study_groups(id),actor_id INTEGER NOT NULL REFERENCES users(id),note TEXT NOT NULL DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS v6_activity_log(id INTEGER PRIMARY KEY,actor_id INTEGER REFERENCES users(id),action TEXT NOT NULL,target TEXT NOT NULL,target_id INTEGER,details TEXT NOT NULL DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS idx_v6_activity ON v6_activity_log(created_at);
  `);
  const wrap=f=>(req,res,next)=>Promise.resolve().then(()=>f(req,res)).catch(next);
  const fail=(res,msg,status=400)=>res.status(status).json({error:msg});
  const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
  const str=(x,n=200)=>String(x??'').trim().slice(0,n);
  const admin=u=>['admin','super_admin'].includes(u.role);
  const finance=u=>admin(u)||u.role==='accountant';
  const teacher=u=>admin(u)||u.role==='teacher';
  const branch=(uid,bid)=>!!db.prepare('SELECT 1 FROM v6_staff_branches WHERE user_id=? AND branch_id=?').get(uid,bid);
  const group=(gid)=>db.prepare('SELECT * FROM study_groups WHERE id=?').get(id(gid));
  const canManageGroup=(u,g)=>g&&(admin(u)||(u.role==='teacher'&&g.teacher_id===u.id)||(u.role==='branch_manager'&&g.branch_id&&branch(u.id,g.branch_id)));
  const member=(gid,uid)=>!!db.prepare('SELECT 1 FROM group_students WHERE group_id=? AND student_id=?').get(gid,uid);
  const canReadGroup=(u,g)=>!!g&&(canManageGroup(u,g)||(u.role==='student'&&member(g.id,u.id))||(u.role==='parent'&&!!db.prepare('SELECT 1 FROM ops_parent_links l JOIN group_students s ON s.student_id=l.student_id WHERE l.parent_id=? AND s.group_id=?').get(u.id,g.id)));
  const log=(actor,action,target,targetId,details='')=>db.prepare('INSERT INTO v6_activity_log(actor_id,action,target,target_id,details) VALUES(?,?,?,?,?)').run(actor,action,target,targetId||null,str(details,1000));
  const base='/api/v6';
  app.get(base+'/roles',auth(),(req,res)=>res.json({role:req.user.role,roles:['super_admin','admin','branch_manager','teacher','student','parent','accountant']}));
  app.get(base+'/branches/my',auth(),wrap((req,res)=>{if(admin(req.user))return res.json(db.prepare('SELECT id,name,address FROM cms_branches ORDER BY id').all());res.json(db.prepare('SELECT b.id,b.name,b.address FROM v6_staff_branches m JOIN cms_branches b ON b.id=m.branch_id WHERE m.user_id=?').all(req.user.id));}));
  // Admin can appoint branch managers, super_admin is reserved for a secured CLI bootstrap.
  app.post(base+'/staff/branch',auth(),role('admin','super_admin'),wrap((req,res)=>{
    const uid=id(req.body.user_id),bid=id(req.body.branch_id),u=db.prepare('SELECT id,role FROM users WHERE id=?').get(uid);
    if(!u||!['branch_manager','teacher'].includes(u.role)||!db.prepare('SELECT 1 FROM cms_branches WHERE id=?').get(bid))return fail(res,'Xodim yoki filial noto‘g‘ri');
    db.prepare('INSERT OR IGNORE INTO v6_staff_branches(user_id,branch_id) VALUES(?,?)').run(uid,bid);log(req.user.id,'assign_branch','user',uid,String(bid));res.json({ok:true});
  }));
  app.get(base+'/branches/:bid/overview',auth(),wrap((req,res)=>{
    const bid=id(req.params.bid);if(!admin(req.user)&&!(req.user.role==='branch_manager'&&branch(req.user.id,bid)))return fail(res,'Filialga ruxsat yo‘q',403);
    const b=db.prepare('SELECT id,name,address FROM cms_branches WHERE id=?').get(bid);if(!b)return fail(res,'Filial topilmadi',404);
    const groups=db.prepare('SELECT g.id,g.name,g.capacity,u.name teacher_name,c.title course_title,(SELECT COUNT(*) FROM group_students s WHERE s.group_id=g.id) students FROM study_groups g LEFT JOIN users u ON u.id=g.teacher_id JOIN courses c ON c.id=g.course_id WHERE g.branch_id=? ORDER BY g.id DESC LIMIT 100').all(bid);
    res.json({branch:b,groups,total_students:db.prepare('SELECT COUNT(DISTINCT gs.student_id) n FROM study_groups g JOIN group_students gs ON gs.group_id=g.id WHERE g.branch_id=?').get(bid).n});
  }));
  app.get(base+'/branches/:bid/students',auth(),wrap((req,res)=>{
    const bid=id(req.params.bid);if(!admin(req.user)&&!(req.user.role==='branch_manager'&&branch(req.user.id,bid)))return fail(res,'Ruxsat yo‘q',403);
    res.json(db.prepare(`SELECT DISTINCT u.id,u.name,p.phone FROM study_groups g JOIN group_students gs ON gs.group_id=g.id JOIN users u ON u.id=gs.student_id LEFT JOIN v5_profiles p ON p.user_id=u.id WHERE g.branch_id=? ORDER BY u.name LIMIT 500`).all(bid));
  }));
  app.get(base+'/groups/mine',auth(),wrap((req,res)=>{
    const rows=db.prepare('SELECT g.*,c.title course_title,u.name teacher_name FROM study_groups g JOIN courses c ON c.id=g.course_id LEFT JOIN users u ON u.id=g.teacher_id ORDER BY g.id DESC LIMIT 500').all();
    res.json(rows.filter(g=>canReadGroup(req.user,g)));
  }));
  app.post(base+'/groups/transfer',auth(),wrap((req,res)=>{
    const student=id(req.body.student_id),from=id(req.body.from_group),to=id(req.body.to_group),old=group(from),target=group(to);
    if(!old||!target||!canManageGroup(req.user,old)||!canManageGroup(req.user,target))return fail(res,'Guruhlarni boshqarishga ruxsat yo‘q',403);
    if(!member(from,student))return fail(res,'O‘quvchi avvalgi guruhda yo‘q');
    if(!db.prepare('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?').get(student,target.course_id))return fail(res,'O‘quvchi yangi guruh kursiga yozilmagan',403);
    if(db.prepare('SELECT COUNT(*) n FROM group_students WHERE group_id=?').get(to).n>=target.capacity)return fail(res,'Yangi guruh to‘lgan',409);
    db.transaction(()=>{db.prepare('INSERT OR IGNORE INTO group_students(group_id,student_id) VALUES(?,?)').run(to,student);db.prepare('DELETE FROM group_students WHERE group_id=? AND student_id=?').run(from,student);db.prepare('INSERT INTO v6_group_transfers(student_id,from_group,to_group,actor_id,note) VALUES(?,?,?,?,?)').run(student,from,to,req.user.id,str(req.body.note,300));log(req.user.id,'transfer','student',student,`${from} → ${to}`);})();res.json({ok:true});
  }));
  app.get(base+'/groups/transfers',auth(),wrap((req,res)=>{
    if(!admin(req.user)&&req.user.role!=='branch_manager')return fail(res,'Ruxsat yo‘q',403);
    const rows=db.prepare('SELECT t.*,u.name student_name FROM v6_group_transfers t JOIN users u ON u.id=t.student_id ORDER BY t.id DESC LIMIT 250').all();
    res.json(rows.filter(t=>admin(req.user)||[t.from_group,t.to_group].every(g=>!g||canManageGroup(req.user,group(g)))));
  }));
  app.post(base+'/schedule/repeat',auth(),wrap((req,res)=>{
    const g=group(req.body.group_id);if(!canManageGroup(req.user,g))return fail(res,'Ruxsat yo‘q',403);
    const weekday=Number(req.body.weekday),start=str(req.body.start_time,5),end=str(req.body.end_time,5),topic=str(req.body.topic,150),room=str(req.body.room,70);
    if(!Number.isInteger(weekday)||weekday<0||weekday>6||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end||topic.length<3)return fail(res,'Dars vaqti noto‘g‘ri');
    const conflicts=db.prepare('SELECT j.* FROM v6_repeat_jobs j JOIN study_groups g ON g.id=j.group_id WHERE j.weekday=? AND j.start_time<? AND j.end_time>? AND (g.teacher_id=? OR (j.room<>\'\' AND j.room=?))').all(weekday,end,start,g.teacher_id,room);
    if(conflicts.length)return fail(res,'Takroriy dars o‘qituvchi yoki xona bilan to‘qnashdi',409);
    // Expand the weekly rule into eight real schedule sessions. All-or-nothing on conflicts.
    const teacherId=g.teacher_id;if(!teacherId)return fail(res,'Guruhga o‘qituvchi biriktirilmagan');
    const localNow=new Date(Date.now()+5*3600000),instances=[];
    for(let d=0;d<56;d++){
      const localDate=new Date(Date.UTC(localNow.getUTCFullYear(),localNow.getUTCMonth(),localNow.getUTCDate()+d));
      if(localDate.getUTCDay()!==weekday)continue;
      const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
      const y=localDate.getUTCFullYear(),m=localDate.getUTCMonth(),day=localDate.getUTCDate();
      instances.push({begin:new Date(Date.UTC(y,m,day,sh-5,sm)).toISOString(),finish:new Date(Date.UTC(y,m,day,eh-5,em)).toISOString()});
    }
    for(const t of instances){
      if(db.prepare('SELECT 1 FROM ops_schedule WHERE teacher_id=? AND starts_at<? AND ends_at>? LIMIT 1').get(teacherId,t.finish,t.begin))return fail(res,'O‘qituvchining mavjud darsi bilan to‘qnashdi',409);
      if(room&&db.prepare("SELECT 1 FROM ops_schedule WHERE room=? AND starts_at<? AND ends_at>? LIMIT 1").get(room,t.finish,t.begin))return fail(res,'Xona band',409);
    }
    const newId=db.transaction(()=>{
      const r=db.prepare('INSERT INTO v6_repeat_jobs(group_id,topic,weekday,start_time,end_time,room,created_by) VALUES(?,?,?,?,?,?,?)').run(g.id,topic,weekday,start,end,room,req.user.id);
      const insert=db.prepare('INSERT INTO ops_schedule(group_id,teacher_id,starts_at,ends_at,room,topic) VALUES(?,?,?,?,?,?)');
      for(const t of instances)insert.run(g.id,teacherId,t.begin,t.finish,room,topic);
      log(req.user.id,'create','repeat_schedule',r.lastInsertRowid,instances.length+' sessions');
      return Number(r.lastInsertRowid);
    })();
    res.status(201).json({id:newId,created_sessions:instances.length});
  }));
  app.get(base+'/schedule/repeat',auth(),wrap((req,res)=>{const rows=db.prepare('SELECT j.*,g.name group_name,g.branch_id,g.teacher_id FROM v6_repeat_jobs j JOIN study_groups g ON g.id=j.group_id ORDER BY j.weekday,j.start_time').all();res.json(rows.filter(j=>canReadGroup(req.user,group(j.group_id))));}));
  app.get(base+'/teacher/dashboard',auth(),role('teacher','admin','super_admin'),wrap((req,res)=>{
    let where=req.user.role==='teacher'?'WHERE g.teacher_id=?':'',args=req.user.role==='teacher'?[req.user.id]:[];
    const rows=db.prepare(`SELECT g.id,g.name,g.course_id,(SELECT COUNT(*) FROM group_students WHERE group_id=g.id) student_count,(SELECT COUNT(*) FROM ops_assignments WHERE group_id=g.id) assignments,(SELECT COUNT(*) FROM class_sessions WHERE group_id=g.id) sessions FROM study_groups g ${where} ORDER BY g.id DESC LIMIT 200`).all(...args);
    const upcoming=db.prepare(`SELECT s.id,s.topic,s.starts_at,g.name group_name FROM ops_schedule s JOIN study_groups g ON g.id=s.group_id ${req.user.role==='teacher'?'WHERE s.teacher_id=?':''} ORDER BY s.starts_at DESC LIMIT 30`).all(...args);
    res.json({groups:rows,upcoming,total_students:rows.reduce((a,g)=>a+g.student_count,0)});
  }));
  app.get(base+'/parent/dashboard',auth(),role('parent'),wrap((req,res)=>{
    const children=db.prepare(`SELECT u.id,u.name,(SELECT COUNT(*) FROM attendance_records a WHERE a.student_id=u.id AND a.status='present') present,(SELECT COUNT(*) FROM attendance_records a WHERE a.student_id=u.id) total,(SELECT COALESCE(SUM(i.amount),0) FROM ops_invoices i WHERE i.student_id=u.id AND i.status='open') invoiced,(SELECT COALESCE(SUM(r.amount),0) FROM ops_receipts r JOIN ops_invoices i ON i.id=r.invoice_id WHERE i.student_id=u.id AND i.status='open' AND r.voided_at IS NULL) paid FROM ops_parent_links l JOIN users u ON u.id=l.student_id WHERE l.parent_id=?`).all(req.user.id);
    res.json(children.map(c=>({...c,debt:Math.max(0,c.invoiced-c.paid)})));
  }));
  // Message read receipts: only the recipient may mark a private message; no foreign conversations visible.
  app.post(base+'/chat/:id/read',auth(),wrap((req,res)=>{
    const m=db.prepare('SELECT * FROM messages WHERE id=?').get(id(req.params.id));
    if(!m||m.recipient_id!==req.user.id)return fail(res,'Bu xabarni o‘qish huquqi yo‘q',403);
    db.prepare('INSERT OR IGNORE INTO v6_message_reads(message_id,reader_id) VALUES(?,?)').run(m.id,req.user.id);io.to('user:'+m.sender_id).emit('chat:read',{message_id:m.id,reader_id:req.user.id});res.json({ok:true});
  }));
  app.get(base+'/chat/:id/read',auth(),wrap((req,res)=>{
    const m=db.prepare('SELECT * FROM messages WHERE id=?').get(id(req.params.id));if(!m||![m.sender_id,m.recipient_id].includes(req.user.id))return fail(res,'Ruxsat yo‘q',403);
    const r=db.prepare('SELECT read_at FROM v6_message_reads WHERE message_id=? AND reader_id=?').get(m.id,m.recipient_id);res.json({read:!!r,read_at:r?.read_at||null});
  }));
  app.get(base+'/notifications/preferences',auth(),wrap((req,res)=>res.json(db.prepare('SELECT chat,academic,billing FROM v6_notification_prefs WHERE user_id=?').get(req.user.id)||{chat:1,academic:1,billing:1})));
  app.put(base+'/notifications/preferences',auth(),wrap((req,res)=>{const keys=['chat','academic','billing'];if(keys.some(k=>![0,1].includes(req.body[k])))return fail(res,'Parametrlar noto‘g‘ri');db.prepare('INSERT INTO v6_notification_prefs(user_id,chat,academic,billing) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET chat=excluded.chat,academic=excluded.academic,billing=excluded.billing').run(req.user.id,...keys.map(k=>req.body[k]));res.json({ok:true});}));
  app.get(base+'/achievements',auth(),wrap((req,res)=>{const uid=req.user.role==='student'?req.user.id:id(req.query.student_id);if(req.user.role!=='student'&&!admin(req.user))return fail(res,'Ruxsat yo‘q',403);res.json(db.prepare('SELECT code,points,details,created_at FROM v6_student_achievements WHERE student_id=? ORDER BY created_at DESC').all(uid));}));
  app.post(base+'/achievements',auth(),role('admin','super_admin','teacher'),wrap((req,res)=>{
    const uid=id(req.body.student_id),code=str(req.body.code,60),points=Number(req.body.points),desc=str(req.body.details,300);
    if(!db.prepare("SELECT 1 FROM users WHERE id=? AND role='student'").get(uid)||!/^[-a-zA-Z0-9_]{3,60}$/.test(code)||!Number.isInteger(points)||points<0||points>1000)return fail(res,'Yutuq ma’lumotlari noto‘g‘ri');
    if(req.user.role==='teacher'&&!db.prepare('SELECT 1 FROM group_students gs JOIN study_groups g ON g.id=gs.group_id WHERE gs.student_id=? AND g.teacher_id=?').get(uid,req.user.id))return fail(res,'O‘quvchi sizning guruhingizda emas',403);
    db.prepare('INSERT INTO v6_student_achievements(student_id,code,points,details) VALUES(?,?,?,?) ON CONFLICT(student_id,code) DO NOTHING').run(uid,code,points,desc);log(req.user.id,'award','student',uid,code);res.json({ok:true});
  }));
  app.get(base+'/leaderboard',auth(),wrap((req,res)=>res.json(db.prepare(`SELECT substr(u.name,1,1)||'.' || u.id AS nickname,COALESCE(SUM(a.points),0) points FROM users u JOIN v6_student_achievements a ON a.student_id=u.id GROUP BY u.id ORDER BY points DESC LIMIT 30`).all())));
  // Files: binary stream, strict size+magic+authorization, never served as public static files.
  const uploadDir=path.join(DATA_DIR,'private_uploads');fs.mkdirSync(uploadDir,{recursive:true});
  const types={pdf:{mime:'application/pdf',valid:b=>b.subarray(0,5).toString()==='%PDF-'},png:{mime:'image/png',valid:b=>b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))},jpg:{mime:'image/jpeg',valid:b=>b.length>3&&b[0]===255&&b[1]===216&&b[2]===255},webp:{mime:'image/webp',valid:b=>b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'}};
  const fileAccess=(user,kind,relation,writing=false)=>{
    if(kind==='homework'){
      const a=db.prepare('SELECT group_id,teacher_id FROM ops_assignments WHERE id=?').get(relation);if(!a)return false;
      return admin(user)||a.teacher_id===user.id||(user.role==='student'&&member(a.group_id,user.id));
    }
    if(kind==='material'){
      const g=group(relation);return writing?canManageGroup(user,g):canReadGroup(user,g);
    }
    if(kind==='chat'){
      const m=db.prepare('SELECT sender_id,recipient_id,course_id FROM messages WHERE id=?').get(relation);if(!m)return false;
      if(writing&&m.sender_id!==user.id)return false;
      if(m.course_id){const c=db.prepare('SELECT teacher_id FROM courses WHERE id=?').get(m.course_id);return admin(user)||c?.teacher_id===user.id||!!db.prepare('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?').get(user.id,m.course_id);}
      return [m.sender_id,m.recipient_id].includes(user.id);
    }
    return false;
  };
  app.post(base+'/files/:kind/:relation',auth(),express.raw({type:'application/octet-stream',limit:'5mb'}),wrap((req,res)=>{
    const kind=req.params.kind,related=id(req.params.relation),b=req.body;
    if(!['homework','chat','material'].includes(kind)||!fileAccess(req.user,kind,related,true))return fail(res,'Fayl biriktirishga ruxsat yo‘q',403);
    const ext=str(req.headers['x-file-ext'],6).toLowerCase(),t=types[ext];if(!t||!Buffer.isBuffer(b)||b.length<16||b.length>5*1024*1024||!t.valid(b))return fail(res,'Faqat 5MB gacha PDF, PNG, JPG va WEBP mumkin');
    const name=str(req.headers['x-file-name'],120).replace(/[\/\\<>\x00-\x1f]/g,'_')||('hujjat.'+ext),key=crypto.randomBytes(24).toString('hex')+'.'+ext,sha=crypto.createHash('sha256').update(b).digest('hex');
    fs.writeFileSync(path.join(uploadDir,key),b,{flag:'wx',mode:0o600});
    try{const r=db.prepare('INSERT INTO v6_file_uploads(owner_id,kind,related_id,filename,mime,storage_key,size_bytes,sha256) VALUES(?,?,?,?,?,?,?,?)').run(req.user.id,kind,related,name,t.mime,key,b.length,sha);if(kind==='homework')db.prepare('INSERT INTO v6_homework_attachments(assignment_id,file_id) VALUES(?,?)').run(related,r.lastInsertRowid);log(req.user.id,'upload','file',r.lastInsertRowid);res.status(201).json({id:Number(r.lastInsertRowid),filename:name,size:b.length});}
    catch(e){fs.rmSync(path.join(uploadDir,key),{force:true});throw e;}
  }));
  app.get(base+'/files/:kind/:relation',auth(),wrap((req,res)=>{const relation=id(req.params.relation),kind=req.params.kind;if(!fileAccess(req.user,kind,relation))return fail(res,'Ruxsat yo‘q',403);res.json(db.prepare('SELECT id,filename,mime,size_bytes,created_at FROM v6_file_uploads WHERE kind=? AND related_id=? ORDER BY id DESC LIMIT 100').all(kind,relation));}));
  app.get(base+'/files/:id/download',auth(),wrap((req,res)=>{const f=db.prepare('SELECT * FROM v6_file_uploads WHERE id=?').get(id(req.params.id));if(!f||!fileAccess(req.user,f.kind,f.related_id))return fail(res,'Faylga ruxsat yo‘q',403);const fp=path.join(uploadDir,f.storage_key);if(!fs.existsSync(fp))return fail(res,'Fayl diskda topilmadi',404);res.set('Content-Type',f.mime);res.set('Content-Disposition',`attachment; filename="attachment.${path.extname(f.storage_key).slice(1)}"`);res.set('X-Content-Type-Options','nosniff');res.sendFile(fp); }));
  app.get(base+'/security/audit',auth(),role('admin','super_admin'),wrap((req,res)=>res.json(db.prepare('SELECT a.*,u.name actor_name FROM v6_activity_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 500').all())));
  // Printable, server-rendered documents. Browser printing can save them as PDF.
  const htmlEsc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const documentHtml=(title,body)=>`<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEsc(title)}</title><style>body{font:16px system-ui,sans-serif;max-width:850px;margin:35px auto;color:#1e293b;padding:18px}h1{font-size:36px}header{border-bottom:4px solid #f04b1d;padding-bottom:16px}article{padding:35px 5px}small{color:#64748b}footer{border-top:1px solid #ddd;padding-top:20px}button{background:#f04b1d;border:0;color:white;border-radius:6px;padding:12px 19px;cursor:pointer}@media print{button{display:none}body{margin:0}}</style></head><body><header><h1>${htmlEsc(title)}</h1></header>${body}<footer><small>EduSphere Pro · Elektron tekshirish sahifasi</small></footer><button onclick="window.print()">Chop etish / PDF sifatida saqlash</button></body></html>`;
  app.get('/certificate/:code',wrap((req,res)=>{
    const code=str(req.params.code,55);
    const c=db.prepare('SELECT cert.public_id,cert.issued_at,u.name student_name,co.title course_title FROM ops_certificates cert JOIN users u ON u.id=cert.student_id JOIN courses co ON co.id=cert.course_id WHERE cert.public_id=?').get(code);
    if(!c)return fail(res,'Sertifikat topilmadi',404);
    res.type('html').send(documentHtml('Sertifikat',`<article style="text-align:center;border:2px solid #f04b1d;border-radius:12px"><p>Ushbu sertifikat taqdim etiladi:</p><h2>${htmlEsc(c.student_name)}</h2><p><b>${htmlEsc(c.course_title)}</b> kursida qatnashganligi uchun</p><p>Sertifikat № ${htmlEsc(c.public_id)}</p><small>Berilgan sana: ${htmlEsc(c.issued_at)}</small></article>`));
  }));
  app.get('/api/v6/invoices/:id/print',auth(),wrap((req,res)=>{
    const invoice=db.prepare('SELECT i.*,u.name student_name FROM ops_invoices i JOIN users u ON u.id=i.student_id WHERE i.id=?').get(id(req.params.id));
    if(!invoice)return fail(res,'Hisob topilmadi',404);
    const canSee=finance(req.user)||req.user.id===invoice.student_id||(req.user.role==='parent'&&!!db.prepare('SELECT 1 FROM ops_parent_links WHERE parent_id=? AND student_id=?').get(req.user.id,invoice.student_id));
    if(!canSee)return fail(res,'Hisobga ruxsat yo‘q',403);
    const paid=db.prepare('SELECT COALESCE(SUM(amount),0) n FROM ops_receipts WHERE invoice_id=? AND voided_at IS NULL').get(invoice.id).n;
    const rows=db.prepare('SELECT amount,paid_on,method,reference FROM ops_receipts WHERE invoice_id=? AND voided_at IS NULL ORDER BY id').all(invoice.id);
    res.type('html').send(documentHtml('Hisob-faktura №'+invoice.id,`<article><p><b>O‘quvchi:</b> ${htmlEsc(invoice.student_name)}</p><p><b>Xizmat:</b> ${htmlEsc(invoice.description)}</p><p><b>To‘lov muddati:</b> ${htmlEsc(invoice.due_on)}</p><h2>Hisob: ${invoice.amount.toLocaleString('uz-UZ')} so‘m</h2><p>To‘langan: ${paid.toLocaleString('uz-UZ')} so‘m</p><p>Qoldiq: ${Math.max(0,invoice.amount-paid).toLocaleString('uz-UZ')} so‘m</p><h3>To‘lovlar</h3><ul>${rows.map(r=>`<li>${htmlEsc(r.paid_on)} — ${r.amount.toLocaleString('uz-UZ')} so‘m (${htmlEsc(r.method)}) ${htmlEsc(r.reference)}</li>`).join('')}</ul></article>`));
  }));
  // Real server-rendered article URLs for indexers; draft articles stay private.
  app.get('/articles/:slug',wrap((req,res)=>{
    const slug=str(req.params.slug,140);
    const a=db.prepare("SELECT title,excerpt,body,category,slug,published_at FROM cms_articles WHERE slug=? AND status='published' AND (published_at IS NULL OR published_at<=?)").get(slug,new Date().toISOString());
    if(!a)return fail(res,'Maqola topilmadi',404);
    const title=htmlEsc(a.title),description=htmlEsc(a.excerpt).slice(0,160),canonical=(process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`).replace(/\/$/,'')+'/articles/'+encodeURIComponent(a.slug);
    res.type('html').send(`<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | EduSphere</title><meta name="description" content="${description}"><link rel="canonical" href="${htmlEsc(canonical)}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"></head><body style="font:18px system-ui;max-width:800px;margin:45px auto;padding:20px;line-height:1.75"><nav><a href="/">EduSphere</a> / ${htmlEsc(a.category)}</nav><article><h1>${title}</h1><p><em>${description}</em></p><div style="white-space:pre-wrap">${htmlEsc(a.body)}</div></article><p><a href="/#/articles">Boshqa maqolalar →</a></p></body></html>`);
  }));
  app.get('/robots.txt',(_req,res)=>res.type('text/plain').send('User-agent: *\nDisallow: /api/\nDisallow: /#/admin\n'));
  app.get('/sitemap.xml',(req,res)=>{const host=(process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`).replace(/\/$/,'');const urls=['/'];const rows=db.prepare("SELECT slug FROM cms_articles WHERE status='published' AND (published_at IS NULL OR published_at<=?) ORDER BY id DESC LIMIT 1000").all(new Date().toISOString());rows.forEach(x=>urls.push('/articles/'+encodeURIComponent(x.slug)));const xml='<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>`<url><loc>${host.replace(/[&<>"]/g,'')}${url}</loc></url>`).join('')+'</urlset>';res.type('application/xml').send(xml);});
};
