// Match the existing app's source-balance rules. GCash-to-Card intentionally
// allows a negative GCash balance, representing Card debt to GCash.
export function checkKonekEntry(plan,params,balance) {
  const receipt=plan.receipt,amount=Number(receipt.amount??plan.records[0].amount);
  const enough=(field,value,message)=>{if(Number(balance[field]||0)+0.000001<value)throw new Error(message);};
  switch(params.action) {
    case 'testCashOut': enough('cashOnHand',amount,'Not enough Cash on Hand — borrow first.');break;
    case 'testAtmWithdraw': enough('card',amount,'Not enough Card balance.');break;
    case 'testLoan': enough('card',receipt.payment,'Not enough Card balance for the loan payment.');break;
    case 'testHoldMoney':
      if(params.holdAction==='release')enough('heldMoney',amount,'Release amount is greater than Money on Hold.');
      else enough('card',amount,'Not enough spendable Card money to hold.');
      break;
    case 'testOthersLoan':
      if(receipt.action==='minus') {
        enough('othersLoan',receipt.principal,'Payment is greater than Others Loan.');
        enough('card',receipt.principal,'Not enough Money on Card.');
      }
      break;
    case 'testTransfer':
      switch(params.direction) {
        case 'cashToGcash': enough('cashOnHand',amount,'Not enough Cash on Hand.');break;
        case 'cardToGcash': enough('card',amount,'Not enough Card balance.');break;
        case 'gcashToCash': enough('gcash',amount,'Not enough GCash balance.');break;
        case 'cashToNanay':
          enough('utangKayNanay',amount,'Amount is greater than Nanay loan.');
          enough('cashOnHand',amount,'Not enough Cash on Hand.');break;
      }
      break;
  }
}
