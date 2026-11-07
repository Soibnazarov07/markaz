'use strict';
/** Optional RFC 6238 TOTP for privileged accounts, replay-resistant. Secret encrypted at rest. */
const crypto=require('crypto');
module.exports=function initMfa({app,db,auth,SECRET}){
  db.exec(`CREATE TABLE IF NOT EXISTS v6_totp(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,cipher TEXT NOT NULL,iv TEXT NOT NULL,tag TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,last_counter INTEGER NOT NULL DEFAULT -1);`);
  const key=crypto.createHash('sha256').update(SECRET+':mfa:v6').digest();
  const encrypt=raw=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(raw,'utf8'),cipher.final()]);return {cipher:data.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')};};
  const decrypt=row=>{const c=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(row.iv,'base64'));c.setAuthTag(Buffer.from(row.tag,'base64'));return Buffer.concat([c.update(Buffer.from(row.cipher,'base64')),c.final()]).toString('utf8');};
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const encode32=buf=>{let bits=0,v=0,s='';for(const x of buf){v=(v<<8)|x;bits+=8;while(bits>=5){s+=alphabet[(v>>(bits-=5))&31];}}if(bits)s+=alphabet[(v<<(5-bits))&31];return s;};
  const decode32=s=>{let v=0,b=0,arr=[];for(const c of s.toUpperCase()){const x=alphabet.indexOf(c);if(x<0)throw Error('Noto‘g‘ri MFA kaliti');v=(v<<5)|x;b+=5;if(b>=8){b-=8;arr.push((v>>b)&255);}}return Buffer.from(arr);};
  const otp=(secret,counter)=>{const data=Buffer.alloc(8);data.writeBigUInt64BE(BigInt(counter));const h=crypto.createHmac('sha1',decode32(secret)).update(data).digest();const pos=h[h.length-1]&15;const val=(h.readUInt32BE(pos)&0x7fffffff)%1000000;return String(val).padStart(6,'0');};
  const check=(row,value)=>{if(!/^\d{6}$/.test(String(value||'')))return -1;const now=Math.floor(Date.now()/30000);for(const counter of [now-1,now,now+1]){if(counter<=row.last_counter)continue;const expected=Buffer.from(otp(decrypt(row),counter)),given=Buffer.from(String(value));if(crypto.timingSafeEqual(expected,given))return counter;}return -1;};
  const fail=(res,m,c=400)=>res.status(c).json({error:m});
  const needsTOTP=uid=>!!db.prepare('SELECT enabled FROM v6_totp WHERE user_id=? AND enabled=1').get(uid);
  // Called only after successful password hash comparison.
  const verifyLogin=(uid,code)=>{const row=db.prepare('SELECT * FROM v6_totp WHERE user_id=? AND enabled=1').get(uid);if(!row)return {ok:true};const counter=check(row,code);if(counter<0)return {ok:false};const r=db.prepare('UPDATE v6_totp SET last_counter=? WHERE user_id=? AND last_counter<?').run(counter,uid,counter);return {ok:r.changes===1};};
  app.get('/api/v6/mfa/status',auth(),(req,res)=>res.json({enabled:needsTOTP(req.user.id)}));
  app.post('/api/v6/mfa/setup',auth(),(req,res)=>{
    if(needsTOTP(req.user.id))return fail(res,'MFA allaqachon yoqilgan',409);
    const secret=encode32(crypto.randomBytes(20)),data=encrypt(secret);
    db.prepare('INSERT INTO v6_totp(user_id,cipher,iv,tag,enabled,last_counter) VALUES(?,?,?,?,0,-1) ON CONFLICT(user_id) DO UPDATE SET cipher=excluded.cipher,iv=excluded.iv,tag=excluded.tag,enabled=0,last_counter=-1').run(req.user.id,data.cipher,data.iv,data.tag);
    const issuer=encodeURIComponent('EduSphere Pro');const account=encodeURIComponent(req.user.email);
    res.json({secret,otpauth_url:`otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`});
  });
  app.post('/api/v6/mfa/enable',auth(),(req,res)=>{
    const row=db.prepare('SELECT * FROM v6_totp WHERE user_id=?').get(req.user.id);if(!row)return fail(res,'Avval MFA sozlang');
    const counter=check(row,req.body.code);if(counter<0)return fail(res,'Bir martalik kod noto‘g‘ri',401);
    db.prepare('UPDATE v6_totp SET enabled=1,last_counter=? WHERE user_id=?').run(counter,req.user.id);res.json({ok:true});
  });
  app.post('/api/v6/mfa/disable',auth(),(req,res)=>{
    const row=db.prepare('SELECT * FROM v6_totp WHERE user_id=? AND enabled=1').get(req.user.id);if(!row)return fail(res,'MFA yoqilmagan',409);
    const counter=check(row,req.body.code);if(counter<0)return fail(res,'Kod noto‘g‘ri',401);
    const u=db.prepare('SELECT password FROM users WHERE id=?').get(req.user.id);
    if(!require('bcryptjs').compareSync(String(req.body.password||''),u.password))return fail(res,'Parol noto‘g‘ri',401);
    db.prepare('DELETE FROM v6_totp WHERE user_id=?').run(req.user.id);res.json({ok:true});
  });
  return {needsTOTP,verifyLogin};
};
