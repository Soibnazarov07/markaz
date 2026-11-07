'use strict';
// Isolated authorization + update logic tests. No external npm dependencies required.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const fakeBcrypt = {
  hashSync: password => 'hash:' + password,
  compareSync: (value, hash) => hash === 'hash:' + value
};
let init;
try {
  Module._load = function (request, parent, isMain) {
    if (request === 'bcryptjs') return fakeBcrypt;
    return originalLoad.call(this, request, parent, isMain);
  };
  init = require('../admin-credentials');
} finally { Module._load = originalLoad; }

function setup() {
  const users = new Map([
    [1, { id:1, role:'admin', password:'hash:AdminPassword!2026', session_version:0 }],
    [2, { id:2, role:'student', password:'hash:StudentPassword123', session_version:0 }],
    [3, { id:3, role:'admin', password:'hash:OtherAdminPassword', session_version:0 }],
    [4, { id:4, role:'super_admin', password:'hash:SuperPassword1234', session_version:0 }]
  ]);
  const audit = [], events = [], disconnected = [];
  const totp = new Set([2]);
  const app = { put(path, ...middlewares) { assert.equal(path, '/api/admin/users/:id/password'); this.middleware = middlewares; this.handler = middlewares.at(-1); } };
  const db = {
    prepare(sql) {
      if (sql.startsWith('SELECT id,role,password')) return { get: id => users.get(Number(id)) };
      if (sql.startsWith('UPDATE users SET password')) return { run(hash, id) { const u=users.get(Number(id));u.password=hash;u.session_version++;return { changes:1 }; } };
      if (sql.startsWith('DELETE FROM v6_totp')) return { run(id) { totp.delete(Number(id)); return { changes:1 }; } };
      if (sql.includes('INSERT INTO v6_activity_log')) return { run(actor, id, details) {audit.push({actor,id,details});} };
      throw new Error('Unexpected SQL: ' + sql);
    },
    transaction(fn) { return fn; }
  };
  const io = {
    to(room) { return { emit(...args) {events.push({room,args});} }; },
    in(room) { return { disconnectSockets(force) { disconnected.push({room,force}); } }; }
  };
  const auth = () => () => {};
  const role = (...allowed) => { assert.deepEqual(allowed,['admin','super_admin']);return () => {}; };
  init({app,db,io,auth,role});
  assert.equal(app.middleware.length,3);
  async function request(actorId, targetId, body) {
    const req={user:{id:actorId,role:users.get(actorId)?.role??'student'},params:{id:String(targetId)},body};
    const res={statusCode:200,status(n){this.statusCode=n;return this;},json(obj){this.body=obj;return this;}};
    let failure=null;
    app.handler(req,res,err=>{failure=err;});
    if(failure)throw failure;
    return {status:res.statusCode, body:res.body};
  }
  return {request,users,audit,events,disconnected,totp};
}
const valid = {admin_password:'AdminPassword!2026',new_password:'Replacement12345!'};

test('admin recovery updates password, audit, 2FA, and increments session_version',async()=>{
  const s=setup();const result=await s.request(1,2,{...valid,reset_2fa:true});
  assert.deepEqual(result,{status:200,body:{ok:true,logout_required:false}});
  assert.equal(s.users.get(2).password,'hash:Replacement12345!');
  assert.equal(s.users.get(2).session_version,1);
  assert.equal(s.audit.length,1);assert.equal(s.audit[0].actor,1);
  assert.equal(s.totp.has(2),false);
  assert.deepEqual(s.disconnected,[{room:'user:2',force:true}]);
});

test('admin recovery rejects wrong admin password without touching account',async()=>{
  const s=setup();const out=await s.request(1,2,{admin_password:'bad',new_password:'NewPassword12345!'});
  assert.equal(out.status,403);assert.equal(s.users.get(2).session_version,0);assert.equal(s.audit.length,0);
});

test('normal admin cannot reset another admin or super admin',async()=>{
  const s=setup();assert.equal((await s.request(1,3,valid)).status,403);
  assert.equal((await s.request(1,4,valid)).status,403);
});

test('super admin may reset other admin after reauthentication but not another super admin',async()=>{
  const s=setup();const out=await s.request(4,3,{admin_password:'SuperPassword1234',new_password:'NewAdminPassword1234'});
  assert.equal(out.status,200);assert.equal(s.users.get(3).session_version,1);
});

test('admin may rotate own password but must re-login',async()=>{
  const s=setup();const result=await s.request(1,1,{admin_password:'AdminPassword!2026',new_password:'DifferentPassword12345!'});
  assert.equal(result.body.logout_required,true);assert.equal(s.users.get(1).session_version,1);
});

test('password policy, missing user, role guard and no changes on invalid input',async()=>{
  const s=setup();assert.equal((await s.request(1,2,{...valid,new_password:'short'})).status,400);
  assert.equal((await s.request(1,2,{...valid,new_password:'StudentPassword123'})).status,400);
  assert.equal((await s.request(1,100,valid)).status,404);
  assert.equal((await s.request(2,1,valid)).status,403);
  assert.equal(s.users.get(2).session_version,0);
});
