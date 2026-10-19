/**
 * 家日曆 V1.9 — Google Sheets + Apps Script 橋接後端
 * 這個專案必須由你的 Google 試算表 > 擴充功能 > Apps Script 建立。
 * 請儲存程式後回到 Google 試算表重新整理，使用「家日曆設定」選單初始化（非公開函式）。
 * 不需要也不可把 Google 試算表設成「知道連結的任何人可編輯」。
 */
const FAM_ = {
  meta:'設定', members:'家庭成員', events:'日曆事項', templates:'常用事項',
  schema:'family-calendar-sheets-v1'
};

function onOpen() {
 // 只有在試算表 UI 中出現的選單。真正的管理函式以下劃線結尾，無法由 google.script.run 遠端呼叫。
 SpreadsheetApp.getUi().createMenu('家日曆設定')
   .addItem('首次初始化／檢查工作表','setupFamily_')
   .addItem('更換家庭共用密鑰','rotateFamilyKey_')
   .addToUi();
}
function setupFamily_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error('請從 Google 試算表的「擴充功能 → Apps Script」建立這份指令碼。');
  const props=PropertiesService.getScriptProperties();
  props.setProperty('FAMILY_SHEET_ID',ss.getId());
  ensureFamilySheets_(ss);
  // 初始化四位預設成員，避免第一次只更新一個人的照片時，其他成員在別台裝置消失。
  const familyMembers=ss.getSheetByName(FAM_.members);
  if(familyMembers.getLastRow()===1){
    const defaults=[
      {id:'dad',name:'爸爸',emoji:'👨',color:'#637cf3',photo:''},
      {id:'mom',name:'媽媽',emoji:'👩',color:'#ed7fa2',photo:''},
      {id:'daughter',name:'女兒',emoji:'👧',color:'#c18aea',photo:''},
      {id:'son',name:'兒子',emoji:'👦',color:'#2caf9e',photo:''}
    ];
    familyMembers.getRange(2,1,defaults.length,2).setValues(defaults.map(m=>[m.id,JSON.stringify(m)]));
  }
  const hasKey=!!props.getProperty('FAMILY_KEY_SHA256');
  if(hasKey){SpreadsheetApp.getUi().alert('工作表已準備完成。先前建立的密鑰不會再次顯示；若忘記，請使用家日曆設定 → 更換家庭共用密鑰。');return;}
  const secret=generateFamilyKey_();
  props.setProperty('FAMILY_KEY_SHA256',digestFamilyKey_(secret));
  SpreadsheetApp.getUi().alert('首次建立成功！請複製並安全保存以下家庭共用密鑰（不會再次顯示）：\n\n'+secret+'\n\n請再部署 Apps Script 網頁應用程式。');
  Logger.log('====== 家日曆首次設定 ======');
  Logger.log('共用密鑰（僅本次顯示，請安全保存）: '+secret);
  Logger.log('試算表: '+ss.getUrl());
  Logger.log('請部署 → 新增部署作業 → 網頁應用程式；執行身分=我，存取權=任何人。');
}

