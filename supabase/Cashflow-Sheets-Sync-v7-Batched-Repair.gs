/* Add as a separate Apps Script file. Not a replacement for Code.gs.
 * Configure Script Properties: CFH_SUPABASE_SECRET, CFH_SPREADSHEET_ID.
 * Never paste the secret into HTML, SQL Editor queries, or GitHub.
 * Bootstrap only while legacy app writes are paused. It refuses a changed export.
 */
var CFH_SYNC_TABS_ = {
  life_log: ['Life Log',5,5], twice_as_nyce:['TwiceAsNyce',5,5],
  printing:['Printing Business',5,5],cash_in_out:['Cash In/Out',5,5],
  money_flow:['Money Flow',5,8],konek2card:['Konek2Card',5,7],rental:['Rental',6,6]
};
function cfhBackend_(path,method,body) {
  var key=PropertiesService.getScriptProperties().getProperty('CFH_SUPABASE_SECRET');
  if(!key)throw new Error('Set CFH_SUPABASE_SECRET in Script Properties.');
  var headers={apikey:key};
  if(key.indexOf('eyJ')===0)headers.Authorization='Bearer '+key;
  var result=UrlFetchApp.fetch('https://mssrsogwxvxyyjnavdiu.supabase.co/rest/v1/'+path,{
    method:method||'get',headers:headers,
    contentType:'application/json',payload:body===undefined?undefined:JSON.stringify(body),muteHttpExceptions:true
  });
  if(result.getResponseCode()>=300)throw new Error('Supabase sync failed ('+result.getResponseCode()+'): '+result.getContentText().slice(0,500));
  return result.getContentText()?JSON.parse(result.getContentText()):null;
}
function cfhCheckConnection() {
  var book=cfhWorkbook_();
  var records=cfhBackend_('cfh_records?select=id&limit=1');
  var settings=cfhBackend_('cfh_settings?select=setting_key&setting_key=eq.konek_balance_seed');
  if(!records.length||!settings.length)throw new Error('Imported records or balance settings are missing.');
  console.log('Connected to Google Sheet: '+book.getName());
  console.log('Supabase records and balance settings found.');
}
function cfhAuditSync() {
  var book=cfhWorkbook_(),records=cfhAllRecords_();
  Object.keys(CFH_SYNC_TABS_).forEach(function(tab){
    var config=CFH_SYNC_TABS_[tab],sheet=book.getSheetByName(config[0]);
    if(!sheet)throw new Error('Missing sheet: '+config[0]);
    var rows=cfhRows_(sheet,config[1],config[2]);
    var active=records.filter(function(record){return record.tab_key===tab&&!record.deleted_at;});
    var matches=Object.create(null),different=0;
    active.forEach(function(record){
      var hash=cfhHash_(record.source_values.slice(0,config[2]));
      matches[hash]=(matches[hash]||0)+1;
    });
    rows.forEach(function(row){
      var hash=cfhHash_(row.values);
      if(matches[hash])matches[hash]--;else different++;
    });
    console.log(config[0]+': Sheet='+rows.length+', Supabase='+active.length+', Unmatched sheet rows='+different);
  });
}
function cfhMissingRows_(rows,records,width) {
  var counts=Object.create(null),deleted=Object.create(null),seen=Object.create(null),missing=[];
  records.forEach(function(record){
    var hash=cfhHash_(record.source_values.slice(0,width));
    if(record.deleted_at)deleted[hash]=true;
    else counts[hash]=(counts[hash]||0)+1;
  });
  rows.forEach(function(row){
    var hash=cfhHash_(row.values);
    seen[hash]=(seen[hash]||0)+1;
    if(counts[hash])counts[hash]--;
    else {
      if(row.marker||deleted[hash])throw new Error('A missing row has sync metadata or matches a deleted transaction. Resolve it manually.');
      missing.push({row:row,hash:hash,ordinal:seen[hash]});
    }
  });
  if(Object.keys(counts).some(function(hash){return counts[hash]>0;}))
    throw new Error('Existing Supabase transactions differ from the sheet. No rows imported.');
  return missing;
}
function cfhReconcileMissingRows() {
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    if(PropertiesService.getScriptProperties().getProperty('CFH_SYNC_READY')==='true')
      throw new Error('This repair is only for migration before automatic sync is enabled.');
    var book=cfhWorkbook_(),records=cfhAllRecords_(),pending=[];
    Object.keys(CFH_SYNC_TABS_).forEach(function(tab){
      var config=CFH_SYNC_TABS_[tab],sheet=book.getSheetByName(config[0]);
      if(!sheet)throw new Error('Missing sheet: '+config[0]);
      var rows=cfhRows_(sheet,config[1],config[2]);
      var missing=cfhMissingRows_(rows,records.filter(function(record){return record.tab_key===tab;}),config[2]);
      missing.forEach(function(item){
        var record=cfhRecordFromSheet_(tab,item.row.values,{payload:{}});
        var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
          'cfh-migration-gap-v1|'+tab+'|'+item.hash+'|'+item.ordinal,Utilities.Charset.UTF_8);
        var hex=bytes.map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('');
        record.id=hex.slice(0,8)+'-'+hex.slice(8,12)+'-5'+hex.slice(13,16)+'-8'+hex.slice(17,20)+'-'+hex.slice(20,32);
        record.client_request_id=record.id;
        record.owner_id='161ecab1-d1d7-4fef-a089-a7300b9da774';
        record.tab_key=tab;record.source='import';
        pending.push(record);
      });
    });
    if(pending.length>20)throw new Error('More than 20 missing rows. Review the audit before importing.');
    if(pending.length)cfhBackend_('cfh_records','post',pending);
    console.log('Imported missing transactions: '+pending.length+'. Google Sheet rows were not changed.');
  }finally{lock.releaseLock();}
  cfhAuditSync();
}
function cfhWorkbook_() {
  var id=PropertiesService.getScriptProperties().getProperty('CFH_SPREADSHEET_ID');
  if(!id)throw new Error('Set CFH_SPREADSHEET_ID in Script Properties.');
  return SpreadsheetApp.openById(id);
}
function cfhMarker_(note) {
  var match=String(note||'').match(/\n?\[CFH_SYNC:(\{[^\n]*\})\]/);
  return match?JSON.parse(match[1]):null;
}
function cfhNote_(cell,record,hash) {
  var original=String(cell.getNote()||'').replace(/\n?\[CFH_SYNC:\{[^\n]*\}\]/g,'');
  cell.setNote(original+'\n[CFH_SYNC:'+JSON.stringify({id:record.id,revision:Number(record.revision),hash:hash})+']');
}
function cfhCellDate_(value) {
  if (value instanceof Date) return value;
  var text = String(value || '').trim();
  if (/^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)) {
    text = '1899-12-30T' + text + '+08:00';
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    text += 'T00:00:00+08:00';
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)) {
    text += '+08:00';
  }
  return new Date(text);
}
function cfhCanonical_(values) {
  return values.map(function(v,i) {
    if (v === null || v === undefined || v === '') return '';
    if (i < 2) {
      var date = cfhCellDate_(v);
      if (!isNaN(date.getTime())) {
        return Utilities.formatDate(date, 'Asia/Manila', i === 0 ? 'yyyy-MM-dd' : 'HH:mm');
      }
    }
    return typeof v === 'string' ? v.trim() : v;
  });
}
function cfhHash_(values) {return JSON.stringify(cfhCanonical_(values));}
function cfhRows_(sheet,start,width) {
  var count=Math.max(0,sheet.getLastRow()-start+1);
  if(!count)return [];
  var values=sheet.getRange(start,2,count,width).getValues();
  var notes=sheet.getRange(start,2,count,1).getNotes();
  return values.map(function(value,i){return {row:start+i,values:value,note:notes[i][0],marker:cfhMarker_(notes[i][0])};})
    .filter(function(row){return row.values[0]!=='';});
}
function cfhAllRecords_() {
  var result=[],cursor='';
  for(;;){
    var page=cfhBackend_('cfh_records?select=*&order=id.asc&limit=1000'+(cursor?'&id=gt.'+cursor:''));
    result=result.concat(page);if(page.length<1000)break;cursor=page[page.length-1].id;
  }
  return result;
}
function cfhBootstrapAssignments_(rows,active,width) {
  if(rows.length!==active.length)throw new Error('Sheet changed since import. Reconcile before enabling sync.');
  var byId=Object.create(null),used=Object.create(null),buckets=Object.create(null);
  active.forEach(function(record){byId[record.id]=record;});
  var assigned=rows.map(function(row){
    if(!row.marker)return null;
    var record=byId[row.marker.id];
    if(!record||used[record.id]||cfhHash_(row.values)!==cfhHash_(record.source_values.slice(0,width)))
      throw new Error('Existing sync ID conflicts at row '+row.row+'. No IDs were remapped.');
    used[record.id]=true;return record;
  });
  active.forEach(function(record){
    if(used[record.id])return;
    var hash=cfhHash_(record.source_values.slice(0,width));
    (buckets[hash]||(buckets[hash]=[])).push(record);
  });
  return rows.map(function(row,i){
    var hash=cfhHash_(row.values),record=assigned[i];
    if(!record){
      var bucket=buckets[hash];
      if(!bucket||!bucket.length)throw new Error('Row '+row.row+' differs from the import. No data was overwritten.');
      record=bucket.shift();
    }
    var note=String(row.note||'').replace(/\n?\[CFH_SYNC:\{[^\n]*\}\]/g,'');
    return {row:row.row,note:note+'\n[CFH_SYNC:'+JSON.stringify({id:record.id,revision:Number(record.revision),hash:hash})+']'};
  });
}
function cfhBootstrapSync() {
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var book=cfhWorkbook_(),records=cfhAllRecords_(),plans=[],mapped=0;
    Object.keys(CFH_SYNC_TABS_).forEach(function(tab){
      var config=CFH_SYNC_TABS_[tab],sheet=book.getSheetByName(config[0]);
      if(!sheet)throw new Error('Missing sheet: '+config[0]);
      var rows=cfhRows_(sheet,config[1],config[2]);
      var active=records.filter(function(r){return r.tab_key===tab&&!r.deleted_at;});
      var assignments=cfhBootstrapAssignments_(rows,active,config[2]);
      var count=Math.max(0,sheet.getLastRow()-config[1]+1);
      var notes=count?sheet.getRange(config[1],2,count,1).getNotes():[];
      assignments.forEach(function(item){notes[item.row-config[1]][0]=item.note;});
      mapped+=assignments.length;
      plans.push({sheet:sheet,start:config[1],notes:notes});
      console.log('Validated '+config[0]+': '+assignments.length+' rows.');
    });
    var archive=book.getSheetByName('Deleted Transactions');
    if(archive&&archive.getLastRow()>=5) {
      var count=archive.getLastRow()-4;
      var archived=archive.getRange(5,2,count,14).getValues();
      var notes=archive.getRange(5,2,count,1).getNotes(),used={};
      archived.forEach(function(row,i){
        if(String(row[11]).toLowerCase()!=='deleted')return;
        var tab=Object.keys(CFH_SYNC_TABS_).filter(function(t){return CFH_SYNC_TABS_[t][0]===row[1];})[0];
        if(!tab)return;
        var width=CFH_SYNC_TABS_[tab][2],hash=cfhHash_(row.slice(3,3+width));
        var marker=cfhMarker_(notes[i][0]);
        var record=records.filter(function(r){return !used[r.id]&&r.tab_key===tab&&r.deleted_at&&
          (!marker||marker.id===r.id)&&cfhHash_(r.source_values.slice(0,width))===hash;})[0];
        if(marker&&!record)throw new Error('Archive sync ID conflict at row '+(i+5));
        if(record){
          used[record.id]=true;
          var original=String(notes[i][0]||'').replace(/\n?\[CFH_SYNC:\{[^\n]*\}\]/g,'');
          notes[i][0]=original+'\n[CFH_SYNC:'+JSON.stringify({id:record.id,revision:Number(record.revision),hash:hash})+']';
        }
      });
      plans.push({sheet:archive,start:5,notes:notes});
    }
    // Validate everything first; write only notes in batches, preserving other notes.
    plans.forEach(function(plan){
      for(var offset=0;offset<plan.notes.length;offset+=1000){
        var batch=plan.notes.slice(offset,offset+1000);
        plan.sheet.getRange(plan.start+offset,2,batch.length,1).setNotes(batch);
      }
      console.log('Linked '+plan.sheet.getName()+'.');
    });
    SpreadsheetApp.flush();
    PropertiesService.getScriptProperties().setProperty('CFH_SYNC_READY','true');
    console.log('Bootstrap completed: '+mapped+' active rows linked. Automatic triggers are not installed.');
    return {mapped:mapped,ready:true};
  } finally {lock.releaseLock();}
}
function cfhMaterialize_(values) {
  return values.map(function(v,i){return v === null || v === undefined ? '' : i<2&&v ? cfhCellDate_(v) : v;});
}
function cfhProjectRecord_(book,record) {
  var config=CFH_SYNC_TABS_[record.tab_key];if(!config)throw new Error('Unknown tab.');
  var sheet=book.getSheetByName(config[0]),rows=cfhRows_(sheet,config[1],config[2]);
  var row=rows.filter(function(r){return r.marker&&r.marker.id===record.id;})[0];
  if(row&&row.marker.revision>record.revision)return;
  if(row&&row.marker.hash!==cfhHash_(row.values))throw new Error('Unsynced sheet edit at '+config[0]+' row '+row.row+'. Resolve conflict first.');
  var archive=book.getSheetByName('Deleted Transactions');
  if(!archive)throw new Error('Deleted Transactions sheet missing.');
  if(record.deleted_at) {
    var count=Math.max(0,archive.getLastRow()-4),notes=count?archive.getRange(5,2,count,1).getNotes():[];
    var exists=notes.some(function(n){var m=cfhMarker_(n[0]);return m&&m.id===record.id&&m.revision===Number(record.revision);});
    if(!exists&&count){
      var archivedValues=archive.getRange(5,2,count,14).getValues();
      archivedValues.forEach(function(v,i){
        if(cfhMarker_(notes[i][0])||String(v[11]).toLowerCase()!=='deleted'||v[1]!==config[0])return;
        if(cfhCellDate_(v[0]).getTime()===new Date(record.deleted_at).getTime()&&
          cfhHash_(v.slice(3,3+config[2]))===cfhHash_(record.source_values.slice(0,config[2]))){
          cfhNote_(archive.getRange(i+5,2),record,cfhHash_(record.source_values));exists=true;
        }
      });
    }
    if(!exists){
      archive.getRange(5,2,1,14).insertCells(SpreadsheetApp.Dimension.ROWS);
      var source=cfhMaterialize_(record.source_values).slice(0,8);while(source.length<8)source.push('');
      archive.getRange(5,2,1,14).setValues([[new Date(record.deleted_at),config[0],row?row.row:''].concat(source,['Deleted','',false])]);
      archive.getRange(5,15).insertCheckboxes();
      cfhNote_(archive.getRange(5,2),record,cfhHash_(record.source_values));
      SpreadsheetApp.flush();
      var savedMarker=cfhMarker_(archive.getRange(5,2).getNote());
      if(!savedMarker||savedMarker.id!==record.id)throw new Error('Archive ID was not saved. The original transaction was retained.');
    }
    if(row)sheet.getRange(row.row,2,1,config[2]).deleteCells(SpreadsheetApp.Dimension.ROWS);
    return;
  }
  if(!row){sheet.getRange(config[1],2,1,config[2]).insertCells(SpreadsheetApp.Dimension.ROWS);row={row:config[1]};}
  var values=cfhMaterialize_(record.source_values.slice(0,config[2]));
  sheet.getRange(row.row,2,1,config[2]).setValues([values]);
  cfhNote_(sheet.getRange(row.row,2),record,cfhHash_(values));
  var archivedCount=Math.max(0,archive.getLastRow()-4);
  if(archivedCount)archive.getRange(5,2,archivedCount,1).getNotes().forEach(function(n,i){
    var m=cfhMarker_(n[0]);if(m&&m.id===record.id){
      archive.getRange(i+5,13,1,3).setValues([['Restored',new Date(),false]]);
      archive.getRange(i+5,15).clearDataValidations();
    }
  });
}
function cfhSyncPending() {
  if(PropertiesService.getScriptProperties().getProperty('CFH_SYNC_READY')!=='true')throw new Error('Run cfhBootstrapSync after reconciling the import.');
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try {
    var book=cfhWorkbook_(),jobs=cfhBackend_('rpc/cfh_claim_sync','post',{p_limit:10});
    jobs.forEach(function(job){
      var error=null;
      try {
        // Fetch the newest revision: a delayed older queue job cannot undo a restore.
        var record=cfhBackend_('cfh_records?select=*&id=eq.'+job.record_id)[0];
        if(!record)throw new Error('Transaction missing.');
        cfhProjectRecord_(book,record);SpreadsheetApp.flush();
      }catch(e){error=String(e.message);}
      cfhBackend_('rpc/cfh_finish_sync','post',{p_id:job.id,p_lease_token:job.lease_token,p_error:error});
    });
  }finally{lock.releaseLock();}
}
function cfhInstallSyncTrigger() {
  if(PropertiesService.getScriptProperties().getProperty('CFH_SYNC_READY')!=='true')throw new Error('Bootstrap first.');
  ScriptApp.getProjectTriggers().forEach(function(t){if(['cfhSyncPending','cfhSyncSheetEdit'].indexOf(t.getHandlerFunction())!==-1)ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger('cfhSyncPending').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('cfhSyncSheetEdit').forSpreadsheet(cfhWorkbook_()).onEdit().create();
}
function cfhRecordFromSheet_(tab,values,existing) {
  var date=values[0],time=values[1];
  if(!(date instanceof Date)||isNaN(date.getTime()))throw new Error('Use a valid date in column B.');
  var day=Utilities.formatDate(date,'Asia/Manila','yyyy-MM-dd');
  var clock=time instanceof Date?Utilities.formatDate(time,'Asia/Manila','HH:mm:ss'):'00:00:00';
  var occurred=new Date(day+'T'+clock+'+08:00').toISOString();
  var record={occurred_at:occurred,amount:null,category:'',description:'',payload:existing.payload||{},source_values:values.map(function(v){return v instanceof Date?v.toISOString():v;})};
  if(tab==='life_log'){record.category=String(values[2]);record.description=String(values[3]);record.payload.notes=values[4];}
  else if(tab==='money_flow'){
    record.amount=Number(values[5]);record.category=String(values[4]);record.description=String(values[3]);
    record.payload.merchant=values[2];record.payload.payment_method=values[6];record.payload.entry=values[7];
  }else if(tab==='konek2card'){
    record.amount=Number(values[3]);record.category=String(values[5]);record.description=String(values[6]);
    record.payload.customer=values[2];record.payload.fee_earned=values[4];
  }else if(tab==='rental'){
    record.amount=Number(values[2]);record.category=String(values[4]);record.description=String(values[5]);record.payload.type=values[3];
  }else{record.amount=Number(values[2]);record.category=String(values[3]);record.description=String(values[4]);}
  if(record.amount!==null&&!isFinite(record.amount))throw new Error('Amount must be numeric.');
  return record;
}
// Recover only an unambiguous deleted record; never guess between duplicates.
function cfhArchiveCandidate_(values,records) {
  var tab=Object.keys(CFH_SYNC_TABS_).filter(function(t){return CFH_SYNC_TABS_[t][0]===values[1];})[0];
  if(!tab||String(values[11]).toLowerCase()!=='deleted')throw new Error('Select a deleted transaction from a supported tab.');
  var width=CFH_SYNC_TABS_[tab][2],hash=cfhHash_(values.slice(3,3+width));
  var matches=records.filter(function(r){return r.tab_key===tab&&r.deleted_at&&cfhHash_(r.source_values.slice(0,width))===hash;});
  // Deleted At is stored as a Date, including seconds even when the display hides them.
  var deletedAt=cfhCellDate_(values[0]).getTime();
  var exact=matches.filter(function(r){return new Date(r.deleted_at).getTime()===deletedAt;});
  if(exact.length===1)return exact[0];
  if(matches.length===1)return matches[0];
  throw new Error(matches.length?'Multiple matching deleted transactions. No transaction was restored.':'No matching deleted transaction in Supabase. No transaction was restored.');
}
function cfhArchiveMarker_(sheet,row) {
  var cell=sheet.getRange(row,2),marker=cfhMarker_(cell.getNote());
  if(marker)return marker;
  var values=sheet.getRange(row,2,1,14).getValues()[0];
  var tab=Object.keys(CFH_SYNC_TABS_).filter(function(t){return CFH_SYNC_TABS_[t][0]===values[1];})[0];
  if(!tab)throw new Error('Unknown source tab.');
  var records=cfhAllRecords_().filter(function(r){return r.owner_id==='161ecab1-d1d7-4fef-a089-a7300b9da774'&&r.tab_key===tab&&r.deleted_at;});
  var record=cfhArchiveCandidate_(values,records);
  cfhNote_(cell,record,cfhHash_(record.source_values));
  SpreadsheetApp.flush();
  return {id:record.id,revision:Number(record.revision)};
}
function cfhSyncSheetEdit(event) {
  if(!event||!event.range||PropertiesService.getScriptProperties().getProperty('CFH_SYNC_READY')!=='true')return;
  var sheet=event.range.getSheet(),name=sheet.getName();
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    if(name==='Deleted Transactions') {
      if(event.range.getColumn()!==15||event.range.getNumRows()!==1||event.value!=='TRUE')return;
      var marker=cfhArchiveMarker_(sheet,event.range.getRow());
      var record=cfhBackend_('rpc/cfh_restore_from_sheet','post',{p_id:marker.id,p_expected_revision:marker.revision});
      cfhProjectRecord_(event.source,record);SpreadsheetApp.flush();return;
    }
    var tab=Object.keys(CFH_SYNC_TABS_).filter(function(t){return CFH_SYNC_TABS_[t][0]===name;})[0];
    if(!tab)return;
    var config=CFH_SYNC_TABS_[tab];
    if(event.range.getColumn()>config[2]+1||event.range.getLastColumn()<2)return;
    for(var row=Math.max(config[1],event.range.getRow());row<=event.range.getLastRow();row++) {
      var cell=sheet.getRange(row,2),marker=cfhMarker_(cell.getNote());
      if(!marker)throw new Error('New rows must currently be added through the app. Existing sheet rows can be edited.');
      var old=cfhBackend_('cfh_records?select=*&id=eq.'+marker.id)[0];
      if(!old||old.tab_key!==tab)throw new Error('Transaction ID mismatch.');
      var values=sheet.getRange(row,2,1,config[2]).getValues()[0];
      cfhApplyExistingSheetEdit_(tab,cell,marker,values,old,event.range.getColumn(),event.range.getLastColumn());
    }
  }catch(error){
    event.source.toast(error.message,'Cashflow sync needs attention',10);
    throw error;
  }finally{lock.releaseLock();}
}

// Read-only diagnosis: no ledger, database, or sync-note changes.
function cfhDiagnoseCashDate() {
  var book=cfhWorkbook_(),sheet=book.getSheetByName('Cash In/Out');
  var records=cfhAllRecords_().filter(function(r){return r.tab_key==='cash_in_out'&&!r.deleted_at;});
  var byId=Object.create(null),counts=Object.create(null);
  records.forEach(function(r){byId[r.id]=r;var h=cfhHash_(r.source_values.slice(0,5));counts[h]=(counts[h]||0)+1;});
  console.log('Sheet timezone: '+book.getSpreadsheetTimeZone()+'; script timezone: '+Session.getScriptTimeZone());
  var different=0;
  cfhRows_(sheet,5,5).forEach(function(row){
    var hash=cfhHash_(row.values),record=row.marker&&byId[row.marker.id];
    if(counts[hash])counts[hash]--;else {
      different++;
      console.log('MISMATCH row '+row.row+'; ID '+(row.marker?row.marker.id:'missing'));
      console.log('Sheet date/time/value: '+hash);
      console.log('Note revision/hash: '+JSON.stringify(row.marker));
      console.log('Supabase revision/date/time/value: '+(record?record.revision+' / '+cfhHash_(record.source_values.slice(0,5)):'No active record found for this ID'));
      console.log('Supabase occurred_at: '+(record?record.occurred_at:'unknown'));
    }
  });
  console.log('Unmatched sheet rows: '+different+'. No data changed.');
}

// Compare against the database, including when a user returns a field to its old value.
function cfhApplyExistingSheetEdit_(tab,cell,marker,values,old,firstColumn,lastColumn) {
  if(old.deleted_at)throw new Error('This transaction has been deleted. Refresh before editing.');
  var hash=cfhHash_(values),databaseHash=cfhHash_(old.source_values.slice(0,values.length));
  if(hash===databaseHash){cfhNote_(cell,old,hash);return;}
  if(Number(old.revision)!==Number(marker.revision)) {
    var base=JSON.parse(marker.hash),current=JSON.parse(databaseHash),local=JSON.parse(hash);
    for(var i=0;i<local.length;i++) {
      var explicitlyEdited=i+2>=firstColumn&&i+2<=lastColumn;
      if(!explicitlyEdited&&(current[i]!==base[i]||local[i]!==base[i]))
        throw new Error('Another field changed since this row was synced. Refresh before editing.');
    }
  }
  var updated=cfhBackend_('rpc/cfh_apply_sheet_edit','post',{
    p_id:marker.id,p_expected_revision:old.revision,p_record:cfhRecordFromSheet_(tab,values,old)
  });
  cfhNote_(cell,updated,hash);SpreadsheetApp.flush();
}

// One-time repair for the diagnosed date mismatch; other fields must agree.
function cfhRepairCashDate() {
  var book=cfhWorkbook_(),sheet=book.getSheetByName('Cash In/Out');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var repaired=0,byId=Object.create(null);
    cfhAllRecords_().forEach(function(record){if(record.tab_key==='cash_in_out')byId[record.id]=record;});
    cfhRows_(sheet,5,5).forEach(function(row){
      if(!row.marker)throw new Error('Missing transaction ID at row '+row.row);
      var old=byId[row.marker.id];
      if(!old||old.tab_key!=='cash_in_out'||old.deleted_at)throw new Error('No active matching transaction at row '+row.row);
      var local=JSON.parse(cfhHash_(row.values)),remote=JSON.parse(cfhHash_(old.source_values.slice(0,5)));
      if(JSON.stringify(local)===JSON.stringify(remote))return;
      for(var i=1;i<5;i++)if(local[i]!==remote[i])throw new Error('Non-date mismatch at row '+row.row+'. No automatic repair allowed.');
      cfhApplyExistingSheetEdit_('cash_in_out',sheet.getRange(row.row,2),row.marker,row.values,old,2,2);repaired++;
    });
    console.log('Repaired date mismatches: '+repaired);
  }finally{lock.releaseLock();}
}
