'use strict';
/** One-shot online SQLite backup with verification and retention. Run via Railway Cron, not in parallel app service. */
require('dotenv').config();
const Database=require('better-sqlite3');const fs=require('fs'),path=require('path');
(async()=>{const dir=path.resolve(process.env.DATA_DIR||path.join(__dirname,'..','data')),src=path.join(dir,'markaz.db');
if(!fs.existsSync(src))throw Error('Baza mavjud emas: '+src);
const backups=path.join(dir,'backups');fs.mkdirSync(backups,{recursive:true});
const dst=path.join(backups,'markaz-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');const db=new Database(src,{readonly:true});
try{await db.backup(dst);}finally{db.close();}
const check=new Database(dst,{readonly:true});try{const result=check.pragma('integrity_check',{simple:true});if(result!=='ok')throw Error('Backup integrity_check noto‘g‘ri: '+result);}finally{check.close();}
const keep=Math.max(3,Math.min(30,Number(process.env.BACKUP_RETENTION)||7));const files=fs.readdirSync(backups).filter(x=>/^markaz-\d{4}-.*\.db$/.test(x)).sort().reverse();for(const f of files.slice(keep))fs.unlinkSync(path.join(backups,f));console.log('Backup verified:',dst,'retained',Math.min(files.length,keep));
})().catch(e=>{console.error(e);process.exitCode=1;});
