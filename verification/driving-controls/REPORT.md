# 駕駛輸入與追車鏡頭

狀態：AUTOMATED VERIFIED / RUNTIME PENDING（Windows 原生注音確認待完成；瀏覽器功能與鏡頭已驗證）

- 比賽期間使用唯讀、inputMode=none 的鍵盤焦點，避免文字組字进入駕駛接收區；點選畫質按鈕後恢復此焦點。車手姓名欄仍可正常輸入中文。
- 依實體按鍵代碼處理 WASD，加入可識別按鍵碼的後備處理；方向鍵抑制預設捲動，失焦和頁面可見性變化清除按鍵狀態。
- 追車鏡頭先補償車輛位移，再平滑追蹤，避免高速時累積額外後退距離。跟車距離改為 9–10.5，FOV 改為 58–64；未改變車身模型、物理或碰撞尺寸。

## 驗證

- TypeScript、Vite build、verify-environment-phase3、verify-phase4a、verify-driving-controls：PASS。Lint：N/A（未配置）。
- 鏡頭停車／高速／不同幀率、輸入法 Process 事件及實體 code、同時按鍵與釋放、失焦、方向鍵及文字輸入保護：PASS。
- 瀏覽器：中文姓名輸入、開始比賽唯讀焦點、Chromium 組字與插入文字無法改變駕駛接收區、WASD／煞車／手煞車／R、畫質切換及重載：PASS。
- 已檢視實際行駛畫面；檢查時為 53 km/h，跟車距離約 9.66。
- Console/runtime errors：0；failed requests：0。
- Headless 瀏覽器無法操作使用者 Windows 的原生注音候選視窗；這部分等待使用者於現有注音模式實測。
- 軟體渲染測試不代表實體 GPU 效能。

[新版畫面](index.html) · [瀏覽器紀錄](runtime.json) · [自動測試](unit.json)
