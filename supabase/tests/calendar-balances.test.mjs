import test from 'node:test';
import assert from 'node:assert/strict';
import { ManilaDate, sourceDate } from '../manila-date.mjs?v=calendar3';
import { computeTestDashboardFromRows_, configureKonekSeed } from '../legacy-rules.mjs?v=calendar3';

test('Manila calendar handles year rollover and leap days independent of host timezone', () => {
  const date = sourceDate('2027-01-01');
  assert.equal(date.toISOString(), '2026-12-31T16:00:00.000Z');
  assert.equal(date.getDay(), 5);
  date.setMonth(date.getMonth() - 1);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 11);
  const leap = new ManilaDate('2028-02-28T23:30:00');
  leap.setDate(leap.getDate() + 1);
  assert.equal(leap.getDate(), 29);
  leap.setDate(leap.getDate() + 1);
  assert.equal(leap.getMonth(), 2);
  assert.equal(leap.getHours(), 23);
  assert.equal(sourceDate('2027-01-01T00:15:00').toISOString(), '2026-12-31T16:15:00.000Z');
});

test('earnings use transaction dates after edits and amounts retain cents', () => {
  configureKonekSeed({reset_at:'2026-09-20T16:00:00Z',bank_card:0,gcash:0,cash_on_hand:0,held_money:0,loan_remaining:0,others_loan:0,savings_included_in_total:0});
  const row = (date, amount, desc) => [new ManilaDate(date),new ManilaDate(date),'Card',amount,'','Income',desc];
  const older = row('2026-10-01T10:00:00+08:00',0.1,'Monthly interest — ₱0.10 interest, ₱0.00 tax');
  const payment = row('2026-10-02T10:00:00+08:00',1,'Loan payment');
  payment[5] = 'Expense';
  const newest = row('2026-10-03T10:00:00+08:00',0.2,'Monthly interest — ₱0.20 interest, ₱0.00 tax');
  const result = computeTestDashboardFromRows_([older,newest,payment]);
  assert.equal(result.card,-0.7);
  assert.equal(result.totalEarned,0.3);
  assert.equal(result.thisWeekEarned,0.2);
});
