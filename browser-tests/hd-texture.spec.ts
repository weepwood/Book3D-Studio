import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'

test('高清正反纸面共享解码、预取上传、代际取消及正确像素',async({page},info)=>{
 // Exercise the independent-map compatibility path to isolate bitmap LRU.
 await page.goto('/?sharedFaces=0')
 const result=await page.evaluate(async()=>{
  const pp='/src/core/pages.ts',sp='/src/core/schema.ts',tp='/src/core/textureWarm.ts',bp='/src/core/book.ts'
  const {createPageLayer}=await import(pp),{parseConfig}=await import(sp),{createTextureWarmer}=await import(tp),{disposeTree}=await import(bp)
  const images=Array.from({length:12},(_,i)=>{
   const c=document.createElement('canvas');c.width=2048;c.height=3072;const g=c.getContext('2d')!
   g.fillStyle=i%2?'rgb(100,200,250)':'rgb(200,100,50)';g.fillRect(0,0,c.width,c.height);g.fillStyle='black';g.font='96px sans-serif';g.fillText(String(i),100,150);return c.toDataURL('image/jpeg',.88)
  })
  const sizes=images.map(x=>x.length),config=parseConfig({version:1,width:150,height:220,pageCount:12,pageImages:images,pageBleed:.1})
  let uploads=0,invalidations=0
  const warm=createTextureWarmer<any>(()=>uploads++)
  const layer=createPageLayer(1.5,2.2,config,()=>invalidations++,warm)
  const sample=(t:any)=>{const c=t.image as HTMLCanvasElement;return Array.from(c.getContext('2d')!.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data)}
  const wait=async(predicate:()=>boolean)=>{for(let i=0;i<600;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10))}throw Error('texture queue did not settle')}
  try{
   // Both original and flipped maps request identical source images before
   // any asynchronous decode can run. This is a real layer, not a fake queue.
   layer.pose(0,6,[{direction:1,progress:.2,grip:0,velocity:0},{direction:1,progress:.1,grip:0,velocity:0}])
   layer.cancelPreload()
   await wait(()=>layer.textureMetrics().pendingTextures===0&&layer.textureMetrics().decode.active===0)
   const first=layer.textureMetrics(),front=sample(layer.slots[0].front.map),back=sample(layer.slots[0].back.map)
   layer.pose(2,6,[])
   await wait(()=>layer.textureMetrics().decodedWarm>0&&layer.textureMetrics().pendingTextures===0&&layer.textureMetrics().decode.active===0&&layer.textureMetrics().warmQueued===0)
   const prefetch=layer.textureMetrics(),before=uploads
   const old=layer.right.material.map
   // Change source generation twice before queued work starts.
   const changed=parseConfig({...config,pageImages:[...images].reverse()})
   layer.update(changed);layer.pose(0,6,[])
   const stale=layer.right.material.map
   layer.update(config);layer.pose(0,6,[]);layer.cancelPreload()
   await wait(()=>layer.textureMetrics().pendingTextures===0&&layer.textureMetrics().decode.active===0)
   const after=layer.textureMetrics(),newPixel=sample(layer.right.material.map)
   const staleDisposed=!!stale.userData.disposed,oldDisposed=!!old.userData.disposed
   const broken=parseConfig({...config,pageImages:['data:image/png;base64,AAAA',...images.slice(1)]})
   layer.update(broken);layer.pose(0,6,[]);layer.cancelPreload()
   await wait(()=>layer.textureMetrics().pendingTextures===0&&layer.textureMetrics().decode.active===0)
   const failure=layer.textureMetrics()
   layer.update(config);layer.pose(1,6,[])
   layer.suspendTextureWork()
   await wait(()=>layer.textureMetrics().decode.active===0)
   const suspended=layer.textureMetrics()
   return {sizes,first,prefetch,after,failure,suspended,front,back,newPixel,staleDisposed,oldDisposed,uploads,before,invalidations}
  }finally{layer.dispose();disposeTree(layer.root)}
 })
 expect(result.first.decode.shared).toBeGreaterThan(0)
 expect(result.first.decode.started).toBeLessThan(result.first.decode.requested)
 expect(result.first.decode.peakActive).toBeLessThanOrEqual(2)
 expect(result.prefetch.decodedWarm).toBeGreaterThan(0)
 expect(result.after.decode.canceled).toBeGreaterThan(0)
 expect(result.staleDisposed&&result.oldDisposed).toBe(true)
 expect(result.after.pendingTextures).toBe(0)
 expect(result.failure.failedTextures).toBeGreaterThan(0)
 expect(result.failure.decode.deliveryFailed).toBe(0)
 expect(result.suspended.decode.cacheBytes).toBe(0)
 expect(result.suspended.pendingTextures+result.suspended.warmQueued+result.suspended.decode.active+result.suspended.decode.queued).toBe(0)
 expect(result.prefetch.decode.cacheHits).toBeGreaterThan(0)
 expect(result.failure.estimatedBytes).toBeLessThanOrEqual(result.failure.budgetBytes)
 for(const [i,expected] of [188,98,50,255].entries())expect(Math.abs(result.front[i]-expected)).toBeLessThanOrEqual(3)
 for(const [i,expected] of [188,98,50,255].entries())expect(Math.abs(result.newPixel[i]-expected)).toBeLessThanOrEqual(3)
 for(const [i,expected] of [98,188,230,255].entries())expect(Math.abs(result.back[i]-expected)).toBeLessThanOrEqual(4)
 await writeFile(info.outputPath('hd-layer.json'),JSON.stringify(result,null,2))
})

