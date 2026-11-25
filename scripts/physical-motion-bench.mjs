// Same hardware, same browser, same actions. Run with an isolated baseline
// checkout and candidate checkout, each with its own node_modules.
import {chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import {writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
const [baseline,candidate,output,port='4191']=process.argv.slice(2)
if(!baseline||!candidate||!output)throw Error('usage: node scripts/physical-motion-bench.mjs BASELINE CANDIDATE OUTPUT [PORT]')
const url='http://127.0.0.1:'+port
const percentile=(values,q)=>{const s=values.slice().sort((a,b)=>a-b);return s.length?s[Math.floor((s.length-1)*q)]:null}
async function run(root,label){
 try{const r=await fetch(url);if(r)throw Error('Benchmark port is already in use: '+port)}catch(e){if(e.message.startsWith('Benchmark port'))throw e}
 const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',port,'--strictPort'],{cwd:root,stdio:['ignore','ignore','inherit']})
 let browser
 try{
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(url)).ok){ready=true;break}}catch{}if(server.exitCode!==null)throw Error('Vite exited');await delay(250)}if(!ready)throw Error('Vite unavailable')
  browser=await chromium.launch({executablePath:process.env.BOOK3D_CHROMIUM_EXECUTABLE,args:process.env.BOOK3D_HARDWARE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
  const page=await browser.newPage({viewport:{width:1280,height:800}}),host=page.locator('.canvas-host')
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url+'/?perf=1'+(process.env.BOOK3D_BENCH_PICK==='1'?'&pick=1':''));await host.locator('canvas').waitFor()
  await page.getByRole('button',{name:'打开书籍',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageReady==='true',{},{timeout:25000})
  const cdp=await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]))
  const before=await metrics(),gc=[]
  cdp.on('Tracing.dataCollected',({value})=>{for(const e of value)if(['MinorGC','MajorGC'].includes(e.name)&&e.ph==='X'&&Number.isFinite(e.dur))gc.push({name:e.name,durationMs:e.dur/1000})})
  await cdp.send('Tracing.start',{categories:'devtools.timeline,v8',transferMode:'ReportEvents'})
  await page.evaluate(()=>{
   const host=document.querySelector('.canvas-host'),p={gaps:[],boundaryGaps:[],progressDeltas:[],done:false,last:0,index:null,progress:0,active:false}
   window.__bookMotionProbe=p
   const tick=now=>{if(p.done)return;const active=host.dataset.pageTurn==='active',index=host.dataset.pageIndex,progress=Number(host.dataset.pageProgress)
    if(p.last&&(active||p.active)&&active!==p.active)p.boundaryGaps.push(now-p.last);if(active&&p.active){p.gaps.push(now-p.last);if(index===p.index)p.progressDeltas.push(Math.abs(progress-p.progress))}
    Object.assign(p,{last:now,index,progress,active});requestAnimationFrame(tick)}
   requestAnimationFrame(tick)
  })
  const settled=async index=>page.waitForFunction(n=>{const h=document.querySelector('.canvas-host');return h.dataset.pageIndex===String(n)&&h.dataset.pageTurn==='idle'},index,{timeout:25000})
  const point=JSON.parse(await host.getAttribute('data-right-pick')),box=await host.boundingBox()
  await page.mouse.move(...point);await page.mouse.down();await page.mouse.move(point[0]-box.width*.23,point[1],{steps:16})
  await page.waitForFunction(()=>Number(document.querySelector('.canvas-host').dataset.pageProgress)>.2)
  const releaseStarted=Date.now();await page.mouse.up();await settled(1);const releaseMs=Date.now()-releaseStarted
  const next=page.locator('.viewport-bottom').getByRole('button',{name:'下一页',exact:true}),prev=page.locator('.viewport-bottom').getByRole('button',{name:'上一页',exact:true})
  for(let i=2;i<=5;i++){await next.click();await settled(i)}
  for(let i=4;i>=1;i--){await prev.click();await settled(i)}
  await next.click();await next.click();await prev.click();await settled(2)
  const observed=await page.evaluate(()=>{const p=window.__bookMotionProbe;p.done=true;return p})
  const after=await metrics()
  const traceDone=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');await Promise.race([traceDone,delay(5000).then(()=>{throw Error('Trace timeout')})])
  const perf=JSON.parse(await host.getAttribute('data-perf'))
  const gaps=observed.gaps,progress=observed.progressDeltas
  if(errors.length)throw Error(errors.join('\n'))
  return {label,pickDiagnostic:process.env.BOOK3D_BENCH_PICK==='1',boundaryFrameGap:{n:observed.boundaryGaps.length,p99:percentile(observed.boundaryGaps,.99),max:Math.max(0,...observed.boundaryGaps)},renderer:await host.getAttribute('data-perf-renderer'),releaseMs,activeFrames:gaps.length,activeFrameGap:{p95:percentile(gaps,.95),p99:percentile(gaps,.99),over33ms:gaps.filter(x=>x>33.4).length},sameLeafProgressDelta:{p95:percentile(progress,.95),max:Math.max(0,...progress)},gc:{events:gc.length,durationMs:gc.reduce((s,e)=>s+e.durationMs,0),maxMs:Math.max(0,...gc.map(e=>e.durationMs))},heapUsedBytes:{before:before.JSHeapUsedSize,after:after.JSHeapUsedSize},perf}
 }finally{await browser?.close();server.kill();await new Promise(r=>{if(server.exitCode!==null||server.signalCode!==null)r();else server.once('exit',r)})}
}
await mkdir(resolve(output,'..'),{recursive:true})
const results=[]
for(const [label,root] of [['baseline',baseline],['candidate',candidate]].filter(([,root])=>root!=='-')){const r=await run(resolve(root),label);results.push(r);await writeFile(output,JSON.stringify(results,null,2));console.log(JSON.stringify(r))}
