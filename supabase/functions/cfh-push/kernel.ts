export function createNotificationReader(snapshot:Record<string,string>){
 const parsed=new Map<string,any>(),scoped=new Map<string,any>(),duplicates=new Map<string,any>(),eastwest=new Map<string,any>();
 function readJSON(key:string,fallback='{}'){if(!parsed.has(key))parsed.set(key,JSON.parse(snapshot[key]||fallback));return parsed.get(key);}
 const localStorage={getItem:(k:string)=>snapshot[k]||null};
 let cfhCalendarEntries=readJSON('cfh_calendar_entries_v1','[]');
     const CFH_CARD_PANEL_KEY='cfh_card_panel_preferences_v1';
    const CFH_EASTWEST_EXTRA_HOLIDAYS={
      2026:['2026-02-17','2026-03-20','2026-05-27','2026-11-02','2026-12-24'],
      2027:['2027-02-06']
    };
    const CFH_EASTWEST_OVERRIDES_KEY='cfh_eastwest_cycle_overrides_v1';
    const CFH_CALENDAR_BELLS_KEY = 'cfh_calendar_bells_v1';
    const CFH_EVENT_DELETIONS_KEY='cfh_calendar_event_deletions_v1';
    const CFH_FIFTEENTH_CYCLES = [
      ['2026-02-15','2026-03-11'],['2026-03-15','2026-04-08'],
      ['2026-04-15','2026-05-11'],['2026-05-17','2026-06-10'],
      ['2026-06-15','2026-07-09'],['2026-07-15','2026-08-10'],
      ['2026-08-16','2026-09-09'],['2026-09-15','2026-10-09']
    ];
    const CFH_METROBANK_CONFIRMED = {'2026-03-18':'2026-04-08','2026-04-18':'2026-05-11','2026-05-18':'2026-06-08','2026-06-18':'2026-07-09','2026-07-18':'2026-08-10','2026-08-18':'2026-09-08','2026-09-18':'2026-10-09'};
    const CFH_METROBANK_OVERRIDE_KEY = 'cfh_metrobank_due_overrides_v1';
    const CFH_METROBANK_STATUS_KEY = 'cfh_metrobank_status_v1';
    function cfhCardDisplayNames(entry){
      const bank=cfhCardKey(entry),prefs=cfhEntryPrefs(entry);
      return {bank:prefs.bankName||(bank==='eastwest'?'EastWest':'Metrobank'),card:prefs.cardName||(bank==='eastwest'?'Visa Platinum':'Travel Signature Visa')};
    }
    function cfhEntryPrefs(entry){return cfhScopedPrefs(cfhCardKey(entry),cfhEntryCycle(entry));}
    function cfhEntryCycle(entry){return entry.cfhDuplicateCycle||entry.cfhEastwestCycle||(entry.cfhStatement||entry.date||entry.cfhDisplayDate||'').slice(0,7);}
    function cfhEastwestCycle(year,month){const cacheKey=JSON.stringify([year,month]);if(!eastwest.has(cacheKey))eastwest.set(cacheKey,cfhEastwestCycleUncached(year,month));return eastwest.get(cacheKey);}
    function cfhEastwestCycleUncached(year,month){
      const cycle=cfhCalendarDateKey(new Date(year,month,15)).slice(0,7);
      const override=cfhEastwestOverrides()[cycle]||{};
      const statement=cfhEastwestValidDate(override.statement)?override.statement:cfhCalendarDateKey(cfhEastwestBankingDate(cfhCardStatementDate('eastwest',year,month)));
      const [y,m,d]=statement.split('-').map(Number);
      const due=cfhEastwestValidDate(override.due)?override.due:cfhCalendarDateKey(cfhEastwestBankingDate(new Date(y,m-1,d+cfhCardScheduleSettings('eastwest',cycle).dueDays)));
      return {cycle,statement,due,statementConfirmed:cfhEastwestValidDate(override.statement),dueConfirmed:cfhEastwestValidDate(override.due)};
    }
    function cfhEastwestValidDate(key){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(key||''))return false;
      const [y,m,d]=key.split('-').map(Number);
      return cfhCalendarDateKey(new Date(y,m-1,d))===key;
    }
    function cfhCalendarDateKey(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + d;
    }
    function cfhCardScheduleSettings(bank,cycle){
      const prefs=cfhScopedPrefs(bank,cycle||'');
      const use=!cycle||!prefs.scheduleFrom||cycle>=prefs.scheduleFrom;
      return {statementDay:use&&Number.isInteger(prefs.statementDay)?prefs.statementDay:(bank==='eastwest'?15:18),dueDays:use&&Number.isInteger(prefs.dueDays)?prefs.dueDays:(bank==='eastwest'?24:21)};
    }
    function cfhScopedPrefs(bank,cycle){
      const cacheKey=JSON.stringify([bank,cycle]);if(scoped.has(cacheKey))return scoped.get(cacheKey);
      const base=cfhCardPanelPreferences()[bank]||{},result={...base};
      for(const edit of base.scopedEdits||[]){
        if(edit.scope==='all'||edit.scope==='future'&&cycle>=edit.cycle||edit.scope==='current'&&cycle===edit.cycle)Object.assign(result,edit.patch);
      }
      scoped.set(cacheKey,result);return result;
    }
    function cfhCardPanelPreferences(){try{return readJSON(CFH_CARD_PANEL_KEY)||{};}catch(e){return {};}}
    function cfhEastwestBankingDate(date){
      const result=new Date(date.getFullYear(),date.getMonth(),date.getDate());
      while(result.getDay()===0||result.getDay()===6||cfhEastwestHoliday(result))result.setDate(result.getDate()+1);
      return result;
    }
    function cfhEastwestHoliday(date){
      const y=date.getFullYear(),key=cfhCalendarDateKey(date);
      const fixed=['01-01','04-09','05-01','06-12','08-21','11-01','11-30','12-08','12-25','12-30','12-31'];
      if(fixed.includes(key.slice(5))||(CFH_EASTWEST_EXTRA_HOLIDAYS[y]||[]).includes(key))return true;
      const lastMonday=new Date(y,7,31);
      while(lastMonday.getDay()!==1)lastMonday.setDate(lastMonday.getDate()-1);
      if(key===cfhCalendarDateKey(lastMonday))return true;
      // Gregorian Easter calculation: Holy Thursday, Good Friday and Black Saturday.
      const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4;
      const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
      const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4;
      const l=(32+2*e+2*i-h-k)%7,n=Math.floor((a+11*h+22*l)/451);
      const month=Math.floor((h+l-7*n+114)/31),day=(h+l-7*n+114)%31+1;
      return [-3,-2,-1].some(offset=>key===cfhCalendarDateKey(new Date(y,month-1,day+offset)));
    }
    function cfhCardStatementDate(bank,year,month){
      const cycle=cfhCalendarDateKey(new Date(year,month,1)).slice(0,7);
      const day=cfhCardScheduleSettings(bank,cycle).statementDay;
      return new Date(year,month,Math.min(day,new Date(year,month+1,0).getDate()));
    }
    function cfhEastwestOverrides(){
      try{const value=readJSON(CFH_EASTWEST_OVERRIDES_KEY);return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch(e){return {};}
    }
    function cfhDuplicateCycle(bank,year,month){const cacheKey=JSON.stringify([bank,year,month]);if(!duplicates.has(cacheKey))duplicates.set(cacheKey,cfhDuplicateCycleUncached(bank,year,month));return duplicates.get(cacheKey);}
    function cfhDuplicateCycleUncached(bank,year,month){
      const cycle=cfhCalendarDateKey(new Date(year,month,1)).slice(0,7),prefs=cfhScopedPrefs(bank,cycle);
      const override=(prefs.confirmedCycles||{})[cycle]||{};
      if(cfhIsAtomeCard(prefs))return {cycle,statement:cfhEastwestValidDate(override.statement)?override.statement:cfhCalendarDateKey(cfhCardStatementDate(bank,year,month)),due:cfhEastwestValidDate(override.due)?override.due:cfhAtomeDueDate(year,month)};
      const adjust=date=>{
        if(prefs.sourceBank==='eastwest')return cfhEastwestBankingDate(date);
        while(date.getDay()===0||date.getDay()===6)date.setDate(date.getDate()+1);
        return date;
      };
      const statement=cfhEastwestValidDate(override.statement)?override.statement:cfhCalendarDateKey(prefs.sourceBank==='eastwest'?adjust(cfhCardStatementDate(bank,year,month)):cfhCardStatementDate(bank,year,month));
      const [y,m,d]=statement.split('-').map(Number);
      const due=cfhEastwestValidDate(override.due)?override.due:cfhCalendarDateKey(adjust(new Date(y,m-1,d+cfhCardScheduleSettings(bank,cycle).dueDays)));
      return {cycle,statement,due};
    }
    function cfhAtomeDueDate(year,month){return cfhCalendarDateKey(new Date(year,month+1,3));}
    function cfhIsAtomeCard(config){return /\batome\b/i.test([config.bankName,config.cardName].filter(Boolean).join(' '));}
    function cfhCardKey(entry){return entry.cfhDuplicate|| (entry.cfhCard15?'eastwest':entry.cfhAuto?'metrobank':'');}
    function cfhCardNotificationTime(entry){
      const bank=cfhCardKey(entry);
      const value=bank?cfhEntryPrefs(entry).notificationTime:entry.time;
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(value||'')?value:'';
    }
    function cfhBellEnabled(id){const saved=cfhBellSettings()[id];if(saved!==undefined)return saved!==false;const key=id.split('|')[0];return !key.startsWith('duplicate-')||(cfhCardPanelPreferences()[key]||{}).remindersEnabled!==false;}
    function cfhBellSettings(){try{return readJSON(CFH_CALENDAR_BELLS_KEY)||{};}catch(e){return {};}}
    function cfhCalendarForDate(key) {
      return cfhCalendarEntries.filter(e => cfhCalendarMatches(e,key)).concat(cfhMetrobankEntriesForDate(key),cfhFifteenthCardEntriesForDate(key),cfhDuplicateEntriesForDate(key)).filter(entry=>cfhCardFutureVisible(entry,key)&&cfhEventVisible(entry,key)).sort((a,b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    }
    function cfhEventVisible(entry,key){
      const deleted=cfhEventDeletions(),series=cfhEventSeries(entry);
      return !(deleted.all||[]).includes(series)&&!(deleted.occurrences||[]).includes(series+'|'+key)&&!(deleted.future&&deleted.future[series]&&key>=deleted.future[series]);
    }
    function cfhEventSeries(entry){return (cfhCardKey(entry)||entry.id)+':'+entry.type;}
    function cfhEventDeletions(){try{return readJSON(CFH_EVENT_DELETIONS_KEY);}catch(e){return {};}}
    function cfhCardFutureVisible(entry,key){
      const bank=cfhCardKey(entry);
      const range=bank?cfhCardScheduleRange(bank,cfhEntryCycle(entry)):null;
      return !range||(key>=range.start&&key<=range.end);
    }
    function cfhCardScheduleRange(bank,cycle){
      const value=cfhScopedPrefs(bank,cycle||'');
      return value&&typeof value==='object'&&cfhEastwestValidDate(value.start)&&cfhEastwestValidDate(value.end)&&value.start<=value.end?value:null;
    }
    function cfhDuplicateEntriesForDate(key){
      const prefs=cfhCardPanelPreferences(),[y,m]=key.split('-').map(Number),entries=[];
      for(const bank of Object.keys(prefs).filter(k=>k.startsWith('duplicate-'))){
        const config=prefs[bank],cycles=new Set();
        for(let delta=-3;delta<=0;delta++)cycles.add(cfhCalendarDateKey(new Date(y,m-1+delta,1)).slice(0,7));
        Object.keys(config.confirmedCycles||{}).forEach(cycle=>cycles.add(cycle));
        for(const cycleKey of cycles){
          const [year,month]=cycleKey.split('-').map(Number),cycle=cfhDuplicateCycle(bank,year,month-1);
          for(const type of ['statement','due']){
          if(key!==cycle[type==='due'?'due':'statement'])continue;
          entries.push({id:bank+'|'+cycleKey+'|'+type,type,title:config.bankName+' '+config.cardName,date:key,time:config.notificationTime||'',cfhDuplicate:bank,cfhDuplicateCycle:cycleKey,cfhCard15:config.sourceBank==='eastwest',cfhAuto:config.sourceBank!=='eastwest',cfhStatement:cycle.statement});
          }
        }
      }
      return entries;
    }
    function cfhFifteenthCardEntriesForDate(key) {
      const entries=[];
      CFH_FIFTEENTH_CYCLES.forEach(function(pair) {
        const statement=pair[0],due=pair[1];
        if(key===statement)entries.push({id:'fifteenth-statement-'+statement,type:'statement',title:'EastWest Visa Platinum — Statement',date:key,time:'',amount:null,repeat:'none',notes:'User-provided statement date (historical). EastWest Visa Platinum.',cfhCard15:true});
        if(key===due)entries.push({id:'fifteenth-due-'+statement,type:'due',title:'EastWest Visa Platinum — Payment Due',date:key,time:'',amount:null,repeat:'none',notes:'User-provided payment due date (historical). EastWest Visa Platinum.',cfhCard15:true});
      });

      const [year,month]=key.split('-').map(Number);
      // Include neighboring cycles for due dates crossing month/year boundaries.
      const cycles=new Set();
      for(let delta=-2;delta<=0;delta++)cycles.add(cfhCalendarDateKey(new Date(year,month-1+delta,15)).slice(0,7));
      Object.keys(cfhEastwestOverrides()).filter(cycle=>/^\d{4}-\d{2}$/.test(cycle)).forEach(cycle=>cycles.add(cycle));
      cycles.forEach(cycleKey=>{
        if(cycleKey<'2026-10')return;
        const [y,m]=cycleKey.split('-').map(Number),cycle=cfhEastwestCycle(y,m-1);
        ['statement','due'].forEach(type=>{
          if(key!==cycle[type])return;
          const confirmed=type==='statement'?cycle.statementConfirmed:cycle.dueConfirmed;
          entries.push({id:'eastwest-'+type+'-'+cycleKey,type,title:'EastWest Visa Platinum — '+(type==='statement'?'Statement':'Payment Due'),date:key,time:'',amount:null,repeat:'none',notes:confirmed?'Confirmed SOA date saved on this device.':'Estimated: statement on the 15th, due 24 calendar days later; weekends and known Philippine non-working holidays adjusted. Newly announced holidays may change dates.',cfhCard15:true,cfhEastwestCycle:cycleKey,cfhConfirmed:confirmed});
        });
      });
      return entries;
    }
    function cfhMetrobankEntriesForDate(key) {
      const [y,m] = key.split('-').map(Number);
      if (y<2026 || y>2100) return [];
      const results=[];
      for (let delta=-2;delta<=0;delta++) {
        const base = cfhCardStatementDate('metrobank',y,m-1+delta);
        const statement = cfhCalendarDateKey(base);
        if (!cfhMetrobankStatementUnlocked(statement) || !cfhMetrobankIsActiveForStatement(statement)) continue;
        const due = cfhMetrobankDueDate(statement);
        if (key===statement) results.push({id:'metrobank-statement-'+statement,type:'statement',title:'Metrobank Travel Signature Visa — Statement',date:key,time:'',amount:null,repeat:'none',notes:'Monthly statement cut-off. Check your official SOA for the balance.' ,cfhAuto:true});
        if (key===due.key) results.push({id:'metrobank-due-'+statement,type:'due',title:'Metrobank Travel Signature Visa — Payment Due',date:key,time:'',amount:null,repeat:'none',notes:due.confirmed?'Due date confirmed from provided statement or manual override.':'Estimated due date (+21 days, weekends adjusted). Verify against official SOA; holidays may change it.',cfhAuto:true,cfhStatement:statement,cfhConfirmed:due.confirmed});

      }
      return results;
    }
    function cfhMetrobankDueDate(statementKey) {
      const confirmed = CFH_METROBANK_CONFIRMED[statementKey];
      const override = cfhMetrobankOverrides()[statementKey];
      if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return {key:override,confirmed:true};
      if (confirmed) return {key:confirmed,confirmed:true};
      const [y,m,d] = statementKey.split('-').map(Number);
      const due = new Date(y,m-1,d+cfhCardScheduleSettings('metrobank',statementKey.slice(0,7)).dueDays);
      // Weekends are predictable; unannounced special holidays are not.
      while (due.getDay()===0 || due.getDay()===6) due.setDate(due.getDate()+1);
      return {key:cfhCalendarDateKey(due),confirmed:false};
    }
    function cfhMetrobankOverrides() { try { return readJSON(CFH_METROBANK_OVERRIDE_KEY)||{}; } catch(e){return {};} }
    function cfhMetrobankIsActiveForStatement(statement) {
      const stopped = cfhMetrobankStoppedAfter();
      return !stopped || statement <= stopped;
    }
    function cfhMetrobankStoppedAfter() { try { return localStorage.getItem(CFH_METROBANK_STATUS_KEY) || ''; } catch(e) { return ''; } }
    function cfhMetrobankStatementUnlocked(statementKey) {
      return statementKey.slice(0,7) >= '2026-10' &&
        Number(statementKey.slice(0,4)) <= cfhMetrobankUnlockedThrough();
    }
    function cfhMetrobankUnlockedThrough() {
      const now = new Date();
      const year = now.getFullYear();
      return now.getMonth() === 11 ? year + 1 : year;
    }
    function cfhCalendarMatches(entry,key){
      if(key<entry.date||entry.repeatUntil&&key>entry.repeatUntil)return false;
      if(entry.date===key)return true;
      const custom=entry.repeat==='custom',unit=custom?entry.repeatUnit:entry.repeat;
      if(!unit||unit==='none')return false;
      const interval=custom?Math.max(1,Number(entry.repeatInterval)||1):1;
      const [sy,sm,sd]=entry.date.split('-').map(Number),[y,m,d]=key.split('-').map(Number);
      const days=Math.round((Date.UTC(y,m-1,d)-Date.UTC(sy,sm-1,sd))/86400000);
      if(unit==='daily')return days%interval===0;
      if(unit==='weekly')return days%(7*interval)===0;
      if(unit==='monthly')return ((y-sy)*12+m-sm)%interval===0&&d===Math.min(sd,new Date(y,m,0).getDate());
      if(unit==='yearly')return (y-sy)%interval===0&&m===sm&&d===Math.min(sd,new Date(y,m,0).getDate());
      return false;
    }
 return function(key:string){
 return cfhCalendarForDate(key).filter(e=>cfhBellEnabled(e.id)).map(e=>{
 const bank=cfhCardKey(e),prefs=bank?cfhEntryPrefs(e):e,names=bank?cfhCardDisplayNames(e):null;
 return {id:e.id,title:names?names.bank+' '+names.card+' — '+(e.type==='due'?'Due date':'Statement'):e.title,date:key,time:cfhCardNotificationTime(e),days:Array.isArray(prefs.reminderDays)?prefs.reminderDays:[7,5,3,2,1,0]};
 });
};
}
export function notificationEntries(snapshot:Record<string,string>,key:string){return createNotificationReader(snapshot)(key);}
