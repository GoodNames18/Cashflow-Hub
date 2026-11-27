// Card cash flow and loan principal are deliberately separate.
export function loanMoney(value,label,{zero=false,blank=false}={}){
 const raw=String(value??'').replace(/[₱,\s]/g,'');
 if(!raw&&blank)return 0;
 if(!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw))throw Error('Enter a valid '+label+' with up to two decimal places.');
 const cents=Math.round(Number(raw)*100);
 if(!Number.isSafeInteger(cents)||cents<(zero?0:1))throw Error('Enter a '+(zero?'nonnegative':'positive')+' '+label+'.');
 return cents/100;
}
export function loanPaymentParts(description){
 const full=String(description||''),text=full.split('\nDetails: ')[0].trim();
 if(/^loan$/i.test(text))return {atomic:false,rebate:0,principal:0};
 const match=/^loan payment(?: \| principal (\d+\.\d{2}))?$/i.exec(text);
 if(!match)return null;
 const breakdown=/\nDetails: \[Payment (\d+\.\d{2}); Pledge credit (\d+\.\d{2})\]/.exec(full);
 return {atomic:!!breakdown,payment:Number(breakdown?.[1]||0),rebate:Number(breakdown?.[2]||0),principal:Number(match[1]||0)};
}
export function loanPaymentDescription(entry){return 'Loan payment'+(entry.principal?' | Principal '+entry.principal.toFixed(2):'')+'\nDetails: [Payment '+entry.payment.toFixed(2)+'; Pledge credit '+entry.rebate.toFixed(2)+']';}
export function loanUserDetails(value){return String(value||'').replace(/^\[Payment \d+\.\d{2}; Pledge credit \d+\.\d{2}\](?: — )?/,'');}
export function validateLoanPayment(params){
 const payment=loanMoney(params.amount,'payment'),rebate=loanMoney(params.rebate,'pledge credit',{zero:true,blank:true});
 if(rebate>=payment)throw Error('Pledge credit must be less than the payment. Use 0 when there is no credit.');
 let principal=loanMoney(params.principal,'principal paid',{zero:true,blank:true}),expectedLoanRemaining,remainingAfter;
 if(String(params.remainingAfter??'').trim()!==''){
  remainingAfter=loanMoney(params.remainingAfter,'remaining loan balance',{zero:true});
  expectedLoanRemaining=loanMoney(params.loanBefore,'current loan balance',{zero:true});
  const reduction=Math.round((expectedLoanRemaining-remainingAfter)*100)/100;
  if(reduction<0)throw Error('Remaining loan is higher than the app balance. Reconcile the loan balance before recording this payment.');
  if(String(params.principal??'').trim()!=='')throw Error('Enter either principal paid or remaining loan balance, not both.');
  principal=reduction;
 }
 if(principal>payment)throw Error('Principal paid cannot exceed the payment. Check the loan statement.');
 return {payment,rebate,principal,netDeduction:Math.round((payment-rebate)*100)/100,...(remainingAfter===undefined?{}:{expectedLoanRemaining,remainingAfter})};
}

if(typeof window!=='undefined'){window.cfhValidateLoanPayment=validateLoanPayment;window.cfhLoanPaymentParts=loanPaymentParts;}