test('真实高清书籍冷启动、固定坐标连续输入及图片资源循环',async({page},info)=>{
 test.setTimeout(150000)
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error/i.test(m.text()))errors.push(m.text())})
 await page.goto('/?perf=1')
 const config=await page.evaluate(()=>{
  const images=Array.from({length:24},(_,i)=>{const c=document.createElement('canvas');c.width=2048;c.height=3072;const g=c.getContext('2d')!;const a=g.createLinearGradient(0,0,c.width,c.height);a.addColorStop(0,'hsl('+i*15+' 60% 75%)');a.addColorStop(1,'#342e29');g.fillStyle=a;g.fillRect(0,0,c.width,c.height);g.fillStyle='white';g.font='160px Georgia';g.fillText('PAGE '+(i+1),120,300);return c.toDataURL('image/jpeg',.9)})
  return {version:1,width:150,height:220,pageCount:24,pageIndex:0,opening:0,pageDuration:.85,paperPhysics:'material',thicknessMode:'automatic',pageImages:images,pageBleed:.1}
 })
 const host=page.locator('.canvas-host')
 await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'hd-book.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))})
 await expect(page.locator('footer [role=status]')).toContainText('项目已导入')
 await page.getByRole('button',{name:'打开书籍',exact:true}).click()
 await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
 const idle=async(index:number)=>{await expect(host).toHaveAttribute('data-page-index',String(index),{timeout:45000});await expect(host).toHaveAttribute('data-page-turn','idle')}
 const next=page.getByRole('button',{name:'下一页',exact:true}),previous=page.getByRole('button',{name:'上一页',exact:true})
 const start=await page.evaluate(()=>performance.now())
 await next.click();await idle(1)
 const first=await host.evaluate(el=>{const d=(el as HTMLElement).dataset;return {at:performance.now(),motion:JSON.parse(d.firstMotion??'[]'),trace:JSON.parse(d.firstMotionTrace??'[]'),perf:JSON.parse(d.perf!),cache:JSON.parse(d.textureCache!)}})
 expect(first.trace.length).toBeGreaterThan(0)
 expect(first.trace[0].request.target).toBe(1);expect(first.trace[0].submit.renderProgress).toBeGreaterThan(.002)
 expect(first.trace[0].firstMotionFrame.phases.render).toBeGreaterThanOrEqual(0)
 const extended=process.env.BOOK3D_LONG_STRESS==='1'
 const cycles=extended?12:process.env.BOOK3D_HARDWARE_GPU==='1'?3:1,checkpoints=[]
 if(extended)test.setTimeout(240000)
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable')
 for(let cycle=0;cycle<cycles;cycle++){
  for(const [button,goal] of [[next,11],[previous,1]] as const){
   const b=(await button.boundingBox())!;for(let i=0;i<10;i++){await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(80)}
   await idle(goal)
  }
  await expect.poll(async()=>{const c=JSON.parse((await host.getAttribute('data-texture-cache'))!);return c.pendingTextures+c.decode.active+c.decode.queued+c.warmQueued},{timeout:20000}).toBe(0)
  const d=await host.evaluate(el=>{const d=(el as HTMLElement).dataset;return {cache:JSON.parse(d.textureCache!),resources:JSON.parse(d.renderResources!),perf:JSON.parse(d.perf!),motion:JSON.parse(d.firstMotion??'[]')}})
  expect(d.cache.estimatedBytes).toBeLessThanOrEqual(d.cache.budgetBytes);expect(d.cache.decode.peakActive).toBeLessThanOrEqual(2);expect(d.cache.failedTextures).toBe(0);expect(d.cache.decode.deliveryFailed).toBe(0);expect(d.cache.decode.cacheBytes).toBeLessThanOrEqual(d.cache.decode.cacheBudget);expect(d.cache.decode.cacheHits).toBeGreaterThan(0)
  await cdp.send('HeapProfiler.collectGarbage')
  const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]))
  checkpoints.push({...d,heapBytes:metrics.JSHeapUsedSize})
 }
 if(checkpoints.length>1){const initial=checkpoints[0].resources;for(const point of checkpoints.slice(1)){expect(point.resources.geometries).toBeLessThanOrEqual(initial.geometries+2);expect(point.resources.textures).toBeLessThanOrEqual(initial.textures+2);expect(point.resources.programs).toBeLessThanOrEqual(initial.programs+2)}}
 expect(Number(await host.getAttribute('data-peak-chunk-leaves'))).toBe(0);expect(errors).toEqual([])
 await writeFile(info.outputPath('hd-reading.json'),JSON.stringify({first:{...first,elapsedMs:first.at-start},cycles,sourceBytes:config.pageImages.reduce((n,s)=>n+s.length,0),checkpoints,renderer:await host.getAttribute('data-perf-renderer')},null,2))
 await page.screenshot({path:info.outputPath('hd-reading.png')})
})

