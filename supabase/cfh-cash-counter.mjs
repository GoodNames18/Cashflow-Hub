import {formatTextField} from './cfh-number-format.mjs';
export const denominations = Object.freeze([1000,500,200,100,50,20,10,5,1]);
export const storageKey = 'cashflow-hub:cash-counter-v1';
export function normalizeCounts(value) {
  return Object.fromEntries(denominations.map(d => [d, Number.isSafeInteger(value?.[d]) && value[d] >= 0 && value[d] <= 999999 ? value[d] : 0]));
}
export function cashTotal(counts) {
  const safe = normalizeCounts(counts);
  return denominations.reduce((sum,d) => sum + d * safe[d],0);
}
export function manilaDay(now = Date.now()) {
  return new Date(Number(now) + 8 * 60 * 60 * 1000).toISOString().slice(0,10);
}
export function nextMidnightDelay(now = Date.now()) {
  const shifted = Number(now) + 8 * 60 * 60 * 1000;
  return 86400000 - ((shifted % 86400000 + 86400000) % 86400000);
}
export function restoreDailyCount(saved, now = Date.now()) {
  const date = manilaDay(now);
  // Preserve existing counts on upgrade; older releases did not record their date.
  return {date, counts: normalizeCounts(saved?.date ? (saved.date === date ? saved.counts : null) : saved)};
}
export function mountCashCounter(root, storage, {now = Date.now, schedule = true} = {}) {
  let saved;
  try { saved = JSON.parse(storage.getItem(storageKey)); } catch {}
  let {counts, date} = restoreDailyCount(saved, now());
  const peso = n => '₱' + n.toLocaleString('en-PH');
  root.innerHTML = `<header class="cash-heading"><div><p>MONEY</p><h1>Cash counter</h1></div><button type="button" id="cashReset">Clear</button></header><section class="cash-summary" aria-label="Counted cash"><span>Total cash</span><strong id="cashTotal" aria-live="polite"></strong><small id="cashPieces"></small></section><div class="cash-columns" aria-hidden="true"><span>Denomination</span><span>Quantity</span><span>Subtotal</span></div><div class="cash-rows">${denominations.map(d=>`<label class="cash-row"><span class="cash-denomination">${peso(d)}</span><input data-cash="${d}" type="text" inputmode="numeric" pattern="[0-9,]*" maxlength="7" placeholder="0" aria-label="Quantity of ${d} peso bills or coins"><output data-subtotal="${d}"></output></label>`).join('')}</div><p class="cash-local" id="cashStatus" role="status">Saved on this device · Resets at 12 AM (PH)</p><dialog id="cashConfirm"><h2>Clear cash count?</h2><p>This resets all quantities to zero.</p><div><button type="button" id="cashCancel">Cancel</button><button type="button" id="cashClear">Clear</button></div></dialog>`;
  const status = root.querySelector('#cashStatus');
  function render() {
    root.querySelector('#cashTotal').textContent = peso(cashTotal(counts));
    const pieces = denominations.reduce((n,d)=>n+counts[d],0);
    root.querySelector('#cashPieces').textContent = `${pieces.toLocaleString('en-PH')} ${pieces===1?'bill / coin':'bills / coins'}`;
    denominations.forEach(d=>{ root.querySelector(`[data-subtotal="${d}"]`).textContent = peso(d*counts[d]); });
  }
  function persist() {
    try { storage.setItem(storageKey,JSON.stringify({date,counts})); status.textContent = 'Saved on this device · Resets at 12 AM (PH)'; }
    catch { status.textContent = 'Could not save on this device. Keep this page open to retain your count.'; }
  }
  function checkDay() {
    if (date === manilaDay(now())) return;
    date = manilaDay(now()); counts = normalizeCounts(null);
    root.querySelectorAll('[data-cash]').forEach(input=>input.value='');
    render(); persist();
  }
  root.querySelectorAll('[data-cash]').forEach(input=>{
    input.value = counts[input.dataset.cash] || '';formatTextField(input);
    input.addEventListener('input',()=>{
      const typed = input.value.replace(/[^0-9]/g,'').slice(0,6);
      checkDay();
      input.value = typed;
      counts[input.dataset.cash] = Number(input.value || 0);
      formatTextField(input);render(); persist();
    });
  });
  const dialog=root.querySelector('#cashConfirm');
  root.querySelector('#cashReset').onclick=()=>dialog.showModal();
  root.querySelector('#cashCancel').onclick=()=>dialog.close();
  root.querySelector('#cashClear').onclick=()=>{
    counts=normalizeCounts(null);root.querySelectorAll('[data-cash]').forEach(input=>input.value='');render();persist();dialog.close();
  };
  render(); persist();
  const win = root.ownerDocument.defaultView, doc = root.ownerDocument;
  let timer;
  function armReset() {
    win.clearTimeout(timer); checkDay();
    if(schedule) timer = win.setTimeout(armReset,nextMidnightDelay(now()) + 20);
  }
  function resume() { if(doc.visibilityState !== 'hidden') armReset(); }
  doc.addEventListener('visibilitychange',resume);
  win.addEventListener('pageshow',resume);
  win.addEventListener('focus',resume);
  armReset();
  return () => { win.clearTimeout(timer); doc.removeEventListener('visibilitychange',resume); win.removeEventListener('pageshow',resume); win.removeEventListener('focus',resume); };
}
if (typeof document !== 'undefined') {
  const root=document.getElementById('cfhCashPage');
  if(root) { let storage; try { storage=window.localStorage; } catch {} mountCashCounter(root,storage); }
}
