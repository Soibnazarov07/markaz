'use strict';
/** EduSphere incremental CMS / public education portal.
 * Additive SQLite migrations: never drops legacy user, course, payment or chat data.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

module.exports = function installCMS({app,db,io,auth,role,getSetting,setSetting,clean,DATA_DIR}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cms_articles(
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Yangiliklar',
      cover TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
      published_at TEXT, author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_cms_articles_status ON cms_articles(status,published_at,id);
    CREATE TABLE IF NOT EXISTS cms_ads(
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, sponsor TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '', mobile_image TEXT NOT NULL DEFAULT '', alt TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '', cta TEXT NOT NULL DEFAULT 'Batafsil', target_url TEXT NOT NULL,
      placement TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
      starts_at TEXT, ends_at TEXT, priority INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_cms_ads_visibility ON cms_ads(placement,status,priority);
    CREATE TABLE IF NOT EXISTS cms_branches(
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '', telegram TEXT NOT NULL DEFAULT '', hours TEXT NOT NULL DEFAULT '',
      map_url TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS cms_leads(
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL,
      course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL, note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','trial','interested','registered','closed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_cms_leads_date ON cms_leads(created_at);
    CREATE TABLE IF NOT EXISTS cms_audit(
      id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS study_groups(
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      branch_id INTEGER REFERENCES cms_branches(id) ON DELETE SET NULL,
      capacity INTEGER NOT NULL DEFAULT 20, weekdays TEXT NOT NULL DEFAULT '', time_slot TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS group_students(
      group_id INTEGER NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(group_id,student_id));
    CREATE TABLE IF NOT EXISTS class_sessions(
      id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
      session_date TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id,session_date));
    CREATE TABLE IF NOT EXISTS attendance_records(
      session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('present','absent','late','excused')),
      marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(session_id,student_id));
  `);
  const mediaDir=path.join(DATA_DIR,'media');fs.mkdirSync(mediaDir,{recursive:true});
  app.use('/media',express.static(mediaDir,{index:false,immutable:true,maxAge:'7d',fallthrough:false}));
  const asText=(s,max=200)=>String(s??'').trim().slice(0,max);
  const reject=(res,s,status=400)=>res.status(status).json({error:s});
  const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(err=>{if(String(err.code||'').startsWith('SQLITE_CONSTRAINT'))return reject(res,'Bu qiymat allaqachon mavjud yoki bog‘langan ma’lumot bor',409);next(err);});
  const admin=[auth(),role('admin')];
  const id=x=>{const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:null;};
  const audit=(req,action,entity,pk)=>db.prepare('INSERT INTO cms_audit(actor_id,action,entity,entity_id) VALUES(?,?,?,?)').run(req.user.id,action,entity,pk||null);
  const publish=()=>io.emit('cms:changed');
  const slug=s=>asText(s,160).toLowerCase().normalize('NFKD').replace(/[^a-z0-9\u0400-\u04ff\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
  const imagePath=u=>!u||/^\/media\/[a-f\d-]{36}\.(png|jpg|webp)$/.test(u)||/^https:\/\/[^\s<>"']{1,350}$/i.test(u);
  const validPhone=s=>/^\+?[\d ()-]{9,25}$/.test(s);
  const validTelegram=s=>!s||/^@?[A-Za-z0-9_]{5,32}$/.test(s);
  const validExternal=s=>!s||/^https:\/\/[^\s<>"']{1,350}$/i.test(s);
  const validIso=s=>!s||(!isNaN(Date.parse(s))&&new Date(s).toISOString()===s);
  const contacts={name:"O'quv markaz",phone:'',telegram:'',instagram:'',youtube:'',heroTitle:'Kelajak kasbingiz shu yerdan boshlanadi',heroSubtitle:'Zamonaviy kurslar, malakali ustozlar va real natijalar.',logo:'',favicon:'',heroImage:''};
  const site=()=>{let v={};try{v=JSON.parse(getSetting('cms_site','{}'));}catch{}return {...contacts,...v,name:v.name||getSetting('center_name',contacts.name)};};
  const getSitePublic=()=>site();
  app.get('/api/public/site',(_req,res)=>res.json(getSitePublic()));
  app.get('/api/admin/site',...admin,(_req,res)=>res.json(getSitePublic()));
  app.put('/api/admin/site',...admin,wrap((req,res)=>{
    const old=site(),v=req.body||{};
    const next={};for(const k of Object.keys(contacts)) next[k]=asText(v[k]===undefined?old[k]:v[k],k==='heroSubtitle'?400:300);
    if(!next.name||next.name.length<2)return reject(res,'Markaz nomi kamida 2 ta belgidan iborat bo‘lsin');
    if(next.phone&&!validPhone(next.phone))return reject(res,'Telefon formati noto‘g‘ri');
    if(!validTelegram(next.telegram))return reject(res,'Telegram username noto‘g‘ri');
    for(const k of ['instagram','youtube']) if(!validExternal(next[k]))return reject(res,k+' HTTPS link bo‘lishi kerak');
    for(const k of ['logo','favicon','heroImage'])if(!imagePath(next[k]))return reject(res,k+' rasm manzili noto‘g‘ri');
    setSetting('cms_site',JSON.stringify(next));setSetting('center_name',next.name);audit(req,'update','site',null);publish();io.emit('settings:changed');res.json(next);
  }));
  // Strict small PNG/JPEG/WEBP file upload. Files live on Railway persistent Volume.
  app.post('/api/admin/media',...admin,wrap((req,res)=>{
    const str=String(req.body?.dataUrl||'');
    const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(str);
    if(!m||str.length>3_700_000)return reject(res,'PNG/JPEG/WEBP rasm, maksimum 2.5 MB');
    const buf=Buffer.from(m[2],'base64');if(buf.length>2_500_000||buf.length<32)return reject(res,'Rasm hajmi noto‘g‘ri');
    const png=buf.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
    const jpg=buf[0]===255&&buf[1]===216&&buf[2]===255;
    const webp=buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP';
    if(!((m[1]==='png'&&png)||(m[1]==='jpeg'&&jpg)||(m[1]==='webp'&&webp)))return reject(res,'Rasm turi va fayl tarkibi mos kelmadi');
    const ext=m[1]==='jpeg'?'jpg':m[1],filename=crypto.randomUUID()+'.'+ext;
    fs.writeFileSync(path.join(mediaDir,filename),buf,{flag:'wx',mode:0o600});audit(req,'upload','media',null);res.status(201).json({url:'/media/'+filename});
  }));
  const articleSelect='SELECT a.id,a.title,a.slug,a.excerpt,a.body,a.category,a.cover,a.status,a.published_at,a.created_at,a.updated_at,u.name AS author FROM cms_articles a LEFT JOIN users u ON u.id=a.author_id';
  app.get('/api/public/articles',(_req,res)=>{
    const rows=db.prepare(articleSelect+" WHERE a.status='published' AND (a.published_at IS NULL OR a.published_at<=?) ORDER BY a.published_at DESC,a.id DESC LIMIT 100").all(new Date().toISOString());
    res.json(rows.map(({body,...rest})=>rest));
  });
  app.get('/api/public/articles/:slug',(req,res)=>{
    const row=db.prepare(articleSelect+" WHERE a.slug=? AND a.status='published' AND (a.published_at IS NULL OR a.published_at<=?)").get(req.params.slug,new Date().toISOString());
    return row?res.json(row):reject(res,'Maqola topilmadi',404);
  });
  app.get('/api/admin/articles',...admin,(_req,res)=>res.json(db.prepare(articleSelect+' ORDER BY a.id DESC LIMIT 300').all()));
  function articleData(v){return {title:asText(v.title,160),slug:slug(v.slug||v.title),excerpt:asText(v.excerpt,350),body:asText(v.body,35000),category:asText(v.category,70)||'Yangiliklar',cover:asText(v.cover,400),status:asText(v.status,20)||'draft',published_at:v.published_at?asText(v.published_at,40):null};}
  function validateArticle(v,res){if(v.title.length<3||v.slug.length<3)return reject(res,'Maqola nomi yoki slug noto‘g‘ri');if(!['draft','published','archived'].includes(v.status))return reject(res,'Status noto‘g‘ri');if(!imagePath(v.cover))return reject(res,'Rasm manzili noto‘g‘ri');if(!validIso(v.published_at))return reject(res,'Nashr sanasi ISO formatida bo‘lishi kerak');return false;}
  app.post('/api/admin/articles',...admin,wrap((req,res)=>{
    const v=articleData(req.body||{});if(validateArticle(v,res))return;
    const row=db.prepare('INSERT INTO cms_articles(title,slug,excerpt,body,category,cover,status,published_at,author_id) VALUES(@title,@slug,@excerpt,@body,@category,@cover,@status,@published_at,@author_id)').run({...v,author_id:req.user.id});audit(req,'create','article',row.lastInsertRowid);publish();res.status(201).json({id:Number(row.lastInsertRowid)});
  }));
  app.put('/api/admin/articles/:id',...admin,wrap((req,res)=>{
    const pk=id(req.params.id);if(!pk||!db.prepare('SELECT 1 FROM cms_articles WHERE id=?').get(pk))return reject(res,'Maqola topilmadi',404);
    const v=articleData(req.body||{});if(validateArticle(v,res))return;
    db.prepare('UPDATE cms_articles SET title=@title,slug=@slug,excerpt=@excerpt,body=@body,category=@category,cover=@cover,status=@status,published_at=@published_at,updated_at=CURRENT_TIMESTAMP WHERE id=@id').run({...v,id:pk});audit(req,'update','article',pk);publish();res.json({ok:true});
  }));
  app.delete('/api/admin/articles/:id',...admin,(req,res)=>{
    const pk=id(req.params.id);if(!pk)return reject(res,'ID noto‘g‘ri');const r=db.prepare('DELETE FROM cms_articles WHERE id=?').run(pk);if(!r.changes)return reject(res,'Maqola topilmadi',404);audit(req,'delete','article',pk);publish();res.json({ok:true});
  });
  const placements=['HOME_TOP_BANNER','HOME_HERO_SLIDER','HOME_COURSES_BETWEEN','ARTICLES_TOP','ARTICLES_GRID_INLINE','ARTICLE_DETAIL_INLINE','COURSE_LISTING_INLINE','COURSE_DETAIL_BOTTOM','TEST_LISTING_BANNER','FOOTER_PROMO'];
  app.get('/api/public/ads',(req,res)=>{
    const location=asText(req.query.placement,60);if(!placements.includes(location))return reject(res,'Reklama joyi noto‘g‘ri');
    const now=new Date().toISOString();const rows=db.prepare(`SELECT id,title,sponsor,image,mobile_image,alt,description,cta,target_url,placement FROM cms_ads WHERE placement=? AND status='published' AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>?) ORDER BY priority DESC,id DESC LIMIT 5`).all(location,now,now);res.json(rows);
  });
  const rate=new Map();const limited=(key,max=20)=>{const now=Date.now(),a=(rate.get(key)||[]).filter(t=>now-t<60000);a.push(now);rate.set(key,a);return a.length>max;};
  setInterval(()=>rate.clear(),600000).unref();
  app.post('/api/public/ads/:id/event',(req,res)=>{
    const pk=id(req.params.id),type=req.body?.type;if(!['click','impression'].includes(type)||!pk)return reject(res,'Event xato');
    if(limited('ad:'+req.ip+':'+pk+':'+type,type==='click'?12:60))return reject(res,'Juda ko‘p so‘rov',429);
    const now=new Date().toISOString();const column=type==='click'?'clicks':'impressions';
    const r=db.prepare(`UPDATE cms_ads SET ${column}=${column}+1 WHERE id=? AND status='published' AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>?)`).run(pk,now,now);
    return r.changes?res.json({ok:true}):reject(res,'Reklama faol emas',404);
  });
  app.get('/api/admin/ads',...admin,(_req,res)=>res.json(db.prepare('SELECT * FROM cms_ads ORDER BY id DESC LIMIT 300').all()));
  function adData(v){return {title:asText(v.title,120),sponsor:asText(v.sponsor,120),image:asText(v.image,400),mobile_image:asText(v.mobile_image,400),alt:asText(v.alt,180),description:asText(v.description,300),cta:asText(v.cta,70)||'Batafsil',target_url:asText(v.target_url,400),placement:asText(v.placement,60),status:asText(v.status,20)||'draft',starts_at:v.starts_at?asText(v.starts_at,40):null,ends_at:v.ends_at?asText(v.ends_at,40):null,priority:Math.max(-100,Math.min(100,Number(v.priority)||0))};}
  function validateAd(v,res){if(v.title.length<3||!validExternal(v.target_url)||!v.target_url)return reject(res,'Nom yoki HTTPS reklama havolasi noto‘g‘ri');if(!placements.includes(v.placement))return reject(res,'Reklama joyi noto‘g‘ri');if(!['draft','published','archived'].includes(v.status))return reject(res,'Status noto‘g‘ri');if(!imagePath(v.image)||!imagePath(v.mobile_image))return reject(res,'Rasm manzili noto‘g‘ri');if(!validIso(v.starts_at)||!validIso(v.ends_at)||(v.starts_at&&v.ends_at&&v.starts_at>=v.ends_at))return reject(res,'Vaqt oralig‘i noto‘g‘ri');return false;}
  app.post('/api/admin/ads',...admin,wrap((req,res)=>{const v=adData(req.body||{});if(validateAd(v,res))return;const r=db.prepare('INSERT INTO cms_ads(title,sponsor,image,mobile_image,alt,description,cta,target_url,placement,status,starts_at,ends_at,priority) VALUES(@title,@sponsor,@image,@mobile_image,@alt,@description,@cta,@target_url,@placement,@status,@starts_at,@ends_at,@priority)').run(v);audit(req,'create','ad',r.lastInsertRowid);publish();res.status(201).json({id:Number(r.lastInsertRowid)});}));
  app.put('/api/admin/ads/:id',...admin,wrap((req,res)=>{const pk=id(req.params.id),v=adData(req.body||{});if(validateAd(v,res))return;const r=db.prepare('UPDATE cms_ads SET title=@title,sponsor=@sponsor,image=@image,mobile_image=@mobile_image,alt=@alt,description=@description,cta=@cta,target_url=@target_url,placement=@placement,status=@status,starts_at=@starts_at,ends_at=@ends_at,priority=@priority,updated_at=CURRENT_TIMESTAMP WHERE id=@id').run({...v,id:pk});if(!r.changes)return reject(res,'Reklama topilmadi',404);audit(req,'update','ad',pk);publish();res.json({ok:true});}));
  app.delete('/api/admin/ads/:id',...admin,(req,res)=>{const pk=id(req.params.id);const r=db.prepare('DELETE FROM cms_ads WHERE id=?').run(pk);if(!r.changes)return reject(res,'Reklama topilmadi',404);audit(req,'delete','ad',pk);publish();res.json({ok:true});});
  app.get('/api/public/branches',(_req,res)=>res.json(db.prepare('SELECT * FROM cms_branches WHERE is_active=1 ORDER BY id DESC').all()));
  app.get('/api/admin/branches',...admin,(_req,res)=>res.json(db.prepare('SELECT * FROM cms_branches ORDER BY id DESC').all()));
  function branchData(v){return {name:asText(v.name,140),address:asText(v.address,250),phone:asText(v.phone,30),telegram:asText(v.telegram,40),hours:asText(v.hours,120),map_url:asText(v.map_url,400),image:asText(v.image,400),is_active:v.is_active===false||v.is_active===0?0:1};}
  function validateBranch(v,res){if(v.name.length<2)return reject(res,'Filial nomini kiriting');if(v.phone&&!validPhone(v.phone))return reject(res,'Telefon noto‘g‘ri');if(!validTelegram(v.telegram))return reject(res,'Telegram noto‘g‘ri');if(!validExternal(v.map_url)||!imagePath(v.image))return reject(res,'Xarita yoki rasm URL noto‘g‘ri');return false;}
  app.post('/api/admin/branches',...admin,wrap((req,res)=>{const v=branchData(req.body||{});if(validateBranch(v,res))return;const r=db.prepare('INSERT INTO cms_branches(name,address,phone,telegram,hours,map_url,image,is_active) VALUES(@name,@address,@phone,@telegram,@hours,@map_url,@image,@is_active)').run(v);audit(req,'create','branch',r.lastInsertRowid);publish();res.status(201).json({id:Number(r.lastInsertRowid)});}));
  app.put('/api/admin/branches/:id',...admin,wrap((req,res)=>{const pk=id(req.params.id),v=branchData(req.body||{});if(validateBranch(v,res))return;const r=db.prepare('UPDATE cms_branches SET name=@name,address=@address,phone=@phone,telegram=@telegram,hours=@hours,map_url=@map_url,image=@image,is_active=@is_active WHERE id=@id').run({...v,id:pk});if(!r.changes)return reject(res,'Filial topilmadi',404);audit(req,'update','branch',pk);publish();res.json({ok:true});}));
  app.delete('/api/admin/branches/:id',...admin,wrap((req,res)=>{const pk=id(req.params.id);const r=db.prepare('DELETE FROM cms_branches WHERE id=?').run(pk);if(!r.changes)return reject(res,'Filial topilmadi',404);audit(req,'delete','branch',pk);publish();res.json({ok:true});}));
  app.post('/api/public/leads',wrap((req,res)=>{
    if(limited('lead:'+req.ip,4))return reject(res,'Iltimos, keyinroq urinib ko‘ring',429);
    const v={name:asText(req.body?.name,100),phone:asText(req.body?.phone,30),note:asText(req.body?.note,350),course_id:id(req.body?.courseId)};
    if(v.name.length<2||!validPhone(v.phone)||req.body?.consent!==true)return reject(res,'Ism, telefon va rozilikni to‘g‘ri kiriting');
    if(v.course_id&&!db.prepare('SELECT 1 FROM courses WHERE id=? AND published=1').get(v.course_id))return reject(res,'Kurs topilmadi',404);
    const r=db.prepare('INSERT INTO cms_leads(name,phone,note,course_id) VALUES(@name,@phone,@note,@course_id)').run(v);io.to('admins').emit('activity',{text:'Yangi kurs arizasi: '+v.name,ts:Date.now()});res.status(201).json({ok:true,id:Number(r.lastInsertRowid)});
  }));
  app.get('/api/admin/leads',...admin,(_req,res)=>res.json(db.prepare('SELECT l.*,c.title AS course_title FROM cms_leads l LEFT JOIN courses c ON c.id=l.course_id ORDER BY l.id DESC LIMIT 500').all()));
  app.patch('/api/admin/leads/:id',...admin,wrap((req,res)=>{const pk=id(req.params.id),status=asText(req.body?.status,20);if(!['new','contacted','trial','interested','registered','closed'].includes(status))return reject(res,'Status noto‘g‘ri');const r=db.prepare('UPDATE cms_leads SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,pk);if(!r.changes)return reject(res,'Ariza topilmadi',404);audit(req,'update','lead',pk);res.json({ok:true});}));
  app.get('/api/admin/cms-stats',...admin,(_req,res)=>{
    const n=q=>db.prepare(q).get().n;
    res.json({articles:n("SELECT COUNT(*) n FROM cms_articles WHERE status='published'"),ads:n("SELECT COUNT(*) n FROM cms_ads WHERE status='published'"),branches:n('SELECT COUNT(*) n FROM cms_branches'),leads:n('SELECT COUNT(*) n FROM cms_leads'),newLeads:n("SELECT COUNT(*) n FROM cms_leads WHERE status='new'"),impressions:n('SELECT COALESCE(SUM(impressions),0) n FROM cms_ads'),clicks:n('SELECT COALESCE(SUM(clicks),0) n FROM cms_ads')});
  });
  app.get('/api/admin/audit',...admin,(_req,res)=>res.json(db.prepare('SELECT a.*,u.name AS actor FROM cms_audit a LEFT JOIN users u ON a.actor_id=u.id ORDER BY a.id DESC LIMIT 100').all()));
  // Actual groups & attendance: only enrolled students can be added and marked.
  const teacherAccess=(g,u)=>['admin','super_admin'].includes(u?.role)||(u?.role==='teacher'&&g.teacher_id===u.id);
  app.get('/api/manage/groups',auth(),role('admin','teacher'),(req,res)=>{
    const rows=db.prepare(`SELECT g.*,c.title AS course_title,u.name AS teacher_name,
      (SELECT COUNT(*) FROM group_students WHERE group_id=g.id) AS students_count
      FROM study_groups g JOIN courses c ON c.id=g.course_id LEFT JOIN users u ON u.id=g.teacher_id
      ${req.user.role==='teacher'?'WHERE g.teacher_id=?':''} ORDER BY g.id DESC`).all(...(req.user.role==='teacher'?[req.user.id]:[]));res.json(rows);
  });
  app.post('/api/manage/groups',auth(),role('admin','teacher'),wrap((req,res)=>{
    const courseId=id(req.body?.course_id),c=db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);
    if(!c||!(['admin','super_admin'].includes(req.user.role)||c.teacher_id===req.user.id))return reject(res,'Kursga huquq yo‘q',403);
    const name=asText(req.body?.name,120),capacity=Number(req.body?.capacity)||20;
    const teacherId=req.user.role==='teacher'?req.user.id:(id(req.body?.teacher_id)||c.teacher_id);
    if(name.length<2||capacity<1||capacity>1000)return reject(res,'Guruh nomi yoki sig‘imi noto‘g‘ri');
    if(teacherId){const u=db.prepare('SELECT role FROM users WHERE id=?').get(teacherId);if(!u||!['teacher','admin'].includes(u.role))return reject(res,'O‘qituvchi topilmadi');}
    const r=db.prepare('INSERT INTO study_groups(name,course_id,teacher_id,capacity,weekdays,time_slot) VALUES(?,?,?,?,?,?)').run(name,c.id,teacherId,capacity,asText(req.body?.weekdays,80),asText(req.body?.time_slot,40));audit(req,'create','group',r.lastInsertRowid);res.status(201).json({id:Number(r.lastInsertRowid)});
  }));
  app.get('/api/manage/groups/:id/students',auth(),role('admin','teacher'),(req,res)=>{
    const g=db.prepare('SELECT * FROM study_groups WHERE id=?').get(id(req.params.id));if(!g||!teacherAccess(g,req.user))return reject(res,'Ruxsat yo‘q',403);
    res.json(db.prepare('SELECT u.id,u.name,u.email FROM group_students gs JOIN users u ON u.id=gs.student_id WHERE gs.group_id=? ORDER BY u.name').all(g.id));
  });
  app.post('/api/manage/groups/:id/students',auth(),role('admin','teacher'),wrap((req,res)=>{
    const g=db.prepare('SELECT * FROM study_groups WHERE id=?').get(id(req.params.id)),studentId=id(req.body?.student_id);
    if(!g||!teacherAccess(g,req.user))return reject(res,'Ruxsat yo‘q',403);
    if(!db.prepare("SELECT 1 FROM users u JOIN enrollments e ON e.user_id=u.id WHERE u.id=? AND e.course_id=? AND u.role='student'").get(studentId,g.course_id))return reject(res,'O‘quvchi kursga yozilmagan');
    const count=db.prepare('SELECT COUNT(*) n FROM group_students WHERE group_id=?').get(g.id).n;
    if(count>=g.capacity&&!db.prepare('SELECT 1 FROM group_students WHERE group_id=? AND student_id=?').get(g.id,studentId))return reject(res,'Guruhda bo‘sh joy yo‘q');
    db.prepare('INSERT OR IGNORE INTO group_students(group_id,student_id) VALUES(?,?)').run(g.id,studentId);audit(req,'assign','group',g.id);res.json({ok:true});
  }));
  app.get('/api/manage/groups/:id/attendance',auth(),role('admin','teacher'),(req,res)=>{
    const g=db.prepare('SELECT * FROM study_groups WHERE id=?').get(id(req.params.id));if(!g||!teacherAccess(g,req.user))return reject(res,'Ruxsat yo‘q',403);
    res.json(db.prepare('SELECT * FROM class_sessions WHERE group_id=? ORDER BY session_date DESC LIMIT 100').all(g.id));
  });
  app.post('/api/manage/groups/:id/attendance',auth(),role('admin','teacher'),wrap((req,res)=>{
    const g=db.prepare('SELECT * FROM study_groups WHERE id=?').get(id(req.params.id));if(!g||!teacherAccess(g,req.user))return reject(res,'Ruxsat yo‘q',403);
    const date=asText(req.body?.date,10),entries=req.body?.entries,topic=asText(req.body?.topic,150);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||!Array.isArray(entries)||entries.length>g.capacity)return reject(res,'Davomat ma’lumoti noto‘g‘ri');
    const members=new Set(db.prepare('SELECT student_id FROM group_students WHERE group_id=?').all(g.id).map(x=>x.student_id));
    const found=new Set();for(const e of entries){const sid=id(e.student_id);if(!members.has(sid)||found.has(sid)||!['present','absent','late','excused'].includes(e.status))return reject(res,'Davomatdagi o‘quvchi yoki holat noto‘g‘ri');found.add(sid);}
    const save=db.transaction(()=>{
      db.prepare('INSERT INTO class_sessions(group_id,session_date,topic) VALUES(?,?,?) ON CONFLICT(group_id,session_date) DO UPDATE SET topic=excluded.topic').run(g.id,date,topic);
      const sid=db.prepare('SELECT id FROM class_sessions WHERE group_id=? AND session_date=?').get(g.id,date).id;
      const stmt=db.prepare('INSERT INTO attendance_records(session_id,student_id,status,marked_by) VALUES(?,?,?,?) ON CONFLICT(session_id,student_id) DO UPDATE SET status=excluded.status,marked_by=excluded.marked_by,updated_at=CURRENT_TIMESTAMP');
      for(const e of entries)stmt.run(sid,e.student_id,e.status,req.user.id);
      audit(req,'mark','attendance',sid);return sid;
    });res.json({ok:true,sessionId:save()});
  }));
  app.get('/api/me/attendance',auth(),(req,res)=>res.json(db.prepare(`SELECT a.status,s.session_date,s.topic,g.name AS group_name,c.title AS course_title FROM attendance_records a JOIN class_sessions s ON s.id=a.session_id JOIN study_groups g ON g.id=s.group_id JOIN courses c ON c.id=g.course_id WHERE a.student_id=? ORDER BY s.session_date DESC LIMIT 100`).all(req.user.id)));
};
