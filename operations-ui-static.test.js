'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('Operations UI renders main role-specific views using mocked API data',async()=>{
 const rendered=[];
 const ctx=vm.createContext({Intl,Date,console,Promise,Number,Array,Object,String,Set,Error,localStorage:{},location:{hash:'#/ops'},S:{user:{id:1,role:'admin'}},forms:{},actions:{},routes:[],renderNav:()=>{},needLogin:()=>false,esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),view:html=>rendered.push(html),api:async url=>({ '/ops/assignments':[], '/manage/groups':[], '/ops/schedule':[], '/ops/invoices':[], '/ops/finance':{invoiced:0,received:0,outstanding:0,expenses:0}, '/ops/receipts':[], '/ops/people':[], '/ops/tickets':[], '/ops/certificates':[], '/courses':[], '/ops/salary':[], '/ops/parent/children':[] })[url]||[], toast:()=>{},guard:async f=>f(),confirm:()=>true,modal:()=>{},closeModal:()=>{}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/operations-ui.js'),'utf8'),ctx);
 for(const fn of ['opDash','opAssignmentPage','opSchedulePage','opInvoicesPage','opFinancePage','opLinkPage','opTicketsPage','opCertPage','opSalaryPage']){
  await vm.runInContext(`${fn}()`,ctx);assert.ok(rendered.at(-1).length>100,fn);
 }
 ctx.S.user={id:9,role:'parent'};
 await vm.runInContext('opParentPage()',ctx);assert.match(rendered.at(-1),/Farzandlarim/);
 assert.ok(ctx.routes.length>=11);
});
