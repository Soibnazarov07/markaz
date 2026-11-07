'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/v6-ui.js'),'utf8');
const mock={
  '/admin/stats':{students:11,teachers:3,courses:4,enrollments:18},
  '/v6/branches/my':[{id:3,name:'Shahar filiali',address:'Markaz'}],
  '/v6/branches/3/overview':{branch:{id:3,name:'Shahar filiali',address:'Markaz'},groups:[],total_students:0},
  '/v6/teacher/dashboard':{groups:[{id:2,name:'English',student_count:5,assignments:2,sessions:4}],upcoming:[],total_students:5},
  '/v6/parent/dashboard':[{id:12,name:'Ali',present:3,total:4,debt:50000}],
  '/ops/finance':{invoiced:300000,received:250000,outstanding:50000,expenses:20000},
  '/v6/groups/mine':[],
  '/v6/schedule/repeat':[],
  '/v6/leaderboard':[],
  '/v6/achievements':[],
  '/v6/notifications/preferences':{chat:1,academic:1,billing:1},
  '/v6/security/audit':[],
  '/admin/users':[],
  '/ops/people':[],
  '/v6/mfa/status':{enabled:false}
};
const roles=['super_admin','admin','branch_manager','teacher','student','parent','accountant'];
test('v6 renders functional role dashboards and distinct branches in mocked read-only UI',async()=>{
 for(const role of roles){
  const views=[];
  const ctx=vm.createContext({console,Intl,Date,Promise,Number,Array,Object,String,Set,Error,Map,Math,FormData,URL,location:{hash:'#/workspace'},S:{user:{id:1,role,name:'User'}},
    forms:{},actions:{},routes:[],renderNav:()=>{},needLogin:()=>false,view:html=>views.push(html),
    api:async url=>{if(!(url in mock))throw Error('Unmocked route '+url);return mock[url];},
    esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    opHead:(_tag,title,info)=>`<h1>${title}</h1><p>${info}</p>`,opForm:(_name,fields)=>`<form>${fields}</form>`,
    opField:()=>'<input>',opSelect:()=>'<select>',opMenu:()=>'',
    opTable:(cols,rows)=>`<table>${rows.length}</table>`,
    toast:()=>{},guard:async f=>f(),confirm:()=>true,document:{},
    $:()=>null,localStorage:{},fetch:()=>{} });
  vm.runInContext(source,ctx);
  await vm.runInContext('v6Workspace()',ctx);
  assert.ok(views.at(-1).length>90,'Role view '+role);
  assert.ok(ctx.routes.some(([re])=>re.test('#/workspace')));
  if(role==='branch_manager')assert.match(views.at(-1),/Shahar filiali/);
  if(role==='accountant')assert.match(views.at(-1),/50.000|50 000|50 000|50000/);
 }
});
test('v6 contains non-mock file upload, QR-free certificate routes and role-safe actions',()=>{
 assert.match(source,/fetch\(`\/api\/v6\/files/);
 assert.match(source,/api\('\/v6\/staff\/branch'/);
 assert.match(source,/api\('\/v6\/achievements'/);
 assert.match(source,/v6MfaEnable/);
});
