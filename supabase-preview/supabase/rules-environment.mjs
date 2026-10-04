import { ManilaDate, sourceDate } from './manila-date.mjs?v=financial4';
let state = null;
const names = { life_log:'Life Log', twice_as_nyce:'TwiceAsNyce',
  printing:'Printing Business', cash_in_out:'Cash In/Out', money_flow:'Money Flow',
  konek2card:'Konek2Card', rental:'Rental' };
export function withRecords(records, referenceCells, operation) {
  const previous = state;
  const sheets = {};
  for (const record of records.filter(r => !r.deleted_at)) {
    const name = names[record.tab_key];
    if (!name) throw new Error('Unknown record tab.');
    const row = record.source_values.map((v,i) => i < 2 ? sourceDate(v) : v);
    row.sourceRowNumber = record.id;
    row.sourceFingerprint = record.id + ':' + record.revision;
    (sheets[name] ||= []).push(row);
  }
  for (const rows of Object.values(sheets)) rows.sort((a,b) =>
    b[0].getTime() - a[0].getTime() || (b[1]?.getTime?.() || 0) - (a[1]?.getTime?.() || 0) ||
    b.sourceRowNumber.localeCompare(a.sourceRowNumber));
  state = { sheets, referenceCells };
  try { return operation(); } finally { state = previous; }
}
export function currentRows(name) {
  if (!state) throw new Error('No Cashflow Hub snapshot loaded.');
  return state.sheets[name] || [];
}
export const Session = { getScriptTimeZone: () => 'Asia/Manila' };
export const PropertiesService = {
  getDocumentProperties: () => ({ getProperty: key =>
    key === 'TEST_LIVE_START_AT_V3' ? '2026-07-31T16:00:00.000Z' : null })
};
export const SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: name => ({
    getLastRow: () => currentRows(name).length + (name === 'Rental' ? 5 : 4),
    getRange: (row, column, count, width) => ({
      getValues: () => {
        const start = name === 'Rental' ? 6 : 5;
        return currentRows(name).slice(row-start,row-start+count).map(original => {
          const copy = original.slice(column-2,column-2+width);
          copy.sourceRowNumber = original.sourceRowNumber;
          copy.sourceFingerprint = original.sourceFingerprint;
          return copy;
        });
      },
      getValue: () => {
        const value = state?.referenceCells?.[name]?.[row];
        if (value === undefined) throw new Error('Missing sheet reference value: ' + name + ' ' + row);
        return value;
      }
    })
  }) })
};
export const Utilities = {
  formatDate: (value, zone, pattern) => {
    const date = new ManilaDate(value.getTime());
    const month = date.getMonth(), day = date.getDate(), year = date.getFullYear();
    const months = ['January','February','March','April','May','June','July','August',
      'September','October','November','December'];
    const pad = v => String(v).padStart(2,'0');
    const tokens = { yyyy:String(year), yy:String(year).slice(-2), MMMM:months[month],
      MMM:months[month].slice(0,3), MM:pad(month+1), dd:pad(day), d:String(day),
      hh:pad(date.getHours()%12||12), mm:pad(date.getMinutes()),
      a:date.getHours()<12?'AM':'PM' };
    return pattern.replace(/yyyy|MMMM|MMM|MM|dd|hh|mm|yy|d|a/g, token=>tokens[token]);
  }
};
