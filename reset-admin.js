'use strict';
// Safe, explicit operator action: updates only an EXISTING sole administrator.
// Must be run from the deployed service with its correct DATA_DIR and configured secrets.
require('dotenv').config();
const fs=require('fs'),path=require('path');
const Database=require('better-sqlite3'),bcrypt=require('bcryptjs');
const email=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
const pass=String(process.env.ADMIN_PASSWORD||'');
if(!email.match(/^\S+@\S+\.\S+$/)||pass.length<12)throw Error('ADMIN_EMAIL va 12+ belgili ADMIN_PASSWORD shart');
const dbFile=path.join(process.env.DATA_DIR||path.join(__dirname,'..','data'),'markaz.db');
if(!fs.existsSync(dbFile))throw Error('Ma’lumotlar bazasi topilmadi: '+dbFile+' (yo‘q bazani yaratmaymiz)');
const db=new Database(dbFile,{fileMustExist:true});
try{
  const admins=db.prepare("SELECT id,email FROM users WHERE role='admin'").all();
  if(admins.length!==1)throw Error('Adminlar soni '+admins.length+'; avtomatik o‘zgartirish xavfsiz emas');
  const other=db.prepare('SELECT id FROM users WHERE email=? AND id!=?').get(email,admins[0].id);
  if(other)throw Error('Bu email boshqa foydalanuvchida mavjud');
  if(db.pragma('table_info(users)').some(c=>c.name==='session_version'))
    db.prepare('UPDATE users SET email=?,password=?,session_version=session_version+1 WHERE id=?').run(email,bcrypt.hashSync(pass,12),admins[0].id);
  else db.prepare('UPDATE users SET email=?,password=? WHERE id=?').run(email,bcrypt.hashSync(pass,12),admins[0].id);
  console.log('Mavjud yagona admin akkaunti yangilandi. Email:',email);
}finally{db.close();}
