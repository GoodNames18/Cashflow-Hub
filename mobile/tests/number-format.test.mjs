import test from 'node:test';import assert from 'node:assert/strict';
import {formatAmount,formatNoteNumbers,numberValue} from '../../supabase/cfh-number-format.mjs';
import {cashMovement} from '../../supabase/cfh-portfolio-model.mjs';
import {estimatePurchaseFees} from '../../supabase/cfh-portfolio-fees.mjs';
test('display separators preserve amounts, decimal precision, negatives and partial typing',()=>{
 for(const [input,want] of [['1000','1,000'],['12500.50','12,500.50'],['-1000000.05','-1,000,000.05'],['1000.','1,000.'],['.','.'],['-','-'],['1,000','1,000'],['0.00012345','0.00012345']])assert.equal(formatAmount(input),want);
 assert.equal(numberValue('12,500.50'),12500.5);assert.equal(numberValue('-1,000'),-1000);
});
test('notes format amounts and math without changing dates, phones, card numbers or IDs',()=>{
 for(const [input,want] of [['12500.50 Cecil','12,500.50 Cecil'],['1000 + 2000 =','1,000 + 2,000 ='],['1000 - 2000 =','1,000 - 2,000 ='],['1000000 Cecil','1,000,000 Cecil'],['2026-11-21 09:30','2026-11-21 09:30'],['09123456789','09123456789'],['+63 912 345 6789','+63 912 345 6789'],['Card 1234567890123456','Card 1234567890123456'],['ID: 12345','ID: 12345'],['AB12345','AB12345'],['₱12500.50','₱12,500.50']])assert.equal(formatNoteNumbers(input),want,input);
});
test('comma-formatted finance inputs retain exact amounts in calculations',()=>{
 assert.equal(cashMovement([],{asset:'stock',action:'deposit',broker:'COL Financial',amount:String(numberValue('12,500.50'))},'cash').price,12500.5);
 assert.equal(estimatePurchaseFees({asset:'stock',broker:'COL Financial',date:'2026-11-21',shares:'1,000',price:'1,000'}).amount,2950);
});

test('typing a date removes grouping previously inserted into its year',()=>{
 let text='';for(const char of '2026-11-21')text=formatNoteNumbers(text+char);
 assert.equal(text,'2026-11-21');
});
