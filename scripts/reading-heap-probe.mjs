// Run against a dev or production URL. CDP counts include detached native
// nodes, not only nodes connected to the application DOM.
import {chromium} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
const urls=process.argv.slice(2);if(!urls.length)throw Error('Usage: node scripts/reading-heap-probe.mjs URL [URL...]')
const browser=await chromium.launch({...(process.env.BOOK3D_CHROMIUM_EXECUTABLE?{executablePath:process.env.BOOK3D_CHROMIUM_EXECUTABLE}:{}),args:process.env.BOOK3D_HARDWARE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const results=[]
try{
 const fixture=await browser.newPage()
 await fixture.goto(urls[0])
 const config=await fixture.evaluate(()=>({version:1,width:150,height:220,pageCount:24,pageIndex:1,opening:180,pageDuration:.85,paperPhysics:'material',thicknessMode:'automatic',pageBleed:.1,pageImages:Array.from({length:24},(_,i)=>{const c=document.createElement('canvas');c.width=2048;c.height=3072;const g=c.getContext('2d');g.fillStyle='hsl('+i*15+' 60% 75%)';g.fillRect(0,0,c.width,c.height);g.fillStyle='white';g.font='160px Georgia';g.fillText('PAGE '+(i+1),120,300);return c.toDataURL('image/jpeg',.9)})}))
 await fixture.close()
 for(const url of urls){
  const context=await browser.newContext({viewport:{width:1280,height:800}})
  try{
   const page=await context.newPage(),errors=[]
   page.on('pageerror',e=>errors.push(e.message))
   await page.addInitScript(c=>localStorage.setItem('book3d.config',JSON.stringify(c)),config)
   const target=new URL(url);target.searchParams.set('perf','1');await page.goto(target.href)
   await page.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageReady==='true',{},{timeout:30000})
   const cdp=await context.newCDPSession(page)
   const checkpoint=async(inspectDetached=false)=>{
    await page.waitForFunction(()=>{const c=JSON.parse(document.querySelector('.canvas-host').dataset.textureCache);return c.pendingTextures+c.decode.active+c.decode.queued+c.warmQueued===0},{},{timeout:20000})
    await cdp.send('HeapProfiler.collectGarbage');await page.waitForTimeout(100);await cdp.send('HeapProfiler.collectGarbage')
    const heap=await cdp.send('Runtime.getHeapUsage'),dom=await cdp.send('Memory.getDOMCounters')
    let detached
    try{
     if(inspectDetached){const result=await cdp.send('DOM.getDetachedDomNodes')
     const byName={};for(const item of result.detachedNodes??[]){const name=item.treeNode.nodeName;byName[name]=(byName[name]??0)+1}
     detached={trees:result.detachedNodes?.length??0,byName}}
    }catch(e){detached={unavailable:String(e)}}
    const data=await page.evaluate(()=>{const d=document.querySelector('.canvas-host').dataset;return {connected:document.querySelectorAll('*').length,cache:JSON.parse(d.textureCache),resources:JSON.parse(d.renderResources)}})
    return {heap,dom,detached,...data}
   }
   const checkpoints=[await checkpoint()]
   for(let cycle=0;cycle<3;cycle++){
    for(const [key,target] of [['ArrowRight',11],['ArrowLeft',1]]){
     for(let i=0;i<10;i++){await page.keyboard.press(key);await page.waitForTimeout(80)}
     await page.waitForFunction(n=>{const d=document.querySelector('.canvas-host').dataset;return Number(d.pageIndex)===n&&d.pageTurn==='idle'},target,{timeout:30000})
    }
    checkpoints.push(await checkpoint(cycle===2))
   }
   results.push({url,errors,checkpoints})
  }finally{await context.close()}
 }
}finally{await browser.close()}
await writeFile(process.env.BOOK3D_HEAP_OUT??'/tmp/book3d-reading-heap.json',JSON.stringify(results,null,2))
console.log(JSON.stringify(results.map(x=>({url:x.url,errors:x.errors,checkpoints:x.checkpoints.map(c=>({heap:c.heap.usedSize,dom:c.dom,detached:c.detached,connected:c.connected,resources:c.resources}))})),null,2))
