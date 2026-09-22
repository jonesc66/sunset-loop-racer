import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const dir='verification/recovery-20260912';
const modes=['regression','controls','art-recovery','resources'];
const runtime={};
for(const mode of modes){const r=JSON.parse(await fs.readFile(dir+'/runtime/cdp-'+mode+'.json','utf8'));assert.equal(r.status,'PASS',mode);assert.equal(r.requests.length,0,mode+' failed requests');assert(!r.logs.some(l=>l.level==='error'||l.type==='error'||l.type==='exception'));runtime[mode]={status:r.status,started:r.started,ended:r.ended,views:r.views.length,checks:r.checks,resetConfirmed:r.resetConfirmed};}
const regression=runtime.regression;assert(regression.checks.some(c=>c.legacyExcluded));assert(regression.checks.some(c=>c.persistence==='PASS'));
const unit=JSON.parse(await fs.readFile(dir+'/record-art-tests.json','utf8'));assert.equal(unit.status,'PASS');
const files=['src/App.tsx','src/environment/BenchmarkEnvironment.tsx','src/environment/FullSceneArt.tsx','src/environment/benchmarkGeometry.ts','scripts/verify-phase4a.mjs','scripts/verify-recovery.mjs','scripts/recovery-browser-check.mjs'];
const hashes={};for(const file of files)hashes[file]=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const html=await fs.readFile(dir+'/gallery.html','utf8');for(const match of html.matchAll(/src="([^"]+)"/g))await fs.access(dir+'/'+match[1]);
const report={status:'DONE',scope:'Expanded-track personal records reset; interrupted forest replacement; mountain surface detail; local runtime acceptance',hardwareGPU:'Not verified: Microsoft Basic Render Driver software renderer',automated:{typecheck:'PASS',lint:'N/A: no configured lint script',build:'PASS',tests:['verify-environment-phase3','verify-phase4a','verify-whole-scene','verify-recovery']},runtime,hashes,date:new Date().toISOString()};
await fs.writeFile(dir+'/verification.json',JSON.stringify(report,null,2));
const md=['# 加長賽道紀錄與美術修復','',
'狀態：DONE（本次修改與本機功能驗證）；實體 GPU 效能尚未驗證。','',
'## 修改','',
'- Personal Top 5 改用加長版賽道專用儲存鍵。舊短賽道成績保留在舊鍵，但不再讀入新版榜單；新成績可保存與重載。現有遊戲分頁需重新整理。',
'- 完成先前磁碟滿而中斷的 SliceForest 替換；使用既有自然松樹模型，保留植栽位置、畫質可見距離及陰影設定。',
'- 山體最低曲面分段由 18 提高到 36，減少粗糙折線；賽道、物理、檢查點與碰撞流程未修改。',
'- 原始碼備份保存於本目錄的 before.txt 檔案。原始 frozen hashes 保留，驗證只允許本次明確授權的 App 儲存鍵字串變更。','',
'## 驗證','',
'- TypeScript、Vite build、三項既有測試與新增紀錄／山體測試：PASS。Vite 大型 chunk 提示仍在，沒有新增建置錯誤；未配置 lint。',
'- 實際瀏覽器六車三圈、結果頁、新榜單排除舊紀錄、Race Again、重載保存：PASS。',
'- 鍵盤油門、轉向、手煞車、煞車與 R 重置操作：已執行，重置速度回到零。',
'- High／GPU 的 A–J、隧道入口及出口，共 24 個畫面與畫質切換：PASS；已查看巡檢圖。',
'- 資源釋放與反覆畫質切換：PASS。沒有偵測到 console/runtime errors 或 failed requests。',
'- 測試使用獨立 Edge 設定檔與軟體渲染，測試跑圈時間及 FPS 不作實體 GPU 效能指標。','',
'[查看畫面](gallery.html) · [詳細證據與檔案雜湊](verification.json)'];
await fs.writeFile(dir+'/REPORT.md',md.join('\n'));
console.log('DONE: report and gallery verified');
