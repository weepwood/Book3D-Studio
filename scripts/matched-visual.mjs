import {chromium} from '@playwright/test'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
const dir='matched-visual',fixture=await readFile(new URL('./fixtures/visual-book.json',import.meta.url))
await mkdir(dir,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.BOOK3D_CHROMIUM_EXECUTABLE||undefined,args:process.env.BOOK3D_HARDWARE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const report=[],baseline=process.env.BASELINE_LABEL||'v0.8.0'
try{
 for(const [name,url] of [[baseline,process.env.BASELINE_URL],['candidate',process.env.LOCAL_URL]]){
   if(!url)throw Error('Both baseline and candidate URLs are required')
   const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1})
   const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error|VALIDATE_STATUS/i.test(m.text()))errors.push(m.text())})
   // Capture the canvas synchronously after the same animation callback that
   // changes the turn state; a later Playwright screenshot can show a different frame.
   await page.addInitScript(()=>{
     const raf=window.requestAnimationFrame.bind(window)
     window.requestAnimationFrame=callback=>raf(time=>{
       const host=document.querySelector('.canvas-host'),before=host?.dataset.pageProgress
       callback(time)
       if(!window.__matchedVisualArmed||window.__matchedVisualFrame||!host)return
       const progress=Number(host.dataset.pageProgress)
       if(host.dataset.pageTurn==='active'&&host.dataset.pageIndex==='0'&&host.dataset.pageProgress!==before&&progress>=.35&&progress<1){
         const canvas=host.querySelector('canvas')
         if(canvas)window.__matchedVisualFrame={progress,index:host.dataset.pageIndex,png:canvas.toDataURL('image/png')}
       }
     })
   })
   console.log('Capturing '+name+' '+url);await page.goto(url);try{await page.locator('.canvas-host canvas').waitFor()}catch(e){await page.screenshot({path:dir+'/'+name+'-startup-error.png'});throw Error(name+' startup failed: '+errors.join('; ')+' '+await page.locator('body').innerText(),{cause:e})}
   await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'visual-book.json',mimeType:'application/json',buffer:fixture})
   await page.waitForTimeout(1200)
   const host=page.locator('.canvas-host')
   const shot=async(label)=>{const info=await host.evaluate(e=>({frame:e.dataset.readFrame??null,stack:e.dataset.stackMetrics??null,index:e.dataset.pageIndex,progress:e.dataset.pageProgress,viewport:[e.clientWidth,e.clientHeight]}));await page.screenshot({path:dir+'/'+name+'-'+label+'.png'});report.push({name,label,...info})}
   await shot('closed')
   await page.getByRole('button',{name:'打开书籍',exact:true}).click()
   await page.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageReady==='true',{},{timeout:30000})
   await page.waitForTimeout(800);await shot('open')
   await page.evaluate(()=>{window.__matchedVisualArmed=true})
   await page.getByRole('button',{name:'下一页',exact:true}).click()
   await page.waitForFunction(()=>Boolean(window.__matchedVisualFrame),{},{timeout:30000})
   const turn=await page.evaluate(()=>{window.__matchedVisualArmed=false;const frame=window.__matchedVisualFrame;delete window.__matchedVisualFrame;return frame})
   const png=Buffer.from(turn.png.split(',')[1],'base64')
   if(png.length<10000)throw Error(name+': turning canvas capture unexpectedly small')
   await writeFile(dir+'/'+name+'-turn-frame.png',png)
   report.push({name,label:'turn-frame',progress:turn.progress,index:turn.index,bytes:png.length})
   await shot('turn')
   await page.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageIndex==='1',{},{timeout:60000})
   await page.getByRole('button',{name:'下一页',exact:true}).evaluate(b=>{for(let i=0;i<9;i++)b.click()})
   await page.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageIndex==='10',{},{timeout:60000})
   await shot('middle')
   if(errors.length)throw Error(name+': '+errors.join('; '))
   await page.close()
 }
}finally{await browser.close();await writeFile(dir+'/report.json',JSON.stringify({fixture:JSON.parse(fixture.toString()),baseline,report,limitations:'Same local dimensions, original demo artwork and UI viewport; candidate fit is intentionally changed. Turn-frame canvas captures are synchronous with the recorded logical progress; baseline and candidate can cross the threshold on different frames. Full workspace turn screenshots remain asynchronous. External Stripe Press assets/camera are not equivalent; no pixel-level source parity claim.'},null,2))}
