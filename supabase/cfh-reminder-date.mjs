// Formatting is presentation only: callers keep the original reminder value.
export function formatReminderDate(value) {
 if(typeof value!=='string'||!value)return '';
 const local=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value);
 const date=new Date(local?value+'Z':value);
 if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:local?'UTC':'Asia/Manila',hour:'2-digit',minute:'2-digit',hour12:true,month:'short',day:'numeric',year:'numeric'}).formatToParts(date);
 const part=name=>parts.find(p=>p.type===name)?.value||'';
 return `${part('hour')}:${part('minute')} ${part('dayPeriod')} ${part('month')} ${part('day')}, ${part('year')}`;
}
export function createReminderDateField(doc,value) {
 const wrapper=doc.createElement('span');wrapper.className='cfh-reminder-date-field';
 const display=doc.createElement('span');display.className='cfh-reminder-date-display';display.setAttribute('aria-hidden','true');
 const input=doc.createElement('input');input.type='datetime-local';input.value=value;input.setAttribute('aria-label','Reminder date and time');
 const refresh=()=>{display.textContent=formatReminderDate(input.value)||'Choose date and time';};
 input.addEventListener('input',refresh);input.addEventListener('change',refresh);
 input.addEventListener('click',()=>{try{input.showPicker?.();}catch{/* Native date/time controls remain available when showPicker is unsupported. */}});
 wrapper.append(display,input);refresh();return {element:wrapper,input};
}
