// Renders only this local illustrative artifact in an isolated browser.
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const dir=path.dirname(fileURLToPath(import.meta.url));
const data=JSON.parse(fs.readFileSync(path.join(dir,'模拟数据.json')));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^https?:/,route=>route.abort());
 const url=pathToFileURL(path.join(dir,'演示占位页.html')).href;
 const checks=[];
 for(let i=0;i<data.scenes.length;i++){
  await page.goto(`${url}?capture=1&scene=${i+1}#${i+1}`);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('h1').textContent(),data.scenes[i].title);
  assert.equal(await page.locator('.flag').textContent(),'模拟数据 / 占位图 · 待现场取证替换');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const name=`${data.scenes[i].id}_${data.scenes[i].slug}_模拟占位.png`;
  await page.locator('#sheet').screenshot({path:path.join(dir,'images',name)});
  checks.push({image:name,heading:data.scenes[i].title});
 }
 await page.goto(url);await page.getByRole('button',{name:'下一图 →'}).click();assert.equal(await page.locator('h1').textContent(),data.scenes[1].title);
 await page.locator('#select').selectOption('7');assert.equal(await page.locator('h1').textContent(),data.scenes[7].title);
 await page.locator('#next').blur();await page.locator('h1').click();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('h1').textContent(),data.scenes[6].title);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(dir,'渲染检查.json'),JSON.stringify({artifactType:'SIMULATED_PLACEHOLDER',renderDate:'2026-11-05',browser:await browser.version(),checks,interactionChecks:['next button','scene selector','left arrow','390px no horizontal overflow'],pageErrors:errors,notice:'仅证明模拟材料渲染和翻页正常，不是链上测试结果。'},null,2));
 console.log('Rendered 8 simulated placeholders; navigation, mobile overflow and console checks passed.');
}finally{await browser.close()}
