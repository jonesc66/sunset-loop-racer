import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const out='verification/environment-phase4a/';
const names=['river','river-video','resources','regression'];
const runs=await Promise.all(names.map(async n=>JSON.parse(await fs.readFile(out+`cdp-${n}.json`,'utf8'))));
for(const [i,r] of runs.entries())if(r.status!=='PASS')throw Error(names[i]+' incomplete');
const errors=runs.flatMap(r=>r.logs).filter(l=>l.level==='error'||l.type==='error'||l.type==='exception');
const requests=runs.flatMap(r=>r.requests);
if(errors.length||requests.length)throw Error('Runtime errors');
const receipt=JSON.parse(await fs.readFile(out+'build-result.json','utf8'));
if(receipt.status!=='PASS'||!receipt.devInspectionExcluded)throw Error('Build missing');
const files=['src/environment/Phase4AEnvironment.tsx','scripts/verify-phase4a.mjs','scripts/phase4a-browser-check.mjs','scripts/write-river-report.mjs','scripts/verify-river-video.mjs',receipt.artifact];
const hashes={};for(const f of files)hashes[f]=crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex');
await fs.writeFile(out+'river-verification.json',JSON.stringify({date:new Date().toISOString(),runs:names,errors,requests,hashes,build:receipt,video:runs[1].checks},null,2));
const report=`# 河流動態水面修正

原河流只有平面幾何與材質法線，視覺上像色板。本輪改成 171 × 25 = 4,275 個頂點的水面網格，8,160 個三角形；頂點依時間移動，最大上下起伏為 0.10 m，岸線固定。

流紋沿河道方向移動，法線跟隨波高變化；中央深水、淺岸色差與稀疏岸邊亮紋打破均勻色塊。這是程序化流動近似，沒有宣稱為流體模擬，也沒有加入真實場景倒影。

## 驗證

- TypeScript / production build PASS；DEV 近照鏡頭未進入正式 bundle。
- 道路凍結、模型淨空、河道網格、最大波高 0.10 m 下整圈 1,800 組道路檢查 PASS。
- High / GPU 橋下、橋側、湖岸回歸 PASS，沒有 shader error。
- 畫質切換與既有新增資源釋放檢查 PASS。
- 瀏覽器六車三圈、Race Again、localStorage reload PASS。
- 本次驗收 ${errors.length} error / exception、${requests.length} failed request。
- river-flow.webm 是 High 畫質下實際遊戲 canvas 的 12 秒錄影，不是圖片動畫。

目前使用 SOFTWARE renderer，影片流暢度不代表實體 GPU；實體顯卡效能驗收仍 BLOCKED。整體場景的最終美術驗收仍未完成。

本輪以 river.html / river-verification.json 為準；REPORT.md 和舊對照圖保留上一輪房屋、岩石與河道形狀修改的歷史快照。
`;
await fs.writeFile(out+'RIVER-REPORT.md',report);
const previousReport=await fs.readFile(out+'REPORT.md','utf8');
if(!previousReport.includes('RIVER-REPORT.md'))await fs.writeFile(out+'REPORT.md','> 最新河面起伏／流動修正與驗證請見 [RIVER-REPORT.md](RIVER-REPORT.md)；以下為前一輪快照。\n\n'+previousReport);
const pairs=['high','gpu'].map(p=>`<section><h2>${p.toUpperCase()} 同視角比較</h2><div class="pair"><figure><img src="river-before-${p}.png"><figcaption>修改前：平面河面</figcaption></figure><figure><img src="river-E-detail-${p}.png"><figcaption>修改後：起伏、深淺與反光</figcaption></figure></div></section>`).join('');
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>河流動態水面</title><style>body{background:#17292d;color:#e8efef;font:16px system-ui;margin:32px auto;max-width:1440px;padding:0 20px}video{width:100%;max-height:75vh;background:#0a1518}img{width:100%}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}figcaption{padding:10px}section{margin:32px 0}a{color:#9fdbd3}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><h1>河流：實際流動與水面起伏</h1><p>先播放這段 12 秒遊戲錄影，再看同視角比較。錄影環境為軟體渲染，不能代表顯卡效能。</p><video controls autoplay muted loop playsinline preload="metadata" src="river-flow.webm" poster="river-E-detail-high.png"></video><p><a href="RIVER-REPORT.md">本輪驗證報告</a> · <a href="http://127.0.0.1:5173/sunset-loop-racer/?autoRace&environmentInspect#E-detail">開啟即時遊戲河流視角</a></p>${pairs}</html>`;
await fs.writeFile(out+'river.html',html);
const index=await fs.readFile(out+'index.html','utf8');
if(!index.includes('id="river-update"'))await fs.writeFile(out+'index.html',index.replace('<h1>','<p id="river-update"><a href="river.html">最新：播放河流動態水面與同視角比較</a></p><h1>'));
console.log('River video gallery and verification report written.');
