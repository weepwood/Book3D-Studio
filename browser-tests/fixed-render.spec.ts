import {test,expect} from '@playwright/test'
import {readFile,writeFile} from 'node:fs/promises'

test('固定渲染档位、首帧优先与逐叶提交真实对照',async({browser},info)=>{
 test.setTimeout(240000)
 const records=[]
 const rounds=process.env.BOOK3D_FIXED_BENCH==='1'?2:1
 for(let round=0;round<rounds;round++)for(const profile of round%2?['economy','balanced','full']:['full','balanced','economy']){
  const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:{width:1280,height:800}})
  try{
   const page=await context.newPage(),errors:string[]=[]
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error/i.test(m.text()))errors.push(m.text())})
   await page.addInitScript(()=>localStorage.setItem('book3d.config',JSON.stringify({version:1,pageCount:80,pageIndex:10,opening:180,paperPhysics:'material',thicknessMode:'automatic',pageDuration:.85})))
   await page.goto('/?perf=1&inputPriority=1&renderProfile='+profile)
   const host=page.locator('.canvas-host'),canvas=host.locator('canvas')
   await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
   const base=await canvas.evaluate((c:HTMLCanvasElement)=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}))
   const level=profile==='full'?0:profile==='balanced'?1:2,scale=[1,.75,.5][level]
   expect(base.width).toBe(Math.floor(base.cssWidth*scale))
   expect(base.height).toBe(Math.floor(base.cssHeight*scale))
   await page.evaluate(()=>{
    const h=document.querySelector<HTMLElement>('.canvas-host')!,frames:unknown[]=[]
    Object.assign(window,{fixedFrames:frames})
    const collect=()=>{const d=h.dataset,c=h.querySelector('canvas')!;frames.push({at:performance.now(),index:Number(d.pageIndex),target:Number(d.pageTarget),p:Number(d.pageRenderProgress),chunk:Number(d.chunkLeaves),active:Number(d.activeLeaves),width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight})}
    new MutationObserver(collect).observe(h,{attributes:true,attributeFilter:['data-page-index','data-page-progress','data-page-turn']})
    collect()
   })
   const next=page.getByRole('button',{name:'下一页',exact:true})
   const idle=async(n:number)=>{await expect(host).toHaveAttribute('data-page-index',String(n),{timeout:45000});await expect(host).toHaveAttribute('data-page-turn','idle')}
   const start=await page.evaluate(()=>performance.now())
   await next.click();await idle(11)
   const first=await host.evaluate(el=>{const d=(el as HTMLElement).dataset;return {at:performance.now(),trace:JSON.parse(d.firstMotionTrace!),cache:JSON.parse(d.textureCache!),perf:JSON.parse(d.perf!)}})
   expect(first.trace[0].request.eventDispatchMs).toBeGreaterThanOrEqual(0)
   expect(first.cache.priorityPauses).toBeGreaterThanOrEqual(1)
   expect(first.cache.priorityResumes).toBe(first.cache.priorityPauses)
   expect(first.cache.backgroundPaused).toBe(false)
   const b=(await next.boundingBox())!,burst=await page.evaluate(()=>performance.now())
   for(let i=0;i<6;i++){await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(80)}
   await idle(17)
   const evidence=await page.evaluate(()=>{const d=document.querySelector<HTMLElement>('.canvas-host')!.dataset;return {at:performance.now(),frames:(window as any).fixedFrames as {index:number;p:number;active:number;chunk:number;width:number;height:number;cssWidth:number;cssHeight:number}[],perf:JSON.parse(d.perf!),resources:JSON.parse(d.renderResources!),cache:JSON.parse(d.textureCache!),profile:JSON.parse(d.renderBudget??'{"level":0}')}})
   expect(evidence.frames.every(f=>f.chunk===0&&f.active<=6&&f.width===base.width&&f.height===base.height&&f.cssWidth===base.cssWidth&&f.cssHeight===base.cssHeight)).toBe(true)
   const changes=evidence.frames.filter((f,i)=>i===0||f.index!==evidence.frames[i-1].index)
   expect(changes.map(f=>f.index)).toEqual([10,11,12,13,14,15,16,17])
   expect(evidence.frames.every((f,i)=>i===0||f.index===evidence.frames[i-1].index||evidence.frames[i-1].p===1)).toBe(true)
   expect(evidence.profile.level).toBe(level)
   expect(evidence.perf.published).toBeLessThanOrEqual(evidence.perf.frames)
   await canvas.screenshot({path:info.outputPath(profile+'-'+round+'.png')})
   // Full-quality 1x export independent of preview profile; after exporting
   // the fixed backing dimensions are restored.
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'保存 PNG'}).click()])
   const file=info.outputPath(profile+'-'+round+'-export.png');await download.saveAs(file)
   const png=await readFile(file);expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual([base.cssWidth,base.cssHeight])
   expect(await canvas.evaluate((c:HTMLCanvasElement)=>[c.width,c.height])).toEqual([base.width,base.height])
   expect(errors).toEqual([])
   records.push({round,profile,base,firstMs:first.at-start,firstTrace:first.trace,burstMs:evidence.at-burst,...evidence})
  }finally{await context.close()}
 }
 await writeFile(info.outputPath('fixed-render.json'),JSON.stringify(records,null,2))
})
