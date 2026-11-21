export const denominations = Object.freeze([1000,500,200,100,50,20,10,5,1]);
export const storageKey = 'cashflow-hub:cash-counter-v1';
export function normalizeCounts(value) {
  return Object.fromEntries(denominations.map(d => [d, Number.isSafeInteger(value?.[d]) && value[d] >= 0 && value[d] <= 999999 ? value[d] : 0]));
}
export function cashTotal(counts) {
  const safe = normalizeCounts(counts);
  return denominations.reduce((sum,d) => sum + d * safe[d],0);
}
export function mountCashCounter(root, storage) {
  let counts;
  try { counts = normalizeCounts(JSON.parse(storage.getItem(storageKey))); } catch { counts = normalizeCounts(null); }
  const peso = n => '₱' + n.toLocaleString('en-PH');
  root.innerHTML = `<header class="cash-heading"><div><p>MONEY</p><h1>Cash counter</h1></div><button type="button" id="cashReset">Clear</button></header><section class="cash-summary" aria-label="Counted cash"><span>Total cash</span><strong id="cashTotal" aria-live="polite"></strong><small id="cashPieces"></small></section><div class="cash-columns" aria-hidden="true"><span>Denomination</span><span>Quantity</span><span>Subtotal</span></div><div class="cash-rows">${denominations.map(d=>`<label class="cash-row"><span class="cash-denomination">${peso(d)}</span><input data-cash="${d}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="0" aria-label="Quantity of ${d} peso bills or coins"><output data-subtotal="${d}"></output></label>`).join('')}</div><p class="cash-local" id="cashStatus" role="status">Saved on this device only</p><dialog id="cashConfirm"><h2>Clear cash count?</h2><p>This resets all quantities to zero.</p><div><button type="button" id="cashCancel">Cancel</button><button type="button" id="cashClear">Clear</button></div></dialog>`;
  const status = root.querySelector('#cashStatus');
  function render() {
    root.querySelector('#cashTotal').textContent = peso(cashTotal(counts));
    const pieces = denominations.reduce((n,d)=>n+counts[d],0);
    root.querySelector('#cashPieces').textContent = `${pieces.toLocaleString('en-PH')} ${pieces===1?'bill / coin':'bills / coins'}`;
    denominations.forEach(d=>{ root.querySelector(`[data-subtotal="${d}"]`).textContent = peso(d*counts[d]); });
  }
  function persist() {
    try { storage.setItem(storageKey,JSON.stringify(counts)); status.textContent = 'Saved on this device only'; }
    catch { status.textContent = 'Could not save on this device. Keep this page open to retain your count.'; }
  }
  root.querySelectorAll('[data-cash]').forEach(input=>{
    input.value = counts[input.dataset.cash] || '';
    input.addEventListener('input',()=>{
      input.value = input.value.replace(/[^0-9]/g,'').slice(0,6);
      counts[input.dataset.cash] = Number(input.value || 0);
      render(); persist();
    });
  });
  const dialog=root.querySelector('#cashConfirm');
  root.querySelector('#cashReset').onclick=()=>dialog.showModal();
  root.querySelector('#cashCancel').onclick=()=>dialog.close();
  root.querySelector('#cashClear').onclick=()=>{
    counts=normalizeCounts(null);root.querySelectorAll('[data-cash]').forEach(input=>input.value='');render();persist();dialog.close();
  };
  render();
}
if (typeof document !== 'undefined') {
  const root=document.getElementById('cfhCashPage');
  if(root) { let storage; try { storage=window.localStorage; } catch {} mountCashCounter(root,storage); }
}
