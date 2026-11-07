'use strict';
/** CLI only. Usage: SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... npm run superadmin:create */
require('dotenv').config();
const path=require('path'),fs=require('fs'),bcrypt=require('bcryptjs');
const Database=require('better-sqlite3');
const dir=process.env.DATA_DIR||path.join(__dirname,'..','data');
const file=path.join(dir,'markaz.db');
const email=String(process.env.SUPER_ADMIN_EMAIL||'').trim().toLowerCase(),password=String(process.env.SUPER_ADMIN_PASSWORD||'');
if(!fs.existsSync(file))throw Error('Baza topilmadi; avval serverni ishga tushiring');
if(!/^\S+@\S+\.\S+$/.test(email)||password.length<16)throw Error('SUPER_ADMIN_EMAIL va 16+ belgili SUPER_ADMIN_PASSWORD sozlang');
const db=new Database(file);
try{
  const rows=db.prepare("SELECT COUNT(*) n FROM users WHERE role='super_admin'").get().n;
  if(rows)throw Error('Super admin mavjud. Takror yaratilmaydi.');
  const user=db.prepare('SELECT id,role FROM users WHERE email=?').get(email);
  if(user){if(user.role!=='admin')throw Error('Email admin akkauntiga tegishli emas');db.prepare("UPDATE users SET role='super_admin',password=?,session_version=session_version+1 WHERE id=?").run(bcrypt.hashSync(password,12),user.id);}
  else db.prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'super_admin')").run('Super Administrator',email,bcrypt.hashSync(password,12));
  console.log('Super admin yaratildi. Muhim: maxfiy Variables qiymatini ish tugagach olib tashlang.');
}finally{db.close();}
