import {chromium} from '@playwright/test'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
const dir='matched-visual',fixture=await readFile(new URL('./fixtures/visual-book.json',import.meta.url))
await mkdir(dir,{recursive:true})
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const report=[]
try{
 for(const [name,url] of [['v0.6.0',process.env.BASELINE_URL],['candidate',process.env.LOCAL_URL]]){
   if(!url)throw Error('Both baseline and candidate URLs are required')
   const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1})
   const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error|VALIDATE_STATUS/i.test(m.text()))errors.push(m.text())})
   await page.goto(url);await page.locator('.canvas-host canvas').waitFor()
   await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'visual-book.json',mimeType:'application/json',buffer:fixture})
   await page.waitForTimeout(1200)
   const host=page.locator('.canvas-host')
   const shot=async(label)=>{const info=await host.evaluate(e=>({frame:e.dataset.readFrame??null,stack:e.dataset.stackMetrics??null,index:e.dataset.pageIndex,progress:e.dataset.pageProgress,viewport:[e.clientWidth,e.clientHeight]}));await page.screenshot({path:dir+'/'+name+'-'+label+'.png'});report.push({name,label,...info})}
   await shot('closed')
   await page.getByRole('button',{name:'打开书籍',exact:true}).click()
   await page.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageReady==='true',{},{timeout:30000})
   await page.waitForTimeout(800);await shot('open')
   await page.getByRole('button',{name:'下一页',exact:true}).click()
   await page.waitForFunction(()=>Number(document.querySelector('.canvas-host')?.dataset.pageProgress)>.35,{},{timeout:30000})
   await shot('turn')
   await page.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageIndex==='1',{},{timeout:60000})
   await page.getByRole('button',{name:'下一页',exact:true}).evaluate(b=>{for(let i=0;i<9;i++)b.click()})
   await page.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageIndex==='10',{},{timeout:60000})
   await shot('middle')
   if(errors.length)throw Error(name+': '+errors.join('; '))
   await page.close()
 }
}finally{await browser.close();await writeFile(dir+'/report.json',JSON.stringify({fixture:JSON.parse(fixture.toString()),baseline:'v0.6.0',report,limitations:'Same local dimensions, original demo artwork and UI viewport; candidate fit is intentionally changed. Turning captures are not frame-locked. External Stripe Press assets/camera are not equivalent; no pixel-level source parity claim.'},null,2))}
