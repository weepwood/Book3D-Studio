import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'

// Alternating fresh contexts; shared browser/driver caches remain. A/B timing
// is evidence, not a wall-clock CI gate. No artificial delay in render calls.
test('直接阅读的离屏预热与低性能渲染预算对照',async({browser},info)=>{
 test.setTimeout(240000)
 const runs=[]
 const rounds=process.env.BOOK3D_RENDER_BENCH==='1'?2:1
 for(let round=0;round<rounds;round++)for(const mode of round%2?['both','budget','baseline']:['baseline','budget','both']){
  const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:{width:1280,height:800}})
  try{
   const page=await context.newPage(),errors:string[]=[]
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error/i.test(m.text()))errors.push(m.text())})
   await page.addInitScript(()=>localStorage.setItem('book3d.config',JSON.stringify({version:1,pageCount:80,pageIndex:10,opening:180,paperPhysics:'material',thicknessMode:'automatic',pageDuration:.85})))
   await page.goto('/?perf=1&renderBudget='+(mode==='baseline'?0:1)+'&warmDraw='+(mode==='both'?1:0))
   const host=page.locator('.canvas-host')
   await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
   await expect(host).toHaveAttribute('data-reading-warm',mode==='both'?'offscreen-drawn':'submitted',{timeout:30000})
   const startup=JSON.parse((await host.getAttribute('data-startup'))!)
   const warmMs=Number(await host.getAttribute('data-reading-warm-ms')),drawMs=Number(await host.getAttribute('data-reading-warm-draw-ms'))
   const baseSize=await host.locator('canvas').evaluate((c:HTMLCanvasElement)=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}))
   await page.evaluate(()=>{
    const h=document.querySelector<HTMLElement>('.canvas-host')!,frames:unknown[]=[]
    Object.assign(window,{budgetFrames:frames})
    new MutationObserver(()=>{const d=h.dataset;const c=h.querySelector('canvas')!;frames.push({at:performance.now(),index:Number(d.pageIndex),target:Number(d.pageTarget),p:Number(d.pageRenderProgress),active:Number(d.activeLeaves),chunk:Number(d.chunkLeaves),budget:JSON.parse(d.renderBudget??'{"level":0}'),width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight})}).observe(h,{attributes:true,attributeFilter:['data-page-index','data-page-progress','data-page-turn','data-render-budget']})
   })
   const next=page.getByRole('button',{name:'下一页',exact:true})
   const idle=async(n:number)=>{await expect(host).toHaveAttribute('data-page-index',String(n),{timeout:60000});await expect(host).toHaveAttribute('data-page-turn','idle')}
   const start=await page.evaluate(()=>performance.now())
   await next.click();await idle(11)
   const first=await host.evaluate(el=>({at:performance.now(),trace:JSON.parse((el as HTMLElement).dataset.firstMotionTrace!)}))
   const b=await next.boundingBox(),count=6
   if(!b)throw Error('missing input')
   const burst=await page.evaluate(()=>performance.now())
   for(let i=0;i<count;i++){await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(80)}
   await idle(17)
   const evidence=await page.evaluate(()=>{const d=document.querySelector<HTMLElement>('.canvas-host')!.dataset;return {at:performance.now(),frames:(window as any).budgetFrames as {index:number;p:number;active:number;chunk:number;budget:{level:number};width:number;height:number;cssWidth:number;cssHeight:number}[],perf:JSON.parse(d.perf!),programWarm:d.programWarm,resources:JSON.parse(d.renderResources!)}})
   const settled=await host.locator('canvas').evaluate((c:HTMLCanvasElement)=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}))
   expect(settled).toEqual(baseSize)
   expect(evidence.frames.every(f=>f.chunk===0&&f.active<=6&&f.cssWidth===baseSize.cssWidth&&f.cssHeight===baseSize.cssHeight)).toBe(true)
   const changes=evidence.frames.filter((f,i)=>i===0||f.index!==evidence.frames[i-1].index)
   expect(changes.map(f=>f.index)).toEqual([10,11,12,13,14,15,16,17])
   expect(evidence.frames.every((f,i)=>i===0||f.index===evidence.frames[i-1].index||evidence.frames[i-1].p===1)).toBe(true)
   expect(evidence.frames.at(-1)?.budget.level).toBe(0)
   expect(errors).toEqual([])
   runs.push({round,mode,startup,warmMs,drawMs,baseSize,firstMs:first.at-start,firstTrace:first.trace,burstMs:evidence.at-burst,...evidence,peakLevel:Math.max(...evidence.frames.map(f=>f.budget.level))})
  }finally{await context.close()}
 }
 await writeFile(info.outputPath('render-budget.json'),JSON.stringify(runs,null,2))
})
