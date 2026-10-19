# V1.9.1 同步修正測試摘要

- `node --check`：前端內嵌 JS、獨立 app.js 與 Apps Script Code.gs 複製為 JS 後語法檢查均通過。
- 本機 Node VM + Google Apps Script 函式模擬：HMAC-SHA256 簽章驗證、JSONP 簽名讀取、表單 POST 簽名寫入、寫後查詢版號與資料、舊版本衝突與錯誤密鑰拒絕 — 通過。
- 原有 V1.9 回歸測試（模擬伺服器）：初次雲端載入、新增與修改、非重疊衝突合併、同筆衝突處理、本機資料保留、頭像、重複期限、大量資料分批等 11 項 — 通過。
- Chromium 模擬：1440px 電腦、820px 平板、390px 手機、360px 手機，月曆和同步表單可正常顯示且沒有 JavaScript pageerror；失敗原因能顯示於設定視窗 — 通過。
- 限制：測試用模擬 Google Apps Script 後端。尚未以使用者的實際 Apps Script `/exec`、iPhone Safari、Android Chrome 真正完成跨裝置同步測試；不能保證所有行動網路或瀏覽器環境都能正常連線。
