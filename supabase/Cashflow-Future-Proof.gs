/* Add this as a NEW Apps Script file; keep Code.gs and Cashflow-Sheets-Sync.gs.
 * In Code.gs insert these lines at the START of the named functions:
 * computeTestDashboardFromRows_(rows, liveStartAt, asOfDate):
 *   rows = cfhPrepareKonekRows_(rows);
 * refreshTestSheetDashboard_(sheet, dashboard, rows, liveStartAt, asOfDate):
 *   cfhRollKonekPeriod_(sheet, asOfDate);
 * refreshTestYearlyDashboard_(sheet, rows, liveStartAt, asOfDate):
 *   cfhRollKonekPeriod_(sheet, asOfDate);
 * Then run cfhSetupFutureProof once. It creates only its own 10-minute trigger.
 * Project Settings > Time zone must be Asia/Manila.
 */
function cfhPrepareKonekRows_(rows) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get('CFH_KONEK_SEED_V1');
  if (!raw) {
    var settings = cfhBackend_('cfh_settings?select=value&owner_id=eq.161ecab1-d1d7-4fef-a089-a7300b9da774&setting_key=eq.konek_balance_seed');
    if (!settings || settings.length !== 1) throw new Error('Missing Konek2Card balance settings.');
    raw = JSON.stringify(settings[0].value);
    cache.put('CFH_KONEK_SEED_V1', raw, 300);
  }
  var seed = JSON.parse(raw);
  ['bank_card','gcash','cash_on_hand','held_money','loan_remaining','others_loan','savings_included_in_total'].forEach(function(key) {
    if (seed[key] === null || seed[key] === '' || !isFinite(Number(seed[key]))) throw new Error('Invalid Konek2Card balance setting: ' + key);
  });
  var reset = new Date(seed.reset_at);
  if (isNaN(reset.getTime())) throw new Error('Invalid Konek2Card reset date.');
  TEST_START_BANK_CARD_ = Number(seed.bank_card);
  TEST_START_GCASH_ = Number(seed.gcash);
  TEST_START_CASH_ON_HAND_ = Number(seed.cash_on_hand);
  TEST_START_HELD_MONEY_ = Number(seed.held_money);
  TEST_START_LOAN_REMAINING_ = Number(seed.loan_remaining);
  TEST_START_OTHERS_LOAN_ = Number(seed.others_loan);
  TEST_START_SAVINGS_INCLUDED_IN_TOTAL_ = Number(seed.savings_included_in_total);
  TEST_BALANCE_RESET_AT_ = reset;
  return (rows || []).slice().sort(function(a,b) {
    return getTestRowTimestamp_(b) - getTestRowTimestamp_(a);
  });
}

function cfhRollKonekPeriod_(sheet, asOfDate) {
  var now = asOfDate instanceof Date ? asOfDate : new Date();
  var month = Utilities.formatDate(now, 'Asia/Manila', 'yyyy-MM');
  var year = Utilities.formatDate(now, 'Asia/Manila', 'yyyy');
  var props = PropertiesService.getScriptProperties();
  var prefix = 'CFH_PERIOD_' + sheet.getParent().getId() + '_' + sheet.getSheetId();
  if (props.getProperty(prefix + '_MONTH') !== month) {
    sheet.getRange('K2').clearDataValidations().setValue(Utilities.formatDate(now, 'Asia/Manila', 'MMMM yyyy').toUpperCase());
    props.setProperty(prefix + '_MONTH', month);
  }
  if (props.getProperty(prefix + '_YEAR') !== year) {
    sheet.getRange('V2').clearDataValidations().setValue(Number(year));
    props.setProperty(prefix + '_YEAR', year);
  }
}

function cfhRefreshFutureProofDashboard() {
  if (Session.getScriptTimeZone() !== 'Asia/Manila') throw new Error('Set project time zone to Asia/Manila in Project Settings.');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var sheet = cfhWorkbook_().getSheetByName('Konek2Card');
    if (!sheet) throw new Error('Konek2Card sheet not found.');
    var count = Math.max(0, sheet.getLastRow() - 4);
    var rows = cfhPrepareKonekRows_(count ? sheet.getRange(5,2,count,7).getValues() : []);
    var now = new Date();
    cfhRollKonekPeriod_(sheet, now);
    var liveStart = PropertiesService.getDocumentProperties().getProperty('TEST_LIVE_START_AT_V3');
    var dashboard = computeTestDashboardFromRows_(rows, liveStart, now);
    refreshTestSheetDashboard_(sheet, dashboard, rows, liveStart, now);
    refreshTestYearlyDashboard_(sheet, rows, liveStart, now);
  } finally { lock.releaseLock(); }
}

function cfhSetupFutureProof() {
  if (Session.getScriptTimeZone() !== 'Asia/Manila') throw new Error('Set project time zone to Asia/Manila in Project Settings, then run again.');
  cfhWorkbook_().setSpreadsheetTimeZone('Asia/Manila');
  CacheService.getScriptCache().remove('CFH_KONEK_SEED_V1');
  cfhRefreshFutureProofDashboard();
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'cfhRefreshFutureProofDashboard') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('cfhRefreshFutureProofDashboard').timeBased().everyMinutes(10).create();
}
