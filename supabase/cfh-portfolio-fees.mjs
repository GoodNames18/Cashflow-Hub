// Purchase fees only. Each component is rounded separately to centavos.
// COL: https://colfinancial.freshdesk.com/support/solutions/articles/6000073098
// COL minimum removed 2024-06-03: https://dr1.colfinancial.com/ape/final2/home/faqs_main.asp
export const centavos=n=>Math.round((n+Number.EPSILON)*100)/100;
export function estimatePurchaseFees({asset='stock',broker='',date='',shares,price,purchaseType='market'}){
 if(asset!=='stock')return {amount:null,message:'Enter the fee from your exchange receipt.'};
 if(purchaseType==='ipo')return {amount:null,message:'IPO: enter the fee from your allocation notice, including 0 if no extra fee was charged.'};
 const col=/^col(?: financial)?$/i.test(broker.trim());
 // Other brokers remain manual until their complete, dated fee schedule is verified.
 if(!col)return {amount:null,message:'Enter the fee from your broker invoice. Automatic estimates are currently available for COL Financial.'};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return {amount:null,message:'Choose a purchase date to estimate fees.'};
 const gross=Number(shares)*Number(price);
 if(!(gross>0)||!Number.isFinite(gross)||gross>1e12)return {amount:null,message:'Enter shares and price to estimate fees.'};
 const commission=centavos(Math.max(date<'2024-06-03'?20:0,gross*.0025));
 const vat=centavos(commission*.12),pse=centavos(gross*.00005),sccp=centavos(gross*.0001);
 return {amount:centavos(commission+vat+pse+sccp),commission,vat,pse,sccp,message:'Estimated COL fees · Check your invoice.'};
}
export function resolvePurchaseFees(input,mode,value){const estimate=estimatePurchaseFees(input);return {estimate,value:mode==='manual'?value:estimate.amount===null?'':estimate.amount.toFixed(2)};}
