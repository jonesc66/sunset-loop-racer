import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const dir='verification/environment-phase4a';
const read=async name=>JSON.parse(await fs.readFile(`${dir}/${name}`,'utf8'));
const modes=['full-after','closeups','controls','resources','regression'];
const runtime={};for(const mode of modes){runtime[mode]=await read(`cdp-${mode}.json`);if(runtime[mode].status!=='PASS')throw Error(`${mode} incomplete`);}
const tests=await read('whole-scene-tests.json');if(tests.status!=='PASS')throw Error('Whole-scene geometry failed');
for(const mode of modes)if(Date.parse(runtime[mode].started)<Date.parse(tests.date))throw Error(`${mode} stale`);
const build=await read('build-result.json');if(build.status!=='PASS'||!build.devInspectionExcluded)throw Error('Build incomplete');
const files=[build.artifact,'src/environment/FullSceneArt.tsx','src/environment/Phase3Environment.tsx','src/environment/Phase4AEnvironment.tsx','src/environment/BenchmarkEnvironment.tsx','src/environment/benchmarkGeometry.ts','src/RaceScene.tsx','public/assets/environment/phase3/environment-v1.glb','public/assets/environment/phase4a/environment.glb'];
const hashes={};for(const file of files)hashes[file]=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const result={date:new Date().toISOString(),status:'IMPLEMENTED / LOCAL RUNTIME VERIFIED',hardwareGPU:'BLOCKED: Microsoft Basic Render Driver SOFTWARE; physical GPU performance not verified',tests,build,runtime:Object.fromEntries(modes.map(m=>[m,{status:runtime[m].status,started:runtime[m].started,ended:runtime[m].ended,views:runtime[m].views.length}])),hashes};
await fs.writeFile(`${dir}/whole-scene-verification.json`,JSON.stringify(result,null,2));
const zones=['A','B','C','D','E','F','G','H','I','J','I-entrance','I-exit'];
const image=(file,label)=>`<figure><a href="${file}"><img loading="lazy" src="${file}" alt="${label}"></a><figcaption>${label}</figcaption></figure>`;
const gallery=zones.map(z=>`<section id="${z}"><h2>${z}</h2><div class="grid">${image(`full-before-${z}-high.png`,'調整前 · High')}${image(`full-after-${z}-high.png`,'調整後 · High')}${image(`full-after-${z}-gpu.png`,'調整後 · GPU 預設')}</div></section>`).join('');
const details=runtime.closeups.views.map(v=>image(`closeups-${v.zone}-${v.preset}.png`,`${v.zone} · ${v.preset}`)).join('');
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>全圈環境更新 · A–J</title><style>body{margin:0;background:#121b20;color:#edf3ef;font:16px/1.65 system-ui}main{max-width:1600px;margin:auto;padding:36px}h1{font-size:36px}p{max-width:1000px;color:#c9d4d1}a{color:#b4dca1}nav{display:flex;gap:20px;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}figure{margin:0;background:#202e32;border-radius:8px;overflow:hidden}img{display:block;width:100%}figcaption{padding:10px}section{padding-top:26px}.details{grid-template-columns:repeat(2,1fr)}@media(max-width:850px){main{padding:18px}.grid{grid-template-columns:1fr}}</style><main><h1>全圈環境更新 · A–J</h1><p>統一地表材質、樹木與村莊植栽，補上住屋入口碎石路；河流加入河槽、深淺水色、岸邊收束和流動波面。岩體重新製作輪廓，隧道改為拱頂，工業建築增加構造細節。以下均為遊戲實際截圖。</p><p>本機操作、畫質切換、完整六車三圈與重新比賽驗證通過。這台環境使用軟體繪圖；GPU 按鈕代表畫質預設，實體 GPU 效能仍未驗證。整體仍是風格化即時 3D，並非照片級離線渲染。</p><nav>${zones.map(z=>`<a href="#${z}">${z}</a>`).join('')}<a href="#details">近景</a><a href="whole-scene-verification.json">驗證記錄</a></nav>${gallery}<section id="details"><h2>河岸、岩壁與房屋近景</h2><div class="grid details">${details}</div></section></main></html>`;
await fs.writeFile(`${dir}/whole-scene.html`,html);
await fs.writeFile(`${dir}/WHOLE-SCENE-REPORT.md`,`# 全圈環境更新\n\n日期：${result.date}\n\n狀態：${result.status}\n\n已更新 A–J 地表、植栽、村莊入口、岩體、河流／湖面／工業水道、隧道與工業建築。\n\n修復實際啟動發現的 GLSL 保留字導致地表編譯失敗；驗證程式新增逐畫面 shaderErrors 檢查。\n\n驗證：型別檢查、建置、Phase 3／4A／全景幾何與道路淨空；High／GPU 全圈截圖、近景、操作、材質釋放、六車三圈、重新比賽與保存設定。詳見 whole-scene-verification.json 及相關 CDP 記錄。\n\n限制：${result.hardwareGPU}。風格化即時 3D，不是照片級成品。\n\n對照：whole-scene.html\n`);
for(const name of ['index.html','river.html']){let page=await fs.readFile(`${dir}/${name}`,'utf8');if(!page.includes('id="whole-scene-update"')){page=page.replace('<h1>','<p id="whole-scene-update"><a href="whole-scene.html">最新：全圈 A–J 更新與前後對照</a></p><h1>');await fs.writeFile(`${dir}/${name}`,page);}}
console.log('Whole-scene report written');
