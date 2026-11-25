import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'

test('首帧优先调度对照及无原生空闲回调时的资源恢复',async({browser},info)=>{
 test.setTimeout(180000)
 const fixture=await browser.newPage()
 let config
 try{
  await fixture.goto('http://127.0.0.1:4173/')
  config=await fixture.evaluate(()=>({version:1,width:150,height:220,pageCount:24,pageIndex:0,opening:180,pageDuration:.85,paperPhysics:'material',thicknessMode:'automatic',pageBleed:.1,pageImages:Array.from({length:24},(_,i)=>{const c=document.createElement('canvas');c.width=2048;c.height=3072;const g=c.getContext('2d')!;g.fillStyle='hsl('+i*15+' 60% 75%)';g.fillRect(0,0,c.width,c.height);g.fillStyle='white';g.font='160px Georgia';g.fillText('PAGE '+(i+1),120,300);return c.toDataURL('image/jpeg',.9)})}))
 }finally{await fixture.close()}
 const results=[]
 const rounds=process.env.BOOK3D_FIRST_FRAME_BENCH==='1'?3:1
 for(let round=0;round<rounds;round++)for(const priority of round%2?[true,false]:[false,true]){
  const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:{width:1280,height:800}})
  try{
   const page=await context.newPage(),errors:string[]=[]
   page.on('pageerror',e=>errors.push(e.message))
   await page.addInitScript(({config,noIdle})=>{localStorage.setItem('book3d.config',JSON.stringify(config));if(noIdle){Object.defineProperty(window,'requestIdleCallback',{value:undefined,configurable:true});Object.defineProperty(window,'cancelIdleCallback',{value:undefined,configurable:true})}},{config,noIdle:round===rounds-1})
   await page.goto('/?perf=1'+(priority?'&inputPriority=1':''))
   const host=page.locator('.canvas-host')
   await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
   await page.evaluate(()=>{const h=document.querySelector<HTMLElement>('.canvas-host')!,frames:unknown[]=[];Object.assign(window,{auditFrames:frames});const collect=()=>{const d=h.dataset;frames.push({index:Number(d.pageIndex),target:Number(d.pageTarget),render:Number(d.pageRenderProgress),state:d.pageTurn})};new MutationObserver(collect).observe(h,{attributes:true,attributeFilter:['data-page-index','data-page-progress','data-page-turn']});collect()})
   const start=await page.evaluate(()=>performance.now())
   await page.getByRole('button',{name:'下一页',exact:true}).click()
   await expect(host).toHaveAttribute('data-page-index','1',{timeout:30000})
   await expect(host).toHaveAttribute('data-page-turn','idle')
   const first=await host.evaluate(el=>{const d=(el as HTMLElement).dataset;return {at:performance.now(),trace:JSON.parse(d.firstMotionTrace!),cache:JSON.parse(d.textureCache!),perf:JSON.parse(d.perf!)}})
   const trace=first.trace[0]
   expect(trace.framesBeforeMotion.length).toBeGreaterThan(0)
   expect(trace.framesBeforeMotion.every((f:{priorityHeld:boolean})=>f.priorityHeld===priority)).toBe(true)
   if(trace.submittedFrameCount<=12)expect(trace.framesBeforeMotion.at(-1).effective).toBe(true)
   await expect.poll(async()=>{const c=JSON.parse((await host.getAttribute('data-texture-cache'))!);return c.pendingTextures+c.decode.active+c.decode.queued+c.warmQueued},{timeout:30000}).toBe(0)
   const frames=await page.evaluate(()=>(window as any).auditFrames as {index:number;render:number}[])
   expect(frames.every((f,i)=>i===0||f.index===frames[i-1].index||frames[i-1].render===1)).toBe(true)
   const cache=JSON.parse((await host.getAttribute('data-texture-cache'))!)
   expect(cache.backgroundPaused||cache.decode.backgroundPaused).toBe(false)
   expect(cache.priorityPauses).toBe(cache.priorityResumes)
   expect(cache.failedTextures).toBe(0)
   // A forward and backward command in the same JS task cancels the pending
   // turn without requiring a fake motion frame or leaving the queue paused.
   await page.evaluate(()=>{for(const key of ['ArrowRight','ArrowLeft'])window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}))})
   await expect(host).toHaveAttribute('data-page-target','1')
   await expect.poll(async()=>JSON.parse((await host.getAttribute('data-texture-cache'))!).backgroundPaused).toBe(false)
   await expect(host).toHaveAttribute('data-page-index','1')
   expect(errors).toEqual([])
   results.push({round,priority,noIdle:round===rounds-1,firstMs:first.at-start,trace,cache,frames,perf:first.perf,renderer:await host.getAttribute('data-perf-renderer')})
  }finally{await context.close()}
 }
 await writeFile(info.outputPath('first-frame-audit.json'),JSON.stringify(results,null,2))
})
