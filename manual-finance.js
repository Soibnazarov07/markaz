'use strict';
/** Offline tuition bookkeeping. No gateway, card data, fake confirmations or auto bank verification. */
const crypto=require('node:crypto');
module.exports=function installManualFinance({app,db,io,auth,role}){
  for(const [column,definition] of [
    ['paid_on',"TEXT NOT NULL DEFAULT ''"],['note',"TEXT NOT NULL DEFAULT ''"],
    ['voided_at','TEXT'],['voided_by','INTEGER'],['void_reason',"TEXT NOT NULL DEFAULT ''"]
  ]){
    if(!db.pragma('table_info(ops_receipts)').some(c=>c.name===column))db.exec(`ALTER TABLE ops_receipts ADD COLUMN ${column} ${definition}`);
  }
  if(!db.pragma('table_info(ops_invoices)').some(c=>c.name==='course_id'))db.exec('ALTER TABLE ops_invoices ADD COLUMN course_id INTEGER REFERENCES courses(id)');
  db.exec(`
  CREATE INDEX IF NOT EXISTS idx_ops_receipts_paid_on ON ops_receipts(paid_on);
  CREATE INDEX IF NOT EXISTS idx_ops_receipts_invoice_active ON ops_receipts(invoice_id,voided_at);
  CREATE TABLE IF NOT EXISTS v5_course_enrollment_grants(
    student_id INTEGER NOT NULL REFERENCES users(id),course_id INTEGER NOT NULL REFERENCES courses(id),receipt_id INTEGER NOT NULL REFERENCES ops_receipts(id),
    revoked_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(student_id,course_id,receipt_id)
  );
  CREATE TABLE IF NOT EXISTS ops_payment_events(
    id INTEGER PRIMARY KEY AUTOINCREMENT,receipt_id INTEGER NOT NULL REFERENCES ops_receipts(id),
    actor_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('created','voided')),
    details TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `);
  const fail=(res,msg,code=400)=>res.status(code).json({error:msg});
  const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
  const cash=x=>Number.isSafeInteger(Number(x))&&Number(x)>0&&Number(x)<=1000000000?Number(x):null;
  const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
  const str=(s,l=250)=>String(s??'').trim().slice(0,l);
  const adminOnly=[auth(),role('admin','accountant')];
  const audit=(actor,kind,rid,info='')=>{
    db.prepare('INSERT INTO ops_payment_events(receipt_id,actor_id,kind,details) VALUES(?,?,?,?)').run(rid,actor,kind,info);
    db.prepare('INSERT INTO ops_audit(actor_id,action,entity,entity_id) VALUES(?,?,?,?)').run(actor,'manual_payment_'+kind,'receipt',rid);
  };
  const active='r.voided_at IS NULL';
  const totalPaid=i=>db.prepare('SELECT COALESCE(SUM(r.amount),0) n FROM ops_receipts r WHERE r.invoice_id=? AND '+active).get(i).n;
  const receiptBase=`SELECT r.id,r.invoice_id,r.amount,r.method,r.reference,r.paid_on,r.note,r.created_at,r.voided_at,r.void_reason,r.recorded_by,u.name student_name,u.id student_id,rec.name recorder_name,i.description invoice_description,i.amount invoice_total
  FROM ops_receipts r JOIN ops_invoices i ON i.id=r.invoice_id JOIN users u ON u.id=i.student_id
  LEFT JOIN users rec ON rec.id=r.recorded_by`;
  // A single transaction creates a tuition invoice automatically when the administrator did not select one.
  const pay=db.transaction(({studentId,invoiceId,courseId,amount,method,reference,paidOn,note,actor})=>{
    let invoice;
    if(invoiceId){
      invoice=db.prepare('SELECT * FROM ops_invoices WHERE id=?').get(invoiceId);
      if(!invoice||invoice.status!=='open'||(studentId&&studentId!==invoice.student_id))throw Object.assign(new Error('Hisob yoki o‘quvchi mos emas'),{http:400});
    }else{
      if(!db.prepare("SELECT id FROM users WHERE id=? AND role='student'").get(studentId))throw Object.assign(new Error('O‘quvchi topilmadi'),{http:400});
      const course=courseId?db.prepare('SELECT id,title,price FROM courses WHERE id=?').get(courseId):null;
      if(courseId&&(!course||course.price<=0))throw Object.assign(new Error('Pullik kurs topilmadi'),{http:400});
      const label=course?('Kurs: '+course.title+(note?' — '+note:'')):(note?'To‘lov: '+note:'Administrator kiritgan to‘lov');
      const billed=course?course.price:amount;
      const result=db.prepare('INSERT INTO ops_invoices(student_id,course_id,description,amount,due_on,created_by) VALUES(?,?,?,?,?,?)').run(studentId,courseId,label.slice(0,250),billed,paidOn,actor);
      invoice=db.prepare('SELECT * FROM ops_invoices WHERE id=?').get(result.lastInsertRowid);
    }
    if(amount>invoice.amount-totalPaid(invoice.id))throw Object.assign(new Error('To‘lov qoldiqdan ortiq'),{http:400});
    const result=db.prepare('INSERT INTO ops_receipts(invoice_id,amount,method,reference,recorded_by,paid_on,note) VALUES(?,?,?,?,?,?,?)')
      .run(invoice.id,amount,method,reference,actor,paidOn,note);
    audit(actor,'created',Number(result.lastInsertRowid),JSON.stringify({amount,paidOn,method,reference}));
    let access_granted=false;
    if(invoice.course_id&&totalPaid(invoice.id)>=invoice.amount){
      const en=db.prepare('INSERT OR IGNORE INTO enrollments(user_id,course_id) VALUES(?,?)').run(invoice.student_id,invoice.course_id);
      access_granted=en.changes>0;
      if(access_granted)db.prepare('INSERT INTO v5_course_enrollment_grants(student_id,course_id,receipt_id) VALUES(?,?,?)').run(invoice.student_id,invoice.course_id,Number(result.lastInsertRowid));
    }
    return {id:Number(result.lastInsertRowid),invoice_id:invoice.id,student_id:invoice.student_id,access_granted};
  });
  const recordManualPayment=(req,res,next)=>{
    try{
      const body=req.body||{};
      const studentId=body.student_id? id(body.student_id):null;
      const courseId=body.course_id?id(body.course_id):null;
      const invoiceId=body.invoice_id?id(body.invoice_id):null;
      const amount=cash(body.amount),paidOn=str(body.paid_on,10),method=str(body.method,40),note=str(body.note,500);
      let reference=str(body.reference,100);
      if(!reference)reference='MNL-'+crypto.randomBytes(9).toString('hex').toUpperCase();
      if(!amount||!validDate(paidOn)||!['cash','bank_transfer'].includes(method)||(!invoiceId&&!studentId)||reference.length<5)
        return fail(res,'O‘quvchi, sana, summa yoki to‘lov usuli noto‘g‘ri');
      if(paidOn>new Date(Date.now()+5*3600000).toISOString().slice(0,10))return fail(res,'Kelajakdagi to‘lov sanasi kiritilmaydi');
      const result=pay({studentId,invoiceId,courseId,amount,method,reference,paidOn,note,actor:req.user.id});
      try{db.prepare('INSERT INTO notifications(user_id,text,href) VALUES(?,?,?)').run(result.student_id,`To‘lov kiritildi: ${amount.toLocaleString('uz-UZ')} so‘m (${paidOn})`,'#/ops/payments');}catch(e){console.warn('Payment notification failed:',e.message);}
      if(result.access_granted)io.emit('courses:changed');
      io.to('user:'+result.student_id).emit('notify',{text:'To‘lov qayd etildi',href:'#/ops/payments'});
      res.status(201).json({...result,reference});
    }catch(e){if(String(e.code).startsWith('SQLITE_CONSTRAINT'))return fail(res,'To‘lov ma’lumotnoma raqami takrorlangan yoki noto‘g‘ri',409);if(e.http)return fail(res,e.message,e.http);next(e);}
  };
  app.locals.recordManualPayment=recordManualPayment;
  app.post('/api/ops/manual-payments',...adminOnly,recordManualPayment);
  // Reversals are explicit, audited and not deletions. Never mutate historical amount or paid date.
  app.post('/api/ops/manual-payments/:id/void',auth(),role('admin'),(req,res,next)=>{
    const rid=id(req.params.id),reason=str(req.body?.reason,300);
    if(!rid||reason.length<10)return fail(res,'Bekor qilish sababini kamida 10 belgida yozing');
    try{
      const out=db.transaction(()=>{
        const rec=db.prepare('SELECT * FROM ops_receipts WHERE id=?').get(rid);
        if(!rec)throw Object.assign(new Error('To‘lov topilmadi'),{http:404});
        if(rec.voided_at)throw Object.assign(new Error('To‘lov allaqachon bekor qilingan'),{http:409});
        db.prepare("UPDATE ops_receipts SET voided_at=CURRENT_TIMESTAMP,voided_by=?,void_reason=? WHERE id=? AND voided_at IS NULL").run(req.user.id,reason,rid);
        audit(req.user.id,'voided',rid,reason);
        const invoice=db.prepare('SELECT * FROM ops_invoices WHERE id=?').get(rec.invoice_id);
        let revoked=false;
        if(invoice.course_id){
          const grant=db.prepare('SELECT 1 FROM v5_course_enrollment_grants WHERE student_id=? AND course_id=? AND revoked_at IS NULL').get(invoice.student_id,invoice.course_id);
          const eligible=db.prepare(`SELECT 1 FROM ops_invoices i WHERE i.student_id=? AND i.course_id=? AND i.status='open' AND i.amount<=COALESCE((SELECT SUM(r.amount) FROM ops_receipts r WHERE r.invoice_id=i.id AND r.voided_at IS NULL),0) LIMIT 1`).get(invoice.student_id,invoice.course_id);
          const older=db.prepare("SELECT 1 FROM orders WHERE user_id=? AND course_id=? AND status='paid' LIMIT 1").get(invoice.student_id,invoice.course_id);
          if(grant&&!eligible&&!older){
            db.prepare('DELETE FROM group_students WHERE student_id=? AND group_id IN (SELECT id FROM study_groups WHERE course_id=?)').run(invoice.student_id,invoice.course_id);
            db.prepare('DELETE FROM enrollments WHERE user_id=? AND course_id=?').run(invoice.student_id,invoice.course_id);
            db.prepare('UPDATE v5_course_enrollment_grants SET revoked_at=CURRENT_TIMESTAMP WHERE student_id=? AND course_id=? AND revoked_at IS NULL').run(invoice.student_id,invoice.course_id);
            revoked=true;
          }
        }
        return {...rec,access_revoked:revoked};
      })();
      if(out.access_revoked)io.emit('courses:changed');
      res.json({ok:true,id:rid,access_revoked:out.access_revoked});
    }catch(e){if(e.http)return fail(res,e.message,e.http);next(e);}
  });
  app.get('/api/ops/manual-payments',auth(),(req,res)=>{
    let where='',args=[];
    if(req.user.role==='student'){where=' WHERE i.student_id=?';args=[req.user.id];}
    else if(['admin','super_admin','accountant'].includes(req.user.role)){
      if(req.query.student_id){const sid=id(req.query.student_id);if(!sid)return fail(res,'O‘quvchi ID noto‘g‘ri');where=' WHERE i.student_id=?';args=[sid];}
    }else return fail(res,'Ruxsat yo‘q',403);
    res.json(db.prepare(receiptBase+where+' ORDER BY r.id DESC LIMIT 500').all(...args));
  });
  app.get('/api/ops/parent/children/:id/payments',auth(),role('parent'),(req,res)=>{
    const sid=id(req.params.id);
    if(!db.prepare('SELECT 1 FROM ops_parent_links WHERE parent_id=? AND student_id=?').get(req.user.id,sid))return fail(res,'Ruxsat yo‘q',403);
    res.json(db.prepare(receiptBase+' WHERE i.student_id=? ORDER BY r.id DESC LIMIT 100').all(sid));
  });
  app.get('/api/ops/manual-payments/report',...adminOnly,(req,res)=>{
    const month=str(req.query.month,7);
    if(!/^\d{4}-\d{2}$/.test(month))return fail(res,'Oy YYYY-MM formatida bo‘lishi kerak');
    const paid=db.prepare(`SELECT r.method,COUNT(*) count,COALESCE(SUM(r.amount),0) amount FROM ops_receipts r WHERE r.voided_at IS NULL AND substr(CASE WHEN r.paid_on='' THEN r.created_at ELSE r.paid_on END,1,7)=? GROUP BY r.method`).all(month);
    const rows=db.prepare(receiptBase+` WHERE r.voided_at IS NULL AND substr(CASE WHEN r.paid_on='' THEN r.created_at ELSE r.paid_on END,1,7)=? ORDER BY r.paid_on DESC,r.id DESC LIMIT 5000`).all(month);
    res.json({month,summary:paid,rows,total:rows.reduce((s,r)=>s+r.amount,0)});
  });
  app.get('/api/ops/manual-payments/export.csv',...adminOnly,(req,res)=>{
    const month=str(req.query.month,7);if(!/^\d{4}-\d{2}$/.test(month))return fail(res,'Oy YYYY-MM bo‘lishi kerak');
    const data=db.prepare(receiptBase+` WHERE substr(CASE WHEN r.paid_on='' THEN r.created_at ELSE r.paid_on END,1,7)=? ORDER BY r.id DESC LIMIT 10000`).all(month);
    const cell=v=>'"'+String(v??'').replace(/^([=+@\-\t\r])/,'\'$1').replace(/"/g,'""')+'"';
    const content=[['ID','O‘quvchi','Sana','Summa UZS','Usul','Hujjat','Izoh','Holat','Kiritgan'],...data.map(x=>[x.id,x.student_name,x.paid_on||String(x.created_at).slice(0,10),x.amount,x.method,x.reference,x.note,x.voided_at?'Bekor qilingan':'Tasdiqlangan',x.recorder_name])].map(row=>row.map(cell).join(',')).join('\r\n');
    res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition',`attachment; filename="tolovlar-${month}.csv"`);res.send('\uFEFF'+content);
  });
};
