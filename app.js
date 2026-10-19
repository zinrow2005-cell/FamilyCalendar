
/* 家日曆 v1.9.0 — Google Sheets + Apps Script 雲端同步 */
'use strict';
// localStorage 在限制環境中可能被瀏覽器拒絕，確保核心功能仍可操作。
const storageAvailable=(()=>{try{const k='__familycalendar_storage_test__';localStorage.setItem(k,'1');localStorage.removeItem(k);return true}catch{return false}})();
const safeStorage=storageAvailable?localStorage:{getItem(){return null},setItem(){},removeItem(){}};
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const STORE = 'familycolor_v1_local';
const cloud={familyId:null}; // 舊 Firestore 已完整移除；所有資料先由本機保存，再同步 Google Sheets。
const DEFAULT_MEMBERS = [
  {id:'dad', name:'爸爸', emoji:'👨', color:'#637cf3'},
  {id:'mom', name:'媽媽', emoji:'👩', color:'#ed7fa2'},
  {id:'daughter', name:'女兒', emoji:'👧', color:'#c18aea'},
  {id:'son', name:'兒子', emoji:'👦', color:'#2caf9e'}
];
const WEEK = ['一','二','三','四','五','六','日'];
const MONTH_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const T = date => new Date(date.getFullYear(),date.getMonth(),date.getDate());
const iso = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const fromISO = s => {const [y,m,d]=String(s).slice(0,10).split('-').map(Number);return new Date(y,m-1,d)};
const addDays = (date,n) => new Date(date.getFullYear(),date.getMonth(),date.getDate()+n);
const addMonths = (date,n) => {const d=new Date(date.getFullYear(),date.getMonth()+n,1);d.setDate(Math.min(date.getDate(),new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return d};
function recurrenceEnd(start,repeat){const d=fromISO(start);return iso(addDays(addMonths(d,repeat==='yearly'?24:3),-1))}
function untilIsValid(s){return /^\d{4}-\d\d-\d\d$/.test(s)&&iso(fromISO(s))===s}

const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => (typeof crypto!=='undefined' && typeof crypto.randomUUID==='function') ? crypto.randomUUID() : ('e'+Date.now().toString(36)+Math.random().toString(36).slice(2));
const minDate = (a,b)=>a<b?a:b;
const safeColor = s => /^#[0-9a-fA-F]{6}$/.test(s||'') ? s : '#8b78eb';
const rgbSoft = (color,opacity=.10) => { const c=safeColor(color);return `rgba(${parseInt(c.slice(1,3),16)},${parseInt(c.slice(3,5),16)},${parseInt(c.slice(5,7),16)},${opacity})`; };
// 每筆事項的個人風格底色；不改動家庭成員的身分代表色。
const PASTELS=[
 ['奶油杏','#FCEAD5'],['蜜桃粉','#FADCD4'],['玫瑰奶茶','#F5DCE2'],['櫻花粉','#FBE5ED'],
 ['香草黃','#FFF0C6'],['蜂蜜橙','#FBE1BD'],['鼠尾草綠','#E0ECD9'],['抹茶奶綠','#E9EED0'],
 ['霧霾藍','#DFEAF4'],['湖水薄荷','#D9EEE9'],['薰衣草','#E9E3F6'],['灰紫奶霜','#EEE5EA']
];
function safeMemberPhoto(value){
 const x=String(value||'');
 return x.length<=24000&&/^data:image\/jpeg;base64,[a-zA-Z0-9+/]+={0,2}$/.test(x)?x:'';
}
function avatarHTML(m,klass='member-avatar'){
 const pic=safeMemberPhoto(m.photo);
 return `<span class="${klass} ${pic?'has-photo':''}" style="--member-soft:${rgbSoft(m.color,.15)}">${pic?`<img src="${esc(pic)}" alt="${esc(m.name)}的照片"/>`:esc(m.emoji)}</span>`;
}
async function compressMemberPhoto(file){
 if(!file||!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type||''))throw Error('請選擇 JPG、PNG、WebP 或 HEIC 照片');
 if(file.size>10*1024*1024)throw Error('照片須小於 10MB');
 const blobURL=URL.createObjectURL(file);
 let pic;
 try{pic=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(Error('無法讀取照片，請改用 JPG 或 PNG'));im.src=blobURL})}
 finally{URL.revokeObjectURL(blobURL)}
 if(!pic.naturalWidth||!pic.naturalHeight)throw Error('照片尺寸不正確');
 let result='';
 for(const [size,quality] of [[112,.75],[96,.65],[80,.55]]){
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('此瀏覽器無法處理照片');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);
  const width=pic.naturalWidth,height=pic.naturalHeight,side=Math.min(width,height);
  ctx.drawImage(pic,(width-side)/2,(height-side)/2,side,side,0,0,size,size);
  result=canvas.toDataURL('image/jpeg',quality);
  if(result.length<=22000)break;
 }
 if(!safeMemberPhoto(result))throw Error('圖片處理失敗，請改選較小照片');
 return result;
}
async function saveMemberPortrait(id,photo){
 const next=data.members.map(m=>m.id===id?{...m,photo:safeMemberPhoto(photo)}:m);
 data={...data,members:next};persist();render();
}
function shiftColorsHTML(value='',attr='data-shift-bg'){
 return `<button type="button" class="palette-auto" ${attr}="" aria-pressed="${!value}">依成員</button>`+PASTELS.map(([label,c])=>`<button type="button" class="pastel-swatch" style="--swatch:${c}" ${attr}="${c}" aria-label="${label}" title="${label}" aria-pressed="${value===c}"><span>✓</span></button>`).join('');
}
function eventBg(ev){return ev.bgColor?safeColor(ev.bgColor):rgbSoft(eventColor(ev),.14)}
function eventCss(ev){return `--ev-color:${safeColor(eventColor(ev))};--ev-bg:${eventBg(ev)}`}
function timeLabel(ev,day=''){if(ev.allDay)return '全天';if(day&&ev.repeat==='none'&&ev.endDate>ev.date&&day>ev.date)return day===ev.endDate?'↳ '+(ev.endTime||'')+' 結束':'↳ 跨日持續';return (ev.time||'未設定')+(ev.endTime?'–'+ev.endTime:'')}

