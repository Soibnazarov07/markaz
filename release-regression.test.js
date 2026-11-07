'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');

test('All cash and bank receipt writes go through one audited transaction',()=>{
  const ops=read('operations.js'), manual=read('manual-finance.js');
  assert.match(ops,/app\.locals\.recordManualPayment\(req,res,next\)/);
  assert.doesNotMatch(ops,/INSERT INTO ops_receipts\s*\(/);
  assert.match(manual,/const pay=db\.transaction\(/);
  assert.match(manual,/const recordManualPayment=/);
  assert.match(manual,/app\.locals\.recordManualPayment=recordManualPayment/);
  assert.match(manual,/paid_on/);
  assert.match(manual,/voided_at/);
  assert.match(manual,/ops_payment_events/);
});
test('super admin may view finance without student data leaked to guests',()=>{
  const ops=read('operations.js'),man=read('manual-finance.js');
  assert.match(ops,/const finance=u=>\['admin','super_admin','accountant'\]/);
  assert.match(man,/else if\(\['admin','super_admin','accountant'\]/);
  assert.match(ops,/app\.get\('\/api\/ops\/invoices',auth\(\)/);
});
test('user role changes revoke old JWT version and live sockets',()=>{
  const server=read('server.js');
  assert.match(server,/UPDATE users SET role=\?,session_version=session_version\+1/);
  assert.match(server,/io\.in\('user:' \+ req\.params\.id\)\.disconnectSockets\(true\)/);
  assert.match(server,/Number\(p\.sv \?\? 0\)/);
  assert.match(server,/app\.use\('\/api', \(_req, res\) => res\.status\(404\)/);
});
test('no external payment gateways, email password recovery or QR attendance',()=>{
  const features=read('features.js'),server=read('server.js');
  assert.match(features,/\/api\/payments\/checkout'[\s\S]*?410/);
  assert.match(features,/\/api\/payments\/payme'[\s\S]*?410/);
  assert.doesNotMatch(server,/forgot-password|\/api\/v7\/attendance\/qr/);
});
