# 家日曆 V1.9 — Google Sheets / Apps Script 測試記錄

測試環境：Chromium Headless（本地模擬，未連線到真實 Google 帳戶）。

## 前端功能
- 電腦 1440px、平板 820px、手機 390px、小手機 360px：月份日期格正常顯示，上方「本機日曆」按鈕可開啟 Apps Script 設定表單；共四種尺寸檢查。
- V1.6 原有行程回歸測試共 **84 項通過**：新增每週有限期間、每月重複、只修改一次、拆分後續系列、單次／未來取消、備份中的例外日期、重複事項管理與所有畫面無 JavaScript 錯誤。
- 模擬遠端服務的同步邏輯共 **11 項通過**：下載雲端資料、單筆新增、非重疊同時修改自動合併、相同 ID 的修改衝突阻止覆蓋、本機未同步資料保留、手動取用雲端、家庭照片、重複有效期間、大量 520 筆分批上傳及停止共用後保留本機。

## Apps Script 後端模擬測試
- 在 Node.js 建立模擬 Google Sheets、Script Properties、LockService，測試首次建立密鑰（SHA-256 雜湊保存）、密鑰錯誤拒絕、家庭成員照片、重複有效期間資料列、新增／刪除事項、版本衝突拒絕及密鑰輪替。
- 程式語法檢查通過，密鑰初始化及輪替改成 `setupFamily_()` / `rotateFamilyKey_()` **私有函式**，透過試算表 UI 選單執行；Web App 的公開伺服器函式僅提供經過密鑰檢查的讀取／寫入。

## 尚未驗證（不可視為已通過）
- 真實 Google Sheet / Apps Script 首次授權及部署、跨站 iframe / google.script.run 橋接（需使用者的 /exec 部署與密鑰）。
- 真正兩個人同時編輯、Google Apps Script 執行配額、iPhone/iPad Safari 實機，以及網路品質不佳時的實際錯誤率。

**部署前務必先備份 V1.6 的 JSON，尤其之前資料只存在 Firebase 時。**
