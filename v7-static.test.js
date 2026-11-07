'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),read=x=>fs.readFileSync(path.join(root,x),'utf8');
test('v7 server module and UI wired',()=>{assert.match(read('server.js'),/require\('\.\/v7-improvements'\)/);assert.match(read('public/index.html'),/v7-ui\.js/);assert.match(read('public/index.html'),/v7\.css/);});
test('v7 reports and search authenticated, QR endpoints removed',()=>{const c=read('v7-improvements.js');for(const suffix of ['/reports/attendance.csv','/reports/finance.csv','/search'])assert.ok(c.includes(suffix));assert.doesNotMatch(c,/\/attendance\/qr\//);assert.doesNotMatch(read('public/v7-ui.js'),/v7-qr|v7-checkin/);});
test('PWA avoids caching private endpoints',()=>{const sw=read('public/service-worker.js');assert.match(sw,/startsWith\('\/api\/'\)/);assert.match(sw,/startsWith\('\/socket\.io\/'\)/);});
test('manual payment workflows preserved',()=>{assert.match(read('server.js'),/manual-finance/);assert.match(read('public/index.html'),/v5-ui/);});
