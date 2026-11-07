'use strict';
/* SQLite consistent backup; Railway users should also enable Volume Backups. */
require('dotenv').config();
const fs=require('fs'),path=require('path'),Database=require('better-sqlite3');
const dir=path.resolve(process.env.DATA_DIR||path.join(__dirname,'..','data'));
const source=path.join(dir,'markaz.db');
if(!fs.existsSync(source))throw Error('Markaz bazasi topilmadi: '+source);
const out=path.resolve(process.argv[2]||path.join(dir,'backups','markaz-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db'));
if(out===source)throw Error('Backup bazaning o‘ziga yozilmaydi');
fs.mkdirSync(path.dirname(out),{recursive:true});
const db=new Database(source,{readonly:true});db.backup(out).then(()=>{db.close();console.log('SQLite backup:',out);}).catch(e=>{db.close();console.error(e);process.exitCode=1;});
