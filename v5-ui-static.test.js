'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('v5 manual payment, academic test and report UI render in sandbox', async()=>{
 const out=[];
 const context=vm.createContext({Intl,Date,console,Promise,Number,Array,Object,String,Set,Error,Map,Math,FormData,localStorage:{},
 location:{hash:'#/ops'},S:{user:{id:1,role:'admin',name:'Administrator'}},forms:{},actions:{},routes:[],renderNav:()=>{},needLogin:()=>false,
 esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 view:html=>out.push(html),api:async url=>({ '/ops/manual-payments':[], '/ops/invoices':[], '/ops/people':[{'id':22,'name':'O‘quvchi','role':'student'}],'/courses':[], '/ops/assignments':[],'/manage/groups':[], '/v5/announcements':[], '/v5/profiles':{rows:[],total:0,page:1,pages:0}, '/v5/exams':[], '/ops/manual-payments/report?month=2026-11':{month:'2026-11',summary:[],rows:[],total:0}, '/v5/reports/summary?month=2026-11':{income:0,expenses:0,debts:0,students:0,teachers:0,groups:0,unpaid:[]}})[url]||[],
 toast:()=>{},guard:async f=>f(),confirm:()=>true,modal:()=>{},closeModal:()=>{},prompt:()=>null});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/operations-ui.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/v5-ui.js'),'utf8'),context);
 const pages=['v5ManualPayments','v5Profiles','v5Announcements','ex5List'];
 for(const page of pages){await vm.runInContext(`${page}()`,context);assert.ok(out.at(-1).length>120,page);}
 assert.match(out[0],/To‘lovlar tarixi/);
 assert.ok(context.routes.some(r=>String(r[0]).includes('ops')));
});
