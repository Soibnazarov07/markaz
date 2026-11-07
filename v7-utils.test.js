'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {positive,date,month,csv,canManageGroup,roles}=require('../v7-utils');
test('role catalog is explicit',()=>assert.deepEqual(roles,['super_admin','admin','branch_manager','teacher','student','parent','accountant']));
test('numeric identifiers are safe',()=>{assert.equal(positive('24'),24);assert.equal(positive('-1'),null);assert.equal(positive('hello'),null);assert.equal(positive('9007199254740993'),null);});
test('date and month validation',()=>{assert.equal(date('2026-11-07'),true);assert.equal(date('2026-02-30'),false);assert.equal(month('2026-11'),true);assert.equal(month('2026-15'),false);});
test('CSV escapes formulas and quotes',()=>{const s=csv([['x','y'],['=1+2','Hello,"world"'],['-8','abc']]);assert.ok(s.includes("'=1+2"));assert.ok(s.includes('"Hello,""world"""'));assert.ok(s.includes("'-8"));});
test('group access denies unrelated teacher or manager',()=>{const db={prepare:()=>({get:(uid,bid)=>uid===15&&bid===3?{valid:true}:null})},g={id:1,teacher_id:4,branch_id:3};assert.equal(canManageGroup(db,{role:'admin'},g),true);assert.equal(canManageGroup(db,{role:'teacher',id:4},g),true);assert.equal(canManageGroup(db,{role:'teacher',id:5},g),false);assert.equal(canManageGroup(db,{role:'branch_manager',id:15},g),true);assert.equal(canManageGroup(db,{role:'branch_manager',id:9},g),false);});
