import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolio,cashMovement,validateRecord} from '../../supabase/cfh-portfolio-model.mjs';
const start={id:'start',at:'2026-10-22T10:00:00Z',kind:'cash',asset:'stock',broker:'DragonFi',price:484.60};
const movement=(rows,action,broker,toBroker,amount,id='move')=>cashMovement(rows,{action,broker,toBroker,amount,asset:'stock'},id,'2026-10-22T10:01:00Z');
test('deposit and withdrawal change only the chosen cash balance and preserve investments',()=>{
 const rows=[start,{kind:'purchase',asset:'stock',broker:'DragonFi',symbol:'AREIT',date:'2026-10-20',price:40,shares:10,fees:0,id:'buy',at:'2026-10-21T00:00:00Z'}];
 rows.push(movement(rows,'deposit','COL Financial',null,'1000'));
 rows.push({...movement(rows,'withdraw','DragonFi',null,'84.60','withdraw'),at:'2026-10-22T10:02:00Z'});
 assert.equal(portfolio(rows).cashAvailable,1400);assert.equal(portfolio(rows,'stock','DragonFi').cashAvailable,400);assert.equal(portfolio(rows,'stock','COL Financial').cashAvailable,1000);assert.equal(portfolio(rows).invested,400);
});
test('all six broker transfer directions update both sides as one serializable record',()=>{
 const names=['COL Financial','DragonFi','DragonFi Lite (Maya)'];
 for(const from of names)for(const to of names){if(from===to)continue;
 const rows=names.map((broker,i)=>({...start,id:String(i),broker,price:1000}));const move=movement(rows,'transfer',from,to,'250.25');rows.push(JSON.parse(JSON.stringify(move)));
 assert.equal(portfolio(rows).cashAvailable,3000);assert.equal(portfolio(rows,'stock',from).cashAvailable,749.75);assert.equal(portfolio(rows,'stock',to).cashAvailable,1250.25);assert.equal(rows.length,4);
 }
});
test('rejects insufficient cash, same broker, invalid amounts and incomplete records',()=>{
 for(const amount of ['','0','-1','1.234','abc','1e3'])assert.throws(()=>movement([start],'deposit','DragonFi',null,amount));
 assert.throws(()=>movement([start],'withdraw','DragonFi',null,'500'),/Not enough/);
 assert.throws(()=>movement([start],'transfer','DragonFi','DragonFi','1'),/different/);
 assert.throws(()=>movement([start],'transfer','DragonFi','','1'));
 assert.throws(()=>movement([start],'bogus','DragonFi',null,'1'));
 assert.throws(()=>movement([start],undefined,'DragonFi',null,'1'));
});
test('legacy balance snapshots and asset separation remain compatible',()=>{
 const rows=[start,movement([start],'deposit','DragonFi',null,'15.40'),{...start,id:'new',at:'2026-10-22T10:02:00Z',price:300},{...start,id:'coin',asset:'crypto',price:75}];
 assert.equal(portfolio(rows).cashAvailable,300);assert.equal(portfolio(rows,'crypto').cashAvailable,75);assert.equal(validateRecord(start),start);
});
