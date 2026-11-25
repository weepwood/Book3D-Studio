// Same imported JPEG data and native input on an immutable baseline and candidate.
// Image setter counts measure application decode requests, not browser codec invocations.
import {chromium} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
const urls=process.argv.slice(2);if(urls.length!==2)throw Error('Usage: node scripts/hd-texture-bench.mjs BASELINE_URL CANDIDATE_URL')
const browser=await chromium.launch({...(process.env.BOOK3D_CHROMIUM_EXECUTABLE?{executablePath:process.env.BOOK3D_CHROMIUM_EXECUTABLE}:{}),args:process.env.BOOK3D_HARDWARE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const result=[]
try{
 const fixture=await browser.newPage()
 await fixture.goto(urls[0])
 const config=await fixture.evaluate(()=>{
  const images=Array.from({length:24},(_,i)=>{const c=document.createElement('canvas');c.width=2048;c.height=3072;const g=c.getContext('2d'),a=g.createLinearGradient(0,0,c.width,c.height);a.addColorStop(0,'hsl('+i*15+' 60% 75%)');a.addColorStop(1,'#342e29');g.fillStyle=a;g.fillRect(0,0,c.width,c.height);g.fillStyle='white';g.font='160px Georgia';g.fillText('PAGE '+(i+1),120,300);return c.toDataURL('image/jpeg',.9)})
  return {version:1,width:150,height:220,pageCount:24,pageIndex:0,opening:0,pageDuration:.85,paperPhysics:'material',thicknessMode:'automatic',pageImages:images,pageBleed:.1}
 })
 await fixture.close()
 for(let round=0;round<3;round++)for(const variant of round%2?[1,0]:[0,1]){
  const context=await browser.newContext({viewport:{width:1280,height:800}})
  try{
   const page=await context.newPage(),errors=[]
   page.on('pageerror',e=>errors.push(e.message))
   await page.addInitScript(()=>{
    const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src')
    window.__hdRequests=0
    Object.defineProperty(HTMLImageElement.prototype,'src',{...descriptor,set(value){if(typeof value==='string'&&value.startsWith('data:image/'))window.__hdRequests++;descriptor.set.call(this,value)}})
   })
   await page.goto(urls[variant]+'/?perf=1')
   await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'hd-bench.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))})
   await page.locator('footer [role=status]').filter({hasText:'项目已导入'}).waitFor()
   const open=await page.evaluate(()=>performance.now())
   await page.getByRole('button',{name:'打开书籍',exact:true}).click()
   await page.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageReady==='true',{},{timeout:30000})
   const opened=await page.evaluate(()=>performance.now())
   const runs=[],next=page.getByRole('button',{name:'下一页',exact:true}),prev=page.getByRole('button',{name:'上一页',exact:true})
   const measure=async(label,target,fn)=>{
    const start=await page.evaluate(()=>performance.now());await fn()
    await page.waitForFunction(n=>{const d=document.querySelector('.canvas-host')?.dataset;return Number(d.pageIndex)===n&&d.pageTurn==='idle'},target,{timeout:30000})
    const data=await page.evaluate(()=>{const d=document.querySelector('.canvas-host').dataset;return {now:performance.now(),requests:window.__hdRequests,motion:JSON.parse(d.firstMotion??'[]'),perf:JSON.parse(d.perf),cache:JSON.parse(d.textureCache),resources:JSON.parse(d.renderResources)}})
    runs.push({label,totalMs:data.now-start,...data})
   }
   await measure('first',1,()=>next.click())
   await measure('forward',11,async()=>{for(let i=0;i<10;i++){const b=await next.boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(80)}})
   await measure('reverse',1,async()=>{for(let i=0;i<10;i++){const b=await prev.boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(80)}})
   await page.waitForTimeout(500)
   const end=await page.evaluate(()=>({requests:window.__hdRequests,cache:JSON.parse(document.querySelector('.canvas-host').dataset.textureCache)}))
   result.push({round,variant:variant?'candidate':'baseline',openMs:opened-open,runs,end,errors})
  }finally{await context.close()}
 }
}finally{await browser.close()}
await writeFile(process.env.BOOK3D_BENCH_OUT??'/tmp/book3d-hd-ab.json',JSON.stringify(result,null,2))
console.log(JSON.stringify(result.map(r=>({round:r.round,variant:r.variant,openMs:r.openMs,requests:r.end.requests,errors:r.errors,runs:r.runs.map(x=>({label:x.label,totalMs:x.totalMs,motion:x.motion.at(-1),gap:x.perf.frameGap.p95,requests:x.requests}))})),null,2))