// Hold delivery of real decoded images. This tests resource independence,
// not a claim that the browser naturally stalls this long on a cold load.
test('直接阅读的高清解码延迟不阻塞首次输入且恢复不改变页码',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{
  const images=Array.from({length:8},(_,i)=>{
   const c=document.createElement('canvas');c.width=2048;c.height=3072
   const g=c.getContext('2d')!;g.fillStyle='hsl('+i*40+' 50% 60%)';g.fillRect(0,0,c.width,c.height);return c.toDataURL('image/jpeg',.88)
  })
  localStorage.setItem('book3d.config',JSON.stringify({version:1,width:150,height:220,pageCount:8,pageIndex:0,opening:180,pageDuration:.85,paperPhysics:'material',thicknessMode:'automatic',pageImages:images,pageBleed:.1}))
  const original=HTMLImageElement.prototype.decode
  let release!:()=>void
  const gate=new Promise<void>(resolve=>release=resolve)
  Object.assign(window,{releasePageDecode:release})
  HTMLImageElement.prototype.decode=async function(){await original.call(this);if(this.src.startsWith('data:image/'))await gate}
 })
 await page.goto('/?perf=1&inputPriority=1')
 const host=page.locator('.canvas-host')
 await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
 await expect.poll(async()=>JSON.parse((await host.getAttribute('data-texture-cache'))!).pendingTextures).toBeGreaterThan(0)
 await page.getByRole('button',{name:'下一页',exact:true}).click()
 await expect(host).toHaveAttribute('data-page-index','1',{timeout:30000})
 await expect(host).toHaveAttribute('data-page-turn','idle')
 const trace=JSON.parse((await host.getAttribute('data-first-motion-trace'))!)
 expect(trace[0].request.pendingTextures).toBeGreaterThan(0)
 expect(trace[0].submit.pendingTextures).toBeGreaterThan(0)
 expect(trace[0].submit.renderProgress).toBeGreaterThan(.002)
 expect(trace[0].submittedFrameCount).toBeGreaterThan(0)
 expect(trace[0].framesBeforeMotion.length).toBeLessThanOrEqual(12)
 expect(trace[0].framesBeforeMotion.every((f:{priorityHeld:boolean})=>f.priorityHeld)).toBe(true)
 if(trace[0].submittedFrameCount<=12)expect(trace[0].framesBeforeMotion.at(-1).effective).toBe(true)
 await page.evaluate(()=>(window as unknown as {releasePageDecode:()=>void}).releasePageDecode())
 await expect.poll(async()=>{const c=JSON.parse((await host.getAttribute('data-texture-cache'))!);return c.pendingTextures+c.decode.active+c.decode.queued+c.warmQueued},{timeout:20000}).toBe(0)
 await expect(host).toHaveAttribute('data-page-index','1')
 await expect(host).toHaveAttribute('data-page-turn','idle')
 expect(errors).toEqual([])
 const cache=JSON.parse((await host.getAttribute('data-texture-cache'))!)
 expect(cache.failedTextures).toBe(0)
 expect(cache.backgroundPaused||cache.decode.backgroundPaused).toBe(false)
 expect(cache.priorityPauses).toBe(cache.priorityResumes)
 await writeFile(info.outputPath('delayed-decode-first-input.json'),JSON.stringify({trace,cache,renderer:await host.getAttribute('data-perf-renderer')},null,2))
})
