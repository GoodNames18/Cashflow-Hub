const BASE='https://edge.pse.com.ph';
export function cleanText(value){return String(value).replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>String.fromCodePoint(Math.min(0x10ffff,n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n)))).replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/\s+/g,' ').trim();}
export function pseDate(value){const t=cleanText(value),m=/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/.exec(t);if(!m)return null;const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(m[1]);if(month<0)return null;const d=new Date(Date.UTC(+m[3],month,+m[2]));return d.getUTCMonth()===month&&d.getUTCDate()===+m[2]?d.toISOString().slice(0,10):null;}
export function cashRate(value){const t=cleanText(value).replace(/,/g,'');const m=/^(?:(?:PHP|PH[Pp]|P|₱)\s*)?(\d+(?:\.\d+)?)\s*(?:per\s+(?:common\s+)?share)?\.?$/i.exec(t);const n=m?Number(m[1]):NaN;return Number.isFinite(n)&&n>0&&n<=1e6?n:null;}
const rows=html=>[...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c=>c[1]));
const viewer=html=>{const id=/openPopup\(\s*['"]([a-f0-9]{32})['"]/i.exec(html)?.[1];return id?BASE+'/openDiscViewer.do?edge_no='+id:null;};
export function parseDividendSchedule(html,symbol,companyId){
 if(!/Dividend Information/.test(html)||!/Ex-Dividend Date/.test(html))throw Error('PSE dividend format changed');
 const result=[];
 for(const c of rows(html)){if(c.length!==7)continue;const security=cleanText(c[0]).toUpperCase();if(security!=='COMMON'&&security!==symbol)continue;if(cleanText(c[1]).toLowerCase()!=='cash')continue;
 const perShare=cashRate(c[2]),exDate=pseDate(c[3]),recordDate=pseDate(c[4]),paymentDate=pseDate(c[5]),url=viewer(c[6]);
 if(perShare===null||!exDate||!recordDate||!paymentDate||!url||recordDate<exDate||paymentDate<recordDate)continue;
 result.push({symbol,companyId,security,perShare,exDate,recordDate,paymentDate,url,circular:cleanText(c[6]),source:'PSE EDGE',key:[symbol,security,exDate,paymentDate,perShare].join('|')});
 }return result;
}
export function parseCompanyNews(html){
 if(!/Announce Date and Time/.test(html)||!/Circular Number/.test(html))throw Error('PSE news format changed');
 const result=[];for(const c of rows(html)){if(c.length!==5)continue;const url=viewer(c[1]),companyId=/cmpy_id=(\d+)/.exec(c[0])?.[1];if(!url||!companyId)continue;const title=cleanText(c[1]);if(!title)continue;result.push({id:url.split('=').at(-1),title,company:cleanText(c[0]),companyId,published:cleanText(c[3]),circular:cleanText(c[4]),url,source:'PSE EDGE'});}return result;
}
export function expectedAnnouncements(records,announcements,existing=[],today){
 const result=[],seen=new Set();
 for(const a of announcements){if(!a||!pseDateFromIso(a.exDate)||!pseDateFromIso(a.paymentDate)||!Number.isFinite(a.perShare)||a.perShare<=0||!/^https:\/\/edge\.pse\.com\.ph\/openDiscViewer\.do\?edge_no=[a-f0-9]{32}$/.test(a.url||''))continue;
 const byBroker=new Map();for(const r of records){if(r.kind!=='purchase'||r.asset!=='stock'||r.symbol!==a.symbol||!pseDateFromIso(r.date)||r.date>=a.exDate||r.date>today||!Number.isFinite(r.shares)||r.shares<=0)continue;byBroker.set(r.broker,(byBroker.get(r.broker)||0)+r.shares);}
 for(const [broker,shares]of byBroker){const key=a.key+'|'+broker;if(seen.has(key))continue;seen.add(key);
 if(existing.some(r=>r.symbol===a.symbol&&r.broker===broker&&(r.announcementKey===a.key||(r.exDate===a.exDate&&r.paymentDate===a.paymentDate&&Math.abs(r.perShare-a.perShare)<1e-8)||(!r.exDate&&r.paymentDate===a.paymentDate&&Math.abs(r.perShare-a.perShare)<1e-8))))continue;
 result.push({id:'pse:'+key,recordId:'pse:'+key,kind:'dividend',asset:'stock',status:'upcoming',symbol:a.symbol,broker,shares,perShare:a.perShare,tax:0,exDate:a.exDate,recordDate:a.recordDate,paymentDate:a.paymentDate,announcementKey:a.key,sourceUrl:a.url,source:'PSE EDGE',grossEstimate:true,at:a.firstSeen||new Date().toISOString(),notes:'Automatically matched to recorded purchases before the ex-date. Gross estimate before withholding tax; confirm actual broker credit.'});
 }}return result;
}
function pseDateFromIso(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function mergeAnnouncements(previous,incoming,today,checkedSymbols=[]){const checked=new Set(checkedSymbols);const map=new Map(previous.filter(a=>a&&a.key&&(a.paymentDate<today||!checked.has(a.symbol))).map(a=>[a.key,a]));for(const a of incoming){if(a.paymentDate<today&&!map.has(a.key))continue;map.set(a.key,{...a,firstSeen:map.get(a.key)?.firstSeen||new Date().toISOString()});}return [...map.values()];}
