import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const out='verification/environment-phase3/';
const read=async file=>JSON.parse(await fs.readFile(out+file,'utf8'));
const tests=await read('automated-results.json'), player=await read('player-physics-results.json');
const runs=['cdp-final.json','cdp-manual.json','cdp-visual.json','cdp-controls.json','cdp-overviews.json'];
const runtime=await Promise.all(runs.map(read));
if([tests,player,...runtime].some(r=>r.status!=='PASS'))throw new Error('Required verification did not pass');
if(!runtime[3].resetConfirmed)throw new Error('Reset verification missing');
const logs=runtime.flatMap(r=>r.logs), requests=runtime.flatMap(r=>r.requests);
const errors=logs.filter(l=>l.level==='error'||l.type==='error'||l.type==='exception');
if(errors.length)throw new Error('Runtime errors require review');
if(requests.length)throw new Error('Failed network requests require review');
const warnings=[...new Set(logs.map(l=>l.text||l.args?.map(a=>a.value||a.description).join(' ')).filter(Boolean))];
const changed=['.gitignore','src/game/track.ts','src/game/trackZones.ts','src/RaceScene.tsx','src/environment/Phase3Environment.tsx','src/environment/BenchmarkEnvironment.tsx','src/environment/benchmarkGeometry.ts','src/environment/GpuEnvironment.tsx','tools/blender/generate_environment.py','tools/blender/PHASE3.md','scripts/verify-environment-phase3.mjs','scripts/phase3-browser-check.mjs','scripts/write-phase3-report.mjs','public/assets/environment/phase3/environment-v1.glb','public/assets/environment/phase3/manifest.json'];
const hashes={};for(const file of [...changed,'src/qualityPresets.ts','src/App.tsx','src/game/audio.ts'])hashes[file]=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
await fs.writeFile(out+'accepted-source-hashes.json',JSON.stringify(hashes,null,2));
await fs.writeFile(out+'final-console.json',JSON.stringify({errors,warnings,requests,runs},null,2));
const zones=[['A','森林起終點：保留既有森林、起跑線、PBR 道路、護欄與山景風格'],['B','開闊山谷：農田、農舍、穀倉、乾草、木圍欄與少量樹木'],['C','峽谷：Blender 岩壁、大石與切山道路'],['D','湖區：水面、岸邊岩石與湖畔道路'],['E','橋區：道路走在橋面上，下方有梁、橋墩與河道'],['F','聚落／服務區：山屋、小教堂、車庫、設備箱'],['G','鄉間：農田、分散房舍、木圍欄與稀疏樹群'],['H','河岸工業區：倉庫、維修建物、儲槽、電線桿與設備'],['I','必經隧道：入口、連續牆頂、肋架、步道、燈具與出口'],['J','高山區：帶雪色岩頂的大型岩體、巨石、稀疏植被，直接回到 A']];
const fmt=x=>Number(x).toFixed(2);
const summary=`# Phase 3 驗證報告

**狀態：BLOCKED — High 流暢度／實體 GPU 效能驗收尚未完成。**

遊戲本體已實作閉環擴充、十個環境區域及可重建 Blender 資產。相關自動檢查、實際瀏覽器三圈比賽、玩家鍵盤事件跑圈、Race Again、畫質切換與視覺重驗已完成。這不代表實體 GPU 效能已達標。未 push、未部署、未更動車輛資產或音效系統。

## 賽道與拓撲

| 項目 | 結果 |
|---|---:|
| 原賽道長度 | ${fmt(tests.oldLength)} m |
| 新賽道長度 | ${fmt(tests.newLength)} m |
| 延長比例 | ${fmt(tests.expansionPercent)}% |
| 採樣數 | 600（原 360） |
| Checkpoints | 20（原 14） |
| 最高路面 | 18 m |
| 最大採樣坡度 | ${fmt(tests.maxGrade*100)}% |
| 非相鄰中心線最小測試間距 | ${fmt(tests.minClearance)} m |

長度以閉合路徑採樣點的三維公尺距離總和計算。保留起跑控制點，向遠離起點的部分逐步擴展現有路線；原有掃彎、較快區段與較緊的回程彎保持在同一條道路上。高度採平滑過渡，沒有重寫車輛物理。

唯一拓撲是 **A → B → C → D → E → F → G → H → I → J → A**。沒有分支、shortcut 或隧道外側替代道路。道路、AI、檢查點、進度、重置與視點共用 track 資料。每區兩個均勻檢查點；I 內含中段檢查點。

![Track overview](track-overview.svg)

## A–J 與 Blender 來源

| Zone | 內容 |
|---|---|
${zones.map(([id,description])=>`| ${id} | ${description} |`).join('\n')}

Blender 4.5.9 LTS background CLI 實際執行：

\`\`\`powershell
& '.\\.tools\\blender-4.5.9-windows-x64\\blender.exe' --background --factory-startup --python tools/blender/generate_environment.py
\`\`\`

Seed **9031**。16 類資產、48 個 LOD mesh，共用 opaque vertex-colour 材質；GLB ${tests.glbBytes.toLocaleString()} bytes，不下載外部素材。尺寸、LOD、seed、版本、命令與三角形預算記錄於腳本／manifest。資產包含 cliff、rock、alpine、chalet、barn、church、warehouse、garage、tank、fence、hay、pole、bridge、tunnel、portal、utility。

來源比例按資產來源理解：新環境的主要建物／結構／岩體來自 Blender；runtime 負責水、地形、農田、放置、光線與材質細節。這不是以程式行數或畫面像素宣稱精確 60%。

## 橋與隧道

橋區間 **0.407–0.483**，約 116 m。Blender 10 m 模組的橋面在 road spline 下方，兩側有結構與梁，橋墩向下延伸；橋段不生成一般路堤，露出河道。道路仍由 track system 控制。

隧道區間 **0.807–0.887**，約 122 m。6 m 模組沿相同 spline 排列，依坡度傾斜並重疊封住接縫。淨寬 38 m、頂高約 10 m；既有側向護欄限制讓車輛留在通道內。入口／出口 portal、牆、頂、肋架、步道、燈具均為 Blender 產物。三盞有限範圍、無即時陰影的 point light 搭配 emissive 燈具與平滑環境光明暗過渡。

村落與工業建物轉向道路，基座向下延伸以貼合坡面；岩壁有低成本表面變化。GPU 增加次要石塊與近距離陰影。未建立第二套路徑。

## 品質與效能

High 仍是預設；qualityPresets.ts 與 App 的選擇邏輯保持原樣。GPU 僅手動選擇。五種畫質都有完整橋、湖、聚落、鄉間、工業、隧道與高山內容。

| 差異 | 標準畫質含 High | GPU |
|---|---|---|
| Phase 3 culling | 300 m | 440 m |
| Phase 3 LOD 距離 | 80 / 170 m | 130 / 260 m |
| 次要岩石／地物 | 較少 | 增加 |
| Phase 3 近資產陰影 | 無新增 casting | 近 LOD casting |
| 原森林、地面、shadow 品質 | 原設定 | 原 GPU 增強設定 |

依 asset family / LOD 使用 InstancedMesh，定期距離剔除，明確釋放 instance buffers 與自有 geometry/material。沒有無限制燈光、透明卡片或大型貼圖。

驗證 renderer 為 **Microsoft Basic Render Driver / SOFTWARE**。觀察到 High 約 2–5 FPS、Perf 約 5–7 FPS，GPU 更慢；不能由此宣稱實體 GPU FPS、frame time、usage 通過，也尚不能證明原 VM 的 High 流暢 baseline 被保留。仍需在實體 Windows GPU 與公開網站實測；本次沒有部署。

## 自動驗證

- TypeScript / production build：PASS，最後使用 npm run build -- --emptyOutDir false，保留既有輸出。既有 >500 kB chunk advisory 持續存在。
- Lint：N/A，專案未配置。
- Phase 3 tests：PASS，見 automated-results.json。
- 道路有限數值、法線、閉合縫、非相鄰路段間距、坡度：PASS。
- 1,200 採樣點 × 三個車道的環境車身淨空與地形覆路射線：PASS。
- 隧道頂與左右牆連續性射線：PASS。
- Checkpoint coverage、跳過前段不能完成圈數、重置：PASS。
- 原 createCar 至 HUD 的核心函式與 Phase 2 相同：PASS。
- 六台 AI 使用實際原函式，完成三圈且都經過十區：PASS。
- 實際 updatePlayer、布林輸入測試：三圈 PASS；碰撞 ${player.collisionCount}，最大側向偏移 ${fmt(player.maxLateral)} m，見 player-physics-results.json。這是無 renderer 的測試，不冒充 browser 證據。

舊 Phase 2 測試中要求 track 檔案完全不變的斷言不適用於此明確授權的賽道擴充；未改寫舊證據，新增本階段測試保留核心 gameplay equality。

## 實際 runtime 閉環

- Start Race、High 預設載入：PASS。
- 全區 High + 七組 GPU 視點、完整 GLB instances：PASS，cdp-visual.json 與截圖。
- High → GPU → High 反覆切換，以及 Low / Medium / Perf：PASS。
- 最終拓撲／坡度下，六台車自然跑完三圈並出現 Race Complete：PASS，cdp-final.json / final-race-complete.png。
- Race Again 回到 countdown、LAP 1、CP 0：PASS，final-race-again.png。
- 真正 CDP 鍵盤事件操控玩家，經檢查點完成一個有效圈：PASS，cdp-manual.json / manual-full-lap.png。以外部輸入控制器提供按鍵，沒有改寫車輛位置或進度；不是人類手動試駕。
- 油門、轉向、煞車、手煞車、R 重置：已實際操作並保存狀態／截圖；cdp-controls.json 確認 R 後速度為 0。
- 湖岸與橋墩 High / GPU 總覽：PASS，cdp-overviews.json 與 D-overview / E-overview 截圖。
- 坡面車身視覺對齊：PASS，cdp-visual.json 中實際 renderer 車身俯仰與道路坡度誤差小於 0.03 rad；final-grade-driving.png。
- localStorage reload 持久性：PASS。
- 最後岩壁表面／植被落地修正後，重新執行 automated checks、build、受影響畫面與畫質切換；沒有更動比賽或物理邏輯。

Race results 與完整逐步輸出在 cdp-final.json / transcript-final.txt。軟體渲染下 frameDelta 被原邏輯 capped，wall-clock 成績會被拉長，不能拿來比較實際性能或無 renderer 模擬成績。

## Console / network

五份接受執行共 **${errors.length} error / exception**；Network.loadingFailed 記錄 **${requests.length}**。原音訊初始化有 AudioContext autoplay warning，已在 Phase 2 baseline 重現，未修改凍結音訊。完整分類見 final-console.json；原始記錄在各 cdp JSON。

${warnings.map(w=>`- ${w}`).join('\n')}

## 修正循環與保留證據

1. 首版回程最大坡度約 41%，修緩到 ${fmt(tests.maxGrade*100)}%，重新通過幾何／AI／玩家物理與 browser 跑圈。
2. 立體道路同步路肩、標線與車輛高度；使用相鄰邊投影平滑高度接觸。
3. 隧道模組增加重疊與坡度傾斜，射線重驗沒有牆頂缺口。
4. 展開道路後移動衝突山體與 GPU 遠山；地形與車道淨空重新驗證。
5. 修正建物朝向／基座、岩壁過強条紋與植被坡面落地，重拍相關視點。
6. 內嵌瀏覽器逾時後，經使用者同意改用本機 Edge/CDP。第一輪測試按鈕在視窗外，修正測試捲動／尺寸後成功；失敗證據保留在 cdp-first-click-failure.json。
7. 降低湖側路堤並移除水面植被放置，補拍湖岸與橋墩總覽；車身在原有 body response 外增加坡面視覺對齊，保持原水平物理。
8. 補拍時發現第一張湖區截圖早於資產載入完成，測試加入環境 ready 等待後重新拍攝，人工檢視 High / GPU 的湖面與橋墩均可見。

## 重現與未來關卡

\`\`\`powershell
node scripts/verify-environment-phase3.mjs
npm run build -- --emptyOutDir false
npm run dev -- --host 127.0.0.1
\`\`\`

本機網址： http://127.0.0.1:5173/sunset-loop-racer/?environmentInspect#A 。選車 Start Race 後，hash A–J、I-entrance / I-interior / I-exit 提供視點；原 numeric progress hash 仍可用。autoRace 是原有 DEV 模式，正式 build 關閉。CDP 腳本需經使用者同意後，使用本機專用 profile / port 9225。

trackZones.ts 的 ordered segment records 保留 previous / next / progress boundaries，可供未来 A–C、C–F 等 point-to-point stage 切片；本次未新增 stage UI。

## 修改檔案

${changed.map(f=>`- ${f}`).join('\n')}

驗證產物全在 verification/environment-phase3/，index.html 是截圖相簿，accepted-source-hashes.json 記錄接受來源 SHA-256。Blender 重建規格在 tools/blender/PHASE3.md。

## 已知限制與最後狀態

- **BLOCKED — hardware GPU performance acceptance**；High 流暢性尚待合適 renderer 與實機測試。
- 車輛維持原水平物理，加上垂直接觸同步及車身坡面視覺對齊；坡度不引入新的重力／抓地模型，保留原加減速俯仰與側傾反應。
- 個人排行榜儲存未更動，可能含舊賽道成績，不能與擴充賽道直接比較；沒有刪除成績。
- 環境為可重建的模組化美術，水採近似反射，建物輪廓簡化；仍可進一步美術精修。
- 沒有發布 GitHub 網站；需在部署後取得實體 GPU 的效能證據，才能完成整體驗收。

**最終狀態：BLOCKED（剩餘效能驗收），不宣稱整體 DONE。**
`;
await fs.writeFile(out+'REPORT.md',summary.replaceAll('\\`','`'));
const images=(await fs.readdir(out)).filter(f=>/^(?:[A-J](?:-entrance|-interior|-exit|-overview)?-(?:high|gpu)|final-race-complete|final-race-again|final-grade-driving|manual-full-lap|manual-reset)\.png$/.test(f));
await fs.writeFile(out+'index.html',`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 3 verification</title><style>body{margin:0;padding:32px;background:#142329;color:#eaf2ef;font:16px system-ui}h1{margin:0 0 8px}p{color:#c4d3ce}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:24px}figure{margin:0;background:#22373c;padding:12px;border-radius:12px}img{width:100%;height:auto}figcaption{padding:12px 0}a{color:#8bdbc3}</style><h1>Phase 3 — Closed loop / Blender world</h1><p>1,524.73 m · +66.06% · 20 checkpoints · A–J · Hardware GPU acceptance blocked</p><p><a href="REPORT.md">完整驗證報告</a></p><main>${images.map(f=>`<figure><a href="${f}"><img src="${f}" loading="lazy" alt="${f}"></a><figcaption>${f}</figcaption></figure>`).join('')}</main></html>`);
console.log('Wrote report, gallery, source hashes; runtime errors:',errors.length,'failed requests:',requests.length);
