// A/B against an independently served immutable baseline; sequential fresh
// contexts, alternating order. GPU/driver caches are not isolated.
import {chromium} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
const urls=process.argv.slice(2)
if(urls.length!==2)throw Error('Usage: node scripts/turn-input-bench.mjs BASELINE_URL CANDIDATE_URL')
const browser=await chromium.launch({...(process.env.BOOK3D_CHROMIUM_EXECUTABLE?{executablePath:process.env.BOOK3D_CHROMIUM_EXECUTABLE}:{}),args:process.env.BOOK3D_HARDWARE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const result=[]
try{
 for(let round=0;round<3;round++)for(const variant of round%2?[1,0]:[0,1]){
  const context=await browser.newContext({viewport:{width:1280,height:800}})
  try{
   const page=await context.newPage(),errors=[]
   page.on('pageerror',e=>errors.push(e.message))
   await page.goto(urls[variant]+'/?perf=1')
   await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'benchmark.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,pageCount:2000,pageIndex:50,opening:0,pageDuration:.85,paperPhysics:'material',thicknessMode:'automatic'}))})
   await page.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageIndex==='50')
   await page.getByRole('button',{name:'打开书籍',exact:true}).click()
   await page.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageReady==='true',{},{timeout:30000})
   await page.evaluate(()=>{
    const host=document.querySelector('.canvas-host'),data={frames:[],inputs:[]}
    window.__turnBench=data
    new MutationObserver(()=>{const d=host.dataset;data.frames.push({at:performance.now(),index:Number(d.pageIndex),target:Number(d.pageTarget),progress:Number(d.pageProgress),renderProgress:d.pageRenderProgress===undefined?null:Number(d.pageRenderProgress),active:Number(d.activeLeaves),chunk:Number(d.chunkLeaves),state:d.pageTurn})}).observe(host,{attributes:true,attributeFilter:['data-page-index','data-page-progress','data-page-turn']})
    for(const type of ['pointerup','keydown'])document.addEventListener(type,e=>data.inputs.push({at:performance.now(),type, key:e.key}),true)
   })
   const next=page.getByRole('button',{name:'下一页',exact:true}),box=await next.boundingBox(),runs=[]
   const measure=async(label,target,fn)=>{
    const start=await page.evaluate(()=>performance.now());await fn()
    await page.waitForFunction(index=>{const d=document.querySelector('.canvas-host')?.dataset;return Number(d.pageIndex)===index&&d.pageTurn==='idle'},target,{timeout:30000})
    const data=await page.evaluate(()=>({end:performance.now(),...window.__turnBench,perf:JSON.parse(document.querySelector('.canvas-host').dataset.perf),cache:JSON.parse(document.querySelector('.canvas-host').dataset.textureCache)}))
    const frames=data.frames.filter(f=>f.at>=start),inputs=data.inputs.filter(f=>f.at>=start),first=frames.find(f=>f.progress>.002&&f.state==='active')
    const commits=frames.filter((f,i)=>i>0&&f.index!==frames[i-1].index)
    runs.push({label,target,totalMs:data.end-(inputs[0]?.at??start),firstMotionMs:first&&first.at-(inputs[0]?.at??start),inputs,frames,commits,maxActive:Math.max(...frames.map(f=>f.active)),maxChunk:Math.max(...frames.map(f=>f.chunk)),perf:data.perf,cache:data.cache})
   }
   await measure('first',51,()=>next.click())
   await measure('second',52,()=>next.click())
   await measure('burst',72,async()=>{for(let i=0;i<20;i++){const b=await next.boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(75)}})
   result.push({round,variant:variant?'candidate':'baseline',renderer:await page.locator('.canvas-host').getAttribute('data-perf-renderer'),runs,errors})
  }finally{await context.close()}
 }
}finally{await browser.close()}
await writeFile(process.env.BOOK3D_BENCH_OUT??'/tmp/book3d-turn-input-ab.json',JSON.stringify(result,null,2))
console.log(JSON.stringify(result.map(r=>({round:r.round,variant:r.variant,errors:r.errors,runs:r.runs.map(({label,totalMs,firstMotionMs,maxActive,maxChunk,commits})=>({label,totalMs,firstMotionMs,maxActive,maxChunk,commits:commits.length}))})),null,2))
