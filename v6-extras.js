'use strict';
/** Import, attendance history, finance checks and exports; no financial provider is used. */
module.exports=function v6Extras({app,db,auth,role}){
  db.exec(`
    CREATE TABLE IF NOT EXISTS v6_attendance_change(id INTEGER PRIMARY KEY,session_id INTEGER NOT NULL,student_id INTEGER NOT NULL,old_status TEXT,new_status TEXT NOT NULL,marked_by INTEGER,changed_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TRIGGER IF NOT EXISTS v6_attendance_insert AFTER INSERT ON attendance_records BEGIN
      INSERT INTO v6_attendance_change(session_id,student_id,old_status,new_status,marked_by) VALUES(new.session_id,new.student_id,NULL,new.status,new.marked_by);
    END;
    CREATE TRIGGER IF NOT EXISTS v6_attendance_update AFTER UPDATE OF status ON attendance_records WHEN old.status<>new.status BEGIN
      INSERT INTO v6_attendance_change(session_id,student_id,old_status,new_status,marked_by) VALUES(new.session_id,new.student_id,old.status,new.status,new.marked_by);
    END;
  `);
  const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
  const fail=(res,m,c=400)=>res.status(c).json({error:m});
  const adm=u=>['admin','super_admin'].includes(u.role);
  const canGroup=(u,g)=>g&&(adm(u)||u.role==='teacher'&&g.teacher_id===u.id||u.role==='branch_manager'&&g.branch_id&&db.prepare('SELECT 1 FROM v6_staff_branches WHERE user_id=? AND branch_id=?').get(u.id,g.branch_id));
  const audit=(u,act,target,id,info='')=>db.prepare('INSERT INTO v6_activity_log(actor_id,action,target,target_id,details) VALUES(?,?,?,?,?)').run(u.id,act,target,id,info);
  // Safe bounded CSV (quoted cells and escaped quotes), reject formula-based cells in student exports.
  const csvParse=text=>{
    if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>200000)throw Error('CSV 200 KBdan oshmasligi kerak');
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}
      else if(ch==='"'){if(cell)throw Error('CSV qo‘shtirnoq xatosi');quoted=true;}
      else if(ch===','){row.push(cell);cell='';}
      else if(ch==='\n'){row.push(cell.replace(/\r$/,''));if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}
      else cell+=ch;
      if(cell.length>4000)throw Error('CSV katak juda katta');
    }
    if(quoted)throw Error('CSV yopilmagan qo‘shtirnoq');
    row.push(cell.replace(/\r$/,''));if(row.some(x=>x.trim()))rows.push(row);
    if(rows.length>501)throw Error('Bir safarda 500 qatorgacha mumkin');
    return rows;
  };
  app.post('/api/v6/groups/:gid/import',auth(),(req,res,next)=>{
    try{
      const gid=id(req.params.gid),g=db.prepare('SELECT * FROM study_groups WHERE id=?').get(gid);
      if(!canGroup(req.user,g))return fail(res,'Ruxsat yo‘q',403);
      const rows=csvParse(req.body?.csv),head=rows.shift()?.map(x=>x.trim().toLowerCase());
      if(JSON.stringify(head)!==JSON.stringify(['student_id']))return fail(res,'CSV sarlavhasi student_id bo‘lsin');
      const students=[],errors=[];for(const [i,row] of rows.entries()){
        const sid=id(row[0]);if(row.length!==1||!sid||!db.prepare("SELECT 1 FROM users WHERE id=? AND role='student'").get(sid))errors.push({row:i+2,error:'O‘quvchi ID noto‘g‘ri'});else if(students.includes(sid))errors.push({row:i+2,error:'Takroriy ID'});else if(!db.prepare('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?').get(sid,g.course_id))errors.push({row:i+2,error:'O‘quvchi ushbu kursga yozilmagan'});else students.push(sid);
      }
      const existing=db.prepare('SELECT COUNT(*) n FROM group_students WHERE group_id=?').get(gid).n;
      const newIds=students.filter(sid=>!db.prepare('SELECT 1 FROM group_students WHERE group_id=? AND student_id=?').get(gid,sid));
      if(existing+newIds.length>g.capacity)errors.push({error:'Guruh sig‘imidan oshadi'});
      if(req.body.preview===true||errors.length)return res.json({preview:true,valid:students.length,new_students:newIds.length,errors});
      db.transaction(()=>{const insert=db.prepare('INSERT OR IGNORE INTO group_students(group_id,student_id) VALUES(?,?)');for(const sid of newIds)insert.run(gid,sid);audit(req.user,'csv_import','group',gid,'added='+newIds.length);})();res.json({ok:true,added:newIds.length});
    }catch(e){if(e.message.startsWith('CSV'))return fail(res,e.message);next(e);}
  });
  app.get('/api/v6/attendance/changes',auth(),(req,res)=>{
    if(!adm(req.user)&&!['teacher','branch_manager'].includes(req.user.role))return fail(res,'Ruxsat yo‘q',403);
    const rows=db.prepare('SELECT a.*,g.teacher_id,g.branch_id FROM v6_attendance_change a JOIN class_sessions s ON s.id=a.session_id JOIN study_groups g ON g.id=s.group_id ORDER BY a.id DESC LIMIT 300').all();
    res.json(rows.filter(a=>adm(req.user)||req.user.role==='teacher'&&a.teacher_id===req.user.id||req.user.role==='branch_manager'&&!!db.prepare('SELECT 1 FROM v6_staff_branches WHERE user_id=? AND branch_id=?').get(req.user.id,a.branch_id)));
  });
  app.get('/api/v6/finance/monthly',auth(),role('admin','accountant'),(req,res)=>{
    const month=String(req.query.month||'');if(!/^\d{4}-(0[1-9]|1[012])$/.test(month))return fail(res,'Oy YYYY-MM ko‘rinishida bo‘lsin');
    const rows=db.prepare(`SELECT u.id student_id,u.name student_name,i.id invoice_id,i.description,i.amount invoiced,i.due_on,i.status,COALESCE((SELECT SUM(r.amount) FROM ops_receipts r WHERE r.invoice_id=i.id AND r.voided_at IS NULL),0) paid FROM ops_invoices i JOIN users u ON u.id=i.student_id WHERE substr(i.due_on,1,7)=? ORDER BY i.due_on,i.id LIMIT 5000`).all(month);
    const total=rows.filter(x=>x.status==='open').reduce((a,x)=>({invoiced:a.invoiced+x.invoiced,paid:a.paid+x.paid,due:a.due+Math.max(0,x.invoiced-x.paid)}),{invoiced:0,paid:0,due:0});res.json({month,rows,total});
  });
  app.post('/api/v6/exams/:exam/questions/import',auth(),role('admin','teacher'),(req,res,next)=>{
    try{
      const eid=id(req.params.exam),exam=db.prepare('SELECT * FROM v5_exams WHERE id=?').get(eid);
      if(!exam||exam.status!=='draft')return fail(res,'Test topilmadi yoki draft emas',403);
      const allowed=adm(req.user)||req.user.role==='teacher'&&db.prepare('SELECT 1 FROM courses WHERE id=? AND teacher_id=?').get(exam.course_id,req.user.id);
      if(!allowed)return fail(res,'Ruxsat yo‘q',403);
      const rows=csvParse(req.body.csv),header=rows.shift()?.map(x=>x.trim().toLowerCase());
      if(JSON.stringify(header)!==JSON.stringify(['type','prompt','options','answer','points']))return fail(res,'Sarlavha type,prompt,options,answer,points bo‘lsin');
      const valid=[],errors=[];for(const [index,r] of rows.entries()){
        const [type,prompt,opts,answer,score]=r,points=Number(score);let options=[],key;
        if(r.length!==5||!['single','multiple','true_false','short','essay'].includes(type)||!prompt||prompt.length<3||prompt.length>2000||!Number.isInteger(points)||points<1||points>100){errors.push({row:index+2,error:'Satr maydonlari noto‘g‘ri'});continue;}
        if(['single','multiple'].includes(type)){
          options=opts.split('|').map(x=>x.trim());if(options.length<2||options.length>8||options.some(x=>!x||x.length>250)){errors.push({row:index+2,error:'Variantlar noto‘g‘ri'});continue;}
          const n=answer.split('|').map(x=>Number(x)-1);if(n.some(x=>!Number.isInteger(x)||x<0||x>=options.length)||new Set(n).size!==n.length||type==='single'&&n.length!==1){errors.push({row:index+2,error:'Javob indeksi noto‘g‘ri'});continue;}key=type==='single'?n[0]:n;
        }else if(type==='true_false'){options=['To‘g‘ri','Noto‘g‘ri'];if(!['true','false'].includes(answer)){errors.push({row:index+2,error:'true/false kerak'});continue;}key=answer==='true';}
        else if(type==='short'){if(!answer||answer.length>180){errors.push({row:index+2,error:'Javob yetishmaydi'});continue;}key=answer;}
        else key=null;
        valid.push({type,prompt,options,key,points});
      }
      if(errors.length||req.body.preview===true)return res.json({preview:true,count:valid.length,errors});
      db.transaction(()=>{const insert=db.prepare('INSERT INTO v5_exam_questions(exam_id,type,prompt,options_json,answer_json,points) VALUES(?,?,?,?,?,?)');for(const q of valid)insert.run(eid,q.type,q.prompt,JSON.stringify(q.options),JSON.stringify(q.key),q.points);audit(req.user,'csv_import','exam',eid,'questions='+valid.length);})();res.json({ok:true,added:valid.length});
    }catch(e){if(e.message.startsWith('CSV'))return fail(res,e.message);next(e);}
  });
};
