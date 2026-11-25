import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'

test('首次纸叶绘制分解及匹配阴影变体预热对照',async({browser},info)=>{
 test.setTimeout(180000)
 const results=[],images:Record<number,string[]>={}
 const stock=process.env.BOOK3D_STOCK_DEPTH_BENCH==='1'
 const rounds=process.env.BOOK3D_DRAW_BENCH==='1'?3:1
 for(let round=0;round<rounds;round++)for(const matched of round%2?[true,false]:[false,true]){
  const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',viewport:{width:1280,height:800}})
  try{
   const page=await context.newPage(),errors:string[]=[]
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error/i.test(m.text()))errors.push(m.text())})
   await page.addInitScript(()=>{
    localStorage.setItem('book3d.config',JSON.stringify({version:1,pageCount:80,pageIndex:10,opening:180,pageDuration:.85,paperPhysics:'material',thicknessMode:'automatic'}))
    // Test-only WebGL call accounting. These durations are nested within
    // renderer timings and do not measure GPU completion.
    const calls:Record<string,{n:number;ms:number}>={}
    let enabled=false
    Object.assign(window,{drawCalls:calls,startDrawCalls:()=>{enabled=true},stopDrawCalls:()=>{enabled=false}})
    const proto=WebGL2RenderingContext.prototype as any
    for(const name of ['compileShader','linkProgram','getProgramParameter','getActiveUniform','getActiveAttrib','bufferData','bufferSubData','texImage2D','texSubImage2D','texStorage2D','generateMipmap','drawElements','drawArrays']){
     const original=proto[name];if(typeof original!=='function')continue
     proto[name]=function(...args:unknown[]){if(!enabled)return original.apply(this,args);const start=performance.now();try{return original.apply(this,args)}finally{const c=calls[name]??={n:0,ms:0};c.n++;c.ms+=performance.now()-start}}
    }
   })
   await page.goto('/?perf=1&drawAudit=1'+(stock?(matched?'&stockDepthWarm=1':''):(matched?'':'&depthWarm=0')))
   const host=page.locator('.canvas-host')
   await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
   await expect(host).toHaveAttribute('data-reading-warm','submitted',{timeout:30000})
   await expect(host).toHaveAttribute('data-depth-warm',stock||matched?'matched-submitted':'legacy-submitted')
   const warmMs=Number(await host.getAttribute('data-reading-warm-ms')),stockVariants=Number(await host.getAttribute('data-stock-depth-warm'))
   if(stock&&matched)expect(stockVariants).toBeGreaterThan(0)
   await page.evaluate(()=>{const h=document.querySelector<HTMLElement>('.canvas-host')!;const trace:unknown[]=[];Object.assign(window,{auditTimeline:trace});const collect=()=>{const d=h.dataset;trace.push({index:Number(d.pageIndex),render:Number(d.pageRenderProgress),active:Number(d.activeLeaves),chunk:Number(d.chunkLeaves)});if(d.firstMotionTrace)(window as any).stopDrawCalls()};new MutationObserver(collect).observe(h,{attributes:true,attributeFilter:['data-page-index','data-page-progress','data-first-motion-trace']});collect();(window as any).startDrawCalls()})
   const start=await page.evaluate(()=>performance.now())
   await page.getByRole('button',{name:'下一页',exact:true}).click()
   await expect(host).toHaveAttribute('data-page-index','11',{timeout:30000})
   await expect(host).toHaveAttribute('data-page-turn','idle')
   const result=await page.evaluate(()=>{const h=document.querySelector<HTMLElement>('.canvas-host')!,d=h.dataset;return {at:performance.now(),trace:JSON.parse(d.firstMotionTrace!),timeline:(window as any).auditTimeline as {index:number;render:number;active:number;chunk:number}[],calls:(window as any).drawCalls,resources:JSON.parse(d.renderResources!),renderer:d.perfRenderer}})
   const t=result.trace[0]
   expect(t.framesBeforeMotion.length).toBeGreaterThan(0)
   expect(t.framesBeforeMotion.every((f:any)=>f.drawBreakdown&&f.drawBreakdown.shadowMs>=0)).toBe(true)
   expect(t.framesBeforeMotion.some((f:any)=>f.drawBreakdown.groups['shadow:leaf']?.calls>0)).toBe(true)
   expect(t.framesBeforeMotion.some((f:any)=>f.drawBreakdown.groups['color:leaf']?.calls>0)).toBe(true)
   expect(result.timeline.every((f,i)=>f.chunk===0&&(i===0||f.index===result.timeline[i-1].index||result.timeline[i-1].render===1))).toBe(true)
   expect(errors).toEqual([])
   if(matched)expect(t.framesBeforeMotion.reduce((sum:number,f:any)=>sum+(f.drawBreakdown.groups['shadow:leaf']?.newPrograms??0),0)).toBe(0)
   await page.mouse.move(3,3);await page.waitForTimeout(400)
   const png=await host.locator('canvas').screenshot({path:info.outputPath(round+'-'+matched+'.png')})
   ;(images[round]??=[]).push(png.toString('base64'))
   results.push({round,matched,stock,stockVariants,warmMs,firstMs:result.at-start,...result})
  }finally{await context.close()}
 }
 const page=await browser.newPage()
 let pixels
 try{
  await page.goto('http://127.0.0.1:4173/')
  pixels=await page.evaluate(async groups=>{
   const read=async(src:string)=>{const im=new Image();im.src='data:image/png;base64,'+src;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d')!;g.drawImage(im,0,0);return {width:c.width,height:c.height,data:g.getImageData(0,0,c.width,c.height).data}}
   const out=[]
   for(const [round,[one,two]] of Object.entries(groups)){
    const a=await read(one),b=await read(two);if(a.width!==b.width||a.height!==b.height)throw Error('size mismatch')
    let sum=0,max=0,changed=0
    for(let i=0;i<a.data.length;i++){const d=Math.abs(a.data[i]-b.data[i]);sum+=d;max=Math.max(max,d);if(d)changed++}
    out.push({round,width:a.width,height:a.height,mean:sum/a.data.length,max,changed})
   }
   return out
  },images)
 }finally{await page.close()}
 for(const p of pixels)expect(p.mean).toBeLessThan(.25)
 await writeFile(info.outputPath('draw-audit.json'),JSON.stringify({results,pixels},null,2))
})