const today = () => iso(new Date());
// 一人各自的常用事項庫，不預先塞入實際行程；只有使用者建立的快捷事項才會顯示。
function cleanQuickTemplate(t){
 if(!t||typeof t!=='object')return null;
 const title=String(t.title||'').trim().slice(0,80),memberId=String(t.memberId||'').slice(0,80);
 if(!title||!memberId)return null;
 const goodTime=x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x||'');
 const allDay=t.allDay!==false;
 return {id:String(t.id||uid()).slice(0,90),memberId,title,allDay,
   time:!allDay&&goodTime(t.time)?t.time:'09:00',endTime:!allDay&&goodTime(t.endTime)?t.endTime:'10:00',
   bgColor:PASTELS.some(v=>v[1]===t.bgColor)?t.bgColor:'',location:String(t.location||'').slice(0,120),
   note:String(t.note||'').slice(0,1000),repeat:['none','daily','weekly','monthly','yearly'].includes(t.repeat)?t.repeat:'none'};
}
function cleanQuickTemplates(raw,members){
 if(!Array.isArray(raw))return [];
 const ids=new Set(members.map(m=>m.id)),counts={};const seen=new Set();const cleaned=[];
 for(const candidate of raw.slice(0,800)){
  const t=cleanQuickTemplate(candidate);if(!t||!ids.has(t.memberId)||seen.has(t.id))continue;
  if((counts[t.memberId]||0)>=30)continue;
  seen.add(t.id);counts[t.memberId]=(counts[t.memberId]||0)+1;cleaned.push(t);
 }
 return cleaned;
}
function initialData(){return {familyName:'我們的家',members:DEFAULT_MEMBERS.map(m=>({...m})),events:[],quickTemplates:[]}}
function cleanEvent(ev){
  const title=String(ev.title||'').trim().slice(0,100), date=String(ev.date||'').slice(0,10);
  if(!title || !/^\d{4}-\d\d-\d\d$/.test(date) || Number.isNaN(fromISO(date).getTime()) || iso(fromISO(date))!==date) return null;
  const until=String(ev.until||'').slice(0,10), end=String(ev.endDate||date).slice(0,10);
  const exdates=Array.isArray(ev.exdates)?[...new Set(ev.exdates.filter(x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&x>=date).slice(0,1000))].sort():[];
  const time= /^\d\d:\d\d$/.test(ev.time||'')?ev.time:'';
  const endTime=/^\d\d:\d\d$/.test(ev.endTime||'')?ev.endTime:'';
  return {id:String(ev.id||uid()),title,date,endDate:end>=date&&/^\d{4}-\d\d-\d\d$/.test(end)?end:date,time,endTime,allDay:ev.allDay!==false,
    memberIds:Array.isArray(ev.memberIds)?[...new Set(ev.memberIds.filter(x=>typeof x==='string'))].slice(0,30):[],
    repeat:['none','daily','weekly','monthly','yearly'].includes(ev.repeat)?ev.repeat:'none',until:/^\d{4}-\d\d-\d\d$/.test(until)&&until>=date?until:'',exdates,
    note:String(ev.note||'').slice(0,1000),location:String(ev.location||'').slice(0,120),bgColor:ev.bgColor&&/^#[0-9a-fA-F]{6}$/.test(ev.bgColor)?ev.bgColor.toUpperCase():'',kind:ev.kind==='shift'?'shift':'event',done:!!ev.done,updatedAt:ev.updatedAt||Date.now()};
}
function cleanData(raw){
 const d=initialData();if(!raw||typeof raw!=='object')return d;
 d.familyName=String(raw.familyName||d.familyName).slice(0,40);
 if(Array.isArray(raw.members)&&raw.members.length) d.members=raw.members.slice(0,20).filter(m=>m&&typeof m.name==='string'&&m.name.trim()).map((m,i)=>({id:String(m.id||uid()),name:m.name.trim().slice(0,16),emoji:String(m.emoji||'😊').slice(0,8),color:safeColor(m.color),photo:safeMemberPhoto(m.photo)}));
 if(Array.isArray(raw.events))d.events=raw.events.slice(0,8000).map(cleanEvent).filter(Boolean);
 d.quickTemplates=cleanQuickTemplates(raw.quickTemplates,d.members);
 return d;
}
let localData;
try{localData=cleanData(JSON.parse(safeStorage.getItem(STORE)||'null'))}catch{localData=initialData()}
let data=localData;
let selectedDate=today(),cursor=new Date(),view='month';
let activeMemberIds=new Set(data.members.map(m=>m.id));

let visibleCalendarItems=[];
let toastTimer;
function persist(){localData=data;try{safeStorage.setItem(STORE,JSON.stringify(localData))}catch{toast('儲存空間不足，請先匯出資料備份')}scheduleSheetPush();}
function message(text){toast(text)}
function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3000)}
function member(id){return data.members.find(m=>m.id===id)}
function eventMembers(ev){return (ev.memberIds||[]).map(member).filter(Boolean)}
function eventColor(ev){return eventMembers(ev)[0]?.color||'#8b78eb'}
function currentEvents(){return Array.isArray(data.events)?data.events:[]}
function occurs(ev,dateStr){
 if(dateStr<ev.date || (ev.until && dateStr>ev.until) || (ev.exdates||[]).includes(dateStr))return false;
 let initial=fromISO(ev.date), dt=fromISO(dateStr);
 if(ev.repeat==='none')return dateStr>=ev.date&&dateStr<=(ev.endDate||ev.date);
 const duration=Math.max(0,Math.round((fromISO(ev.endDate||ev.date)-initial)/86400000));
 for(let lag=0;lag<=Math.min(duration,365);lag++){
  const candidate=addDays(dt,-lag);if(candidate<initial)break;
  const deltaDays=Math.round((candidate-initial)/86400000);
  if(ev.repeat==='daily')return true;
  if(ev.repeat==='weekly'&&deltaDays%7===0)return true;
  if(ev.repeat==='monthly'&&candidate.getDate()===initial.getDate())return true;
  if(ev.repeat==='yearly'&&candidate.getDate()===initial.getDate()&&candidate.getMonth()===initial.getMonth())return true;
 }
 return false;
}
function eventsOn(dateStr){const key=ev=>ev.allDay?'':(ev.repeat==='none'&&ev.endDate>ev.date&&dateStr>ev.date?'00:00':ev.time||'00:00');return currentEvents().filter(ev=>occurs(ev,dateStr)&&(!ev.memberIds.length||ev.memberIds.some(id=>activeMemberIds.has(id)))).sort((a,b)=>key(a).localeCompare(key(b))||a.title.localeCompare(b.title));}
function dateInfo(ds){let dt=fromISO(ds);return `${dt.getMonth()+1} 月 ${dt.getDate()} 日`}
function dayWeek(ds){return WEEK[(fromISO(ds).getDay()+6)%7]}
function daysBetween(start,end){const days=[];for(let dt=T(start);dt<=T(end);dt=addDays(dt,1)){days.push(iso(dt));if(days.length>400)break;}return days;}
function dateHeader(ds){const dt=fromISO(ds);return `${dt.getMonth()+1}/${dt.getDate()}（週${dayWeek(ds)}）`}
function render(){
 $('#familyTitle').textContent=data.familyName;
 syncStatus(sheetSync.blocked?'⚠ 同步衝突':sheetSync.active?(sheetSync.lastError?'⚠ 待同步':'Sheets 已同步'):(sheetSync.lastError?'連線失敗':'本機日曆'),sheetSync.active&&!sheetSync.lastError&&!sheetSync.blocked);
 renderMembers(); renderCalendar();renderSelectedDay();
 const boot=$('#bootFailure'); if(boot)boot.classList.add('hidden');
}
function renderMembers(){
 $('#memberFilters').innerHTML=data.members.map(m=>`<div class="member-filter-entry"><button class="member-filter ${activeMemberIds.has(m.id)?'active':''}" data-filter="${esc(m.id)}" style="--member-soft:${rgbSoft(m.color,.15)}">${avatarHTML(m)}<span class="member-name">${esc(m.name)}</span><span class="member-check">${activeMemberIds.has(m.id)?'✓':''}</span></button><button type="button" class="member-photo-upload" data-upload-member="${esc(m.id)}" title="上傳${esc(m.name)}的照片" aria-label="上傳${esc(m.name)}的照片">📷</button></div>`).join('');
}
function rangeForView(){const dt=new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate());if(view==='month'){const first=new Date(dt.getFullYear(),dt.getMonth(),1);const before=(first.getDay()+6)%7;const last=new Date(dt.getFullYear(),dt.getMonth()+1,0);const needed=Math.ceil((before+last.getDate())/7)*7;return {start:addDays(first,-before),end:addDays(first,needed-before-1)}}if(view==='week'){let before=(dt.getDay()+6)%7;return {start:addDays(dt,-before),end:addDays(dt,6-before)}}return {start:dt,end:addDays(dt,29)};}
function renderCalendar(){
 const month=$('#monthTitle'),sub=$('#monthSubtitle');
 const range=rangeForView();
 if(view==='month'){month.textContent=`${cursor.getFullYear()} 年 ${cursor.getMonth()+1} 月`;sub.textContent=`${MONTH_EN[cursor.getMonth()]} ${cursor.getFullYear()}`}
 else if(view==='week'){month.textContent=`${dateInfo(iso(range.start))} – ${dateInfo(iso(range.end))}`;sub.textContent=`${range.start.getFullYear()} 年・每週從星期一開始`}
 else{month.textContent=`${cursor.getFullYear()} 年 ${cursor.getMonth()+1} 月`;sub.textContent='未來 30 天的行程'}
 $$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 let markup=''; const ds=daysBetween(range.start,range.end);visibleCalendarItems=ds;
 if(view!=='agenda'){
 markup+=`<div class="weekdays">${WEEK.map(w=>`<div class="weekday">週${w}</div>`).join('')}</div><div class="month-grid ${view==='week'?'week-grid':''}">`;
 for(const day of ds){const dt=fromISO(day),items=eventsOn(day),out=view==='month'&&dt.getMonth()!==cursor.getMonth();const colors=[...new Set(items.flatMap(ev=>eventMembers(ev).map(m=>m.color)))].slice(0,4);
 markup+=`<div class="calendar-cell ${out?'outside':''} ${day===today()?'is-today':''} ${day===selectedDate?'is-selected':''}" data-day="${day}" role="button" tabindex="0" aria-label="${esc(dateHeader(day))}，${items.length} 項事項"><div class="date-row"><span class="date-number">${dt.getDate()}</span><span class="date-dot-row">${colors.map(c=>`<i style="background:${c}"></i>`).join('')}</span></div>`;
 let limit=view==='week'?10:2;
 for(let i=0;i<Math.min(items.length,limit);i++){const ev=items[i],col=eventColor(ev);markup+=`<button class="event-chip ${ev.done?'done':''}" style="${eventCss(ev)}" data-event="${esc(ev.id)}" data-occurrence="${day}" title="${esc(ev.title)}"><span class="chip-time">${ev.allDay?'':esc(ev.repeat==='none'&&ev.endDate>ev.date&&day>ev.date?(day===ev.endDate?'↳ '+ev.endTime:'持續'):ev.time)}</span><span class="chip-title">${esc(ev.title)}</span></button>`}
 if(items.length>limit)markup+=`<div class="event-more">+${items.length-limit} 更多</div>`;
 markup+='</div>';}
 markup+='</div>';
 }else{
 markup+='<div class="agenda-list">';let count=0;
 for(const day of ds){const events=eventsOn(day);if(!events.length)continue;count++;
 markup+=`<div class="agenda-date-group"><div class="agenda-date-label">${esc(dateHeader(day))} ${day===today()?'・今天':''}</div>`;
 for(const ev of events){const col=eventColor(ev);markup+=`<div class="agenda-event" data-event="${esc(ev.id)}" data-occurrence="${day}" style="${eventCss(ev)}"><span class="agenda-icon">${esc(eventMembers(ev)[0]?.emoji||'🏡')}</span><span class="agenda-copy"><strong>${esc(ev.title)}</strong><small>${esc(timeLabel(ev,day))}　${esc(eventMembers(ev).map(m=>m.name).join('、')||'全家')}</small></span><span style="color:#aaa5ba">›</span></div>`;}
 markup+='</div>';
 }if(!count)markup+='<div class="agenda-empty"><span>📅</span>這段期間還沒有安排事項<br/>點選「新增事項」開始記錄吧！</div>';
 markup+='</div>';
 }
 $('#calendarBody').innerHTML=markup;
}
function renderSelectedDay(){
 const dt=fromISO(selectedDate),events=eventsOn(selectedDate);
 $('#selectedDateTitle').textContent=`${dt.getMonth()+1} 月 ${dt.getDate()} 日 · 週${dayWeek(selectedDate)}`;
 $('#selectedDateSubtitle').textContent=selectedDate===today()?'今天也一起把日子過得精彩':'這一天的家庭安排';
 $('#dayBigNumber').textContent=dt.getDate();
 const mIds=[...new Set(events.flatMap(e=>e.memberIds))];
 $('#dayMemberDots').innerHTML=mIds.map(id=>member(id)).filter(Boolean).map(m=>`<span class="pill-dot" style="background:${m.color}" title="${esc(m.name)}"></span>`).join('')+`<span class="day-total">${events.length} 項事項</span>`;
 if(!events.length){$('#dayEventList').innerHTML='<div class="empty-day"><span class="empty-icon">🗓️</span><strong>這天還沒有安排喔</strong><p>點一下下面的按鈕，幫家人加個行程</p></div>'}
 else{$('#dayEventList').innerHTML=events.map(e=>{const col=eventColor(e);return `<div class="detail-event" style="${eventCss(e)}"><span class="detail-bar"></span><div class="detail-main"><span class="detail-time">${esc(timeLabel(e,selectedDate))}${e.repeat!=='none'?(e.until?' · 重複至 '+e.until:' · ⚠ 尚未設結束日'):''}${e.done?' · 已完成':''}</span><div class="detail-title">${esc(e.title)}</div><div class="detail-people">${eventMembers(e).map(m=>`<span title="${esc(m.name)}">${avatarHTML(m,'tiny-person')}</span>`).join('')}${e.location?`<span>📍 ${esc(e.location)}</span>`:''}</div></div><button class="detail-edit" type="button" aria-label="編輯 ${esc(e.title)}" data-event="${esc(e.id)}" data-occurrence="${selectedDate}">⋯</button></div>`}).join('')}
 let upcoming=[]; for(let i=0;i<14;i++){const d=iso(addDays(new Date(),i));for(const ev of eventsOn(d))upcoming.push({d,ev});}
 $('#upcomingList').innerHTML=upcoming.length?upcoming.slice(0,7).map(({d,ev})=>{const dt=fromISO(d),col=eventColor(ev);return `<div class="upcoming-item" style="${eventCss(ev)}"><div class="upcoming-date">${dt.getMonth()+1}月<strong>${dt.getDate()}</strong></div><div class="upcoming-content"><strong>${esc(ev.title)}</strong><small>${esc(timeLabel(ev,d))} · ${esc(eventMembers(ev).map(m=>m.name).join('、')||'全家')}</small></div><span class="upcoming-spot"></span></div>`}).join(''):'<div class="upcoming-empty">接下來兩週還沒有行程。<br/>有要記得的事，隨時加進來。</div>';
}
function setSelected(day){selectedDate=day; if(view==='month'&&fromISO(day).getMonth()!==cursor.getMonth())cursor=fromISO(day);if(view==='week')cursor=fromISO(day);render();}
function go(delta){if(view==='month')cursor=new Date(cursor.getFullYear(),cursor.getMonth()+delta,1);else if(view==='week')cursor=addDays(cursor,delta*7);else cursor=addDays(cursor,delta*30);render()}
function modal(title,eyebrow,html){$('#modalTitle').textContent=title;$('#modalEyebrow').textContent=eyebrow;$('#modalContent').innerHTML=html;$('#modalBackdrop').classList.remove('hidden');$('#modalContent').scrollTop=0;document.body.style.overflow='hidden';}
function closeModal(){ $('#modalBackdrop').classList.add('hidden');$('#modal').classList.remove('wide-modal');document.body.style.overflow=''; }
function eventForm(ev=null,occurrence=null){
 const editing=!!ev, recurring=editing&&ev.repeat!=='none';
 const clicked=recurring&&occurrence&&occurs(ev,occurrence)?occurrence:ev?.date;
 let scope=recurring&&occurrence?'single':'all';
 const d=ev||{title:'',date:selectedDate,endDate:selectedDate,time:'09:00',endTime:'10:00',allDay:false,memberIds:[data.members[0]?.id],repeat:'none',until:'',exdates:[],note:'',location:'',done:false};
 const editDate=recurring&&scope!=='all'?clicked:d.date;
 const editEnd=recurring&&scope!=='all'?clicked:(d.endDate||d.date);
 const initialUntil=d.repeat!=='none'?(d.until||recurrenceEnd(editDate,d.repeat)):'';
 const members=data.members.map(m=>`<button type="button" class="person-option ${(d.memberIds||[]).includes(m.id)?'selected':''}" data-person="${esc(m.id)}" style="--color:${safeColor(m.color)};--light:${rgbSoft(m.color)}">${avatarHTML(m,'person-avatar')}${esc(m.name)}</button>`).join('');
 const scopeHtml=recurring?`<section class="recurrence-scope" aria-label="重複事項修改範圍"><strong>↻ 修改哪一些日期？</strong><div class="scope-options">
 ${[['single','只修改這一次','其他日期不變'],['future','從這次起往後','之前不變'],['all','整個重複系列','全部日期一併修改']].map(([mode,label,desc])=>`<label class="scope-choice"><input type="radio" name="editScope" value="${mode}" ${scope===mode?'checked':''}/><span><b>${label}</b><small>${desc}</small></span></label>`).join('')}</div><p class="member-help" id="scopeHelp">只將 ${esc(clicked)} 這一天獨立修改，其他週期維持原狀。</p></section>`:'';
 const html=`<form id="eventForm">${scopeHtml}<div class="form-field"><label class="form-label" for="evTitle">事項名稱</label><input required maxlength="100" class="field-input" id="evTitle" placeholder="例如：接小朋友、回診、家庭聚餐" value="${esc(d.title)}" autofocus/></div>
 <div class="form-field"><label class="form-label">這是誰的行程？ <span class="form-sub">可同時選多位家人</span></label><div class="member-options" id="personOptions">${members}</div><p class="member-help">成員代表色仍會保留在行程左側標記；底色可另外選擇。</p></div>
 <section class="quick-pick-panel"><div class="quick-pick-heading"><div><strong>⚡ 常用事項快捷選擇</strong><small>先選上方成員，一點即可套用他的常用項目</small></div><button type="button" class="quick-manage" id="manageQuickFromEvent">管理清單 ↗</button></div><div id="quickPickList" class="quick-pick-groups"></div></section>
 <div class="form-field"><label class="form-label" for="evDate">事項日期</label><div class="field-row"><input class="field-input" type="date" id="evDate" value="${esc(editDate)}" required/><input class="field-input" type="date" id="evEndDate" value="${esc(editEnd)}" title="事項結束日期" required/></div><p class="member-help">這裡是<strong>單次事項的起迄日期</strong>；重複系列的截止日期請在下方設定。</p></div>
 <div class="form-field time-section"><div class="time-head"><label class="form-label">⏰ 事項時間</label><label class="check-line"><input type="checkbox" id="evAllDay" ${d.allDay?'checked':''}/> 全天（不指定時間）</label></div><div id="timeFields" ${d.allDay?'hidden':''}><div class="field-row"><label class="time-field"><span>開始時間</span><input class="field-input" type="time" id="evTime" value="${esc(d.time||'09:00')}"/></label><label class="time-field"><span>結束時間</span><input class="field-input" type="time" id="evEndTime" value="${esc(d.endTime||'10:00')}"/></label></div><p class="member-help">跨午夜請將上方的事項結束日期設為隔天。</p></div></div>
 <div class="form-field"><label class="form-label">🎨 事項底色 <span class="form-sub">個人自訂 · 柔和暖色調</span></label><div class="pastel-palette" id="pastelPalette"><button type="button" class="palette-auto" data-bg="" aria-pressed="${!d.bgColor}" title="依照家庭成員顏色">◉ 依成員</button>${PASTELS.map(([label,color])=>`<button type="button" class="pastel-swatch" style="--swatch:${color}" data-bg="${color}" aria-pressed="${(d.bgColor||'').toUpperCase()===color}" aria-label="${label}" title="${label}"><span>✓</span></button>`).join('')}</div><div class="palette-preview" id="palettePreview">預覽：<span id="palettePreviewChip">${esc(d.title||'我的新事項')}</span><small id="paletteCaption">${d.bgColor?'已選擇個人底色':'依成員代表色顯示'}</small></div></div>
 <section class="recurrence-dates" id="recurrenceSection"><div class="form-field"><label class="form-label" for="evRepeat">↻ 固定事項重複方式</label><select class="field-input" id="evRepeat">${[['none','不重複'],['daily','每天'],['weekly','每週'],['monthly','每月'],['yearly','每年']].map(([v,k])=>`<option value="${v}" ${recurring&&scope==='single'?(v==='none'?'selected':''):(d.repeat===v?'selected':'')}>${k}</option>`).join('')}</select></div>
 <div class="recurrence-range" id="recurrenceRange"><div class="range-heading"><strong>📅 重複的有效期間</strong><small>每週／每月只在此期間內產生事項</small></div><div class="field-row"><label class="time-field"><span>重複開始日</span><input class="field-input" type="date" id="evRepeatStart" value="${esc(editDate)}" readonly/></label><label class="time-field"><span>重複結束日 <em>必填</em></span><input class="field-input" type="date" id="evUntil" value="${esc(initialUntil)}"/></label></div><p class="member-help" id="repeatSummary"></p></div></section>
 <div class="form-field"><label class="form-label" for="evLocation">地點 <span class="form-sub">選填</span></label><input class="field-input" id="evLocation" maxlength="120" value="${esc(d.location)}" placeholder="例如：幼兒園、醫院"/></div>
 <div class="form-field"><label class="form-label" for="evNote">備註 <span class="form-sub">選填</span></label><textarea class="field-area" id="evNote" maxlength="1000" placeholder="寫下需要準備的東西或其他提醒">${esc(d.note)}</textarea></div>
 ${editing?`<div class="form-field"><label class="check-line"><input type="checkbox" id="evDone" ${d.done?'checked':''}/> 標記這個事項已完成</label></div>`:''}
 <label class="quick-save-checkbox"><input type="checkbox" id="evSaveQuick"/> ⭐ 同時存成該成員的「常用事項」（下次直接點選）</label>
 <div class="form-actions">${editing?'<button type="button" class="danger-btn" id="deleteEvent">刪除</button>':''}<button type="button" class="neutral-btn" id="cancelEvent">取消</button><button type="submit" class="primary-btn">${editing?'儲存變更':'新增事項'}</button></div></form>`;
 modal(editing?'編輯事項':'新增家庭事項','YOUR FAMILY PLANS',html);
 $('#cancelEvent').onclick=closeModal;$('#evAllDay').onchange=e=>$('#timeFields').hidden=e.target.checked;
 $('#manageQuickFromEvent').onclick=()=>{
   if((editing || $('#evTitle').value.trim() || $('#evNote').value.trim())&&!confirm('開啟管理清單會關閉目前的編輯視窗，未儲存的修改會遺失。要繼續嗎？'))return;
   quickLibraryModal($$('#personOptions .selected').map(x=>x.dataset.person)[0]);
 };
 let selectedBg=d.bgColor||'';
 const paintPreview=()=>{
  $$('#pastelPalette [data-bg]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.bg===selectedBg)));
  const paint=selectedBg||eventBg({memberIds:$$('#personOptions .selected').map(x=>x.dataset.person)});
  const chip=$('#palettePreviewChip');chip.style.background=paint;chip.style.borderLeft='4px solid '+eventColor({memberIds:$$('#personOptions .selected').map(x=>x.dataset.person)});
  chip.textContent=$('#evTitle').value.trim()||'我的新事項';$('#paletteCaption').textContent=selectedBg?(PASTELS.find(x=>x[1]===selectedBg)?.[0]||'個人自選色'):'依成員代表色顯示';
 };
 $('#pastelPalette').onclick=e=>{const b=e.target.closest('[data-bg]');if(!b)return;selectedBg=b.dataset.bg;paintPreview()};
 $('#evTitle').oninput=paintPreview;
 let untilTouched=Boolean(editing&&ev.until);
 const refreshRepeat=()=>{
  const repeat=$('#evRepeat').value,date=$('#evDate').value,range=$('#recurrenceRange');
  range.hidden=repeat==='none';$('#evRepeatStart').value=date;
  if(repeat!=='none'){
   if(!untilTouched)$('#evUntil').value=recurrenceEnd(date,repeat);
   $('#evUntil').min=date;
   const end=$('#evUntil').value;
   $('#repeatSummary').textContent=end&&end>=date?`只在 ${date} ～ ${end} 期間重複；結束後不再自動產生。`:'請指定不早於開始日期的截止日。';
  }
 };
 $('#evRepeat').onchange=()=>{untilTouched=false;refreshRepeat()};
 $('#evUntil').oninput=()=>{untilTouched=true;refreshRepeat()};
 $('#evDate').onchange=refreshRepeat;
 if(recurring){
  const applyScope=(mode)=>{
   scope=mode;
   const once=mode==='single',all=mode==='all';
   $('#evDate').value=all?ev.date:clicked;$('#evEndDate').value=all?(ev.endDate||ev.date):clicked;
   $('#evRepeat').value=once?'none':ev.repeat;
   $('#evRepeat').disabled=once;
   untilTouched=!once&&Boolean(ev.until);
   $('#evUntil').value=once?'':(ev.until||recurrenceEnd($('#evDate').value,ev.repeat));
   $('#scopeHelp').textContent=once?`只修改 ${clicked} 這一次，原本的週期照常。`:all?'變更整個系列，先前與未來的日期都一起調整。':`從 ${clicked} 起建立新的後續系列，之前排好的日期維持不變。`;
   refreshRepeat();
  };
  $$('input[name="editScope"]').forEach(r=>r.onchange=()=>applyScope(r.value));
  applyScope(scope);
 }else refreshRepeat();
 const refreshQuickPicks=()=>{
   const sel=$$('#personOptions .selected').map(x=>x.dataset.person);const rows=sel.map(id=>{
     const m=member(id),items=(data.quickTemplates||[]).filter(t=>t.memberId===id);
     if(!m||!items.length)return '';
     return `<div class="quick-owner"><div class="quick-owner-name">${esc(m.emoji)} ${esc(m.name)}的常用事項</div><div class="quick-chips">${items.map(t=>`<button type="button" class="quick-chip" data-quick-id="${esc(t.id)}" style="--quick-bg:${t.bgColor||rgbSoft(m.color,.16)};--quick-accent:${safeColor(m.color)}" title="套用 ${esc(t.title)}"><span>${esc(t.title)}</span><small>${t.allDay?'全天':esc(t.time+'–'+t.endTime)}</small></button>`).join('')}</div></div>`;
   }).join('');
   $('#quickPickList').innerHTML=rows||`<p class="quick-empty">${sel.length?'這位家人尚未建立常用事項，可在下方勾選「存成常用事項」或先到「管理清單」新增。':'請先選擇至少一位家人。'}</p>`;
 };
 $('#quickPickList').onclick=e=>{
  const b=e.target.closest('[data-quick-id]');if(!b)return;
  const t=data.quickTemplates.find(x=>x.id===b.dataset.quickId);if(!t)return;
  $$('#personOptions [data-person]').forEach(btn=>btn.classList.toggle('selected',btn.dataset.person===t.memberId));
  $('#evTitle').value=t.title;
  $('#evAllDay').checked=t.allDay;$('#timeFields').hidden=t.allDay;
  $('#evTime').value=t.time;$('#evEndTime').value=t.endTime;
  $('#evLocation').value=t.location;$('#evNote').value=t.note;
  if(!(recurring&&scope==='single')){$('#evRepeat').value=t.repeat;untilTouched=false;refreshRepeat()}
  selectedBg=t.bgColor||'';refreshQuickPicks();paintPreview();toast('已帶入「'+t.title+'」，確認日期後即可新增');
 };
 $$('#personOptions [data-person]').forEach(btn=>btn.onclick=()=>{btn.classList.toggle('selected');refreshQuickPicks();paintPreview()});refreshQuickPicks();paintPreview();
 $('#eventForm').onsubmit=async e=>{
 e.preventDefault();const title=$('#evTitle').value.trim(),date=$('#evDate').value,endDate=$('#evEndDate').value;
 const ids=$$('#personOptions .selected').map(btn=>btn.dataset.person);
 if(!ids.length){toast('請至少選擇一位家庭成員');return}
 if(!date || !endDate || endDate<date){toast('事項結束日期不能早於開始日期');return}
 const allDay=$('#evAllDay').checked,repeat=$('#evRepeat').value,until=$('#evUntil').value;
 if(repeat!=='none'&&(!untilIsValid(until)||until<date)){toast('請設定重複截止日，而且不能早於開始日');return}
 if(repeat!=='none'&&date!==endDate){toast('重複事項僅支援單日，請讓事項開始與結束日期相同');return}
 if(!allDay){const start=$('#evTime').value,finish=$('#evEndTime').value;if(!start||!finish){toast('請選擇開始與結束時間');return}if(date===endDate&&finish<=start){toast('結束時間必須晚於開始時間；跨夜請將結束日期設為隔天');return}}
 const saved=cleanEvent({...d,id:editing&&!(recurring&&scope!=='all')?ev.id:uid(),title,date,endDate,allDay,time:allDay?'':$('#evTime').value,endTime:allDay?'':$('#evEndTime').value,memberIds:ids,bgColor:selectedBg,repeat,until:repeat==='none'?'':until,exdates:recurring&&scope==='all'?ev.exdates:recurring&&scope==='future'?(ev.exdates||[]).filter(x=>x>=clicked):[],location:$('#evLocation').value,note:$('#evNote').value,done:editing?$('#evDone').checked:false,updatedAt:Date.now()});
 if(!saved){toast('請確認日期和事項名稱');return}
 try{
   const wantQuick=$('#evSaveQuick').checked;
   let quickToAdd=null;
   if(wantQuick){
     if(ids.length!==1){toast('存為個人常用事項時，請只選一位家人');return}
     const owner=ids[0];const existing=(data.quickTemplates||[]).find(t=>t.memberId===owner&&t.title===title);
     if(existing){toast('這位家人的常用清單已有同名事項，可在「管理清單」編輯');return}
     if((data.quickTemplates||[]).filter(t=>t.memberId===owner).length>=30){toast('每人常用事項最多 30 筆');return}
     quickToAdd=cleanQuickTemplate({id:uid(),memberId:owner,title,allDay,time:saved.time,endTime:saved.endTime,bgColor:selectedBg,location:saved.location,note:saved.note,repeat:saved.repeat});
   }
   if(recurring&&scope==='single'){
      await commitEventChanges([saved,cleanEvent({...ev,exdates:[...(ev.exdates||[]),clicked]})]);
   }else if(recurring&&scope==='future'){
      const earlier=clicked>ev.date?cleanEvent({...ev,until:iso(addDays(fromISO(clicked),-1)),exdates:(ev.exdates||[]).filter(d=>d<clicked)}):null;
      // clicked 若正好是原系列起點，就直接取代整個系列。
      await commitEventChanges(earlier?[saved,earlier]:[saved],earlier?[]:[ev.id]);
   }else await upsertEvent(saved);
   let templateWarning='';
   if(quickToAdd){try{await saveQuickTemplates([...data.quickTemplates,quickToAdd])}catch(error){templateWarning='；常用清單儲存失敗：'+humanError(error)}}
   selectedDate=date;
   cursor=fromISO(selectedDate);closeModal();render();toast((editing?'事項已更新':'已新增家庭事項')+(quickToAdd&&!templateWarning?'，也已存入常用清單':'')+templateWarning);
 }catch(err){toast('儲存失敗：'+humanError(err))}
 };
 if(editing)$('#deleteEvent').onclick=async()=>{
   let msg=`確定刪除「${ev.title}」？`;
   if(recurring)msg+=scope==='single'?`\n只會取消 ${clicked} 這一次。`:scope==='future'?`\n將取消 ${clicked}（含）之後的全部安排。`:'\n將刪除整組重複事項。';
   if(!confirm(msg))return;
   try{
    if(recurring&&scope==='single')await commitEventChanges([cleanEvent({...ev,exdates:[...(ev.exdates||[]),clicked]})]);
    else if(recurring&&scope==='future'&&clicked>ev.date)await commitEventChanges([cleanEvent({...ev,until:iso(addDays(fromISO(clicked),-1)),exdates:(ev.exdates||[]).filter(d=>d<clicked)})]);
    else await removeEvent(ev.id);
    closeModal();render();toast('已依選擇範圍刪除事項');
   }catch(err){toast('刪除失敗：'+humanError(err))}
 };
}
/* 本機原子更新；同步層以修訂版號加上鎖定，避免兩台設備互相覆蓋。 */
async function commitEventChanges(upserts=[],deletes=[]){
 for(const ev of upserts){const index=data.events.findIndex(e=>e.id===ev.id);if(index>=0)data.events[index]=ev;else data.events.push(ev)}
 if(deletes.length)data.events=data.events.filter(ev=>!deletes.includes(ev.id));
 persist();
}
/* 查看所有重複系列，方便修改結束日期與已排好的固定事項。 */
function recurringManager(){
 const list=currentEvents().filter(e=>e.repeat!=='none').sort((a,b)=>a.date.localeCompare(b.date));
 const text={daily:'每天',weekly:'每週',monthly:'每月',yearly:'每年'};
 const html=`<p class="info-note">在這裡集中管理每週、每月等重複事項。可以縮短結束日期、修改整個系列，也可以進入月曆單獨修改某一次。</p>`+(list.length?`<div class="recurring-list">${list.map(e=>`<div class="recurring-entry" style="--rec-bg:${eventBg(e)}"><div><strong>${esc(e.title)}</strong><small>${esc(eventMembers(e).map(m=>m.name).join('、')||'全家')} · ${text[e.repeat]} · ${esc(e.time||'全天')}</small><small>${e.date} → <b class="${e.until?'':'missing-until'}">${e.until||'⚠ 尚未設定結束日期'}</b></small></div><button type="button" class="neutral-btn" data-edit-recurring="${esc(e.id)}">管理</button></div>`).join('')}</div>`:'<p class="info-note">目前沒有重複事項。新增事項時選擇「每週」、「每月」等即可建立。</p>');
 modal('重複事項管理','RECURRING PLANS',html);
 $$('[data-edit-recurring]').forEach(btn=>btn.onclick=()=>{const ev=data.events.find(e=>e.id===btn.dataset.editRecurring);if(ev)eventForm(ev)});
}
async function upsertEvent(ev){
 const index=data.events.findIndex(e=>e.id===ev.id);if(index>=0)data.events[index]=ev;else data.events.push(ev);persist();
}
async function removeEvent(id){data.events=data.events.filter(e=>e.id!==id);persist()}
async function saveQuickTemplates(items){data.quickTemplates=cleanQuickTemplates(items,data.members);persist()}

function quickLibraryModal(preferred){
 let chosen=(preferred&&member(preferred)?preferred:data.members[0]?.id)||'';
 let editingId='';
 const renderLibrary=()=>{
  const owner=member(chosen),items=(data.quickTemplates||[]).filter(t=>t.memberId===chosen);
  $('#quickMemberChoice').value=chosen;
  $('#quickMemberCount').textContent=`${items.length} / 30 筆`;
  $('#quickLibraryRows').innerHTML=items.length?items.map(t=>`<div class="quick-library-row" style="--quick-bg:${t.bgColor||rgbSoft(owner.color,.14)};--quick-accent:${safeColor(owner.color)}"><div class="quick-library-info"><strong>${esc(t.title)}</strong><small>${t.allDay?'全天':esc(t.time+'–'+t.endTime)}${t.repeat!=='none'?' · '+({daily:'每天',weekly:'每週',monthly:'每月',yearly:'每年'}[t.repeat]||''):''}</small></div><button type="button" data-qedit="${esc(t.id)}">編輯</button><button type="button" class="quick-delete" data-qdelete="${esc(t.id)}">刪除</button></div>`).join(''):'<div class="quick-empty quick-library-empty">此成員尚未新增常用事項。可在下方建立，例如「上學」、「回診」、「運動」。</div>';
 };
 const clearEditor=()=>{
  editingId='';$('#quickEditTitle').textContent='新增常用事項';$('#quickTitle').value='';$('#quickAllDay').checked=true;
  $('#quickTime').value='09:00';$('#quickEndTime').value='10:00';$('#quickLocation').value='';$('#quickNote').value='';$('#quickRepeat').value='none';
  $('#quickBg').value='';$('#quickTimeFields').hidden=true;$('#quickEditorSubmit').textContent='＋ 新增至清單';syncPalette();
 };
 const syncPalette=()=>$$('#quickPalette [data-qbg]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.qbg===$('#quickBg').value)));
 const html=`<p class="info-note">每位家人都有獨立的常用事項清單。建立一次，往後新增行程選成員就能一鍵帶入名稱、柔和底色、時間、地點及備註，日期仍由你決定。清單不會自己生成行程。</p>
  <div class="form-field"><label class="form-label" for="quickMemberChoice">選擇要管理的家庭成員</label><select class="field-input" id="quickMemberChoice">${data.members.map(m=>`<option value="${esc(m.id)}">${esc(m.emoji+' '+m.name)}</option>`).join('')}</select></div>
  <div class="quick-library-heading"><strong>這位家人的快捷清單</strong><span id="quickMemberCount"></span></div><div id="quickLibraryRows" class="quick-library-rows"></div>
  <form id="quickEditorForm" class="quick-editor-form"><div class="quick-editor-title" id="quickEditTitle">新增常用事項</div>
  <div class="form-field"><label class="form-label" for="quickTitle">事項名稱</label><input class="field-input" id="quickTitle" maxlength="80" required placeholder="例如：接送、回診、補習、運動"/></div>
  <div class="form-field"><label class="check-line"><input type="checkbox" id="quickAllDay" checked/> 全天（不預設時間）</label><div class="field-row" id="quickTimeFields" hidden><label class="time-field"><span>開始時間</span><input class="field-input" id="quickTime" type="time" value="09:00"/></label><label class="time-field"><span>結束時間</span><input class="field-input" id="quickEndTime" type="time" value="10:00"/></label></div></div>
  <div class="form-field"><label class="form-label">預設柔和底色</label><div class="pastel-palette" id="quickPalette"><button type="button" class="palette-auto" data-qbg="" aria-pressed="true">◉ 依成員</button>${PASTELS.map(([l,c])=>`<button type="button" class="pastel-swatch" style="--swatch:${c}" data-qbg="${c}" aria-pressed="false" aria-label="${l}" title="${l}"><span>✓</span></button>`).join('')}</div><input type="hidden" id="quickBg"/></div>
  <div class="field-row"><div class="form-field"><label class="form-label" for="quickLocation">預設地點（選填）</label><input class="field-input" id="quickLocation" maxlength="120"/></div><div class="form-field"><label class="form-label" for="quickRepeat">預設重複</label><select class="field-input" id="quickRepeat">${[['none','不重複'],['daily','每天'],['weekly','每週'],['monthly','每月'],['yearly','每年']].map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div></div>
  <div class="form-field"><label class="form-label" for="quickNote">預設備註（選填）</label><textarea class="field-area" id="quickNote" maxlength="1000" rows="2"></textarea></div>
  <div class="form-actions"><button type="button" class="neutral-btn" id="quickEditorReset">清空欄位</button><button type="submit" class="primary-btn" id="quickEditorSubmit">＋ 新增至清單</button></div></form>`;
 modal('每位家人的常用事項','PERSONAL QUICK LISTS',html);
 $('#quickMemberChoice').value=chosen;
 $('#quickMemberChoice').onchange=e=>{chosen=e.target.value;clearEditor();renderLibrary()};
 $('#quickAllDay').onchange=e=>$('#quickTimeFields').hidden=e.target.checked;
 $('#quickPalette').onclick=e=>{const btn=e.target.closest('[data-qbg]');if(!btn)return;$('#quickBg').value=btn.dataset.qbg;syncPalette()};
 $('#quickLibraryRows').onclick=async e=>{
  const edit=e.target.closest('[data-qedit]');const del=e.target.closest('[data-qdelete]');
  if(edit){const t=(data.quickTemplates||[]).find(t=>t.id===edit.dataset.qedit&&t.memberId===chosen);if(!t)return;
   editingId=t.id;$('#quickEditTitle').textContent='修改「'+t.title+'」';$('#quickEditorSubmit').textContent='儲存修改';
   $('#quickTitle').value=t.title;$('#quickAllDay').checked=t.allDay;$('#quickTimeFields').hidden=t.allDay;
   $('#quickTime').value=t.time;$('#quickEndTime').value=t.endTime;$('#quickBg').value=t.bgColor;$('#quickLocation').value=t.location;
   $('#quickNote').value=t.note;$('#quickRepeat').value=t.repeat;syncPalette();$('#quickEditorForm').scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  if(del){const t=(data.quickTemplates||[]).find(t=>t.id===del.dataset.qdelete&&t.memberId===chosen);if(!t||!confirm(`刪除「${t.title}」的快捷項目？已安排的日曆行程不會被刪除。`))return;
   try{await saveQuickTemplates(data.quickTemplates.filter(x=>x.id!==t.id));if(editingId===t.id)clearEditor();renderLibrary();toast('已刪除快捷項目；原本行程保留')}catch(err){toast('刪除失敗：'+humanError(err))}
  }
 };
 $('#quickEditorReset').onclick=clearEditor;
 $('#quickEditorForm').onsubmit=async e=>{
  e.preventDefault();const title=$('#quickTitle').value.trim();if(!title)return;
  const allDay=$('#quickAllDay').checked,time=$('#quickTime').value,endTime=$('#quickEndTime').value;
  if(!allDay&&(!time||!endTime||endTime<=time)){toast('常用事項的結束時間需晚於開始；跨夜值班請使用批次排班');return}
  const duplicates=(data.quickTemplates||[]).find(t=>t.memberId===chosen&&t.title===title&&t.id!==editingId);
  if(duplicates){toast('這位成員已有相同名稱的快捷事項');return}
  if(!editingId&&(data.quickTemplates||[]).filter(t=>t.memberId===chosen).length>=30){toast('每位成員最多 30 筆常用事項');return}
  const t=cleanQuickTemplate({id:editingId||uid(),memberId:chosen,title,allDay,time,endTime,bgColor:$('#quickBg').value,
   location:$('#quickLocation').value,note:$('#quickNote').value,repeat:$('#quickRepeat').value});
  try{await saveQuickTemplates(editingId?data.quickTemplates.map(x=>x.id===editingId?t:x):[...data.quickTemplates,t]);
   clearEditor();renderLibrary();toast('常用事項清單已儲存')
  }catch(err){toast('儲存失敗：'+humanError(err))}
 };
 renderLibrary();
}

// 醫院彈性值班：不規則日期多選是預設；日期區間只是次要輔助，不預設固定週期。
const SHIFT_PRESETS={
 custom:{name:'值班',start:'09:00',end:'18:00',allDay:false},
 allDay:{name:'整日值班',start:'',end:'',allDay:true},
 morning:{name:'早班值班',start:'07:00',end:'15:00',allDay:false},
 afternoon:{name:'晚班值班',start:'15:00',end:'23:00',allDay:false},
 night:{name:'夜班值班',start:'23:00',end:'07:00',allDay:false},
 day:{name:'日班值班',start:'08:00',end:'17:00',allDay:false}
};
const SHIFT_OPTIONS=[['custom','✎ 自訂時間'],['allDay','☀️ 整日（不需時間）'],['morning','🌅 早班'],['afternoon','🌆 晚班'],['night','🌙 夜班（跨日）'],['day','🕗 日班']];
const shiftTimeValue=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'');
function shiftRowHTML(d){
 const preset=SHIFT_PRESETS[d.preset]||SHIFT_PRESETS.custom,allDay=d.allDay===true;
 return `<div class="shift-row shift-row-v14" data-shift-row>
 <label class="shift-date"><span>值班日期</span><input class="field-input" type="date" data-shift-date required value="${esc(d.date)}"/></label>
 <label class="shift-member"><span>值班成員</span><select class="field-input" data-shift-member>${data.members.map(m=>`<option value="${esc(m.id)}" ${m.id===d.memberId?'selected':''}>${esc(m.emoji+' '+m.name)}</option>`).join('')}</select></label>
 <label class="shift-preset"><span>班別</span><select class="field-input" data-shift-preset>${SHIFT_OPTIONS.map(([v,n])=>`<option value="${v}" ${d.preset===v?'selected':''}>${n}</option>`).join('')}</select></label>
 <label class="shift-name"><span>事項名稱</span><input class="field-input" maxlength="60" data-shift-title value="${esc(d.title)}" required/></label>
 <label class="shift-time"><span>開始</span><input class="field-input" type="time" data-shift-start ${allDay?'disabled':''} ${allDay?'':'required'} value="${allDay?'':esc(d.start||preset.start)}"/></label>
 <label class="shift-time"><span>結束</span><input class="field-input" type="time" data-shift-end ${allDay?'disabled':''} ${allDay?'':'required'} value="${allDay?'':esc(d.end||preset.end)}"/></label>
 <div class="shift-color"><span class="shift-label">🎨 底色</span><div class="shift-color-picker" data-row-color data-bg-color="${esc(d.bgColor||'')}"><button type="button" class="shift-color-toggle" data-shift-color-toggle aria-expanded="false"><span class="shift-color-dot" data-row-color-dot style="background:${d.bgColor||rgbSoft(member(d.memberId)?.color||'#8870ec',.22)}"></span><span data-row-color-name>${esc(PASTELS.find(x=>x[1]===d.bgColor)?.[0]||'依成員')}</span><span class="shift-chevron">⌄</span></button><div class="shift-color-menu hidden" data-row-color-menu>${shiftColorsHTML(d.bgColor||'','data-row-bg')}</div></div></div>
 <button class="shift-remove" type="button" data-remove-shift aria-label="移除這個班次" title="移除班次">✕</button></div>`;
}
function batchShiftForm(){
 const d=selectedDate, previewMember=data.members[0]?.id||'dad';
 const html=`<p class="info-note shift-intro">🗓️ <strong>彈性安排值班：</strong>日期與時間不必固定週期。直接在月曆點選多個不連續日期，先建立草稿，再逐列設定每一天的班別、時間及成員。所有草稿確認後才會存入家庭日曆。</p>
 <div class="shift-generator">
 <div class="shift-block-title"><span>01</span> 快速建立值班日期 <small>預設不規則排班</small></div>
 <div class="shift-date-mode" role="group" aria-label="選日期方式"><button type="button" id="batchModePick" class="active" aria-pressed="true">✓ 點選不連續日期</button><button type="button" id="batchModeRange" aria-pressed="false">日期範圍選取</button></div>
 <div class="field-row shift-range-inputs"><label class="form-field"><span class="form-label">從哪一天</span><input id="batchFrom" type="date" class="field-input" value="${esc(d)}"/></label><label class="form-field"><span class="form-label">到哪一天</span><input id="batchTo" type="date" class="field-input" value="${esc(d)}"/></label></div>
 <label class="batch-follow-label"><input id="batchFollow" type="checkbox" checked/> 結束日期自動跟隨開始日 <span>（要選日期區間，可直接修改結束日）</span></label>
 <div id="batchPickSection"><div class="shift-month-toolbar"><button id="shiftPickerPrev" class="shift-month-nav" type="button" aria-label="前一個月">‹</button><strong id="shiftPickerMonth"></strong><button id="shiftPickerNext" class="shift-month-nav" type="button" aria-label="下一個月">›</button><span>可跨月份連續挑選</span></div>
 <div class="shift-mini-week">${WEEK.map(w=>`<span>${w}</span>`).join('')}</div><div id="shiftMiniGrid" class="shift-mini-grid" role="group" aria-label="選擇不規則值班日期"></div>
 <div class="shift-picked-bar"><strong>已選擇 <span id="shiftSelectedCount">0</span> 天</strong><button type="button" class="tiny-link" id="shiftClearDates">清空已選日期</button></div>
 <div class="shift-date-chips" id="shiftDateChips" aria-live="polite">點選上方月曆的日期，也可下方輸入開始日期後加入。</div>
 <button class="neutral-btn" id="batchAddDate" type="button">＋ 將「從哪一天」加入選取</button></div>
 <div id="batchRangeSection" class="hidden"><p class="member-help">這是補充工具，只在指定日期區間需要大量建立班次時使用；不要求固定週期。</p><div class="form-field"><span class="form-label">若只要部分星期，可勾選；不需要就維持全選</span><div class="weekday-picks" id="batchWeekdays">${WEEK.map((w,i)=>`<button type="button" data-weekday="${i}" class="active" aria-pressed="true">${w}</button>`).join('')}</div></div></div>
 <div class="shift-block-title second"><span>02</span> 預設內容 <small>每一筆草稿都可另外修改</small></div>
 <div class="field-row"><label class="form-field"><span class="form-label">預設值班成員</span><select class="field-input" id="batchMember">${data.members.map(m=>`<option value="${esc(m.id)}">${esc(m.emoji+' '+m.name)}</option>`).join('')}</select></label><label class="form-field"><span class="form-label">班別範本</span><select class="field-input" id="batchPreset">${SHIFT_OPTIONS.map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label></div>
 <label class="form-field"><span class="form-label">事項名稱</span><input class="field-input" id="batchTitle" maxlength="60" value="值班"/></label>
 <div class="field-row shift-global-times" id="batchTimeFields"><label class="form-field"><span class="form-label">開始時間</span><input class="field-input" type="time" id="batchStart" value="09:00"/></label><label class="form-field"><span class="form-label">結束時間</span><input class="field-input" type="time" id="batchEnd" value="18:00"/></label></div>
 <div class="form-field shift-global-colors"><span class="form-label">🎨 預設值班底色 <small class="form-sub">柔和暖色調，新增草稿時套用；下方每列仍可單獨改色</small></span><div class="pastel-palette" id="batchColorPalette">${shiftColorsHTML('','data-batch-bg')}</div><p class="member-help" id="batchColorLabel">目前：依成員代表色</p></div>
 <div class="shift-toolbar"><button class="primary-btn" id="batchGenerate" type="button">＋ 將選好的日期加入排班草稿</button><span id="shiftGuide">預設時間可改；每列的日期與時間都能獨立調整。</span></div></div>
 <div class="shift-block-title second"><span>03</span> 編輯不規則班表 <small id="batchCount">目前 0 筆</small></div>
 <div class="shift-row-list" id="shiftRowList"><div class="shift-empty">請在上方選擇日期，或直接按「手動新增一列」。</div></div>
 <div class="shift-list-controls"><button class="neutral-btn" id="batchAddRow" type="button">＋ 手動新增一列</button><button class="neutral-btn" id="batchDuplicate" type="button">複製末列（日期可改）</button><button class="neutral-btn" id="batchClear" type="button">清空草稿</button></div>
 <div class="batch-status" id="batchStatus" role="status">不同日期可以是早班、晚班、夜班、整日或完全自訂時段。整日班次會將開始、結束時間停用。</div>
 <div class="form-actions"><button class="neutral-btn" type="button" id="batchCancel">取消</button><button class="primary-btn" type="button" id="batchSave">儲存全部班次（<span id="batchSaveCount">0</span>）</button></div>`;
 modal('批次排班・值班表','BATCH SHIFT SCHEDULE',html);$('#modal').classList.add('wide-modal');$('#batchCancel').onclick=closeModal;
 const list=$('#shiftRowList'),rows=()=>$$('[data-shift-row]',list);
 let mode='pick',pickerMonth=new Date(fromISO(d).getFullYear(),fromISO(d).getMonth(),1);
 const selectedDates=new Set(),chosenDates=()=>[...selectedDates].sort();
 let defaultShiftBg='';
 const validDate=x=>/^\d{4}-\d\d-\d\d$/.test(x||'')&&iso(fromISO(x))===x;
 const count=()=>{const n=rows().length;$('#batchCount').textContent=`目前 ${n} 筆`;$('#batchSaveCount').textContent=n;$('#batchSave').disabled=!n};
 const addRow=d=>{if(rows().length>=120){toast('單次最多 120 筆，請分批建立');return false}if(!rows().length)list.innerHTML='';list.insertAdjacentHTML('beforeend',shiftRowHTML(d));count();return true};
 const template=()=>{const kind=$('#batchPreset').value,p=SHIFT_PRESETS[kind]||SHIFT_PRESETS.custom;return {date:$('#batchFrom').value||selectedDate,memberId:$('#batchMember').value||previewMember,title:$('#batchTitle').value.trim()||'值班',preset:kind,allDay:p.allDay,start:p.allDay?'':$('#batchStart').value,end:p.allDay?'':$('#batchEnd').value,bgColor:defaultShiftBg}};
 const renderSelected=()=>{$('#shiftSelectedCount').textContent=selectedDates.size;$('#shiftDateChips').innerHTML=selectedDates.size?chosenDates().map(x=>`<button type="button" data-unpick="${x}" aria-label="移除 ${x}" title="點擊移除">${x.slice(5).replace('-','/')} ×</button>`).join(''):'點選上方月曆的日期，也可用「從哪一天」加入。'};
 const renderPicker=()=>{
  const y=pickerMonth.getFullYear(),m=pickerMonth.getMonth();$('#shiftPickerMonth').textContent=`${y} 年 ${m+1} 月`;
  const offset=(new Date(y,m,1).getDay()+6)%7, days=new Date(y,m+1,0).getDate();let markup='';
  for(let i=0;i<offset;i++)markup+='<span class="shift-day-padding"></span>';
  for(let j=1;j<=days;j++){const value=iso(new Date(y,m,j)),selected=selectedDates.has(value);markup+=`<button type="button" class="shift-mini-day${selected?' selected':''}${value===today()?' today':''}" data-pick-date="${value}" aria-pressed="${selected}" aria-label="${value}${selected?' 已選擇':''}">${j}</button>`}
  $('#shiftMiniGrid').innerHTML=markup;renderSelected();
 };
 const switchMode=next=>{mode=next;$('#batchPickSection').classList.toggle('hidden',mode!=='pick');$('#batchRangeSection').classList.toggle('hidden',mode!=='range');$('#batchModePick').classList.toggle('active',mode==='pick');$('#batchModeRange').classList.toggle('active',mode==='range');$('#batchModePick').setAttribute('aria-pressed',String(mode==='pick'));$('#batchModeRange').setAttribute('aria-pressed',String(mode==='range'));$('#batchGenerate').textContent=mode==='pick'?'＋ 將選好的日期加入排班草稿':'＋ 依日期區間建立排班草稿'};
 $('#batchModePick').onclick=()=>switchMode('pick');$('#batchModeRange').onclick=()=>switchMode('range');
 $('#batchFrom').addEventListener('change',()=>{const start=$('#batchFrom').value;if($('#batchFollow').checked)$('#batchTo').value=start;if(validDate(start)){pickerMonth=new Date(fromISO(start).getFullYear(),fromISO(start).getMonth(),1);renderPicker()}});
 $('#batchTo').addEventListener('change',()=>{$('#batchFollow').checked=false});
 $('#batchFollow').onchange=()=>{if($('#batchFollow').checked)$('#batchTo').value=$('#batchFrom').value};
 $('#shiftPickerPrev').onclick=()=>{pickerMonth=new Date(pickerMonth.getFullYear(),pickerMonth.getMonth()-1,1);renderPicker()};
 $('#shiftPickerNext').onclick=()=>{pickerMonth=new Date(pickerMonth.getFullYear(),pickerMonth.getMonth()+1,1);renderPicker()};
 $('#shiftMiniGrid').onclick=e=>{const b=e.target.closest('[data-pick-date]');if(!b)return;const day=b.dataset.pickDate;selectedDates.has(day)?selectedDates.delete(day):selectedDates.add(day);renderPicker()};
 $('#shiftDateChips').onclick=e=>{const b=e.target.closest('[data-unpick]');if(!b)return;selectedDates.delete(b.dataset.unpick);renderPicker()};
 $('#shiftClearDates').onclick=()=>{selectedDates.clear();renderPicker()};
 $('#batchAddDate').onclick=()=>{const day=$('#batchFrom').value;if(!validDate(day)){toast('請先選擇有效日期');return}selectedDates.add(day);pickerMonth=new Date(fromISO(day).getFullYear(),fromISO(day).getMonth(),1);renderPicker()};
 $('#batchWeekdays').onclick=e=>{const b=e.target.closest('[data-weekday]');if(!b)return;b.classList.toggle('active');b.setAttribute('aria-pressed',String(b.classList.contains('active')))};
 const applyGlobalPreset=()=>{const p=SHIFT_PRESETS[$('#batchPreset').value]||SHIFT_PRESETS.custom;$('#batchStart').value=p.start;$('#batchEnd').value=p.end;$('#batchStart').disabled=p.allDay;$('#batchEnd').disabled=p.allDay;$('#batchTimeFields').classList.toggle('all-day-disabled',p.allDay);$('#batchTitle').value=p.name;$('#shiftGuide').textContent=p.allDay?'整日值班不需輸入時間；草稿內也可以單獨切換班別。':'時間只作為預設，所有日期均可另行調整。'};
 $('#batchPreset').onchange=applyGlobalPreset;
 $('#batchColorPalette').onclick=e=>{const b=e.target.closest('[data-batch-bg]');if(!b)return;defaultShiftBg=b.dataset.batchBg||'';$$('#batchColorPalette [data-batch-bg]').forEach(x=>x.setAttribute('aria-pressed',String((x.dataset.batchBg||'')===defaultShiftBg)));$('#batchColorLabel').textContent='目前：'+(PASTELS.find(x=>x[1]===defaultShiftBg)?.[0]||'依成員代表色')};
 $('#batchGenerate').onclick=()=>{
  const base=template();if(!base.allDay&&(!shiftTimeValue(base.start)||!shiftTimeValue(base.end)||base.start===base.end)){toast('請設定有效的起迄時間；如果是整日值班請選「整日」');return}
  let days=[];
  if(mode==='pick'){days=chosenDates();if(!days.length){toast('請先在月曆選擇至少一天值班日期');return}}
  else{const first=$('#batchFrom').value,last=$('#batchTo').value;if(!validDate(first)||!validDate(last)||last<first){toast('請確認起迄日期');return}const period=Math.round((fromISO(last)-fromISO(first))/86400000);if(period>365){toast('日期區間最多一年');return}const chosen=new Set($$('#batchWeekdays .active').map(b=>Number(b.dataset.weekday)));if(!chosen.size){toast('請至少勾選一個星期');return}for(let date=fromISO(first);date<=fromISO(last);date=addDays(date,1))if(chosen.has((date.getDay()+6)%7))days.push(iso(date));}
  let added=0;for(const date of days){if(!addRow({...base,date}))break;added++}
  $('#batchStatus').textContent=added?`已建立 ${added} 筆草稿。可以逐列修改日期、班別及時間，最後再儲存。`:'這次沒有新增班次。';
 };
 $('#batchAddRow').onclick=()=>{const last=rows().at(-1),raw=last?readShiftRow(last):template();if(raw)addRow({...raw,date:last?$('#batchFrom').value||raw.date:raw.date})};
 $('#batchDuplicate').onclick=()=>{const last=rows().at(-1);if(!last){toast('請先建立一列');return}const prev=readShiftRow(last);if(prev)addRow({...prev,date:$('#batchFrom').value||prev.date})};
 $('#batchClear').onclick=()=>{if(rows().length&&!confirm('確定清空尚未儲存的值班草稿？'))return;list.innerHTML='<div class="shift-empty">班表草稿已清空。</div>';count()};
 list.onclick=e=>{
  const btn=e.target.closest('[data-remove-shift]');if(btn){btn.closest('[data-shift-row]').remove();if(!rows().length)list.innerHTML='<div class="shift-empty">班表草稿已清空。</div>';count();return}
  const toggle=e.target.closest('[data-shift-color-toggle]');if(toggle){const menu=toggle.closest('[data-row-color]').querySelector('[data-row-color-menu]');const show=menu.classList.contains('hidden');$$('[data-row-color-menu]',list).forEach(n=>n.classList.add('hidden'));$$('[data-shift-color-toggle]',list).forEach(n=>n.setAttribute('aria-expanded','false'));menu.classList.toggle('hidden',!show);toggle.setAttribute('aria-expanded',String(show));return}
  const color=e.target.closest('[data-row-bg]');if(color){const widget=color.closest('[data-row-color]'),row=color.closest('[data-shift-row]'),bg=color.dataset.rowBg||'';widget.dataset.bgColor=bg;widget.querySelector('[data-row-color-dot]').style.background=bg||rgbSoft(member(row.querySelector('[data-shift-member]').value)?.color||'#8870ec',.22);widget.querySelector('[data-row-color-name]').textContent=PASTELS.find(x=>x[1]===bg)?.[0]||'依成員';$$('[data-row-bg]',widget).forEach(x=>x.setAttribute('aria-pressed',String((x.dataset.rowBg||'')===bg)));widget.querySelector('[data-row-color-menu]').classList.add('hidden');widget.querySelector('[data-shift-color-toggle]').setAttribute('aria-expanded','false')}
 };
 list.addEventListener('change',e=>{
  const row=e.target.closest('[data-shift-row]');if(!row)return;
  if(e.target.matches('[data-shift-preset]')){
   const p=SHIFT_PRESETS[e.target.value]||SHIFT_PRESETS.custom;
   const title=row.querySelector('[data-shift-title]');if(!title.value.trim()||Object.values(SHIFT_PRESETS).some(x=>x.name===title.value))title.value=p.name;
   for(const [selector,value] of [['[data-shift-start]',p.start],['[data-shift-end]',p.end]]){const field=row.querySelector(selector);field.value=value;field.disabled=p.allDay;field.required=!p.allDay}
  }else if(e.target.matches('[data-shift-start],[data-shift-end]'))row.querySelector('[data-shift-preset]').value='custom';
  else if(e.target.matches('[data-shift-member]')&&!row.querySelector('[data-row-color]').dataset.bgColor)row.querySelector('[data-row-color-dot]').style.background=rgbSoft(member(e.target.value)?.color||'#8870ec',.22);
 });
 $('#batchSave').onclick=async()=>{
  const raw=rows().map(readShiftRow);
  if(raw.some(x=>!x||!x.title||!x.date||!x.memberId||(!x.allDay&&(!shiftTimeValue(x.start)||!shiftTimeValue(x.end)||x.start===x.end)))){toast('有班次資料不完整、日期無效，或時間相同；請逐列確認');return}
  const proposed=raw.map(x=>{const endDate=!x.allDay&&x.end<x.start?iso(addDays(fromISO(x.date),1)):x.date;return cleanEvent({id:uid(),date:x.date,endDate,time:x.allDay?'':x.start,endTime:x.allDay?'':x.end,title:x.title,memberIds:[x.memberId],allDay:x.allDay,repeat:'none',until:'',location:'',note:'',kind:'shift',bgColor:x.bgColor||'',done:false,updatedAt:Date.now()})});
  if(proposed.some(x=>!x)){toast('班表日期不正確');return}
  const fingerprint=e=>[e.date,e.memberIds?.[0],e.allDay?'allDay':'timed',e.time,e.endTime,e.endDate].join('|');
  const seen=new Set(data.events.filter(e=>e.kind==='shift').map(fingerprint));const fresh=[],duplicates=[];
  for(const e of proposed){const key=fingerprint(e);if(seen.has(key)){duplicates.push(e);continue}fresh.push(e);seen.add(key)}
  if(!fresh.length){toast('這些班次都已存在，未重複新增');return}
  const extra=duplicates.length?`，另外 ${duplicates.length} 筆重複值班略過`:'';
  if(!confirm(`確認儲存 ${fresh.length} 筆不規則值班${extra}？\n會顯示在家庭月曆上。`))return;
  const saveBtn=$('#batchSave');saveBtn.disabled=true;saveBtn.textContent='正在儲存…';
  try{data.events.push(...fresh);persist();
   selectedDate=fresh[0].date;cursor=fromISO(selectedDate);closeModal();render();toast(`已新增 ${fresh.length} 筆值班${duplicates.length?'；略過重複 '+duplicates.length+' 筆':''}`);
  }catch(error){saveBtn.disabled=false;saveBtn.innerHTML=`儲存全部班次（<span id="batchSaveCount">${rows().length}</span>）`;toast('儲存失敗：'+humanError(error))}
 };
 renderPicker();count();
}
function readShiftRow(row){
 const date=row.querySelector('[data-shift-date]').value,preset=row.querySelector('[data-shift-preset]').value,allDay=preset==='allDay';
 if(!/^\d{4}-\d\d-\d\d$/.test(date||'')||iso(fromISO(date))!==date)return null;
 return {date,memberId:row.querySelector('[data-shift-member]').value,title:row.querySelector('[data-shift-title]').value.trim(),preset,allDay,start:allDay?'':row.querySelector('[data-shift-start]').value,end:allDay?'':row.querySelector('[data-shift-end]').value,bgColor:row.querySelector('[data-row-color]').dataset.bgColor||''};
}

function membersForm(){
 const editorRows=()=>data.members.map(m=>memberEditRow(m)).join('');
 modal('管理家庭成員','MEMBER COLORS & PHOTOS',`<p class="info-note">每位成員可使用自己的照片或表情圖示，照片會自動裁切、縮小並顯示在左側家庭成員清單；顏色仍用來辨識行程。</p><form id="membersForm"><div id="memberEditors" class="member-editor">${editorRows()}</div><button type="button" class="outline-button full" id="addMemberRow" style="margin-top:0">＋ 新增家庭成員</button><div class="form-field" style="margin-top:20px"><label class="form-label">家庭名稱</label><input id="editFamilyName" class="field-input" maxlength="40" value="${esc(data.familyName)}"/></div><div class="form-actions"><button class="neutral-btn" type="button" id="cancelMembers">取消</button><button class="primary-btn" type="submit">儲存家庭設定</button></div></form>`);
 $('#addMemberRow').onclick=()=>{if($$('.member-editor-row').length>=20){toast('目前最多 20 位成員');return}$('#memberEditors').insertAdjacentHTML('beforeend',memberEditRow({id:uid(),name:'新成員',emoji:'😊',color:'#e4a34c'}))};
 $('#memberEditors').onclick=e=>{
  const btn=e.target.closest('[data-remove-member]');if(btn){if($$('.member-editor-row').length===1){toast('至少保留一位家人');return}btn.closest('.member-editor-row').remove();return}
  const pick=e.target.closest('[data-photo-pick]');if(pick){pick.closest('[data-mid]').querySelector('[data-photo-file]').click();return}
  const clear=e.target.closest('[data-photo-clear]');if(clear){const row=clear.closest('[data-mid]');row.dataset.photo='';row.querySelector('[data-photo-preview]').innerHTML=esc(row.querySelector('[data-emoji]').value||'😊');clear.classList.add('hidden');return}
 };
 $('#memberEditors').onchange=async e=>{
  if(!e.target.matches('[data-photo-file]'))return;const input=e.target,row=input.closest('[data-mid]');if(!input.files?.[0])return;
  const submit=$('#membersForm button[type=submit]');submit.disabled=true;
  try{const photo=await compressMemberPhoto(input.files[0]);row.dataset.photo=photo;row.querySelector('[data-photo-preview]').innerHTML=`<img src="${esc(photo)}" alt="頭像預覽"/>`;row.querySelector('[data-photo-clear]').classList.remove('hidden');toast('照片已處理，請按「儲存家庭設定」完成')}
  catch(err){toast(humanError(err))}finally{input.value='';submit.disabled=false}
 };
 $('#memberEditors').oninput=e=>{if(e.target.matches('[data-emoji]')){const row=e.target.closest('[data-mid]');if(!row.dataset.photo)row.querySelector('[data-photo-preview]').textContent=e.target.value||'😊'}};
 $('#cancelMembers').onclick=closeModal;
 $('#membersForm').onsubmit=async e=>{
 e.preventDefault();const next=$$('.member-editor-row').map(row=>({id:row.dataset.mid,name:row.querySelector('[data-name]').value.trim().slice(0,16),emoji:row.querySelector('[data-emoji]').value.trim().slice(0,8)||'😊',color:safeColor(row.querySelector('[data-color]').value),photo:safeMemberPhoto(row.dataset.photo)}));
 if(next.some(m=>!m.name)){toast('每位成員都要有名稱');return}
 const old=activeMemberIds;const originalIds=new Set(data.members.map(m=>m.id)); const newData={...data,members:next,quickTemplates:cleanQuickTemplates(data.quickTemplates,next),familyName:$('#editFamilyName').value.trim().slice(0,40)||'我們的家'};
 try{data=newData;persist();activeMemberIds=new Set(next.map(m=>m.id).filter(id=>old.has(id)||!originalIds.has(id)));if(!activeMemberIds.size)activeMemberIds=new Set(next.map(m=>m.id));closeModal();render();toast('家庭成員已更新')}catch(err){toast('儲存失敗：'+humanError(err))}
 };
}
function memberEditRow(m){const photo=safeMemberPhoto(m.photo);return `<div class="member-editor-row" data-mid="${esc(m.id)}" data-photo="${esc(photo)}"><div class="member-editor-photo"><span class="member-photo-preview" data-photo-preview>${photo?`<img src="${esc(photo)}" alt="${esc(m.name)}的頭像"/>`:esc(m.emoji)}</span><button type="button" class="member-photo-action" data-photo-pick title="上傳或更換照片">📷 上傳</button><button type="button" class="member-photo-clear ${photo?'':'hidden'}" data-photo-clear title="移除照片，恢復表情符號">移除</button><input type="file" data-photo-file accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden/></div><div class="member-editor-info"><label>姓名<input data-name type="text" maxlength="16" required value="${esc(m.name)}" aria-label="成員名稱"/></label><label>預設圖示<input class="emoji-input" data-emoji type="text" maxlength="8" value="${esc(m.emoji)}" aria-label="成員圖示"/></label></div><label class="member-color-wrapper">代表色<input class="color-input" data-color type="color" value="${safeColor(m.color)}" aria-label="成員顏色"/></label><button type="button" class="member-remove" data-remove-member title="移除此成員" aria-label="移除家庭成員">✕</button></div>`}
function backupModal(){
 modal('資料備份與移轉','BACKUP & TRANSFER',`<p class="info-note">所有變更會先保存在目前裝置，連接 Google Sheets 時自動同步。建議定期下載完整 JSON 備份；備份包含成員照片、常用事項及重複系列。</p>
 <div class="btn-row"><button id="exportJson" class="primary-btn">下載完整備份 JSON</button><button id="exportIcs" class="neutral-btn">匯出日曆 ICS</button></div><hr class="section-divider"/><h3 class="mini-strong">還原備份</h3><p class="cloud-help">匯入將取代本裝置目前資料，若已連接 Sheets，差異會依修訂版同步到共用日曆。匯入前先下載備份。</p><button id="importJson" class="neutral-btn">選擇 JSON 備份檔</button>`);
 $('#exportJson').onclick=()=>downloadBlob(`家日曆_完整備份_${today()}.json`,new Blob([JSON.stringify({...data,exportedAt:new Date().toISOString(),version:1},null,2)],{type:'application/json'}));
 $('#exportIcs').onclick=exportICS;
 $('#importJson').onclick=()=>{$('#backupFile').value='';$('#backupFile').click()};
}
function downloadBlob(name,blob){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('檔案已開始下載')}
function icsText(s){return String(s||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,c=>'\\'+c)}
function exportICS(){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//FamilyColor//Family Calendar//ZH-TW','CALSCALE:GREGORIAN','X-WR-CALNAME:'+icsText(data.familyName)];
 const dateCompact=s=>s.replaceAll('-','');
 for(const e of data.events){lines.push('BEGIN:VEVENT','UID:'+e.id.replace(/[^a-zA-Z0-9-]/g,'')+'@familycolor.local','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z'));
 const start=dateCompact(e.date),end=iso(addDays(fromISO(e.endDate||e.date),1));
 if(e.allDay){lines.push('DTSTART;VALUE=DATE:'+start,'DTEND;VALUE=DATE:'+dateCompact(end))}
 else {const compact=s=>s.replace('-','').replace('-','').replace(':','')+'00';lines.push('DTSTART:'+compact(e.date+'T'+(e.time||'09:00')),'DTEND:'+compact((e.endDate||e.date)+'T'+(e.endTime||e.time||'09:00')))}
 lines.push('SUMMARY:'+icsText(e.title),'DESCRIPTION:'+icsText([eventMembers(e).map(m=>m.name).join('、'),e.note].filter(Boolean).join('\n')));if(e.location)lines.push('LOCATION:'+icsText(e.location));
 if(e.repeat!=='none'){let r={daily:'DAILY',weekly:'WEEKLY',monthly:'MONTHLY',yearly:'YEARLY'}[e.repeat];if(r)lines.push('RRULE:FREQ='+r+(e.until?';UNTIL='+dateCompact(e.until)+'T235959':''));if(e.exdates?.length){const dates=e.exdates.map(d=>dateCompact(d));lines.push(e.allDay?'EXDATE;VALUE=DATE:'+dates.join(','):'EXDATE:'+dates.map(x=>x+'T'+(e.time||'09:00').replace(':','')+'00').join(','));}}
 lines.push('END:VEVENT');}
 lines.push('END:VCALENDAR');downloadBlob(`家日曆_${today()}.ics`,new Blob([lines.join('\r\n')],{type:'text/calendar;charset=utf-8'}));
}
async function importBackup(file){
 if(!file)return;let imported;
 try{const contents=await file.text(),raw=JSON.parse(contents);
  if(!raw||!Array.isArray(raw.events)||!Array.isArray(raw.members))throw Error('格式不符');imported=cleanData(raw)}
 catch{toast('無法讀取備份：請選擇家日曆 JSON 檔案');return}
 if(!confirm(`確認以備份中的 ${imported.events.length} 筆事項、${imported.members.length} 位成員取代本機資料？已連接雲端時也會同步這項修改。`))return;
 data=imported;activeMemberIds=new Set(data.members.map(m=>m.id));persist();closeModal();render();toast('已還原備份；如已連接共用同步，將上傳變更');
}
function humanError(e){const msg=String(e?.message||e||'請稍後再試');if(msg.includes('permission-denied'))return '沒有權限：請確認已將你的 Google Email 加入家庭';if(msg.includes('popup'))return '登入視窗被阻擋，請允許彈出視窗';return msg.slice(0,130)}
function closeMenu(){$('#sidebar').classList.remove('open');$('#scrim').classList.add('hidden')}
function wireEvents(){
 $('#addEventTop').onclick=()=>eventForm();$('#addEventDay').onclick=()=>eventForm();$('#mobileFab').onclick=()=>eventForm();$('#batchShiftBtn').onclick=()=>batchShiftForm();$('#batchShiftSide').onclick=()=>{closeMenu();batchShiftForm()};
 $('#manageRecurring').onclick=()=>{closeMenu();recurringManager()};$('#manageMembers').onclick=()=>{closeMenu();membersForm()};$('#manageQuick').onclick=()=>{closeMenu();quickLibraryModal()};$('#backupBtn').onclick=()=>{closeMenu();backupModal()};$('#cloudBtn').onclick=cloudModal;
 $('#menuBtn').onclick=()=>{$('#sidebar').classList.add('open');$('#scrim').classList.remove('hidden')};$('#scrim').onclick=closeMenu;
 $('#selectAllMembers').onclick=()=>{activeMemberIds=new Set(data.members.map(m=>m.id));render()};
 $('#memberFilters').onclick=e=>{const upload=e.target.closest('[data-upload-member]');if(upload){$('#memberPhotoFile').dataset.memberId=upload.dataset.uploadMember;$('#memberPhotoFile').value='';$('#memberPhotoFile').click();return}const btn=e.target.closest('[data-filter]');if(!btn)return;const id=btn.dataset.filter;activeMemberIds.has(id)?activeMemberIds.delete(id):activeMemberIds.add(id);render()};
 $('#memberPhotoFile').onchange=async e=>{const id=e.target.dataset.memberId;if(!member(id)||!e.target.files?.[0])return;const upload=$(`[data-upload-member="${id}"]`);if(upload)upload.disabled=true;try{const pic=await compressMemberPhoto(e.target.files[0]);await saveMemberPortrait(id,pic);toast('家庭成員照片已更新')}catch(err){toast('照片上傳失敗：'+humanError(err))}finally{if(upload)upload.disabled=false;e.target.value=''}};
 $('#prevBtn').onclick=()=>go(-1);$('#nextBtn').onclick=()=>go(1);$('#todayBtn').onclick=()=>{cursor=new Date();selectedDate=today();render()};
 $$('.view-switch [data-view]').forEach(btn=>btn.onclick=()=>{view=btn.dataset.view;render()});
 $('#calendarBody').onclick=e=>{let ev=e.target.closest('[data-event]');if(ev){const obj=data.events.find(v=>v.id===ev.dataset.event);if(obj)eventForm(obj,ev.dataset.occurrence);return}const day=e.target.closest('[data-day]');if(day)setSelected(day.dataset.day)};
 $('#calendarBody').onkeydown=e=>{if(e.key==='Enter' && e.target.matches('[data-day]')){e.preventDefault();setSelected(e.target.dataset.day)}};
 $('#dayEventList').onclick=e=>{const ev=e.target.closest('[data-event]');if(ev){const obj=data.events.find(v=>v.id===ev.dataset.event);if(obj)eventForm(obj,ev.dataset.occurrence)}};
 $('#closeModal').onclick=closeModal;$('#modalBackdrop').onclick=e=>{if(e.target===$('#modalBackdrop'))closeModal()};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modalBackdrop').classList.contains('hidden'))closeModal()});
 $('#backupFile').onchange=e=>importBackup(e.target.files[0]);
}
/* ---------- Google Sheets + Apps Script 安全橋接同步 ---------- */
const SHEET_STORE='familycolor_v1_sheet_sync';
const SHEET_BASE_STORE='familycolor_v1_sheet_base';
let sheetSync={url:'',key:'',active:false,baseline:null,version:0,bridge:null,bridgeWindow:null,bridgeOrigin:'',nonce:'',pending:new Map(),connecting:null,busy:false,blocked:false,timer:null,readyTimer:null,lastError:''};
function cloneJSON(obj){return JSON.parse(JSON.stringify(obj))}
function eqJSON(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function syncStatus(label,good=false){
 const box=$('#cloudLabel'),dot=$('#cloudDot');if(box)box.textContent=label;
 if(dot)dot.classList.toggle('online',good);
 if($('#familySubtitle'))$('#familySubtitle').textContent=sheetSync.active?'Google 試算表家庭共用中':'把每一天安排得剛剛好';
}
function sheetURL(u){
 const raw=String(u||'').trim();if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(raw))throw Error('請貼上 Apps Script 部署網址，須以 /exec 結尾');
 const url=new URL(raw);url.search='';return url.href;
}
function sheetKey(value){const x=String(value||'').trim();if(!/^[a-fA-F0-9]{64}$/.test(x))throw Error('請填入 「家日曆設定」選單產生的 64 碼家庭共用密鑰');return x.toLowerCase()}
function sheetNonce(){return [...crypto.getRandomValues(new Uint8Array(18))].map(v=>v.toString(16).padStart(2,'0')).join('')}
function closeBridge(){
 if(sheetSync.bridge){sheetSync.bridge.remove();sheetSync.bridge=null}
 sheetSync.bridgeWindow=null;sheetSync.bridgeOrigin='';
 for(const {reject} of sheetSync.pending.values())reject(Error('連線已關閉'));
 sheetSync.pending.clear();
}
function bridgeOpen(url){
 closeBridge();sheetSync.nonce=sheetNonce();
 const src=new URL(url);src.searchParams.set('origin',location.origin);src.searchParams.set('nonce',sheetSync.nonce);
 const frame=document.createElement('iframe');frame.title='Google Sheets 同步橋接器';frame.setAttribute('aria-hidden','true');frame.style.cssText='position:absolute;width:1px;height:1px;border:0;left:-9999px;top:0';
 sheetSync.bridge=frame;
 const promise=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{sheetSync.readyTimer=null;reject(Error('Apps Script 橋接器逾時，請確認網頁應用程式的權限是「任何人」，並嘗試使用 GitHub Pages 網址。'))},22000);
  sheetSync.readyTimer={resolve:()=>{clearTimeout(timer);sheetSync.readyTimer=null;resolve()},reject:e=>{clearTimeout(timer);sheetSync.readyTimer=null;reject(e)}};
 });
 window.addEventListener('message',handleBridgeMessage);
 document.body.appendChild(frame);frame.src=src.href;
 return promise;
}
function handleBridgeMessage(evt){
 const m=evt.data;if(!m||!['ready','result','error'].includes(m.familySheetBridge)||m.nonce!==sheetSync.nonce)return;
 if(!sheetSync.bridge)return;
 // 驗證 Apps Script/Google 的來源，且只接收對應連線 nonce 的回覆。
 if(!/^https:\/\/(?:[a-z0-9.-]+\.)?googleusercontent\.com$/.test(evt.origin)&&evt.origin!=='https://script.google.com')return;
 if(m.familySheetBridge==='ready'){
  sheetSync.bridgeWindow=evt.source;sheetSync.bridgeOrigin=evt.origin;
  if(sheetSync.readyTimer)sheetSync.readyTimer.resolve();return;
 }
 if(evt.source!==sheetSync.bridgeWindow||evt.origin!==sheetSync.bridgeOrigin)return;
 const p=sheetSync.pending.get(m.id);if(!p)return;sheetSync.pending.delete(m.id);clearTimeout(p.timer);
 if(m.familySheetBridge==='error')p.reject(Error(String(m.value||'Apps Script 發生錯誤')));
 else p.resolve(m.value);
}
function bridgeCall(action,args={}){
 if(!sheetSync.bridgeWindow) return Promise.reject(Error('尚未建立 Google Apps Script 連線'));
 const id='m'+sheetNonce().slice(0,24);
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{sheetSync.pending.delete(id);reject(Error('Google Sheets 回應逾時；更動已保存在本機，請按「立即同步」重試'))},30000);
  sheetSync.pending.set(id,{resolve,reject,timer});
  sheetSync.bridgeWindow.postMessage({familySheetBridge:'rpc',nonce:sheetSync.nonce,id,action,key:sheetSync.key,...args},sheetSync.bridgeOrigin);
 });
}
function getSavedBase(url){try{const b=JSON.parse(safeStorage.getItem(SHEET_BASE_STORE)||'null');return b&&b.url===url&&Number.isInteger(b.version)?b:null}catch{return null}}
function rememberBase(data0,version){
 sheetSync.baseline=cloneJSON(cleanData(data0));sheetSync.version=version;
 try{safeStorage.setItem(SHEET_BASE_STORE,JSON.stringify({url:sheetSync.url,version,data:sheetSync.baseline}))}catch{toast('備份空間不足：照片與事項已保留在記憶體，請另存 JSON')}
}
function arraysDiff(kind,oldList,newList){
 const om=new Map((oldList||[]).map(x=>[x.id,x])),nm=new Map((newList||[]).map(x=>[x.id,x]));
 const upserts=[],deletes=[];
 for(const [id,obj] of nm)if(!eqJSON(obj,om.get(id)))upserts.push(obj);
 for(const id of om.keys())if(!nm.has(id))deletes.push(id);
 return upserts.length||deletes.length?{upserts,deletes}:null;
}
function deltaData(base,current){
 const result={};
 for(const [key,prop] of [['events','events'],['members','members'],['templates','quickTemplates']]){
  const d=arraysDiff(key,base?.[prop],current[prop]);if(d)result[key]=d;
 }
 if((base?.familyName||'我們的家')!==current.familyName)result.familyName=current.familyName;
 return result;
}
function hasChanges(p){return !!Object.keys(p).length}
// 大型舊資料匯入時切成小批寫入，避免超過 Apps Script 的單次執行限制。
function limitPatch(full,maxRows=250){
 let remaining=maxRows;const part={};
 for(const k of ['members','events','templates']){
  const group=full[k];if(!group||remaining<=0)continue;
  const upserts=(group.upserts||[]).slice(0,remaining);remaining-=upserts.length;
  const deletes=(group.deletes||[]).slice(0,remaining);remaining-=deletes.length;
  if(upserts.length||deletes.length)part[k]={upserts,deletes};
 }
 if(Object.prototype.hasOwnProperty.call(full,'familyName'))part.familyName=full.familyName;
 return part;
}
function applyPatch(data0,patch){
 const target=cloneJSON(data0);
 for(const [k,prop] of [['events','events'],['members','members'],['templates','quickTemplates']]){
  if(!patch[k])continue;
  const m=new Map((target[prop]||[]).map(x=>[x.id,x]));
  for(const id of patch[k].deletes||[])m.delete(id);
  for(const obj of patch[k].upserts||[])m.set(obj.id,obj);
  target[prop]=[...m.values()];
 }
 if(Object.prototype.hasOwnProperty.call(patch,'familyName'))target.familyName=patch.familyName;
 return cleanData(target);
}
function conflictsIn(base,remote,localPatch){
 const issues=[];
 for(const [k,prop] of [['events','events'],['members','members'],['templates','quickTemplates']]){
  const patch=localPatch[k];if(!patch)continue;
  const oldM=new Map((base[prop]||[]).map(x=>[x.id,x]));
  const remoteM=new Map((remote[prop]||[]).map(x=>[x.id,x]));
  for(const id of [...(patch.upserts||[]).map(x=>x.id),...(patch.deletes||[])]){
   if(!eqJSON(oldM.get(id),remoteM.get(id)))issues.push(k+'/'+id);
  }
 }
 if(Object.prototype.hasOwnProperty.call(localPatch,'familyName')&&base.familyName!==remote.familyName)issues.push('familyName');
 return issues;
}
function localHasInformation(){return !!(data.events.length||data.quickTemplates.length||data.members.some(m=>safeMemberPhoto(m.photo))||data.members.length!==4||data.familyName!=='我們的家')}
function storeLocal(){
 localData=data;
 try{safeStorage.setItem(STORE,JSON.stringify(localData))}catch{toast('本機空間不足，請立即下載 JSON 備份')}
}
function acceptCloud(remote,version){
 data=cleanData(remote);activeMemberIds=new Set(data.members.map(m=>m.id));storeLocal();rememberBase(data,version);sheetSync.active=true;sheetSync.blocked=false;sheetSync.lastError='';
 syncStatus('Sheets 已同步',true);render();
}
function rebaseRemote(snapshot){
 const remote=cleanData(snapshot.data),localPatch=deltaData(sheetSync.baseline,data);
 const issues=conflictsIn(sheetSync.baseline,remote,localPatch);
 if(issues.length){sheetSync.blocked=true;sheetSync.lastError='同一筆事項被其他家人修改：'+issues.slice(0,5).join('、');syncStatus('⚠ 同步衝突');return false;}
 data=applyPatch(remote,localPatch);storeLocal();rememberBase(remote,snapshot.version);render();
 sheetSync.blocked=false;return true;
}
async function sheetConnect({auto=false}={}){
 if(sheetSync.connecting)return sheetSync.connecting;
 const task=(async()=>{
  syncStatus('連線中…');sheetSync.lastError='';
  await bridgeOpen(sheetSync.url);
  const result=await bridgeCall('read');
  if(!result||!result.ok||!result.data)throw Error('Google Sheets 回傳的資料格式不正確');
  const remote=cleanData(result.data),last=getSavedBase(sheetSync.url);
  sheetSync.active=true;
  if(last){
    sheetSync.baseline=cleanData(last.data);sheetSync.version=last.version;
    if(rebaseRemote(result)){syncStatus('Sheets 已連線',true);if(hasChanges(deltaData(sheetSync.baseline,data)))scheduleSheetPush(200)}
  }else if((result.version===0&&!result.data.events.length&&!result.data.members.length&&!result.data.quickTemplates.length)||localHasInformation()){
    sheetSync.active=false;sheetSync.offer=result;syncStatus('選擇同步方式');
    if(!auto)toast('連線成功，請選擇首次匯入方式');
  }else acceptCloud(remote,result.version);
  safeStorage.setItem(SHEET_STORE,JSON.stringify({url:sheetSync.url,key:sheetSync.key}));
  if(!auto)cloudModal();
  return result;
 })().catch(err=>{sheetSync.active=false;sheetSync.lastError=String(err?.message||err);syncStatus('連線失敗');if(!auto)toast('連線失敗：'+humanError(err));throw err})
 .finally(()=>{sheetSync.connecting=null});
 sheetSync.connecting=task;return task;
}
function chooseCloud(){if(!sheetSync.offer)return;const r=sheetSync.offer;sheetSync.offer=null;acceptCloud(r.data,r.version);cloudModal();}
function chooseMerge(){
 const r=sheetSync.offer;if(!r)return;
 const remote=cleanData(r.data),patch=deltaData(remote,data);
 // 本機與雲端資料以 ID 合併；相同 ID 以本機為準（須明確確認）。
 if(!confirm('確定將本機新增或修改的事項合併至共用試算表？相同 ID 的事項將以這台裝置的版本為準。建議先下載 JSON 備份。'))return;
 const combined=applyPatch(remote,patch);
 sheetSync.offer=null;acceptCloud(remote,r.version);data=combined;storeLocal();scheduleSheetPush(10);cloudModal();
}
function scheduleSheetPush(delay=900){
 if(!sheetSync.active||sheetSync.blocked)return;
 clearTimeout(sheetSync.timer);sheetSync.timer=setTimeout(()=>{sheetPush().catch(()=>{})},delay);
}
async function sheetPush(){
 if(!sheetSync.active||sheetSync.blocked||sheetSync.busy)return;
 const allChanges=deltaData(sheetSync.baseline,data);if(!hasChanges(allChanges))return;
 const patch=limitPatch(allChanges);
 sheetSync.busy=true;syncStatus('同步上傳中…');
 const submitted=applyPatch(sheetSync.baseline,patch),baseVersion=sheetSync.version;
 try{
  const answer=await bridgeCall('write',{version:baseVersion,patch});
  if(answer?.conflict){const latest=await bridgeCall('read');if(rebaseRemote(latest))scheduleSheetPush(120);return;}
  if(!answer?.ok)throw Error('Apps Script 未確認資料寫入完成');
  rememberBase(submitted,answer.version);sheetSync.blocked=false;sheetSync.lastError='';syncStatus('Sheets 已同步',true);
  if(hasChanges(deltaData(sheetSync.baseline,data)))scheduleSheetPush(150);
 }catch(err){sheetSync.lastError=String(err?.message||err);syncStatus('⚠ 待同步');toast('未能同步，已保留本機：'+humanError(err));}
 finally{sheetSync.busy=false}
}
async function sheetPull(){
 if(!sheetSync.active||sheetSync.busy)return;
 const localPatch=deltaData(sheetSync.baseline,data);
 if(hasChanges(localPatch)){await sheetPush();return;}
 try{
  const result=await bridgeCall('read');if(!result?.ok)throw Error('讀取失敗');
  if(result.version!==sheetSync.version)acceptCloud(result.data,result.version);
  else syncStatus('Sheets 已同步',true);
 }catch(err){sheetSync.lastError=String(err?.message||err);syncStatus('⚠ 待連線')}
}
function sheetDisconnect(){
 clearTimeout(sheetSync.timer);sheetSync.active=false;sheetSync.offer=null;sheetSync.blocked=false;
 closeBridge();safeStorage.removeItem(SHEET_STORE);safeStorage.removeItem(SHEET_BASE_STORE);
 sheetSync.url='';sheetSync.key='';sheetSync.baseline=null;syncStatus('本機日曆');render();
}
function copyLink(){
 const url=new URL(location.href);url.hash='sheet='+encodeURIComponent(sheetSync.url);
 navigator.clipboard?.writeText(url.href).then(()=>toast('連線網址已複製；請另外安全傳送家庭共用密鑰')).catch(()=>toast('請手動複製瀏覽器網址'));
}
function cloudModal(){
 const saved=sheetSync.url?sheetSync.url:'';
 const notice=sheetSync.blocked?`<p class="info-note" style="border-left:3px solid #e99f63">⚠️ ${esc(sheetSync.lastError)}。請先下載完整備份，再選擇使用雲端資料或保留本機修改。</p>`:'';
 const html=`<p class="info-note">使用你自己的 <b>Google Sheets＋Apps Script</b> 作為家庭共用資料庫，無須 Firebase。家人在不同裝置輸入同一個部署網址和家庭共用密鑰即可使用。<b>不需把試算表公開分享。</b></p>
 <div class="form-field"><label class="form-label">Apps Script 網頁應用程式網址（/exec）</label><textarea id="sheetUrl" class="field-area" rows="3" spellcheck="false" placeholder="https://script.google.com/macros/s/.../exec">${esc(saved)}</textarea></div>
 <div class="form-field" style="margin-top:10px"><label class="form-label">家庭共用密鑰（不是 Google 密碼）</label><input id="sheetSecret" type="password" class="field-input" autocomplete="off" placeholder="請貼上 「家日曆設定」選單產生的 64 碼密鑰" value="${esc(sheetSync.key)}"/></div>
 <div class="btn-row" style="margin-top:12px"><button type="button" class="primary-btn" id="connectSheets">連接並檢查</button><button type="button" class="neutral-btn" id="pullSheets" ${sheetSync.active?'':'disabled'}>立即同步</button></div>
 ${notice}
 ${sheetSync.offer?`<hr class="section-divider"/><h3 class="mini-strong">首次連線，請選擇資料來源</h3><p class="cloud-help">試算表目前有 ${sheetSync.offer.data.events.length} 筆事項；本機有 ${data.events.length} 筆。請先下載 JSON 備份，再選擇一項。</p><div class="btn-row"><button type="button" id="useCloud" class="primary-btn">使用試算表的資料</button><button type="button" id="mergeCloud" class="neutral-btn">將本機資料合併上傳</button></div>`:''}
 ${(sheetSync.active||sheetSync.blocked)?`<hr class="section-divider"/><p class="cloud-help"><b>狀態：</b>${sheetSync.blocked?'⚠ 同步衝突':sheetSync.lastError?'⚠ 已保留本機，待重試':'✓ 已連接'}，雲端修訂版 ${sheetSync.version}</p><div class="btn-row"><button type="button" id="copySheetInvite" class="neutral-btn">複製家人連線網址</button><button type="button" id="disconnectSheets" class="neutral-btn">停止共用同步</button></div>`:''}
 ${sheetSync.blocked?`<div class="btn-row"><button type="button" id="conflictUseCloud" class="neutral-btn">放棄本機衝突修改、改用雲端</button><button type="button" id="conflictKeepLocal" class="primary-btn">確認：保留本機修改</button></div>`:''}
 <hr class="section-divider"/><p class="cloud-help"><b>設定流程：</b>Google 試算表 → 擴充功能 → Apps Script → 貼上 ZIP 內的 <code>Code.gs</code> 並建立 HTML 檔 <code>Bridge</code> → 回試算表重新整理 → 「家日曆設定」→「首次初始化」 → 部署網頁應用程式（執行身分：我；存取權：任何人）→ 將 /exec 網址與共用密鑰貼上。<br/>資料變更會在約 1 秒後上傳；開啟頁面時與每分鐘檢查新資料。斷線時先存在此裝置。</p>
 <p class="cloud-help"><b>安全提醒：</b>家庭密鑰相當於共用密碼，知道它的人就能查看和修改行程。不要放在網址、公開儲存庫或分享畫面；家人移除權限時，請到 Apps Script 用試算表的「家日曆設定 → 更換家庭共用密鑰」更換。</p>`;
 modal('Google Sheets 家人同步','SHEETS + APPS SCRIPT',html);
 $('#connectSheets').onclick=async()=>{
  try{const url=sheetURL($('#sheetUrl').value),key=sheetKey($('#sheetSecret').value);sheetSync.url=url;sheetSync.key=key;
  $('#connectSheets').disabled=true;$('#connectSheets').textContent='連線中…';await sheetConnect();}
  catch(err){const b=$('#connectSheets');if(b){b.disabled=false;b.textContent='連接並檢查'}}
 };
 if($('#pullSheets'))$('#pullSheets').onclick=async()=>{await sheetPull();cloudModal();};
 if($('#useCloud'))$('#useCloud').onclick=chooseCloud;
 if($('#mergeCloud'))$('#mergeCloud').onclick=chooseMerge;
 if($('#copySheetInvite'))$('#copySheetInvite').onclick=copyLink;
 if($('#disconnectSheets'))$('#disconnectSheets').onclick=()=>{if(!confirm('切回本機模式？不會刪除 Google 試算表資料。'))return;sheetDisconnect();cloudModal()};
 if($('#conflictUseCloud'))$('#conflictUseCloud').onclick=async()=>{if(!confirm('確定放棄本機尚未同步的修改，改用雲端資料？'))return;const r=await bridgeCall('read');acceptCloud(r.data,r.version);cloudModal()};
 if($('#conflictKeepLocal'))$('#conflictKeepLocal').onclick=async()=>{if(!confirm('確定以本機修改覆蓋同 ID 的雲端資料？這可能覆蓋其他家人的最新修改。'))return;const r=await bridgeCall('read');const pending=deltaData(sheetSync.baseline,data);rememberBase(r.data,r.version);data=applyPatch(cleanData(r.data),pending);storeLocal();sheetSync.blocked=false;scheduleSheetPush(30);cloudModal()};
}
function initSheetSync(){
 // 邀請連結只有部署 URL，刻意不包含任何家庭密鑰。
 try{if(location.hash.startsWith('#sheet=')){const raw=decodeURIComponent(location.hash.slice(7));sheetSync.url=sheetURL(raw);if(history.replaceState)history.replaceState(null,'',location.pathname+location.search);}}catch{}
 let saved=null;try{saved=JSON.parse(safeStorage.getItem(SHEET_STORE)||'null')}catch{}
 if(saved&&saved.url&&saved.key){sheetSync.url=sheetSync.url||saved.url;sheetSync.key=saved.key;
   sheetConnect({auto:true}).catch(()=>{});
 }else if(sheetSync.url){toast('已帶入 Apps Script 網址；請點「本機日曆」輸入家庭密鑰連接')}
 setInterval(()=>{if(sheetSync.active&&!document.hidden)sheetPull()},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&sheetSync.active)sheetPull()});
 window.addEventListener('online',()=>{if(sheetSync.active)sheetPull()});
}

// 先安裝所有按鈕行為，再填滿日曆，避免使用者看到不可操作的空白畫面。
try {wireEvents();render();}
catch(error) { const box=$('#bootFailure'); if(box){box.classList.remove('hidden');box.querySelector('.boot-detail').textContent=String(error?.message||error);} console.error('家日曆啟動失敗',error); }
if(!storageAvailable)toast('瀏覽器限制資料儲存：目前可試用，關閉後可能不會保留，請改用正常瀏覽器開啟。');
initSheetSync();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