/** 如果密鑰遺失或外洩，可執行此函式；舊裝置必須重新輸入新密鑰。 */
function rotateFamilyKey_() {
  if(!PropertiesService.getScriptProperties().getProperty('FAMILY_SHEET_ID'))throw new Error('請先透過「家日曆設定」選單執行首次初始化');
  const secret=generateFamilyKey_();
  PropertiesService.getScriptProperties().setProperty('FAMILY_KEY_SHA256',digestFamilyKey_(secret));
  SpreadsheetApp.getUi().alert('已更換家庭共用密鑰，原本所有裝置需重新設定：\n\n'+secret);
  Logger.log('新的家人共用密鑰（舊密鑰已停用）: '+secret);
}
function generateFamilyKey_(){return [Utilities.getUuid(),Utilities.getUuid()].join('').replace(/-/g,'');}
function digestFamilyKey_(key){
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(key),Utilities.Charset.UTF_8)
    .map(n=>('0'+(n&255).toString(16)).slice(-2)).join('');
}
function authorizeFamily_(key){
  const hash=PropertiesService.getScriptProperties().getProperty('FAMILY_KEY_SHA256');
  if(!hash||typeof key!=='string'||key.length<32||key.length>256||digestFamilyKey_(key)!==hash)
    throw new Error('共用密鑰不正確，或尚未執行 setupFamily');
}
function familySheet_(){
 const id=PropertiesService.getScriptProperties().getProperty('FAMILY_SHEET_ID');
 if(!id)throw new Error('尚未設定試算表；請先透過「家日曆設定」選單執行首次初始化');
 return SpreadsheetApp.openById(id);
}
function ensureFamilySheets_(ss){
 for(const name of [FAM_.meta,FAM_.members,FAM_.events,FAM_.templates]){
   let s=ss.getSheetByName(name);if(!s)s=ss.insertSheet(name);
   if(s.getLastRow()===0){s.appendRow(name===FAM_.meta?['欄位','內容']:['ID','JSON資料']);s.setFrozenRows(1)}
 }
 const meta=ss.getSheetByName(FAM_.meta);
 const existing=meta.getLastRow()>1?meta.getRange(2,1,meta.getLastRow()-1,2).getValues():[];
 if(!existing.some(r=>r[0]==='version'))meta.appendRow(['version','0']);
 if(!existing.some(r=>r[0]==='familyName'))meta.appendRow(['familyName','我們的家']);
 if(!existing.some(r=>r[0]==='updatedAt'))meta.appendRow(['updatedAt',new Date().toISOString()]);
}
function metaValues_(ss){
 const tab=ss.getSheetByName(FAM_.meta),last=tab.getLastRow();const data=last>1?tab.getRange(2,1,last-1,2).getValues():[];
 const res={};for(const r of data)res[String(r[0])]=String(r[1]);return res;
}
function writeMeta_(ss, key,value){
 const tab=ss.getSheetByName(FAM_.meta),last=tab.getLastRow();
 if(last>1){const keys=tab.getRange(2,1,last-1,1).getValues();const i=keys.findIndex(r=>r[0]===key);if(i>=0){tab.getRange(i+2,2).setValue(String(value));return;}}
 tab.appendRow([key,String(value)]);
}
function readRecords_(sheet){
 if(!sheet||sheet.getLastRow()<2)return [];
 const rows=sheet.getRange(2,1,sheet.getLastRow()-1,2).getValues(), out=[];
 for(const [id,txt] of rows){if(!id||!txt)continue;try{const o=JSON.parse(txt);if(o&&String(o.id)===String(id))out.push(o);}catch(err){throw new Error('工作表 '+sheet.getName()+' 有無法解析的 JSON，請檢查 ID：'+id)}}
 return out;
}
function safeId_(x){return typeof x==='string'&&/^[a-zA-Z0-9_-]{1,96}$/.test(x);}
function validateRecord_(value,kind){
 if(!value||typeof value!=='object'||Array.isArray(value)||!safeId_(value.id))throw new Error('資料 ID 不合法');
 const text=JSON.stringify(value);
 if(text.length>44000)throw new Error('單筆資料超過 Google Sheets 的安全容量；請縮小成員照片');
 if(kind==='events'&&(!/^\d{4}-\d\d-\d\d$/.test(value.date||'')||typeof value.title!=='string'))throw new Error('事項格式不正確');
 if(kind==='members'&&typeof value.name!=='string')throw new Error('家庭成員格式不正確');
 if(kind==='templates'&&typeof value.memberId!=='string')throw new Error('常用事項格式不正確');
 return text;
}
function updateRecords_(tab, changes,kind){
 if(!changes)return;
 const puts=Array.isArray(changes.upserts)?changes.upserts:[];
 const drops=Array.isArray(changes.deletes)?changes.deletes:[];
 if(puts.length>1000||drops.length>1000)throw new Error('單次修改不得超過 1000 筆');
 const existing=tab.getLastRow()>1?tab.getRange(2,1,tab.getLastRow()-1,2).getValues():[];
 const dict=new Map();for(const r of existing){if(r[0])dict.set(String(r[0]),String(r[1]||''));}
 for(const id of drops){if(!safeId_(id))throw new Error('刪除 ID 不合法');dict.delete(id)}
 for(const obj of puts)dict.set(obj.id,validateRecord_(obj,kind));
 const rows=[...dict].map(([id,txt])=>[id,txt]);
 if(rows.length>12000)throw new Error('事項數量過多，請先清理歷史資料');
 const current=tab.getLastRow()-1;
 if(rows.length>current)tab.insertRowsAfter(Math.max(tab.getLastRow(),1),rows.length-current);
 if(rows.length)tab.getRange(2,1,rows.length,2).setValues(rows);
 if(current>rows.length)tab.getRange(rows.length+2,1,current-rows.length,2).clearContent();
}
function fullSnapshot_(){
 const ss=familySheet_();ensureFamilySheets_(ss);const meta=metaValues_(ss);
 return {ok:true,schema:FAM_.schema,version:Number(meta.version)||0,updatedAt:meta.updatedAt||'',data:{
  familyName:meta.familyName||'我們的家',members:readRecords_(ss.getSheetByName(FAM_.members)),
  events:readRecords_(ss.getSheetByName(FAM_.events)),
  quickTemplates:readRecords_(ss.getSheetByName(FAM_.templates))}};
}
/** 僅供 Apps Script HTMLService 橋接頁透過 google.script.run 呼叫。 */
function apiRead(secret){
 authorizeFamily_(secret);const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{return fullSnapshot_()}finally{lock.releaseLock()}
}
function apiWrite(secret,baseVersion,patch){
 authorizeFamily_(secret);
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('提交資料不正確');
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  const ss=familySheet_();ensureFamilySheets_(ss);
  const meta=metaValues_(ss),version=Number(meta.version)||0;
  if(version!==Number(baseVersion))return {ok:false,conflict:true,version};
  // 驗證所有輸入，避免部分寫入後才發現不合法。
  for(const k of ['events','members','templates']){
    const set=patch[k];if(!set)continue;
    for(const obj of (set.upserts||[]))validateRecord_(obj,k);
    for(const id of (set.deletes||[]))if(!safeId_(id))throw new Error('刪除 ID 不合法');
  }
  updateRecords_(ss.getSheetByName(FAM_.members),patch.members,'members');
  updateRecords_(ss.getSheetByName(FAM_.events),patch.events,'events');
  updateRecords_(ss.getSheetByName(FAM_.templates),patch.templates,'templates');
  if(Object.prototype.hasOwnProperty.call(patch,'familyName'))writeMeta_(ss,'familyName',String(patch.familyName||'我們的家').slice(0,40));
  const next=version+1;writeMeta_(ss,'version',next);writeMeta_(ss,'updatedAt',new Date().toISOString());
  SpreadsheetApp.flush();return {ok:true,version:next};
 }finally{lock.releaseLock()}
}

/** 僅提供內嵌的 HtmlService 頁面。避免直接暴露 JSONP 家庭行程。 */
function doGet(e){
 const origin=String(e&&e.parameter&&e.parameter.origin||'');
 const nonce=String(e&&e.parameter&&e.parameter.nonce||'');
 if(!/^https:\/\/[a-z0-9.-]+(?::\d{2,5})?$/.test(origin)&&!/^http:\/\/localhost(?::\d{2,5})?$/.test(origin))
  return HtmlService.createHtmlOutput('請從家日曆的 HTTPS 網址連線。');
 if(!/^[a-zA-Z0-9_-]{20,90}$/.test(nonce))return HtmlService.createHtmlOutput('連線識別碼不正確');
 const page=HtmlService.createTemplateFromFile('Bridge');page.origin=origin;page.nonce=nonce;
 return page.evaluate().setTitle('家日曆 Sheet Sync Bridge').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
