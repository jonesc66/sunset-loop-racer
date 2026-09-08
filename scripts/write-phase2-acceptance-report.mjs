import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root=new URL('../verification/environment-phase2/',import.meta.url);
const pairs=['007','014','043','064','085'];
const tour=['0.00','0.07','0.14','0.21','0.28','0.31','0.335','0.36','0.43','0.50','0.57','0.62','0.64','0.67','0.71','0.78','0.85','0.92','0.97'];
const names=['pair-0.07','pair-0.14','pair-0.43','pair-0.64','pair-0.85','tour-latest','manual-latest','controls-latest','race-latest','persistence-latest','cycles-after-fix'];
const baseline=JSON.parse(await fs.readFile(new URL('cdp-baseline-latest.json',root),'utf8'));
const known=new Set(baseline.logs.map(x=>x.text));
const captures=[];
for(const name of names){
  const capture=JSON.parse(await fs.readFile(new URL('cdp-'+name+'.json',root),'utf8'));
  const unexpected=capture.logs.filter(x=>!known.has(x.text)||x.level!=='warning');
  assert.equal(unexpected.length,0,name+' unexpected console entries');
  assert.equal(capture.failedRequests.length,0,name+' failed requests');
  captures.push({file:'cdp-'+name+'.json',capturedAt:capture.capturedAt,errors:0,newWarnings:0,existingAudioWarnings:capture.logs.length,failedRequests:0});
}
const cycles=await fs.readFile(new URL('transcript-cycles-after-fix.txt',root),'utf8');
assert.equal((cycles.match(/DISPOSED_FOREST_BATCHES \d 12/g)||[]).length,3);
const race=await fs.readFile(new URL('phase2-race-state.txt',root),'utf8');
assert(race.includes('CP 14/14')&&race.includes('Race Complete')&&race.includes('Lyra'));
for(const file of [...pairs.flatMap(p=>['high-','gpu-','return-high-'].map(x=>x+p+'.png')),...tour.map(p=>'tour-gpu-'+p+'.png'),'phase2-race-complete.png','phase2-race-again.png','cycles-final-high.png'])await fs.access(new URL(file,root));
const consoleReport={status:'PASS — no new runtime errors, warnings or failed requests in accepted runs',baseline:{file:'cdp-baseline-latest.json',warnings:baseline.logs.length,classification:'Existing AudioContext autoplay warnings reproduced with captured pre-Phase-2 App/RaceScene/environment modules on localhost:5174'},captures,excludedDiagnostic:'cdp-cycles-before-fix.json and transcript-cycles-before-fix.txt preserve the failing instance-disposal regression; superseded by three passing cycles after fix',limitations:['Software-rendered Edge; no hardware GPU performance PASS','Sound UI and input exercised; subjective audible quality not assessed in headless browser']};
await fs.writeFile(new URL('final-console.json',root),JSON.stringify(consoleReport,null,2));
const hashes={};
for(const file of ['src/environment/GpuEnvironment.tsx','src/environment/BenchmarkEnvironment.tsx','src/qualityPresets.ts','public/assets/environment/forest-v1.glb'])hashes[file]=createHash('sha256').update(await fs.readFile(new URL('../'+file,import.meta.url))).digest('hex');
await fs.writeFile(new URL('accepted-source-hashes.json',root),JSON.stringify(hashes,null,2));
const report=`# Phase 2 — 遊戲內驗收

2026-09-08。**遊戲功能與靜態環境視覺驗收 PASS；整體發布條件仍為 BLOCKED — hardware GPU performance acceptance。**

已完成本機 Edge 遊戲內驗收，不再受原 UI 工具初始化錯誤阻擋。使用者明確允許後，以已安裝 Node.js 的 WebSocket/CDP 控制獨立 Edge 測試 profile，僅連線 localhost。按鈕與鍵盤透過瀏覽器 Input 事件操作；場景資源讀取用於等待 GLB 就緒和觀察 dispose。没有下載新工具或修改遊戲狀態來偽造過關。

## 驗收結果

| 項目 | 結果與證據 |
| --- | --- |
| High 預設、GPU 手動選擇 | PASS；每次新頁面為 High，重新載入也為 High；原本沒有畫質保存行為，本次未新增 |
| Perf / Low / Medium / High / GPU | PASS；全部按鈕已操作，Low/Medium/High 狀態見 transcript-persistence-latest.txt |
| High → GPU → High | PASS；五個相同鏡位，各有三張截圖，賽事計時繼續，切回原有樹木和材質 |
| Blender 樹木、GPU terrain shader | PASS；等待實際 gpu-forest 場景節點及有效 instances 後拍照，沒有 shader/GLB 錯誤 |
| 全圈環境 | PASS（靜態視覺）；19 個位置全部截圖並逐張看過，路面通暢，未觀察到缺材質、樹幹占用行車路面或明顯山體開口 |
| W/S | PASS；手動 W 達 115 km/h，S 後 13 km/h；見 transcript-manual-latest.txt |
| A/D | PASS；移動時實際車體 heading 1.198 → 1.549 → 1.081 rad，左右轉向相反；見 transcript-controls-latest.txt |
| Space | PASS（輸入與運行）；移動時送出 trusted Space，115 → 95 km/h；不將此速度差單獨解讀為手煞車減速度測量 |
| R | PASS；離開路面後重置回賽道，計時未重啟；manual-reset.png |
| Sound | PASS（開關 UI）；off/on 樣式正確，未新增 runtime error；未主觀驗收 headless 音色 |
| 三圈 / CP14 / AI / 結算 | PASS；既有 DEV autoRace 驅動，使用 Perf，3/3、CP 14/14，六台車均完賽；不是手動開完三圈或 GPU 效能測試 |
| Race Again | PASS；回到 1/3、CP 0/14、0:00.0，重新倒數 |
| 紀錄保存 | PASS；全程 3:58.9、最佳圈 1:11.8，localStorage 在新頁面及 reload 後相同 |
| GPU 實例資源釋放 | PASS（修正後）；連續三次 GPU → High，每次 12/12 InstancedMesh 都觸發 dispose；見 transcript-cycles-after-fix.txt |
| Console / network | PASS（無新增錯誤或警告）；接受的 11 組執行皆無 failed requests；既有音訊警告另列 final-console.json |
| 真實 GPU FPS / frame time / 順暢度 | BLOCKED；本機瀏覽器回報 Microsoft Basic Render Driver SOFTWARE |

## 視覺結果與界限

五組比較為 0.07、0.14、0.43、0.64、0.85，保留相同視角與瀏覽器 viewport。GPU 可辨識四種樹冠差異、分枝、較密森林、石塊/灌木/乾草、路面樹影及遠山層次。High 恢復原有錐形樹與地形材質。截圖時賽事仍在執行，因此 AI 位置、計時及 HUD 不會像素相同。

全圈查看位置：${tour.join(', ')}。森林密度較高的 0.67–0.92 也已檢查。美術仍為風格化分枝團塊，山體輪廓仍有低多邊形折面；不宣稱照片級寫實。靜態巡查不能證明高速時完全沒有 LOD pop，硬體上仍須確認轉換流暢度、陰影穩定度與幀時間。

## Closed-loop 修正

1. GPU 首次載入 GLB 較慢，原 Suspense 空 fallback 造成短暫無森林。改為顯示 High 的 SliceForest，並讓驗收腳本等待 GLB instances 就緒。重跑五組畫質對照成功。
2. 獨立 Edge profile 的鎖定 Cookies 被 Vite watcher 掃到而觸發 EBUSY。vite.config.ts 忽略 .edge-*-profile，.gitignore 排除測試 profile；重啟後所有接受的 runtime 測試均正常。
3. 釋放驗證重現 GPU → High 的 0/12 dispose。原因是 gpu-forest 父 group 的 dispose=null 阻擋 R3F 子節點清理；手動 geometry/material.dispose 未涵蓋 InstancedMesh 的 instanceMatrix/instanceColor buffers。最終增加明確的 effect cleanup：掛載時保存 meshes，卸載時呼叫每個 InstancedMesh.dispose，保留 cloned GLB geometry/material 清理。重新 typecheck、資產/基準測試、幾何測試、build，再實際三次切換，均 12/12 dispose。最後修正只影響卸載生命週期，先前全圈/完賽結果仍適用，相關切換流程已在最新程式重跑。

失敗證據保留為 transcript-cycles-before-fix.txt；成功為 transcript-cycles-after-fix.txt。這是 instance buffer 清理回歸測試，不是整個瀏覽器所有記憶體的無洩漏證明。

## 自動驗證（最後修正後）

- TypeScript tsc -b：PASS。
- verify-environment-phase2.mjs：PASS；實際 Three.js GLTFLoader 載入 12 meshes、有限 buffers、Y-up 公尺尺寸、normal/colour、LOD 三角形遞減、High/default/effects、凍結 gameplay 比較。
- verify-environment-geometry-phase2.mjs：PASS；路面法線、UV 接縫、路肩淨空、封閉山體，以及凍結物理/AI/checkpoints/camera/車模。
- Vite production build --emptyOutDir false：PASS；index-q_os6iV1.js 約 1,186.36 kB raw / 332.16 kB gzip。既有 >500 kB chunk advisory 保留，未批量刪除舊輸出。
- ESLint：N/A，專案未配置。Phase 1 證據保持原樣。

## High 基準與實作

High 的 sun (-88,112,-62)、direct/hemi 2.7/1.35、shadow 2048、DPR 1–1.35、fog 210–490 與原效果保持不變；GPU 透過集中 qualityPresets 選擇，採用相同 High 車輛路徑及 gameplay effects。沒有修改車輛資產、物理、AI、音訊邏輯或 HUD 行為。

GPU：DPR cap 2（DPR 1 裝置仍為 1）、anisotropy min(16,device max)、4096 shadow、較低太陽 (-100,82,-72)、direct/hemi 3.0/1.05；世界座標 3D noise 混合草/土/岩、80–270 m normal detail fade；遠山十個低細節 mesh 合併一批。沒有 AO、bloom 或額外調色。

Blender 4.5.9 LTS 已實際以 CLI 生成、GLB 重新載入、Cycles CPU 預覽。forest-v1.glb 為 1,078,440 bytes，seed 48120，四種樹 × 三 LOD、單一共享 PBR vertex-colour 材質、無貼圖。近 LOD triangles：spruce 9442 / pine 5410 / fir 11682 / mountain pine 6306；完整預算見 manifest。重建方式見 tools/blender/README.md。

森林最多 1250 放置候選，road/steep-slope rejection 後使用；12 種類/LOD instance batches，105/220/420 m 門檻與 8 m hysteresis、5 Hz 更新，只有近樹投影。地面小物 900 候選、3 batches、115 m cutoff，貼合實際地形。GPU 稠密視角的 overlay 約 1.7M–4.9M triangles（含渲染/陰影負擔），軟體環境約 1–2 FPS，不能用此作硬體效能驗收，也未為 VM 降低 GPU 品質。

## Console 分類

每個一般新頁面有 8 則相同 AudioContext autoplay warning，reload 測試共 16 則。已以 baseline.config.mjs 載入修改前快照重現同樣 8 則，來源為原 createRaceAudioEngine 在使用者手勢前初始化。未改動凍結音訊邏輯；不宣稱「零警告」。最終接受執行沒有新 exception、shader warning 或 failed request。

## 尚待硬體驗收

實體 Windows NVIDIA/AMD GPU 的 Chrome/Edge，以正式一般遊戲網址、相同五區段量測 renderer、viewport、DPR、FPS、frame-time，檢查高速 LOD 與反覆切回 High。此項仍標示 **BLOCKED — hardware GPU performance acceptance**，不把軟體渲染結果標為完整 DONE。

所有截圖、逐步 transcript、console JSON 及最終 source hashes 均在本資料夾；index.html 是可瀏覽的比較相簿。未發布或部署。
`;
await fs.writeFile(new URL('REPORT.md',root),report);
const figures=pairs.map(p=>`<section><h2>路段 ${Number(p)/100}</h2><div class="pair"><figure><figcaption>High</figcaption><a href="high-${p}.png"><img src="high-${p}.png" loading="lazy" alt="High 路段 ${p}"></a></figure><figure><figcaption>GPU</figcaption><a href="gpu-${p}.png"><img src="gpu-${p}.png" loading="lazy" alt="GPU 路段 ${p}"></a></figure></div><a href="return-high-${p}.png">查看切回 High</a></section>`).join('');
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 2 遊戲內驗收</title><style>body{margin:0;background:#142027;color:#e8efec;font:16px/1.7 system-ui}main{max-width:1500px;margin:auto;padding:28px}h1{font-size:32px}a{color:#a4ddea}img{display:block;width:100%;border-radius:8px}figure{margin:0}figcaption{padding:8px 0}section{margin:36px 0}.pair,.tour{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.status{padding:18px;background:#253e36;border-radius:8px}.limit{color:#ffd47e}p{max-width:1000px}@media(max-width:700px){.pair,.tour{grid-template-columns:1fr}main{padding:18px}}</style><main><h1>Phase 2：Blender 森林與手動 GPU</h1><p class="status">遊戲功能與靜態環境驗收通過：五組畫質對照、全圈 19 處、三圈完賽、重新開始、保存與三次資源釋放。<br><span class="limit">實體 GPU 效能仍為 BLOCKED；畫面上的 SOFTWARE FPS 不代表硬體效能。</span></p><p><a href="REPORT.md">完整驗收報告</a> · <a href="final-console.json">Console / network</a> · <a href="transcript-cycles-after-fix.txt">12/12 資源釋放紀錄</a></p><p>High 保留原基準，GPU 手動啟用 Blender 分枝樹、地面細節及遠景。配對鏡位相同，AI 與計時仍在運行。點圖片可看原尺寸。</p>${figures}<section><h2>全圈 19 處：已逐張檢查</h2><div class="tour">${tour.map(p=>`<figure><figcaption>賽道進度 ${p}</figcaption><a href="tour-gpu-${p}.png"><img src="tour-gpu-${p}.png" loading="lazy" alt="GPU 全圈巡查 ${p}"></a></figure>`).join('')}</div></section><section><h2>三圈完賽與重新開始</h2><p>以既有 DEV autoRace、Perf 執行功能回歸；不是 GPU 效能量測。</p><div class="pair"><img src="phase2-race-complete.png" alt="三圈與六車完賽排行"><img src="phase2-race-again.png" alt="重新開始倒數"></div></section><section><h2>Blender CPU 資產預覽</h2><p>資產渲染，並非遊戲畫面。四種針葉樹皆有三個 LOD。</p><img src="blender-tree-preview.png" loading="lazy" alt="四種 Blender 樹木"></section></main></html>`;
await fs.writeFile(new URL('index.html',root),html.replace('<title>','<link rel="icon" href="data:,"><title>'));
console.log('Acceptance report, gallery, console summary and source hashes written. Hardware GPU acceptance remains BLOCKED.');
