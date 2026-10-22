import {parseDividendSchedule,parseCompanyNews,dividendScheduleIssues} from '../../cfh-market-announcements.mjs';
const BASE='https://edge.pse.com.ph';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{headers:cors,status});
const cache=new Map<string,{at:number,data:any}>();
async function cached(key:string,load:()=>Promise<any>){const old=cache.get(key);if(old&&Date.now()-old.at<300000)return old.data;const data=await load();cache.set(key,{at:Date.now(),data});return data;}
async function text(path:string){const response=await fetch(BASE+path,{headers:{Accept:'text/html,application/json'},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('PSE EDGE returned '+response.status);return await response.text();}
function day(d:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function queryDate(iso:string){const [y,m,d]=iso.split('-');return m+'-'+d+'-'+y;}
export async function marketNews(body:any){
 const symbols=[...new Set((Array.isArray(body?.symbols)?body.symbols:[]).map((s:any)=>String(s).trim().toUpperCase()).filter((s:string)=>/^[A-Z0-9][A-Z0-9.\-]{0,19}$/.test(s)))].slice(0,30) as string[];
 const now=new Date(),today=day(now),from=day(new Date(now.getTime()-90*86400000)),params='?fromDate='+queryDate(from)+'&toDate='+queryDate(today)+'&pageNo=1&dateSortType=DESC&sortType=date';
 const warnings:string[]=[],dividends:any[]=[],companyIds:Record<string,string>={},checkedSymbols:string[]=[];let news:any[]=[];
 await Promise.all([cached('news:'+today,async()=>parseCompanyNews(await text('/announcements/search.ax'+params))).then(data=>news=data).catch(()=>warnings.push('Company announcements could not be refreshed.')),
 ...Array.from({length:Math.min(3,symbols.length)},async(_,i)=>{for(let j=i;j<symbols.length;j+=3){const symbol=symbols[j];try{const company=await cached('company:'+symbol,async()=>{const options=JSON.parse(await text('/autoComplete/searchCompanyNameSymbol.ax?term='+encodeURIComponent(symbol)));const exact=Array.isArray(options)?options.find((c:any)=>c.symbol===symbol&&/^\d+$/.test(c.cmpyId)):null;if(!exact)throw Error('Symbol not found');return exact;});companyIds[symbol]=company.cmpyId;const schedule=await cached('dividends:'+symbol,async()=>{const html=await text('/companyPage/dividends_and_rights_list.ax?DividendsOrRights=Dividends&cmpy_id='+company.cmpyId);return {rows:parseDividendSchedule(html,symbol,company.cmpyId),issues:dividendScheduleIssues(html,symbol,today)};});warnings.push(...schedule.issues);if(!schedule.issues.length)checkedSymbols.push(symbol);dividends.push(...schedule.rows.filter((r:any)=>r.paymentDate>=today));}catch{warnings.push(symbol+': dividend announcements could not be refreshed.');}}})]);
 if(!news.length&&warnings.length&&dividends.length===0)throw Error('PSE announcements are temporarily unavailable');
 return {news,dividends,companyIds,checkedSymbols,warnings,fetched_at:new Date().toISOString(),source:'PSE EDGE'};
}
Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return json({error:'Method not allowed'},405);let body;try{body=await req.json();}catch{return json({error:'Invalid JSON'},400);}try{return json(await marketNews(body));}catch{return json({error:'PSE announcements are temporarily unavailable. Last saved announcements are kept.'},502);}});
