import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'

// Compare the diagnostic publisher alone. Both variants use the same input,
// rendering, texture cache and explicit GC at identical reading endpoints.
test('长时间高清阅读的诊断发布与堆内存对照',async({browser},info)=>{
 test.setTimeout(240000)
 const fixture=await browser.newPage()
 let config
 try{
  await fixture.goto('http://127.0.0.1:4173/')
  config=await fixture.evaluate(()=>{
   const images=Array.from({length:24},(_,i)=>{const c=document.createElement('canvas');c.width=2048;c.height=3072;const g=c.getContext('2d')!;const a=g.createLinearGradient(0,0,c.width,c.height);a.addColorStop(0,'hsl('+i*15+' 60% 75%)');a.addColorStop(1,'#342e29');g.fillStyle=a;g.fillRect(0,0,c.width,c.height);g.fillStyle='white';g.font='160px Georgia';g.fillText('PAGE '+(i+1),120,300);return c.toDataURL('image/jpeg',.9)})
   return {version:1,width:150,height:220,pageCount:24,pageIndex:1,opening:180,pageDuration:.85,paperPhysics:'material',thicknessMode:'automatic',pageImages:images,pageBleed:.1}
  })
 }finally{await fixture.close()}
 const results=[]
 for(const full of [true,false]){
  const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:{width:1280,height:800}})
  try{
   const page=await context.newPage(),errors:string[]=[]
   page.on('pageerror',e=>errors.push(e.message))
   await page.addInitScript(c=>localStorage.setItem('book3d.config',JSON.stringify(c)),config)
   await page.goto('/?perf=1'+(full?'&perfPublish=frame':''))
   const host=page.locator('.canvas-host')
   await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
   const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable')
   const read=async()=>{
    await expect.poll(async()=>{const c=JSON.parse((await host.getAttribute('data-texture-cache'))!);return c.pendingTextures+c.decode.active+c.decode.queued+c.warmQueued},{timeout:20000}).toBe(0)
    await cdp.send('HeapProfiler.collectGarbage')
    const heap=await cdp.send('Runtime.getHeapUsage'),metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]))
    const state=await host.evaluate(el=>{const d=(el as HTMLElement).dataset;return {perf:JSON.parse(d.perf!),cache:JSON.parse(d.textureCache!),resources:JSON.parse(d.renderResources!)}})
    return {...state,heap,metrics:{JSHeapUsedSize:metrics.JSHeapUsedSize,Nodes:metrics.Nodes,Documents:metrics.Documents,JSEventListeners:metrics.JSEventListeners}}
   }
   const before=await read(),checkpoints=[]
   const cycles=process.env.BOOK3D_HARDWARE_GPU==='1'?6:1,count=10
   for(let i=0;i<cycles;i++){
    for(const [key,target] of [['ArrowRight',11],['ArrowLeft',1]] as const){
     for(let j=0;j<count;j++){await page.keyboard.press(key);await page.waitForTimeout(80)}
     await expect(host).toHaveAttribute('data-page-index',String(target),{timeout:30000});await expect(host).toHaveAttribute('data-page-turn','idle')
    }
    const state=await read()
    expect(state.cache.backgroundPaused).toBe(false);expect(state.cache.priorityPauses).toBe(state.cache.priorityResumes)
    expect(state.cache.estimatedBytes).toBeLessThanOrEqual(state.cache.budgetBytes)
    expect(state.cache.failedTextures).toBe(0)
    if(checkpoints.length){expect(state.resources).toEqual(checkpoints[0].resources)}
    checkpoints.push(state)
   }
   const last=checkpoints.at(-1)!
   if(full)expect(last.perf.published).toBe(last.perf.frames)
   else expect(last.perf.published).toBeLessThan(last.perf.frames)
   expect(Number(await host.getAttribute('data-peak-chunk-leaves'))).toBe(0);expect(errors).toEqual([])
   results.push({full,cycles,count,before,checkpoints,renderer:await host.getAttribute('data-perf-renderer')})
  }finally{await context.close()}
 }
 await writeFile(info.outputPath('diagnostic-lifecycle.json'),JSON.stringify(results,null,2))
})
