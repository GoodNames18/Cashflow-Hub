// Recover data flattened by the removed checklist -> text -> checklist conversion.
export function unwrapCheckboxText(value){
 const text=String(value||''),match=/^((?:\s*[☐☑☒□]\ufe0f?\s*)+)([\s\S]*)$/u.exec(text);
 if(!match)return {text,markers:0,checked:false};
 const markers=match[1].match(/[☐☑☒□]/gu);
 return {text:match[2],markers:markers.length,checked:/[☑☒]/u.test(markers.at(-1))};
}
const validDate=value=>Number.isFinite(value)&&value>0;
const identity=value=>String(value||'').trim().replace(/\s+/g,' ');
export function repairLegacyChecklist(note,originals=[]){
 if(note?.kind!=='list'||!Array.isArray(note.items))return {note,changed:false};
 const parsed=note.items.map(item=>unwrapCheckboxText(item.text));
 const marked=parsed.filter(item=>item.markers),nonblank=note.items.filter(item=>item.text?.trim());
 const converted=marked.some(item=>item.markers>1)||(marked.length>=2&&marked.length===nonblank.length);
 const candidates=originals.filter(source=>source?.id===note.id&&source.kind==='list').flatMap(source=>source.items||[])
  .filter(item=>validDate(item.createdAt)&&!item.originalDateUnavailable&&!unwrapCheckboxText(item.text).markers);
 let changed=false,boxes=0,checked=0,datesRecovered=0,datesUnavailable=0;
 const items=note.items.map((item,index)=>{
  const part=parsed[index],flattened=converted&&part.markers>0;
  if(!flattened&&!item.originalDateUnavailable)return item;
  let next={...item};
  if(flattened){next.text=part.text;next.checked=!!item.checked||part.checked;boxes+=part.markers;if(next.checked&&!item.checked)checked++;next.recoveredFromCheckboxText=true;}
  // Conversion assigned new timestamps to every row. Never present those as original dates.
  const matching=candidates.filter(old=>identity(old.text)===identity(next.text));
  const byId=matching.filter(old=>old.id===item.id),dates=[...new Set((byId.length?byId:matching).map(old=>old.createdAt))];
  if(dates.length===1){next.createdAt=dates[0];delete next.originalDateUnavailable;datesRecovered++;}
  else if(flattened){if(validDate(next.createdAt))next.conversionCreatedAt=next.createdAt;delete next.createdAt;next.originalDateUnavailable=true;datesUnavailable++;}
  if(JSON.stringify(next)===JSON.stringify(item))return item;changed=true;return next;
 });
 if(!changed)return {note,changed:false};
 return {note:{...note,items,...(checked?{checkedExpanded:false}:{}),legacyChecklistRepairVersion:1},changed:true,stats:{boxes,checked,datesRecovered,datesUnavailable}};
}
