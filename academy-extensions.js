'use strict';
/** Privacy-scoped student records, attendance join codes, announcements and monthly reports. */
const crypto=require('node:crypto');
module.exports=function installAcademyExtensions({app,db,auth,role,io}){
 db.exec(`
 CREATE TABLE IF NOT EXISTS v5_profiles(
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 phone TEXT NOT NULL DEFAULT '',birth_date TEXT NOT NULL DEFAULT '',specialization TEXT NOT NULL DEFAULT '',
 guardian_phone TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active'
 CHECK(status IN ('active','pending','frozen','graduated','inactive')),
 public_bio TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TABLE IF NOT EXISTS v5_attendance_codes(
 session_id INTEGER PRIMARY KEY REFERENCES class_sessions(id) ON DELETE CASCADE,
 code_hash TEXT NOT NULL, expires_at TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TABLE IF NOT EXISTS v5_attendance_log(
 id INTEGER PRIMARY KEY AUTOINCREMENT,session_id INTEGER NOT NULL,
 student_id INTEGER NOT NULL,old_status TEXT,new_status TEXT NOT NULL,actor_id INTEGER NOT NULL,
 source TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TABLE IF NOT EXISTS v5_announcements(
 id INTEGER PRIMARY KEY AUTOINCREMENT,group_id INTEGER REFERENCES study_groups(id) ON DELETE CASCADE,
 title TEXT NOT NULL,message TEXT NOT NULL,author_id INTEGER NOT NULL REFERENCES users(id),
 published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE INDEX IF NOT EXISTS idx_v5_announcements_group ON v5_announcements(group_id,published_at);
 `);
 const err=(res,text,status=400)=>res.status(status).json({error:text});
 const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
 const txt=(s,n=400)=>String(s??'').trim().slice(0,n);
 const staff=u=>['admin','teacher'].includes(u.role);
 const isParentOf=(uid,sid)=>!!db.prepare('SELECT 1 FROM ops_parent_links WHERE parent_id=? AND student_id=?').get(uid,sid);
 const managesGroup=(uid,roleName,g)=>roleName==='admin'||roleName==='teacher'&&g.teacher_id===uid;
 const validDate=s=>!s||/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const safe=(fn)=>(req,res,next)=>{try{fn(req,res);}catch(e){if(String(e.code||'').startsWith('SQLITE_CONSTRAINT'))return err(res,'Ma’lumotlar chekloviga zid',409);next(e);}};
 // Profile: student can read/update own contact fields. Admin can manage status and guardian contacts.
 app.get('/api/v5/profiles',auth(),role('admin'),safe((req,res)=>{
   const p=Math.max(1,Math.min(999999,Number(req.query.page)||1));const lim=25,offset=(p-1)*lim;
   const q=txt(req.query.search,60);
   const rows=db.prepare(`SELECT u.id,u.name,u.email,u.role,p.phone,p.birth_date,p.status,p.guardian_phone,p.specialization FROM users u LEFT JOIN v5_profiles p ON p.user_id=u.id
     WHERE u.name LIKE ? OR u.email LIKE ? ORDER BY u.id DESC LIMIT ? OFFSET ?`).all('%'+q+'%','%'+q+'%',lim,offset);
   const count=db.prepare('SELECT COUNT(*) n FROM users WHERE name LIKE ? OR email LIKE ?').get('%'+q+'%','%'+q+'%').n;
   res.json({rows,total:count,page:p,pages:Math.ceil(count/lim)});
 }));
 app.get('/api/v5/profiles/:id',auth(),safe((req,res)=>{
   const uid=id(req.params.id),u=db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(uid);
   if(!u)return err(res,'Foydalanuvchi topilmadi',404);
   if(!['admin','super_admin'].includes(req.user.role)&&req.user.id!==uid&&!isParentOf(req.user.id,uid))return err(res,'Ruxsat yo‘q',403);
   const p=db.prepare('SELECT * FROM v5_profiles WHERE user_id=?').get(uid)||{};
   // Student and parents cannot read administrative private notes (none stored in this table).
   res.json({...u,...p});
 }));
 app.put('/api/v5/profiles/:id',auth(),safe((req,res)=>{
   const uid=id(req.params.id),target=db.prepare('SELECT role FROM users WHERE id=?').get(uid);
   if(!target)return err(res,'Foydalanuvchi topilmadi',404);
   if(!['admin','super_admin'].includes(req.user.role)&&uid!==req.user.id)return err(res,'Ruxsat yo‘q',403);
   const old=db.prepare('SELECT * FROM v5_profiles WHERE user_id=?').get(uid)||{};
   const phone=txt(req.body.phone,25),guardian=txt(req.body.guardian_phone,25),birth=txt(req.body.birth_date,10),address=txt(req.body.address,250),spec=txt(req.body.specialization,150),bio=txt(req.body.public_bio,800);
   const status=['admin','super_admin'].includes(req.user.role)?txt(req.body.status||old.status||'active',15):(old.status||'active');
   if((phone&&!/^\+?[\d ()-]{9,25}$/.test(phone))||(guardian&&!/^\+?[\d ()-]{9,25}$/.test(guardian))||!validDate(birth)||!['active','pending','frozen','graduated','inactive'].includes(status))return err(res,'Telefon, sana yoki holat noto‘g‘ri');
   db.prepare(`INSERT INTO v5_profiles(user_id,phone,birth_date,specialization,guardian_phone,address,status,public_bio) VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,birth_date=excluded.birth_date,specialization=excluded.specialization,guardian_phone=excluded.guardian_phone,address=excluded.address,status=excluded.status,public_bio=excluded.public_bio,updated_at=CURRENT_TIMESTAMP`)
     .run(uid,phone,birth,spec,guardian,address,status,bio);
   db.prepare('INSERT INTO ops_audit(actor_id,action,entity,entity_id) VALUES(?,?,?,?)').run(req.user.id,'update','profile',uid);
   res.json({ok:true});
 }));
 app.get('/api/v5/attendance/sessions',auth(),role('admin','teacher'),safe((req,res)=>{
   const sql=`SELECT s.id,s.session_date,s.topic,g.name group_name,g.id group_id FROM class_sessions s JOIN study_groups g ON g.id=s.group_id ${req.user.role==='teacher'?'WHERE g.teacher_id=?':''} ORDER BY s.session_date DESC,s.id DESC LIMIT 200`;
   res.json(db.prepare(sql).all(...(req.user.role==='teacher'?[req.user.id]:[])));
 }));
 // Short-lived join code for a particular lesson; authenticated enrolled students only.
 app.post('/api/v5/attendance/:sessionId/code',auth(),role('admin','teacher'),safe((req,res)=>{
   const sid=id(req.params.sessionId),row=db.prepare('SELECT s.*,g.teacher_id FROM class_sessions s JOIN study_groups g ON g.id=s.group_id WHERE s.id=?').get(sid);
   if(!row||!managesGroup(req.user.id,req.user.role,row))return err(res,'Darsni boshqarish huquqi yo‘q',403);
   const code=crypto.randomBytes(5).toString('hex').toUpperCase();
   const expiry=new Date(Date.now()+3*60*1000).toISOString();
   db.prepare('INSERT INTO v5_attendance_codes(session_id,code_hash,expires_at,created_by) VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,created_by=excluded.created_by,created_at=CURRENT_TIMESTAMP')
   .run(sid,crypto.createHash('sha256').update(code).digest('hex'),expiry,req.user.id);
   res.json({code,expires_at:expiry,session_id:sid});
 }));
 const recently=new Map();
 app.post('/api/v5/attendance/redeem',auth(),role('student'),safe((req,res)=>{
   const uid=req.user.id,now=Date.now(),recent=recently.get(uid)||{attempts:0,until:0};
   if(recent.until>now&&recent.attempts>=8)return err(res,'Ko‘p urinish. Birozdan keyin urinib ko‘ring',429);
   if(recent.until<=now){recent.attempts=0;recent.until=now+60000;}recent.attempts++;recently.set(uid,recent);
   const sid=id(req.body.session_id),code=txt(req.body.code,40).toUpperCase();
   const row=db.prepare('SELECT c.*,s.group_id FROM v5_attendance_codes c JOIN class_sessions s ON s.id=c.session_id WHERE c.session_id=?').get(sid);
   if(!row||Date.parse(row.expires_at)<now||!/^[A-F0-9]{10}$/.test(code)||crypto.createHash('sha256').update(code).digest('hex')!==row.code_hash)return err(res,'Kod yaroqsiz yoki muddati tugagan',403);
   if(!db.prepare('SELECT 1 FROM group_students WHERE group_id=? AND student_id=?').get(row.group_id,uid))return err(res,'Siz bu guruhga kirmaysiz',403);
   const old=db.prepare('SELECT status FROM attendance_records WHERE session_id=? AND student_id=?').get(sid,uid);
   if(old)return err(res,'Davomat avval belgilangan. O‘zgartirish uchun o‘qituvchiga murojaat qiling',409);
   db.transaction(()=>{
     db.prepare('INSERT INTO attendance_records(session_id,student_id,status,marked_by) VALUES(?,?,?,?)').run(sid,uid,'present',row.created_by);
     db.prepare('INSERT INTO v5_attendance_log(session_id,student_id,old_status,new_status,actor_id,source) VALUES(?,?,?,?,?,?)').run(sid,uid,null,'present',uid,'code');
   })();
   recently.delete(uid);res.json({ok:true,status:'present'});
 }));
 app.get('/api/v5/attendance/log',auth(),role('admin'),safe((req,res)=>res.json(db.prepare('SELECT * FROM v5_attendance_log ORDER BY id DESC LIMIT 200').all())));
 // Class announcements with strict group scope; never exposed to unrelated students.
 app.post('/api/v5/announcements',auth(),role('admin','teacher'),safe((req,res)=>{
   const gid=req.body.group_id?id(req.body.group_id):null,title=txt(req.body.title,140),message=txt(req.body.message,3000);
   if(title.length<3||message.length<5)return err(res,'Sarlavha yoki xabar juda qisqa');
   if(gid){const g=db.prepare('SELECT * FROM study_groups WHERE id=?').get(gid);if(!g||!managesGroup(req.user.id,req.user.role,g))return err(res,'Guruhga ruxsat yo‘q',403);}
   else if(!['admin','super_admin'].includes(req.user.role))return err(res,'Ommaviy e’lonni faqat admin yuboradi',403);
   const result=db.prepare('INSERT INTO v5_announcements(group_id,title,message,author_id) VALUES(?,?,?,?)').run(gid,title,message,req.user.id);
   res.status(201).json({id:Number(result.lastInsertRowid)});
 }));
 app.get('/api/v5/announcements',auth(),safe((req,res)=>{
   let sql='SELECT a.*,u.name author_name,g.name group_name FROM v5_announcements a JOIN users u ON u.id=a.author_id LEFT JOIN study_groups g ON g.id=a.group_id';let args=[];
   if(req.user.role==='student'){sql+=' WHERE a.group_id IS NULL OR a.group_id IN (SELECT group_id FROM group_students WHERE student_id=?)';args=[req.user.id];}
   else if(req.user.role==='teacher'){sql+=' WHERE a.group_id IS NULL OR a.group_id IN (SELECT id FROM study_groups WHERE teacher_id=?)';args=[req.user.id];}
   else if(req.user.role==='parent'||req.user.role==='accountant')sql+=' WHERE a.group_id IS NULL';
   else if(!['admin','super_admin'].includes(req.user.role))return err(res,'Ruxsat yo‘q',403);
   res.json(db.prepare(sql+' ORDER BY a.id DESC LIMIT 100').all(...args));
 }));
 app.get('/api/v5/reports/summary',auth(),role('admin','accountant'),safe((req,res)=>{
   const month=txt(req.query.month,7)||new Date().toISOString().slice(0,7);
   if(!/^\d{4}-\d{2}$/.test(month))return err(res,'YYYY-MM format talab etiladi');
   const stats=db.prepare(`SELECT
     (SELECT COUNT(*) FROM users WHERE role='student') students,
     (SELECT COUNT(*) FROM users WHERE role='teacher') teachers,
     (SELECT COUNT(*) FROM study_groups) groups,
     (SELECT COUNT(*) FROM attendance_records ar JOIN class_sessions s ON s.id=ar.session_id WHERE substr(s.session_date,1,7)=? AND ar.status='present') present,
     (SELECT COUNT(*) FROM attendance_records ar JOIN class_sessions s ON s.id=ar.session_id WHERE substr(s.session_date,1,7)=?) attendance_total,
     (SELECT COALESCE(SUM(amount),0) FROM ops_receipts WHERE voided_at IS NULL AND substr(CASE WHEN paid_on='' THEN created_at ELSE paid_on END,1,7)=?) income,
     (SELECT COALESCE(SUM(amount),0) FROM ops_expenses WHERE substr(spent_on,1,7)=?) expenses`).get(month,month,month,month);
   const unpaid=db.prepare(`SELECT i.id,u.name student_name,i.description,i.due_on,i.amount-COALESCE((SELECT SUM(r.amount) FROM ops_receipts r WHERE r.invoice_id=i.id AND r.voided_at IS NULL),0) debt
     FROM ops_invoices i JOIN users u ON u.id=i.student_id WHERE i.status='open' AND i.amount>COALESCE((SELECT SUM(r.amount) FROM ops_receipts r WHERE r.invoice_id=i.id AND r.voided_at IS NULL),0)
     ORDER BY i.due_on ASC LIMIT 200`).all();
   res.json({month,...stats,unpaid,debts:unpaid.reduce((t,r)=>t+r.debt,0)});
 }));
};
