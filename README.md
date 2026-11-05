# 下一代花蓮地方實踐指南｜線上提問平台

2026 花蓮縣文化局社造論壇（11/07 六）現場提問收集與抽籤系統。

| 分頁 | 檔案 | 用途 |
|---|---|---|
| 參與者提問 | `index.html` | 現場掃 QR Code 進入，選場次 → 指定講師 → 填暱稱與問題 |
| 前台大螢幕 | `screen.html` | 只顯示被抽中的那一題；沒有抽籤時顯示活動名稱、日期與提問 QR Code |
| 後台管理 | `admin.html` | 一組密碼登入；抽籤、設為不參加抽籤、刪除、開關提問、匯出 Word、下載 QR Code |

GitHub Pages 開啟後的網址：

- 提問頁：`https://afroisgood.github.io/HCCForum2026/`
- 大螢幕：`https://afroisgood.github.io/HCCForum2026/screen.html`
- 後台：`https://afroisgood.github.io/HCCForum2026/admin.html`

## 功能規格

- **場次與講師**
  - 跨域對話與交流：楊政賢、陳運成、文化局
  - 花蓮實踐指南問與答：黃紋綺、沙力浪、陳柏均 Sra
- **提問**：全天開放；暱稱必填（20 字內）、問題必填（200 字內）、需勾選個資告知
- **防洗版**：同一支手機 30 秒內只能送出一次；同一支手機不能重複送出同一題；不能空白
  （前端擋一次，Firebase 安全規則再擋一次）
- **隱私**：參與者送出後看不到任何問題；只有後台看得到全部，大螢幕只看得到被抽中的那一題
- **抽籤**：後台選場次（可再指定講師）→ 從「籤筒中」的問題隨機抽一題 → 大螢幕播放抽籤動畫後顯示
  - 被抽過的問題不會再被抽到；可「放回籤筒」
  - 設為「不參加抽籤」的問題不會被抽到，可再「恢復抽籤」
- **匯出 Word**：依場次 → 講師分組，含現場抽中順序、暱稱、提問時間、狀態

## Firebase 設定步驟（第一次使用前做一次）

1. 到 <https://console.firebase.google.com> →「新增專案」（Google Analytics 可關閉）。
2. 左側「建構 → Firestore Database」→「建立資料庫」→ 位置選 `asia-east1 (台灣)` → 選「正式版模式」。
3. Firestore →「規則」分頁 → 把本專案 `firestore.rules` 的**全部內容**貼上取代 →「發布」。
4. 左側「建構 → Authentication」→「開始使用」→「登入方式」→ 啟用「電子郵件/密碼」。
5. Authentication →「使用者」→「新增使用者」：
   - 電子郵件：`hccforum2026-admin@example.com`（固定，只是帳號名稱，不會寄信）
   - 密碼：自訂（至少 6 碼）← **這就是後台登入密碼**
6. Authentication →「設定」→「已授權網域」→ 新增 `afroisgood.github.io`。
7. 專案總覽旁的齒輪 →「專案設定」→「一般」→ 最下方「你的應用程式」點 `</>`（網頁）→ 取個名稱註冊 → 複製畫面上的 `firebaseConfig`，把六個值填進 `assets/js/firebase-config.js`。

> `firebase-config.js` 裡的 apiKey 等值本來就會公開在網頁上，不是密碼；資料安全由第 3 步的規則控管。
> 若想換後台帳號信箱，`assets/js/firebase-config.js` 的 `ADMIN_EMAIL` 與 `firestore.rules` 裡的信箱要一起改，並重新發布規則。

## 開啟 GitHub Pages

1. 確認程式已合併到要發布的分支（例如 `main`）。
2. GitHub repo →「Settings → Pages」→ Source 選「Deploy from a branch」→ Branch 選 `main`、資料夾 `/ (root)` → Save。
3. 約 1～2 分鐘後即可用上方網址開啟。

## 活動當天流程建議

1. **活動前**：用自己的手機提問幾題測試 → 後台抽籤看大螢幕是否正常 → 按「清空所有提問（測試後使用）」清掉測試資料。
2. 後台按「下載 QR Code」印出或放進簡報；大螢幕待機時也會直接顯示 QR Code。
3. 投影電腦開啟 `screen.html`，移動滑鼠時右下角會出現「全螢幕」按鈕。
4. 工作人員用另一台電腦或手機開 `admin.html` 操作抽籤。
5. **11:20 跨域對話與交流**：後台切到該場次 → 按「抽出一題」。
6. **14:30 花蓮實踐指南問與答**：後台切到該場次 → 按「抽出一題」。
7. 活動結束：後台「關閉提問」→「匯出 Word」。

## 本機測試（開發用）

需要 Node.js 與 Java。

```bash
npx firebase-tools emulators:start --only firestore,auth --project demo-hccforum2026
```

```bash
python3 -m http.server 5173
```

在 Auth 模擬器建立管理者帳號：

```bash
curl -X POST -H 'content-type: application/json' "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key" -d '{"email":"hccforum2026-admin@example.com","password":"test1234"}'
```

瀏覽 `http://127.0.0.1:5173/index.html?emulator=1`（加 `?emulator=0` 可切回正式 Firebase）。

## 檔案結構

```
index.html / screen.html / admin.html
assets/css/style.css          版面與配色（取自海報）
assets/img/                   海報裁切圖
assets/js/firebase-config.js  ★ Firebase 設定
assets/js/common.js           場次、講師、共用函式
assets/js/ask.js / screen.js / admin.js
assets/js/docx.js             Word 匯出
assets/vendor/                Firebase SDK（已打包）、qrcode-generator（MIT）
firestore.rules               ★ Firestore 安全規則
```
