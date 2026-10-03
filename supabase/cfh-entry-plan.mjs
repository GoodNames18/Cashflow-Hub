import * as rules from './legacy-rules.mjs';
import { ManilaDate } from './manila-date.mjs';
const sheets = {life_log:'Life Log',twice_as_nyce:'TwiceAsNyce',printing:'Printing Business',
  cash_in_out:'Cash In/Out',money_flow:'Money Flow',konek2card:'Konek2Card',rental:'Rental'};
function cents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount*100-Math.round(amount*100))>0.000001)
    throw new Error('Enter a positive amount with at most two decimal places.');
  return amount;
}
export function rowRecord(tab, row) {
  let amount = null, category = '', description = '', payload = {sheet:sheets[tab]};
  if (tab==='life_log') {
    category=row[2]; description=row[3]; payload.notes=row[4];
  } else if (tab==='money_flow') {
    amount=row[5]; category=row[4]; description=row[3];
    Object.assign(payload,{merchant:row[2],payment_method:row[6],entry:row[7]});
  } else if (tab==='konek2card') {
    amount=row[3];category=row[5];description=row[6];
    Object.assign(payload,{customer:row[2],fee_earned:row[4]});
  } else if (tab==='rental') {
    amount=row[2];category=row[4];description=row[5];payload.type=row[3];
  } else {
    amount=row[2];category=row[3];description=row[4];
  }
  return {tab_key:tab,occurred_at:row[0].toISOString(),amount,
    category:String(category||'').trim(),description:String(description||''),payload,
    source_values:row.map(v=>v instanceof globalThis.Date?v.toISOString():v)};
}
// Parsing is separated from saving so a retry reuses the same prepared request.
export function planEntry(params, now = new ManilaDate()) {
  let tab, rows, receipt = {};
  const date = new ManilaDate(now.getTime());
  switch (params.action) {
    case 'lifeLogAdd': {
      const category = String(params.category||'').trim();
      if (!['Health','Grooming','Home','Device','Car','Travel','Other'].includes(category))
        throw new Error('Choose a Life Log category.');
      const description=String(params.description||'').trim();
      if (!description) throw new Error('Enter a Life Log description.');
      tab='life_log';rows=[[date,date,category,description,'']];receipt={category,description};break;
    }
    case 'expense': {
      const entry=rules.parseExpense(String(params.text||''));
      entry.amount=cents(entry.amount);
      entry.category=rules.resolveMoneyFlowCategory(entry.category,params.entryType);
      tab='money_flow';rows=[[date,date,entry.merchant,entry.description,entry.category,entry.amount,entry.payment,params.text]];
      receipt=entry;break;
    }
    case 'rentalAdd': {
      const entry=rules.parseRentalEntry_(params.text,params.category,params.entryType);
      tab='rental';rows=[[date,date,entry.amount,entry.type,entry.category,entry.description]];receipt=entry;break;
    }
    case 'twiceAdd':
    case 'printingAdd': {
      const entry=params.action==='twiceAdd'?rules.parseTwiceAsNyceEntry_(params.text,params.category):
        rules.parsePrintingEntry_(params.text,params.category);
      tab=params.action==='twiceAdd'?'twice_as_nyce':'printing';
      rows=[[date,date,entry.amount,entry.category,entry.description]];receipt=entry;break;
    }
    case 'gcashQuickAdd':
    case 'gcashTextAdd': {
      const categories={gcash:'Gcash',maya:'Maya',load:'Load',bills:'Bills'};
      const text=String(params.text||'').trim();
      const key=String(params.category||'').trim().toLowerCase() ||
        (text.match(/\b(gcash|maya|bills?|load)\b/i)?.[1]||'').toLowerCase().replace(/^bill$/,'bills');
      if (!categories[key]) throw new Error('Use GCash, Maya, Bills, or Load.');
      const match=text.match(/(?:₱\s*)?(\d[\d,]*(?:\.\d{1,2})?)/);
      const amount=cents(params.action==='gcashQuickAdd'?params.amount:match?.[1].replace(/,/g,''));
      const category=categories[key], description=params.action==='gcashQuickAdd'?'Income':text;
      const styled=key==='maya'?'     '+category:key==='load'?category+'     ':category;
      tab='cash_in_out';rows=[[date,date,amount,styled,description]];receipt={amount,category,description};break;
    }
    case 'testCashOut': {
      const entry=rules.parseTestCashOutInput_(params.text);
      const fee=rules.getTestFeeEarned_(entry.amount);
      tab='konek2card';rows=[rules.buildTestCashOutRow_(date,entry.customer,entry.amount,fee)];
      receipt={...entry,feeEarned:fee,category:'Income',description:'Cash-out'};break;
    }
    case 'testAapCollection': {
      const entry=rules.parseTestAapInput_(params.text);
      const calculation=rules.calculateTestAap_(entry.people,entry.bookTotal);
      tab='konek2card';rows=[rules.buildTestAapRow_(date,calculation,params.destination)];
      receipt={...calculation,destination:params.destination||'cash'};break;
    }
    case 'testTransfer': {
      const entry=rules.parseTestTransferInput_(params.text||params.amount);
      tab='konek2card';rows=[rules.buildTestTransferInputRow_(date,entry,params.direction)];
      receipt={amount:rows[0][3],description:rows[0][6]};break;
    }
    case 'testOthersLoan': {
      const entry=rules.parseTestOthersLoanInput_(params.text,params.loanAction);
      tab='konek2card';rows=[rules.buildTestOthersLoanRow_(date,entry)];receipt=entry;break;
    }
    case 'testLoan': {
      const entry=rules.validateTestLoanAmount_(params.amount,params.rebate);
      tab='konek2card';rows=rules.buildTestLoanRows_(date,entry.payment,entry.rebate);receipt=entry;break;
    }
    case 'testAtmWithdraw': {
      const amount=rules.validateTestAtmAmount_(params.amount);
      tab='konek2card';rows=[rules.buildTestAtmRow_(date,amount)];receipt={amount};break;
    }
    case 'testHoldMoney': {
      const amount=cents(String(params.amount||'').replace(/[₱,\s]/g,''));
      const action=String(params.holdAction||'').trim().toLowerCase();
      if (!['hold','release'].includes(action)) throw new Error('Choose Hold Money or Release Hold.');
      const description=action==='hold'?'Hold money':'Release hold';
      tab='konek2card';rows=[[date,date,'Card',amount,'','Hold',description]];receipt={amount,description};break;
    }
    default: throw new Error('Unsupported Cashflow save action: '+params.action);
  }
  return {tab,records:rows.map(row=>rowRecord(tab,row)),receipt};
}
