import { checkKonekEntry } from './cfh-financial-checks.mjs?v=live2';
import { planEntry } from './cfh-entry-plan.mjs?v=moneyflow-digits1';
import { CFH_OWNER_ID } from './cfh-store.mjs?v=live2';
import { buildTransactionEdit, editableTransactionFields } from './cfh-transaction-edit.mjs?v=transaction-edit1';
const dashboards={life_log:'lifeLogDashboard',money_flow:'dashboard',rental:'rentalDashboard',
  twice_as_nyce:'twiceDashboard',printing:'printingDashboard',cash_in_out:'gcashDashboard',konek2card:'testDashboard'};
const actions=new Set(['lifeLogAdd','expense','rentalAdd','twiceAdd','printingAdd','gcashQuickAdd',
  'gcashTextAdd','testCashOut','testAapCollection','testTransfer','testOthersLoan','testLoan',
  'testAtmWithdraw','testHoldMoney','testMonthlyInterest','installmentCreate']);
const sheets={'Life Log':'life_log','Money Flow':'money_flow','Rental':'rental','TwiceAsNyce':'twice_as_nyce',
  'Printing Business':'printing','Cash In/Out':'cash_in_out','Konek2Card':'konek2card'};
export class CashflowWriteApi {
  constructor(store,reads,{testOnly=false,allowFinancial=false}={}) {this.store=store;this.reads=reads;this.retries=new Map();this.testOnly=testOnly;this.allowFinancial=allowFinancial;this.queue=Promise.resolve();}
  handles(action) {return actions.has(action)||['transactionDelete','transactionRestore','transactionDeleteStatus','transactionEditLoad','transactionEdit'].includes(action);}
  async find(params) {
    if(String(params.rowNumber||params.id||params.rowFingerprint||'').startsWith('pending:'))throw Error('This entry is pending sync. Connect and sync it before deleting or restoring.');
    if(globalThis.navigator?.onLine===false)throw Error('Connect to delete or restore a synced transaction.');
    const tab=sheets[params.sheet];
    if(!tab)throw new Error('Unknown transaction sheet.');
    let id=String(params.rowNumber||params.id||'');
    // Older cached lists contain a sheet row number but retain the UUID/revision fingerprint.
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      id=String(params.rowFingerprint||'').split(':')[0];
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw new Error('Refresh this transaction before changing it.');
    const {data,error}=await this.store.client.from('cfh_records').select('*')
      .eq('owner_id',CFH_OWNER_ID).eq('id',id).eq('tab_key',tab).single();
    if(error)throw error;
    return data;
  }
  assertCurrentRevision(record,fingerprint) {
    const match=String(fingerprint||'').match(/^([0-9a-f-]{36}):(\\d+)$/i);
    if(!match||match[1].toLowerCase()!==record.id.toLowerCase()||Number(match[2])!==Number(record.revision))
      throw Error('This transaction changed. Refresh it before editing.');
  }
  request(params) {
    const task=this.queue.then(()=>this.perform(params));
    this.queue=task.catch(()=>{});
    return task;
  }
  async perform(params) {
    if(params.action==='installmentCreate') {
      if(this.testOnly)throw new Error('Create installments in the normal app.');
      const key=JSON.stringify(params);
      let pending=this.retries.get(key);
      if(!pending){pending={id:crypto.randomUUID()};this.retries.set(key,pending);}
      if(this.outbox){
        const total=Number(params.total),months=Number(params.months),item=String(params.item||'').trim(),date=String(params.firstDate||'');
        if(!item||item.length>120||!Number.isFinite(total)||total<=0||Math.abs(total*100-Math.round(total*100))>0.000001||!Number.isInteger(months)||months<1||months>120||Math.floor(total*100/months)<1||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'2000-01-01'||date>'2100-01-01'||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Enter a valid item, total, months and first payment date.');
        const result=await this.outbox.enqueue({params,installment:{p_id:pending.id,p_item:item,p_total:total,p_months:months,p_first_date:date}});
        this.retries.delete(key);return result;
      }
      const {data,error}=await this.store.client.rpc('cfh_create_installment',{
        p_id:pending.id,p_item:params.item,p_total:Number(params.total),
        p_months:Number(params.months),p_first_date:params.firstDate
      });
      if(error)throw error;
      this.retries.delete(key);
      try {await this.reads.snapshot.load('money_flow',true);}catch(error){console.warn('Installment saved; display will refresh',error);}
      return data;
    }
    if(params.action==='transactionEditLoad') {
      const record=await this.find(params);
      this.assertCurrentRevision(record,params.rowFingerprint);
      if(record.deleted_at)throw Error('Restore the transaction before editing it.');
      if(this.testOnly && record.payload?.cfh_preview_test!==true)
        throw new Error('In this preview, edit only the test transactions added here.');
      return {success:true,fields:editableTransactionFields(record)};
    }
    if(params.action==='transactionEdit') {
      const record=await this.find(params);
      this.assertCurrentRevision(record,params.rowFingerprint);
      if(record.deleted_at)throw Error('Restore the transaction before editing it.');
      if(this.testOnly && record.payload?.cfh_preview_test!==true)
        throw Error('In this preview, edit only the test transactions added here.');
      const p_record=buildTransactionEdit(record,params.values||{});
      const updated=await this.store.updateRecord(record,p_record);
      return {success:true,record:updated};
    }
    if(params.action==='transactionDeleteStatus') {
      const record=await this.find(params);return {success:true,deleted:!!record.deleted_at};
    }
    if(['transactionDelete','transactionRestore'].includes(params.action)) {
      const record=await this.find(params);
      if(this.testOnly && record.payload?.cfh_preview_test!==true)
        throw new Error('In this preview, delete or restore only the test transactions added here.');
      const fingerprint=String(params.rowFingerprint||'');
      // A stale UI may confirm an already completed operation, but cannot alter
      // a restored/newer record based on the old row's identity.
      const deleting=params.action==='transactionDelete';
      if(fingerprint && fingerprint!==record.id+':'+record.revision && !!record.deleted_at!==deleting)
        throw new Error('This transaction changed. Refresh it before trying again.');
      const result=await this.store.setDeleted(record,deleting);
      return {success:true,deleted:!!result.deleted_at,record:result};
    }
    // Retain the exact prepared UUIDs after uncertain network failures.
    // Successful calls remove the entry, so repeating a legitimate entry works.
    const key=JSON.stringify(params);
    let pending=this.retries.get(key);
    if(!pending) {
      if(this.testOnly && !this.allowFinancial && !['lifeLogAdd','expense','rentalAdd','twiceAdd','printingAdd','gcashQuickAdd','gcashTextAdd','testCashOut'].includes(params.action))
        throw new Error('Transfers, collections, loans, holds and interest will be tested in the next stage.');
      const plan=planEntry(params);
      if(this.testOnly) for(const record of plan.records) record.payload.cfh_preview_test=true;
      pending={plan,prepared:plan.records.map(record=>this.store.prepare(record))};
      this.retries.set(key,pending);
    }
    const {plan,prepared}=pending;
    if(this.outbox){
      if(plan.tab==='konek2card')checkKonekEntry(plan,params,await this.reads.request({action:'testDashboard'}));
      const result=await this.outbox.enqueue({plan,prepared,params});
      this.retries.delete(key);return result;
    }
    // Load before committing so acknowledged events immediately update totals.
    if(plan.tab!=='cash_in_out')await this.reads.snapshot.load(plan.tab);
    if(plan.tab==='konek2card' && !pending.checked) {
      const balance=await this.reads.request({action:'testDashboard'},true);
      checkKonekEntry(plan,params,balance);
      pending.checked=true;
    }
    const records=prepared.length===1?[await this.store.save(prepared[0])]:await this.store.saveBundle(prepared);
    this.retries.delete(key);
    const result={success:true,...plan.receipt,records};
    // GCash UI refreshes its dashboard after acknowledgement. Do not hold the save for a history scan.
    if(plan.tab==='cash_in_out')return result;
    try {result.dashboard=await this.reads.request({action:dashboards[plan.tab],year:params.year,month:params.month});}
    catch(error){console.warn('Saved; dashboard display will refresh separately',error);}
    return result;
  }
}

