'use strict';
/** Incremental v7 modules. Designed not to mutate/delete legacy education/finance tables. */
const {roles,positive:id,text,date,month,csv,canManageGroup}=require('./v7-utils');
module.exports=function improvements({app,db,io,auth,role}){
 db.exec(`
 CREATE TABLE IF NOT EXISTS v7_holidays(
  day TEXT PRIMARY KEY,name TEXT NOT NULL,created_by INTEGER REFERENCES users(id),created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS v7_lesson_cancellations(
  schedule_id INTEGER PRIMARY KEY REFERENCES ops_schedule(id) ON DELETE CASCADE,
  cancelled_by INTEGER NOT NULL REFERENCES users(id),reason TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS v7_xp_events(
  id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES users(id),source TEXT NOT NULL,
  source_id INTEGER NOT NULL,points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 1000),
  awarded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(student_id,source,source_id));
 CREATE INDEX IF NOT EXISTS idx_v7_xp_student ON v7_xp_events(student_id);
 CREATE TRIGGER IF NOT EXISTS v7_legacy_test_xp AFTER INSERT ON results
 WHEN NEW.user_id IS NOT NULL AND NEW.total>0 AND NEW.score>=0 BEGIN
  INSERT OR IGNORE INTO v7_xp_events(student_id,source,source_id,points)
  VALUES(NEW.user_id,'legacy_test',NEW.id,CASE WHEN NEW.score=NEW.total THEN 20 ELSE 10 END);
 END;
 CREATE TABLE IF NOT EXISTS v7_reminders(
  id INTEGER PRIMARY KEY,invoice_id INTEGER NOT NULL REFERENCES ops_invoices(id),
  student_id INTEGER NOT NULL REFERENCES users(id),created_by INTEGER NOT NULL REFERENCES users(id),
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(invoice_id,student_id,created_by, sent_at));
 CREATE TABLE IF NOT EXISTS v7_audit(
  id INTEGER PRIMARY KEY,actor_id INTEGER REFERENCES users(id),action TEXT NOT NULL,
  entity TEXT NOT NULL,entity_id INTEGER,details TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS idx_v7_audit_date ON v7_audit(created_at);
 `);
 const fail=(res,m,c=400)=>res.status(c).json({error:m});
 const wrap=f=>(req,res,next)=>Promise.resolve().then(()=>f(req,res)).catch(next);
 const admin=u=>['admin','super_admin'].includes(u.role);
 const finance=u=>admin(u)||u.role==='accountant';
 const managedGroup=(u,g)=>canManageGroup(db,u,g);
 const group=idn=>db.prepare('SELECT * FROM study_groups WHERE id=?').get(id(idn));
 const audit=(u,action,entity,eid,details='')=>db.prepare('INSERT INTO v7_audit(actor_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)').run(u.id,action,entity,eid,text(details,300));
 const member=(gid,uid)=>!!db.prepare('SELECT 1 FROM group_students WHERE group_id=? AND student_id=?').get(gid,uid);
  // Healthcheck: do not disclose user records or infrastructure credentials.
 app.get('/api/health',(req,res)=>{try{db.prepare('SELECT 1').get();res.json({status:'ok',service:'edusphere',uptime_seconds:Math.round(process.uptime()),time:new Date().toISOString()});}catch{res.status(503).json({status:'unavailable'});}});
 // Global search. Role scope enforced in SQL; separate from existing broad staff lists.
 app.get('/api/v7/search',auth(),wrap((req,res)=>{
  const q=text(req.query.q,70);if(q.length<2)return fail(res,'Kamida 2 ta belgi kiriting');
  const search='%'+q.replace(/[\\%_]/g,'\\$&')+'%';let users=[],groups=[],courses=[];
  if(admin(req.user)){
   users=db.prepare("SELECT id,name,role FROM users WHERE name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 20").all(search);
   groups=db.prepare("SELECT id,name FROM study_groups WHERE name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 20").all(search);
  }else if(req.user.role==='branch_manager'){
   users=db.prepare("SELECT DISTINCT u.id,u.name,u.role FROM users u JOIN group_students gs ON gs.student_id=u.id JOIN study_groups g ON g.id=gs.group_id JOIN v6_staff_branches b ON b.branch_id=g.branch_id WHERE b.user_id=? AND u.name LIKE ? ESCAPE '\\' ORDER BY u.name LIMIT 20").all(req.user.id,search);
   groups=db.prepare("SELECT DISTINCT g.id,g.name FROM study_groups g JOIN v6_staff_branches b ON b.branch_id=g.branch_id WHERE b.user_id=? AND g.name LIKE ? ESCAPE '\\' ORDER BY g.name LIMIT 20").all(req.user.id,search);
  }else if(req.user.role==='teacher'){
   users=db.prepare("SELECT DISTINCT u.id,u.name,u.role FROM users u JOIN group_students gs ON gs.student_id=u.id JOIN study_groups g ON g.id=gs.group_id WHERE g.teacher_id=? AND u.name LIKE ? ESCAPE '\\' ORDER BY u.name LIMIT 20").all(req.user.id,search);
   groups=db.prepare("SELECT id,name FROM study_groups WHERE teacher_id=? AND name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 20").all(req.user.id,search);
  }
  courses=db.prepare("SELECT id,title FROM courses WHERE published=1 AND title LIKE ? ESCAPE '\\' ORDER BY title LIMIT 20").all(search);
  res.json({users,groups,courses});
 }));
 // Attendance/payment exports, bounded and sanitized for Excel. Untrusted cell prefix neutralized.
 app.get('/api/v7/reports/attendance.csv',auth(),wrap((req,res)=>{
  let rows=[];const m=month(req.query.month)?req.query.month:new Date().toISOString().slice(0,7);
  if(admin(req.user)) rows=db.prepare("SELECT g.name group_name,u.name student_name,s.session_date,a.status FROM attendance_records a JOIN class_sessions s ON s.id=a.session_id JOIN study_groups g ON g.id=s.group_id JOIN users u ON u.id=a.student_id WHERE substr(s.session_date,1,7)=? ORDER BY s.session_date DESC LIMIT 5000").all(m);
  else if(req.user.role==='teacher')rows=db.prepare("SELECT g.name group_name,u.name student_name,s.session_date,a.status FROM attendance_records a JOIN class_sessions s ON s.id=a.session_id JOIN study_groups g ON g.id=s.group_id JOIN users u ON u.id=a.student_id WHERE substr(s.session_date,1,7)=? AND g.teacher_id=? ORDER BY s.session_date DESC LIMIT 5000").all(m,req.user.id);
  else if(req.user.role==='branch_manager')rows=db.prepare("SELECT g.name group_name,u.name student_name,s.session_date,a.status FROM attendance_records a JOIN class_sessions s ON s.id=a.session_id JOIN study_groups g ON g.id=s.group_id JOIN users u ON u.id=a.student_id JOIN v6_staff_branches b ON b.branch_id=g.branch_id WHERE substr(s.session_date,1,7)=? AND b.user_id=? ORDER BY s.session_date DESC LIMIT 5000").all(m,req.user.id);
  else return fail(res,'Ruxsat yo‘q',403);
  res.type('text/csv; charset=utf-8').set('Content-Disposition',`attachment; filename="davomat-${m}.csv"`).send(csv([['Guruh','O‘quvchi','Sana','Holat'],...rows.map(x=>[x.group_name,x.student_name,x.session_date,x.status])]));
 }));
 app.get('/api/v7/reports/finance.csv',auth(),wrap((req,res)=>{
  if(!finance(req.user))return fail(res,'Ruxsat yo‘q',403);
  const m=month(req.query.month)?req.query.month:new Date().toISOString().slice(0,7);
  const rows=db.prepare("SELECT u.name student_name,i.id invoice_id,i.description,i.amount,i.due_on,COALESCE((SELECT SUM(amount) FROM ops_receipts r WHERE r.invoice_id=i.id AND r.voided_at IS NULL),0) paid FROM ops_invoices i JOIN users u ON u.id=i.student_id WHERE substr(i.due_on,1,7)=? AND i.status='open' ORDER BY i.due_on LIMIT 5000").all(m);
  res.type('text/csv; charset=utf-8').set('Content-Disposition',`attachment; filename="moliya-${m}.csv"`).send(csv([['O‘quvchi','Hisob №','Izoh','To‘lov muddati','Hisob','To‘langan','Qarzdorlik'],...rows.map(x=>[x.student_name,x.invoice_id,x.description,x.due_on,x.amount,x.paid,Math.max(0,x.amount-x.paid)])]));
 }));
 // Holidays and lesson cancellation log. Does not silently rewrite earlier schedule data.
 app.get('/api/v7/calendar/holidays',auth(),(req,res)=>res.json(db.prepare('SELECT * FROM v7_holidays ORDER BY day DESC LIMIT 100').all()));
 app.post('/api/v7/calendar/holidays',auth(),role('admin'),wrap((req,res)=>{
  const day=text(req.body?.day,10),name=text(req.body?.name,100);if(!date(day)||name.length<3)return fail(res,'Sana yoki nom noto‘g‘ri');
  db.prepare('INSERT INTO v7_holidays(day,name,created_by) VALUES(?,?,?) ON CONFLICT(day) DO UPDATE SET name=excluded.name,created_by=excluded.created_by').run(day,name,req.user.id);
  audit(req.user,'holiday_set','date',null,day);res.json({ok:true});
 }));
 app.delete('/api/v7/calendar/holidays/:day',auth(),role('admin'),wrap((req,res)=>{
  if(!date(req.params.day))return fail(res,'Sana noto‘g‘ri');db.prepare('DELETE FROM v7_holidays WHERE day=?').run(req.params.day);audit(req.user,'holiday_removed','date',null,req.params.day);res.json({ok:true});
 }));
 app.post('/api/v7/calendar/schedule/:sid/cancel',auth(),wrap((req,res)=>{
  const sid=id(req.params.sid),s=db.prepare('SELECT x.*,g.branch_id FROM ops_schedule x JOIN study_groups g ON g.id=x.group_id WHERE x.id=?').get(sid),reason=text(req.body?.reason,250);
  if(!s)return fail(res,'Dars topilmadi',404);if(!managedGroup(req.user,s))return fail(res,'Ruxsat yo‘q',403);if(reason.length<5)return fail(res,'Sababni kiriting');
  db.prepare('INSERT INTO v7_lesson_cancellations(schedule_id,cancelled_by,reason) VALUES(?,?,?) ON CONFLICT(schedule_id) DO NOTHING').run(sid,req.user.id,reason);audit(req.user,'lesson_cancelled','schedule',sid);res.json({ok:true});
 }));
 // Parent analytics, no cross-child visibility.
 app.get('/api/v7/parent/children/:sid/progress',auth(),role('parent'),wrap((req,res)=>{
  const sid=id(req.params.sid);if(!db.prepare('SELECT 1 FROM ops_parent_links WHERE parent_id=? AND student_id=?').get(req.user.id,sid))return fail(res,'Farzandga ruxsat yo‘q',403);
  const monthly=db.prepare("SELECT substr(s.session_date,1,7) month,COUNT(*) total,SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) present FROM attendance_records a JOIN class_sessions s ON s.id=a.session_id WHERE a.student_id=? GROUP BY substr(s.session_date,1,7) ORDER BY month DESC LIMIT 12").all(sid);
  const grades=db.prepare('SELECT a.title,s.score,a.max_score,s.feedback FROM ops_submissions s JOIN ops_assignments a ON a.id=s.assignment_id WHERE s.student_id=? AND s.score IS NOT NULL ORDER BY s.updated_at DESC LIMIT 30').all(sid);
  const debts=db.prepare("SELECT SUM(MAX(0,i.amount-COALESCE((SELECT SUM(r.amount) FROM ops_receipts r WHERE r.invoice_id=i.id AND r.voided_at IS NULL),0))) due FROM ops_invoices i WHERE i.student_id=? AND i.status='open'").get(sid)?.due||0;
  res.json({monthly,grades,debt:debts});
 }));
 app.get('/api/v7/teacher/overview',auth(),role('teacher'),wrap((req,res)=>{
  const teacherId=req.user.id;
  const groups=db.prepare('SELECT g.id,g.name,(SELECT COUNT(*) FROM group_students gs WHERE gs.group_id=g.id) students FROM study_groups g WHERE g.teacher_id=? ORDER BY g.name').all(teacherId);
  const pending=db.prepare('SELECT COUNT(*) n FROM ops_submissions s JOIN ops_assignments a ON a.id=s.assignment_id WHERE a.teacher_id=? AND s.score IS NULL').get(teacherId).n;
  const lessons=db.prepare("SELECT COUNT(*) n FROM ops_schedule WHERE teacher_id=? AND substr(starts_at,1,7)=?").get(teacherId,new Date().toISOString().slice(0,7)).n;
  res.json({groups,pending,lessons});
 }));
 app.get('/api/v7/student/gamification',auth(),role('student'),wrap((req,res)=>{
  const events=db.prepare('SELECT source,points,awarded_at FROM v7_xp_events WHERE student_id=? ORDER BY id DESC LIMIT 100').all(req.user.id);
  const total=db.prepare('SELECT COALESCE(SUM(points),0) n FROM v7_xp_events WHERE student_id=?').get(req.user.id).n;
  res.json({total,events});
 }));
 // Respect per-user billing notification preference for manual reminder generation.
 app.post('/api/v7/finance/remind/:invoice',auth(),wrap((req,res)=>{
  if(!finance(req.user))return fail(res,'Ruxsat yo‘q',403);
  const inv=db.prepare("SELECT i.*,u.name FROM ops_invoices i JOIN users u ON u.id=i.student_id WHERE i.id=?").get(id(req.params.invoice));if(!inv||inv.status!=='open')return fail(res,'Hisob topilmadi',404);
  const paid=db.prepare('SELECT COALESCE(SUM(amount),0) n FROM ops_receipts WHERE invoice_id=? AND voided_at IS NULL').get(inv.id).n;
  const due=Math.max(0,inv.amount-paid);if(!due)return fail(res,'Qarzdorlik yo‘q',409);
  const recent=db.prepare("SELECT 1 FROM v7_reminders WHERE invoice_id=? AND student_id=? AND sent_at>=datetime('now','-1 day') LIMIT 1").get(inv.id,inv.student_id);if(recent)return fail(res,'Bu hisob uchun oxirgi 24 soatda eslatma yuborilgan',429);
  const pref=db.prepare('SELECT billing FROM v6_notification_prefs WHERE user_id=?').get(inv.student_id);if(pref&&pref.billing===0)return fail(res,'O‘quvchi to‘lov bildirishnomalarini o‘chirgan',409);
  db.prepare('INSERT INTO notifications(user_id,text,href) VALUES(?,?,?)').run(inv.student_id,`To‘lov eslatmasi: ${inv.description} — ${due} so‘m. Muddat: ${inv.due_on}`,'#/ops/payments');
  db.prepare('INSERT INTO v7_reminders(invoice_id,student_id,created_by) VALUES(?,?,?)').run(inv.id,inv.student_id,req.user.id);
  io.to('user:'+inv.student_id).emit('notifications:changed');audit(req.user,'payment_reminder','invoice',inv.id);res.json({ok:true,due});
 }));
 app.get('/api/v7/audit',auth(),role('admin'),(req,res)=>res.json(db.prepare('SELECT a.*,u.name actor_name FROM v7_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200').all()));
};
