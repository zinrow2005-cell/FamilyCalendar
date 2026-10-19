/* 家日曆 V2.4 — 臺灣政府辦公日曆假日層。
 * 原始官方資料：行政院人事行政總處 https://data.gov.tw/dataset/14718
 * 年度 JSON 轉檔：https://github.com/ruyut/TaiwanCalendar
 * 假日只顯示於畫面，不存入家庭事件，不上傳 Google Sheets。
 */
(function (root) {
  'use strict';
  const CACHE_PREFIX='familycolor_tw_holidays_';
  const CACHE_AGE=7*86400000;
  const RECORDS=new Map();
  const STATES=new Map();
  const REQUESTS=new Map();
  const onChange=new Set();
  // 2026 年官方辦公日曆備用資料；初次離線也能顯示當年假日。
  // 資料逐日由人事行政總處辦公日曆表轉換，非以每年的固定日期推測。
  const OFFLINE_2026=[
   ['0101','開國紀念日'],['0215','小年夜'],['0216','農曆除夕'],
   ['0217','春節'],['0218','春節'],['0219','春節'],['0220','補假'],
   ['0227','補假'],['0228','和平紀念日'],
   ['0403','補假'],['0404','兒童節'],['0405','清明節'],['0406','補假'],
   ['0501','勞動節'],['0619','端午節'],['0925','中秋節'],
   ['0928','孔子誕辰紀念日／教師節'],['1009','補假'],['1010','國慶日'],
   ['1025','臺灣光復暨金門古寧頭大捷紀念日'],['1026','補假'],['1225','行憲紀念日']
  ];
  let show=true;
  try{show=localStorage.getItem('familycolor_show_tw_holidays')!=='0'}catch{}
  function dateKey(input){
    const text=String(input||'');
    const digits=text.replace(/-/g,'');
    return /^\d{8}$/.test(digits)?digits.slice(0,4)+'-'+digits.slice(4,6)+'-'+digits.slice(6):'';
  }
  function sanitize(input){
    if(!input||typeof input!=='object')return null;
    const date=dateKey(input.date),name=String(input.description||input.name||'').trim().slice(0,75);
    if(!date||!name)return null;
    const y=Number(date.slice(0,4)),m=Number(date.slice(5,7)),d=Number(date.slice(8,10));
    const test=new Date(y,m-1,d);
    if(test.getFullYear()!==y||test.getMonth()!==m-1||test.getDate()!==d)return null;
    const work=/補行上班|調整上班|補班/.test(name);
    const off=input.isHoliday===true||input.isHoliday==='true'||input.isHoliday===2||input.isHoliday==='2';
    if(!off&&!work)return null;
    return {date,name,kind:work?'work':/補假|調整放假/.test(name)?'substitute':'holiday'};
  }
  function buildYear(year,raw){
    const entries=new Map();
    if(Array.isArray(raw))for(const candidate of raw){const item=sanitize(candidate);if(item&&item.date.startsWith(year+'-'))entries.set(item.date,item)}
    return entries;
  }
  function fallback(year){
    if(year!==2026)return new Map();
    return buildYear(year,OFFLINE_2026.map(([d,description])=>({date:'2026'+d,description,isHoliday:true})));
  }
  function notify(year){for(const fn of onChange)try{fn(year)}catch(err){console.warn('假日顯示回呼發生錯誤',err)}}
  function cachedYear(year){
    try{const raw=JSON.parse(localStorage.getItem(CACHE_PREFIX+year)||'null');
      if(!raw||!Array.isArray(raw.items)||typeof raw.timestamp!=='number')return null;
      return {items:buildYear(year,raw.items),timestamp:raw.timestamp};
    }catch{return null;}
  }
  function initYear(year){
    if(RECORDS.has(year))return;
    const cache=cachedYear(year);
    RECORDS.set(year,cache?.items||fallback(year));
    STATES.set(year,{status:cache?'cached':year===2026?'offline':'loading',timestamp:cache?.timestamp||0});
  }
  async function fetchYear(year){
    const url=`https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar@master/data/${year}.json`;
    const ctl=typeof AbortController==='function'?new AbortController():null;
    const timeout=ctl?setTimeout(()=>ctl.abort(),9000):null;
    try{
      const response=await fetch(url,{mode:'cors',cache:'no-cache',signal:ctl?.signal});
      if(!response.ok)throw new Error('年度資料尚未取得（HTTP '+response.status+'）');
      const json=await response.json();
      if(!Array.isArray(json)||json.length<300)throw new Error('年度行事曆內容不完整');
      const items=buildYear(year,json);
      if(items.size<5)throw new Error('年度假日資料不完整');
      RECORDS.set(year,items);
      STATES.set(year,{status:'official',timestamp:Date.now()});
      try{localStorage.setItem(CACHE_PREFIX+year,JSON.stringify({timestamp:Date.now(),items:[...items.values()].map(r=>({date:r.date,description:r.name,isHoliday:r.kind!=='work'}))}))}catch{}
      notify(year);
    }catch(err){
      const state=STATES.get(year);
      STATES.set(year,{status:state?.status==='cached'?'cached':year===2026?'offline':'unavailable',timestamp:state?.timestamp||0});
      notify(year);
      console.info('臺灣國定假日資料暫不可用：',year,String(err?.message||err));
    }finally{if(timeout)clearTimeout(timeout)}
  }
  function ensureYear(year){
    year=Number(year);
    if(!Number.isInteger(year)||year<2017||year>2100)return;
    initYear(year);
    const state=STATES.get(year);
    if(REQUESTS.has(year)||(state.status==='cached'&&Date.now()-state.timestamp<CACHE_AGE))return;
    // 未公布年度：本次瀏覽期間不重複請求；換月不應連續刷 API。
    REQUESTS.set(year,fetchYear(year));
  }
  function ensureRange(start,end){
    const y1=start instanceof Date?start.getFullYear():Number(String(start).slice(0,4));
    const y2=end instanceof Date?end.getFullYear():Number(String(end).slice(0,4));
    if(!Number.isInteger(y1)||!Number.isInteger(y2))return;
    for(let y=y1;y<=Math.min(y2,y1+3);y++)ensureYear(y);
  }
  function get(date){
    if(!show)return null;
    const key=dateKey(date),y=Number(key.slice(0,4));
    if(!RECORDS.has(y))ensureYear(y);
    return RECORDS.get(y)?.get(key)||null;
  }
  function state(year){return STATES.get(Number(year))?.status||'unavailable'}
  function isVisible(){return show}
  function setVisible(value){show=!!value;try{localStorage.setItem('familycolor_show_tw_holidays',show?'1':'0')}catch{};notify(null)}
  function subscribe(fn){onChange.add(fn);return()=>onChange.delete(fn)}
  root.TaiwanHolidays={get,ensureYear,ensureRange,isVisible,setVisible,state,subscribe};
})(typeof window==='object'?window:this);
