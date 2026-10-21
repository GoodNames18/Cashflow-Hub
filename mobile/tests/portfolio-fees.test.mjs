import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estimatePurchaseFees as estimate,resolvePurchaseFees} from '../../supabase/cfh-portfolio-fees.mjs';
const input={broker:'COL Financial',date:'2026-03-27',shares:100,price:38.75};
test('COL invoice examples and historical minimum',()=>{assert.equal(estimate(input).amount,11.43);assert.equal(estimate({...input,price:43.75}).amount,12.91);assert.equal(estimate({...input,date:'2024-06-02'}).commission,20);assert.equal(estimate({...input,date:'2024-06-03'}).commission,9.69);assert.equal(estimate({...input,shares:20000,price:5}).amount,295);});
test('IPO, crypto, unsupported broker, incomplete entries require invoice fees',()=>{for(const change of [{purchaseType:'ipo'},{asset:'crypto'},{broker:'DragonFi Lite (Maya)'},{shares:0},{date:''}])assert.equal(estimate({...input,...change}).amount,null);});
test('manual fee including zero survives input changes and auto can be restored',()=>{assert.equal(resolvePurchaseFees({...input,price:50},'manual','2.02').value,'2.02');assert.equal(resolvePurchaseFees(input,'manual','0').value,'0');assert.equal(resolvePurchaseFees(input,'auto','2.02').value,'11.43');});
