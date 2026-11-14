const numberPattern=/(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)/y;
const identifierPattern=/[A-Za-z][A-Za-z0-9_]*/y;
const decimal=new Intl.NumberFormat('en-PH',{maximumFractionDigits:8});
const pesos=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'});

function evaluate(source,variables){
 const expression=source.trim().replace(/[×÷−]/g,character=>({'×':'*','÷':'/','−':'-'})[character]);
 if(!expression||expression.length>240)return null;
 let index=0;
 function take(pattern){
  while(/\s/.test(expression[index]||''))index++;
  if(typeof pattern==='string'){
   if(expression[index]!==pattern)return false;
   index++;
   return true;
  }
  pattern.lastIndex=index;
  const token=pattern.exec(expression)?.[0];
  if(token)index+=token.length;
  return token;
 }
 function primary(){
  if(take('(')){
   const value=sum();
   if(!take(')'))throw Error();
   return value;
  }
  const currency=take('₱');
  const digits=take(numberPattern);
  if(digits)return {value:Number(digits.replaceAll(',','')),currency};
  const name=currency?null:take(identifierPattern);
  if(!variables.has(name))throw Error();
  return variables.get(name);
 }
 function unary(){
  if(take('+'))return unary();
  if(take('-')){const item=unary();return {...item,value:-item.value};}
  const item=primary();
  return take('%')?{...item,value:item.value/100}:item;
 }
 function combine(left,right,operation){
  return {value:operation(left.value,right.value),currency:left.currency||right.currency};
 }
 function product(){
  let left=unary();
  while(true){
   if(take('*'))left=combine(left,unary(),(a,b)=>a*b);
   else if(take('/'))left=combine(left,unary(),(a,b)=>a/b);
   else return left;
  }
 }
 function sum(){
  let left=product();
  while(true){
   if(take('+'))left=combine(left,product(),(a,b)=>a+b);
   else if(take('-'))left=combine(left,product(),(a,b)=>a-b);
   else return left;
  }
 }
 try{
  const result=sum();
  return index===expression.length&&Number.isFinite(result.value)&&Math.abs(result.value)<=1e15?result:null;
 }catch{return null;}
}

export function noteMathResults(text){
 const variables=new Map(),results=[];
 let start=0;
 for(const line of text.split('\n')){
  const equals=line.indexOf('=');
  if(equals>=0&&equals===line.lastIndexOf('=')){
   const lhs=line.slice(0,equals).trim(),rhs=line.slice(equals+1).trim();
   if(/^[A-Za-z][A-Za-z0-9_]*$/.test(lhs)&&rhs){
    const value=evaluate(rhs,variables);
    if(value)variables.set(lhs,value);
    else variables.delete(lhs);
   }else if(!rhs||/^(?:g|kg|mg|ml|l|tsp|tbsp|cloves?|pcs?|people|shares?|units?)$/i.test(rhs)){
    const value=evaluate(lhs.slice(lhs.lastIndexOf(':')+1).replace(/^[•]\s*/,''),variables);
    if(value)results.push({offset:start+equals+1,text:(value.currency?pesos:decimal).format(value.value===0?0:value.value)});
   }
  }
  start+=line.length+1;
 }
 return results;
}

export function displayNoteMath(text){
 for(const result of noteMathResults(text).reverse()){
  const suffix=text.slice(result.offset);
  text=text.slice(0,result.offset)+' '+result.text+(/^[^\s]/.test(suffix)?' ':'')+suffix;
 }
 return text;
}
