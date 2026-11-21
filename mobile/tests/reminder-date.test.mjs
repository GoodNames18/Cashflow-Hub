import test from 'node:test';import assert from 'node:assert/strict';
import {formatReminderDate} from '../../supabase/cfh-reminder-date.mjs';
test('reminder display uses time first, AM/PM, abbreviated month, day and year',()=>{
 for(const [raw,expected] of [['2006-08-29T00:00','12:00 AM Aug 29, 2006'],['2006-08-29T12:00','12:00 PM Aug 29, 2006'],['2026-11-21T13:45','01:45 PM Nov 21, 2026'],['2026-01-01T09:05','09:05 AM Jan 1, 2026'],['2026-11-21T16:30:00Z','12:30 AM Nov 22, 2026']]){assert.equal(formatReminderDate(raw),expected);}
 assert.equal(formatReminderDate(''),'');assert.equal(formatReminderDate('invalid'),'');
});
