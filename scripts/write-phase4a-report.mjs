import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const out='verification/environment-phase4a/';
const read=async f=>JSON.parse(await fs.readFile(out+f,'utf8'));
const tests=await read('automated-results.json');
const build=await read('build-result.json');if(build.status!=='PASS'||!build.devInspectionExcluded)throw Error('Build verification missing');
const manifest=JSON.parse(await fs.readFile('public/assets/environment/phase4a/manifest.json','utf8'));
const runs={};for(const name of ['before','after','resources','controls','regression','closeups'])runs[name]=await read(`cdp-${name}.json`);
for(const [name,r] of Object.entries(runs))if(r.status!=='PASS')throw Error(`${name} not PASS`);
const accepted=['after','resources','controls','regression','closeups'];
const logs=accepted.flatMap(n=>runs[n].logs),requests=accepted.flatMap(n=>runs[n].requests);
const errors=logs.filter(l=>l.level==='error'||l.type==='error'||l.type==='exception');
if(errors.length||requests.length)throw Error('Runtime acceptance has errors');
await fs.writeFile(out+'final-console.json',JSON.stringify({runs:accepted,errors,requests,warnings:logs},null,2));
const modified=['tools/blender/generate_environment.py','src/RaceScene.tsx','vite.config.ts','src/environment/Phase3Environment.tsx','src/environment/Phase4AEnvironment.tsx','src/environment/phase4aMaterials.ts','src/environment/phase4aInspection.ts','src/environment/BenchmarkEnvironment.tsx','tools/blender/phase4a/build.py','tools/blender/phase4a/README.md','scripts/phase4a-browser-check.mjs','scripts/verify-phase4a.mjs','scripts/write-phase4a-report.mjs'];
const assetFiles=['environment.glb','manifest.json',...(await fs.readdir('public/assets/environment/phase4a/textures')).map(n=>'textures/'+n)].map(n=>'public/assets/environment/phase4a/'+n);
assetFiles.push('public/assets/environment/phase3/environment-v1.glb','public/assets/environment/phase3/manifest.json');
const hashes={};for(const f of [...modified,...assetFiles])hashes[f]=crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex');
await fs.writeFile(out+'accepted-source-hashes.json',JSON.stringify(hashes,null,2));
const views=[['0.205','C 岩壁入口'],['0.25','C 岩壁中段'],['0.303','D 湖區接近'],['0.355','D 湖岸道路'],['0.401','E 橋頭'],['E-overview','E 橋側／橋墩'],['0.486','E 橋梁出口']];
const rows=manifest.meshes.filter(m=>m.lod===0).map(m=>{
 const name=m.name.replace('_lod0',''),lods=[0,1,2].map(l=>manifest.meshes.find(v=>v.name===name+'_lod'+l));
 return `| ${name} | ${m.material} | ${lods.map(v=>v.triangles).join(' | ')} |`;
}).join('\n');
const stats=['high','gpu'].map(p=>{
 const s=runs.after.views.filter(v=>v.preset===p).map(v=>v.scene.stats);
 return `| ${p} | ${Math.min(...s.map(x=>x.calls))}–${Math.max(...s.map(x=>x.calls))} | ${Math.min(...s.map(x=>x.triangles)).toLocaleString()}–${Math.max(...s.map(x=>x.triangles)).toLocaleString()} |`;
}).join('\n');
const report=`# Phase 4A — C / D / E 美術樣板

**整體狀態：IN PROGRESS — 美術品質尚未達標；實體 GPU / High 效能驗收 BLOCKED。**

本次變更已進入實際瀏覽器遊戲，沒有製作離線 Blender 宣傳渲染。固定 7 個視點、High / GPU 各有 Before / After，共 28 張比較圖。美術評估應直接查看 index.html；通過測試或增加面數本身不代表畫質完成。

## 範圍與凍結

原範圍為 C 峽谷、D 湖岸、E 橋梁；本輪依使用者追加要求，亦改善 chalet / barn / church 房屋共用資產與建築表面。道路仍為 1,524.73 m、20 checkpoints、6 台車、3 圈，拓撲與路線不變。track.ts、trackZones.ts、App.tsx、audio.ts、qualityPresets.ts 經 SHA-256 與修改前完全相同。RaceScene 只增加 Phase4AEnvironment 的 import / mount 與 DEV 固定近照鏡頭呼叫，其他內容逐字比對相同。固定鏡頭僅在 environmentInspect 開發模式啟用，不修改車輛或計時。未改車輛模型、物理、AI、HUD、圈數規則、排行榜。房屋分布、位置與 gameplay 保持不變。

## Blender pipeline / 資產

本機 Blender ${manifest.blender}，seed ${manifest.seed}。腳本 tools/blender/phase4a/build.py 執行 modeling → metric UV → PBR authoring → LOD → GLB export。原生 .blend 保存在此驗證資料夾，未放入網站 public。

- GLB：public/assets/environment/phase4a/environment.glb（${tests.glbBytes.toLocaleString()} bytes）。
- 10 個資產家族、30 個 LOD mesh；每家族 3 個 LOD。
- 岩體採格網雕塑的侵蝕面、側向斷裂、岩層突出與不規則收尾。橋梁使用截面掃掠，主體不是 cube 拼接。
- GLB extras.materialKey 明確連到共用材質庫；貼圖不在每個 GLB 重複嵌入。
- Manifest 記錄建模頂點／三角形預算；UV / flat normals 在 glTF 會拆分頂點，實際輸出大小與 browser triangles 另外記錄。

| Asset | Material | LOD0 triangles | LOD1 | LOD2 |
|---|---|---:|---:|---:|
${rows}

## 材質庫與貼圖預算

10 種材質：rock、weathered-rock、lakeshore-stone、concrete、aged-concrete、gravel、dirt、grass、painted-metal、dark-metal。由 rock / concrete / ground / metal 四組共用貼圖供應 base color、normal、packed ORM，共 12 張 1024² PNG。沒有下載外部素材或使用 unique 4K 貼圖。

Base color 為 sRGB；normal / ORM 為 Non-Color。Blender 儲存 normal 時即指定 Non-Color，避免 gamma 改變法線。粗糙度使用 ORM 的 G、金屬度使用 B。AO 的 R 已準備但 runtime 未接入，避免把簡單紋理遮蔽冒充幾何接觸 AO。

12 張 RGBA8 + mipmaps 理論上限約 64 MiB；這是貼圖預算估算，並非實測總 VRAM。High / GPU 共用 1K 圖；GPU 提高 anisotropy 與 detail range，不為每個物件複製高解析圖。

## C 峽谷

兩種岩壁資產以七組錯落、沿路向延伸並重疊的模組沿原路線放置，岩壁腳部加入較大的破裂岩塊與碎石。主岩面有可見輪廓起伏、層狀突出及材質微細節。修改過程修正不平面頂蓋造成的破面、過強波紋與方形端面。道路外側的地表網格共用坡度混合材質，保持車道淨空。近照揭露了道路 normal 與模型 X 軸相反的朝向問題，現已將精細岩面轉向道路，並以 dot-product 斷言防止回歸。

## D 湖泊與湖岸

矩形水面改為不規則邊界；湖岸含岩架、露岩、礫石環與坡面過渡。路堤在 D 邊界以 smoothstep 過渡，避免突然切換高度。岸坡橫斷面由 8 列加密至 14 列，湖泊外緣增加平滑高度過渡，低處混入濕土色調。湖泊 footprint 內的地形壓低到水下，消除噪聲地形造成的碎片草地島；已加入水下高度斷言。

水使用 MeshStandardMaterial 的物理 Fresnel / sky PMREM 反射，以三個尺度的 domain-warped noise 高度場計算法線，使用世界方向轉換至視角空間，取代平行正弦條紋；材質 metalness 為 0，增加低振幅時間變化與大尺度色調變化。没有 SSR、透明多層水或全螢幕反射 pass。反射是天空環境近似，**不含附近山／樹的真實倒影**。

## E 橋梁

保留 gameplay road spline。Blender 僅提供道路下方橋板、預應力梁形截面、墩帽、雙柱墩、基礎、橋台、側欄與排水細節。墩距約 24 m；模組依道路切線與坡度對齊。沒有第二條道路，也沒有修改 AI／碰撞路徑。

混凝土與塗裝金屬各用自己的共享 PBR family；老化混凝土用同貼圖加色調／粗糙度變化。道路上原標線／護欄保持不變。

## 地形與植被構圖

CDE 局部使用細化路堤帶與坡度草／土／岩混合；原全域 procedural 地形保留。沿用 forest-v1.glb 的 scots pine，沒有重做樹模型。6 個小樹群位於開闊側／橋頭，High 24 棵、GPU 30 棵；湖水與桥面維持淨空。樹使用既有較低 LOD，沒有新增樹陰影負擔。

## 光線、色彩、AA、AO

CDE 依玩家位置平滑增加 sun intensity 0.25、降低 hemisphere 0.38；區外恢復既有值。沿用下午暖日光、天空環境與霧，未加 bloom 或染色後製。

實際 renderer 確認 outputColorSpace=srgb、toneMapping=ACESFilmic（4）、exposure=1.04，High / GPU antialias=true。沿用現有 MSAA 路徑，未疊加 SMAA。新陰影選近 LOD 的岩壁、橋板、橋墩及較大的岸邊岩石；本輪另開啟 High 近距建築陰影；碎石／欄杆／新樹群不投影。

未加入 SSAO/GTAO。理由是目前只有 software renderer，無法合理評估新全畫面 pass 的品質／成本；本輪優先改善模型、PBR 和既有陰影。

## High / GPU 與成本

| 設定 | High | GPU |
|---|---|---|
| PBR / 岩壁 / 湖岸 / 橋梁 | 完整 | 完整 |
| LOD 距離 | 95 / 190 m | 145 / 270 m |
| Draw cutoff | 300 m | 420 m |
| 新貼圖尺寸 | 1K | 1K |
| Anisotropy | 8 | 16 |
| 次要碎石 | 減量 | 增加 |
| 既有 shadow map | 2048 | 4096 |
| 既有 DPR 上限 | 1.35 | 2 |

每個資產／LOD 採 InstancedMesh。以下是固定視點的**全場景** gl.info 快照，包含其他既有內容與可能的 shadow update；不是純 Phase 4A 成本，也不是 FPS benchmark：

| Preset | Draw calls | Triangles |
|---|---:|---:|
${stats}

## 自動驗證

- TypeScript / production build：PASS；npm run build -- --emptyOutDir false 保留既有輸出。既有 >500 kB bundle advisory 仍存在。
- Lint：N/A，專案沒有配置。
- Phase 3 gameplay 測試重新執行：PASS，六車三圈、20 checkpoints、所有區域、shortcut / reset、玩家輸入物理。
- Phase 4A 測試：PASS，凍結檔案、30 LOD mesh、材質識別、有限數值、900 組局部車身淨空／覆路射線、岩壁正面朝向、湖內地形低於水面、12 張 1K 圖。

## Runtime / regression

- High / GPU 固定視點：PASS，所有 Phase 4A 資產已載入再拍攝。
- 畫質反覆切換與新材質 dispose event：PASS，cdp-resources.json。
- 玩家鍵盤油門、左右轉向、手煞車、煞車、R 歸零：PASS，cdp-controls.json；不是人類手動試駕。
- 實際瀏覽器 6 台車跑完 3 圈、Race Complete、Race Again countdown、localStorage reload：PASS，cdp-regression.json。使用原 DEV autoRace 模式進行自然 AI 跑圈，沒有直接寫入完成狀態。此回歸用 Perf / 640×360 降低軟體渲染成本，完成畫面回到 1280×720；不把這次回歸當成 High / GPU 效能測試。
- 驗收記錄共 ${errors.length} error / exception，${requests.length} failed request；無 shader compile error。完整內容見 final-console.json。
- 材質釋放測試針對本次新增資源；沒有把 browser 全部快取計數宣稱為零洩漏或 VRAM 實測。

## 修正記錄

1. Blender 低階橋梁 LOD 出現 invalid mesh warning：validate 並限制結構件簡化程度後重匯出。
2. PLACEHOLDER 材質名稱遺失：改用 extras.materialKey；加自動斷言，重新載入成功。
3. 岩壁頂蓋破面：改成明確 quad 拓撲；重拍。
4. 紋理過度波紋與 normal gamma：改成多尺度隨機場，降低振幅，修正 Non-Color。
5. 端面過方、湖岸高度轉換生硬：收窄岩壁端部，smoothstep 地形過渡，再測淨空。
6. Vite 監看剛寫入的驗證 JSON，觸發 Windows EBUSY 後退出：保留 vite-ebusy-failure.log，排除 verification / .tools 監看，重新完成建置、截圖與回歸。
7. 外部暫停 frame loop 拍近照導致鏡頭未固定及測試計時異常：淘汰該批近照；改用 DEV C-detail / D-detail / E-detail 固定鏡頭，保留正常 render loop 與計時並重拍。
8. 岩壁詳細面朝外：旋轉正面朝路，湖內地形切到水面以下；新增斷言、重新建置、重拍比較與近照，重新跑三圈。岩壁最初以 42 度、後續以 32 度分界保留大裂隙，平滑小面的法線，並以不等高、局部中斷的地質岩架取代等距波紋。

9. 重新載入測試在 document.body 尚未建立時讀取 innerText：加入空值等待，重新執行完整比賽與重載驗證。

10. 本輪修正岩壁孤立排列：七組不同尺度沿路向重疊；縮小並打散岸石，降低岸線礫石環，移除規律水面條紋，細化岸坡與濕土過渡。完成相關淨空測試與建置，再拍 High / GPU 並跑資源釋放、三圈回歸。

11. 使用者追加河流、岩石與房屋自然度：橋下橢圓水域改為寬窄變化的彎曲帶狀河道；岩石用不規則平面切割形狀，岩壁將圓滑侵蝕帶改為較清楚折面。房屋加入山牆、薄屋頂、屋簷、窗框／窗台／百葉窗、台階、煙囪蓋與近距瓦片分層，建築增加輕微雨痕／底部色差；保留位置與三段 LOD。這些是遊戲實際資產。

12. 實際近照發現岸帶背面剔除與房屋空白側牆：岸帶改雙面並增加不規則寬度，加入岸石；補側窗與 High 近距建築陰影。河道／岸帶通過整圈 1,800 組道路向上射線檢查。最新近照確認岸帶、側窗及房屋陰影可見；村落地面與遠景仍顯簡化，未將本次改善宣稱為寫實畫質完成。

## 修改檔案

${modified.map(f=>'- '+f).join('\n')}

資產與 manifest 在 public/assets/environment/phase4a/；原生 Blender library、Before / After、console、回歸證據在本資料夾。原 Phase 3 實作未提交 git；本階段 baseline-hashes.json / *.before.txt 區分本次新增差異。

## 重現

先執行 tools/blender/phase4a/build.py（使用既有本機 Blender background），再執行 node scripts/verify-environment-phase3.mjs、node scripts/verify-phase4a.mjs、npm run build -- --emptyOutDir false。啟動本機 Vite 後，以專用本機 Edge CDP port 9225 執行 phase4a-browser-check.mjs 的 after、resources、controls、regression 模式。

## 限制與最後狀態

本機 renderer 是 Microsoft Basic Render Driver / SOFTWARE，不能驗收實體 GPU FPS、VRAM 或 High 流暢性。未部署，未修改公開網站。全域遠景山、道路視覺與 HUD 保持原樣；其他 Zone 只有使用共用房屋資產的外觀随本輪更新，因此畫面仍受 Phase 3 背景品質限制；水也未提供真實場景倒影。

**美術目視驗收：NOT PASS。** 本輪已移除規律水面波紋，減少孤立岩壁排列並改善岸坡。實際畫面仍可辨識程序化岩體表面，遠景與整體光照層次也仍限制品質。橋梁結構與材質已有改善，但目前尚不足以作為其他區域的最終品質標準。後續優先處理岩體自然破裂面的形狀、局部色彩分布與遠景銜接。

**BLOCKED — hardware GPU performance acceptance。整體不得標示 DONE。**
`;
await fs.writeFile(out+'REPORT.md',report);
for(const [id] of views)for(const preset of ['high','gpu'])for(const stage of ['before','after'])await fs.access(out+`${stage}-${id}-${preset}.png`);
const closeups=['cliff-closeup','shoreline-closeup','bridge-closeup','house-closeup'].map(label=>`<section><h2>${label}</h2><div class="pair">${['high','gpu'].map(p=>`<figure><img src="${label}-${p}.png"><figcaption>${p.toUpperCase()} · DEV detail camera</figcaption></figure>`).join('')}</div></section>`).join('');
const cards=views.flatMap(([id,label])=>['high','gpu'].map(p=>`<section><h2>${label} · ${p.toUpperCase()}</h2><div class="pair"><figure><img loading="lazy" src="before-${id}-${p}.png"><figcaption>BEFORE · Phase 3</figcaption></figure><figure><img loading="lazy" src="after-${id}-${p}.png"><figcaption>AFTER · Phase 4A</figcaption></figure></div></section>`)).join('');
await fs.writeFile(out+'index.html',`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CDE · Phase 4A comparison</title><style>body{margin:0;padding:28px;background:#152226;color:#eff3e9;font:16px system-ui}h1{margin-bottom:10px}h2{font-size:19px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}figure{margin:0}img{width:100%;border-radius:8px}figcaption{padding:9px;color:#bbc9bb}section{margin:30px 0 45px}a{color:#addbca}@media(max-width:850px){.pair{grid-template-columns:1fr}}</style><h1>河流・岩石・房屋 · 最新實際畫面</h1><p>同視點 · High / GPU · 遊戲實際畫面。美術仍未達標；實體 GPU 效能驗收仍 BLOCKED。</p><p><a href="REPORT.md">完整報告</a></p>${closeups}${cards}<h2>Gameplay regression</h2><div class="pair"><figure><img src="final-race-complete.png"><figcaption>Race Complete</figcaption></figure><figure><img src="final-race-again.png"><figcaption>Race Again</figcaption></figure></div></html>`);
console.log('Phase 4A report + 28-image comparison gallery written.');
