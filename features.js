'use strict';

/** Real payment, courses chat, direct messages, live lessons + WebRTC signaling. */
module.exports = function installFeatures({ app, io, db, auth, role, getCourse, isManager, isEnrolled, bad, clean, activity, broadcastCourses }) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS orders(
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK(amount>0), status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, paid_at TEXT);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE TABLE IF NOT EXISTS payme_transactions(
    payme_id TEXT PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
    amount INTEGER NOT NULL, payme_time INTEGER NOT NULL, create_time INTEGER NOT NULL,
    perform_time INTEGER NOT NULL DEFAULT 0, cancel_time INTEGER NOT NULL DEFAULT 0,
    state INTEGER NOT NULL, reason INTEGER);
  CREATE INDEX IF NOT EXISTS idx_payme_order ON payme_transactions(order_id);
  CREATE TABLE IF NOT EXISTS live_lessons(
    id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL, starts_at TEXT NOT NULL, duration_min INTEGER NOT NULL DEFAULT 60,
    status TEXT NOT NULL DEFAULT 'scheduled', created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS idx_live_course ON live_lessons(course_id);
  CREATE TABLE IF NOT EXISTS messages(
    id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK ((course_id IS NOT NULL AND recipient_id IS NULL) OR (course_id IS NULL AND recipient_id IS NOT NULL)));
  CREATE INDEX IF NOT EXISTS idx_messages_course ON messages(course_id,id);
  CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id,id);
  CREATE TABLE IF NOT EXISTS notifications(
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL, href TEXT NOT NULL DEFAULT '#/me', read_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,id);
  `);
  const run = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  const numberId = id => { const n = Number(id); return Number.isSafeInteger(n) && n > 0 ? n : null; };
  const canSeeCourse = (courseId, user) => {
    const c = getCourse(numberId(courseId));
    return c && user && (isManager(c, user) || isEnrolled(c, user)) ? c : null;
  };
  const canDm = (a, b) => {
    if (!a || !b || a.id === b.id) return false;
    if (['admin','super_admin'].includes(a.role) || ['admin','super_admin'].includes(b.role)) return true;
    return !!db.prepare(`SELECT 1 FROM courses c LEFT JOIN enrollments ea ON ea.course_id=c.id AND ea.user_id=?
      LEFT JOIN enrollments eb ON eb.course_id=c.id AND eb.user_id=?
      WHERE (ea.user_id IS NOT NULL OR c.teacher_id=?) AND (eb.user_id IS NOT NULL OR c.teacher_id=?) LIMIT 1`).get(a.id,b.id,a.id,b.id);
  };
  const notify = (id, text, href) => {
    const note = db.prepare('INSERT INTO notifications(user_id,text,href) VALUES(?,?,?)').run(id, text.slice(0,250), href).lastInsertRowid;
    io.to('user:' + id).emit('notify', { id: Number(note), text, href });
  };
  const publicMessage = id => db.prepare(`SELECT m.id,m.course_id,m.recipient_id,m.sender_id,m.body,m.created_at,u.name AS sender_name
    FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?`).get(id);
  const roleAuth = [auth(), role('teacher','admin')];

  // v5 OFFLINE ACCOUNTING: do not accept merchant requests, even if legacy keys exist.
  app.all('/api/payments/checkout',(_req,res)=>res.status(410).json({error:'Onlayn to‘lov o‘chirilgan. To‘lovni administrator kiritadi.'}));
  app.all('/api/payments/payme',(_req,res)=>res.status(410).json({error:'To‘lov provayderi integratsiyasi o‘chirilgan.'}));
  // Preserve historical paid orders read-only for migration and audits.
  app.get('/api/payments/my', auth(), (req,res) => res.json(db.prepare(`SELECT o.id,o.course_id,o.amount,o.status,o.created_at,o.paid_at,c.title AS course_title
    FROM orders o JOIN courses c ON c.id=o.course_id WHERE o.user_id=? ORDER BY o.id DESC LIMIT 80`).all(req.user.id)));
  app.get('/api/admin/payments',auth(),role('admin'),(req,res)=>res.json(db.prepare(`SELECT o.id,o.course_id,o.user_id,o.amount,o.status,o.created_at,o.paid_at,c.title AS course_title,u.name AS user_name,u.email
    FROM orders o JOIN courses c ON c.id=o.course_id JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 500`).all()));

  // Messaging and conversations.
  app.get('/api/contacts', auth(), (req,res) => {
    const users=db.prepare('SELECT id,name,email,role FROM users WHERE id != ? ORDER BY name').all(req.user.id);
    res.json(users.filter(u=>canDm(req.user,u)));
  });
  app.get('/api/chat/course/:id', auth(), (req,res) => {
    const c=canSeeCourse(req.params.id,req.user); if(!c) return bad(res,"Kurs xabarlariga ruxsat yo'q",403);
    res.json(db.prepare(`SELECT m.id,m.sender_id,m.course_id,m.body,m.created_at,u.name sender_name FROM messages m
      JOIN users u ON u.id=m.sender_id WHERE m.course_id=? ORDER BY m.id DESC LIMIT 100`).all(c.id).reverse());
  });
  app.get('/api/chat/direct/:id', auth(), (req,res) => {
    const other=db.prepare('SELECT id,name,role FROM users WHERE id=?').get(numberId(req.params.id));
    if(!canDm(req.user,other)) return bad(res,"Shaxsiy yozishmaga ruxsat yo'q",403);
    res.json(db.prepare(`SELECT m.id,m.sender_id,m.recipient_id,m.body,m.created_at,u.name sender_name,(SELECT COUNT(*) FROM v6_message_reads r WHERE r.message_id=m.id AND r.reader_id=m.recipient_id) AS is_read FROM messages m
      JOIN users u ON u.id=m.sender_id WHERE (m.sender_id=? AND m.recipient_id=?) OR (m.sender_id=? AND m.recipient_id=?) ORDER BY m.id DESC LIMIT 100`)
      .all(req.user.id,other.id,other.id,req.user.id).reverse());
  });
  app.post('/api/chat/send', auth(), run((req,res)=>{
    if(typeof req.body.body !== 'string' || !req.body.body.trim() || req.body.body.length>2000) return bad(res,'Xabar 1–2000 belgi bo‘lishi kerak');
    const body=clean(req.body.body,2000);
    if(req.body.courseId) {
      const c=canSeeCourse(req.body.courseId,req.user); if(!c) return bad(res,"Kursga ruxsat yo'q",403);
      const id=db.prepare('INSERT INTO messages(sender_id,course_id,body) VALUES(?,?,?)').run(req.user.id,c.id,body).lastInsertRowid;
      const m=publicMessage(id); io.to('course:'+c.id).emit('chat:new',m); return res.json(m);
    }
    const other=db.prepare('SELECT id,name,role FROM users WHERE id=?').get(numberId(req.body.recipientId));
    if(!canDm(req.user,other)) return bad(res,"Shaxsiy yozishmaga ruxsat yo'q",403);
    const id=db.prepare('INSERT INTO messages(sender_id,recipient_id,body) VALUES(?,?,?)').run(req.user.id,other.id,body).lastInsertRowid;
    const m=publicMessage(id); io.to('user:'+req.user.id).to('user:'+other.id).emit('chat:new',m);
    notify(other.id,req.user.name+' sizga xabar yubordi','#/messages/'+req.user.id);
    res.json(m);
  }));
  app.get('/api/notifications',auth(),(req,res)=>res.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id)));
  app.post('/api/notifications/read',auth(),(req,res)=>{db.prepare('UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND read_at IS NULL').run(req.user.id);res.json({ok:true});});

  // Scheduling, starting and ending live lessons.
  app.get('/api/live',auth(),(req,res)=>{
    const sql=`SELECT l.*,c.title course_title,c.teacher_id, u.name teacher_name FROM live_lessons l JOIN courses c ON c.id=l.course_id LEFT JOIN users u ON u.id=c.teacher_id ORDER BY l.starts_at DESC LIMIT 200`;
    res.json(db.prepare(sql).all().filter(l=>canSeeCourse(l.course_id,req.user)));
  });
  app.post('/api/live',...roleAuth,run((req,res)=>{
    const c=getCourse(numberId(req.body.courseId)); if(!c || !isManager(c,req.user)) return bad(res,"Kursni boshqarish ruxsati yo'q",403);
    const title=clean(req.body.title,120),start=new Date(req.body.startsAt),duration=Number(req.body.durationMin)||60;
    if(title.length<3 || !Number.isFinite(start.getTime()) || duration<10 || duration>240) return bad(res,"Dars nomi, vaqti va davomiyligini to'g'ri kiriting");
    const id=db.prepare('INSERT INTO live_lessons(course_id,title,starts_at,duration_min,created_by) VALUES(?,?,?,?,?)').run(c.id,title,start.toISOString(),duration,req.user.id).lastInsertRowid;
    db.prepare('SELECT user_id FROM enrollments WHERE course_id=?').all(c.id).forEach(r=>notify(r.user_id,`Yangi jonli dars: ${title}`,'#/live/'+id));
    io.emit('live:changed'); res.json({id:Number(id)});
  }));
  app.put('/api/live/:id/status',...roleAuth,run((req,res)=>{
    const l=db.prepare('SELECT * FROM live_lessons WHERE id=?').get(numberId(req.params.id));
    if(!l || !isManager(getCourse(l.course_id),req.user)) return bad(res,"Ruxsat yo'q",403);
    if(!['live','ended'].includes(req.body.status) || l.status==='ended') return bad(res,"Dars holatini o'zgartirib bo'lmaydi");
    db.prepare('UPDATE live_lessons SET status=? WHERE id=?').run(req.body.status,l.id);
    if(req.body.status==='live') db.prepare('SELECT user_id FROM enrollments WHERE course_id=?').all(l.course_id).forEach(r=>notify(r.user_id,`Dars boshlandi: ${l.title}`,'#/live/'+l.id));
    io.to('live:'+l.id).emit('live:status',{id:l.id,status:req.body.status}); io.emit('live:changed');
    res.json({ok:true});
  }));
  app.delete('/api/live/:id',...roleAuth,run((req,res)=>{
    const l=db.prepare('SELECT * FROM live_lessons WHERE id=?').get(numberId(req.params.id));
    if(!l || !isManager(getCourse(l.course_id),req.user)) return bad(res,"Ruxsat yo'q",403);
    if(l.status==='live') return bad(res,"Dars davom etmoqda",409);
    db.prepare('DELETE FROM live_lessons WHERE id=?').run(l.id); io.emit('live:changed');res.json({ok:true});
  }));
  app.get('/api/live/:id',auth(),(req,res)=>{
    const l=db.prepare(`SELECT l.*,c.title course_title,u.name teacher_name FROM live_lessons l JOIN courses c ON c.id=l.course_id LEFT JOIN users u ON u.id=c.teacher_id WHERE l.id=?`).get(numberId(req.params.id));
    if(!l || !canSeeCourse(l.course_id,req.user)) return bad(res,"Dars topilmadi yoki ruxsat yo'q",403);
    res.json({...l,canManage:isManager(getCourse(l.course_id),req.user),iceServers: (() => {
      const servers=[{urls:'stun:stun.l.google.com:19302'}];
      if(process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_PASSWORD) servers.push({urls:process.env.TURN_URL,username:process.env.TURN_USERNAME,credential:process.env.TURN_PASSWORD});
      return servers;
    })()});
  });
  app.get('/api/admin/overview',auth(),role('admin'),(req,res)=>{
    const n=q=>db.prepare(q).get().n;
    res.json({ paidOrders:n("SELECT COUNT(*) n FROM orders WHERE status='paid'"),
      revenue:n("SELECT COALESCE(SUM(amount),0) n FROM orders WHERE status='paid'"),
      liveLessons:n("SELECT COUNT(*) n FROM live_lessons WHERE status='live'"),
      messages:n('SELECT COUNT(*) n FROM messages') });
  });

  // Separate connection listener so base server keeps its other realtime events intact.
  io.on('connection',socket=>{
    socket.on('course:join',({courseId}={})=>{
      if(canSeeCourse(courseId,socket.user)) socket.join('course:'+Number(courseId));
    });
    socket.on('course:leave',({courseId}={})=>socket.leave('course:'+Number(courseId)));
    socket.on('live:join',({lessonId}={},ack)=>{
      const l=db.prepare('SELECT * FROM live_lessons WHERE id=?').get(numberId(lessonId));
      if(!l || l.status!=='live' || !canSeeCourse(l.course_id,socket.user)) return ack?.({error:"Dars faol emas yoki ruxsat yo'q"});
      const room='live:'+l.id, peers=[...(io.sockets.adapter.rooms.get(room)||[])].filter(id=>id!==socket.id);
      if(peers.length>=7) return ack?.({error:'Bu video xonada ko‘pi bilan 8 ishtirokchi bo‘la oladi'});
      socket.join(room); socket.data.liveRoom=room;
      ack?.({ok:true,peers});socket.to(room).emit('live:peer-joined',{socketId:socket.id,name:socket.user.name});
    });
    socket.on('live:signal',({lessonId,target,signal}={})=>{
      const room='live:'+numberId(lessonId); if(!room || !socket.rooms.has(room) || !io.sockets.adapter.rooms.get(room)?.has(target)) return;
      if(!signal || typeof signal!=='object' || JSON.stringify(signal).length>20000) return;
      io.to(target).emit('live:signal',{from:socket.id,signal,name:socket.user?.name});
    });
    const leave=()=>{if(socket.data.liveRoom){const room=socket.data.liveRoom;socket.to(room).emit('live:peer-left',{socketId:socket.id});socket.leave(room);delete socket.data.liveRoom;}};
    socket.on('live:leave',leave);socket.on('disconnecting',leave);
  });
};
