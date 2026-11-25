import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'

test('冷启动、真实连续输入、反向与拖动的页码和时间线',async({page},info)=>{
 test.setTimeout(120000)
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram/i.test(m.text()))errors.push(m.text())})
 await page.goto('/?perf=1')
 const host=page.locator('.canvas-host')
 await expect(host.locator('canvas')).toBeVisible()
 await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'interaction.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,pageCount:2000,pageIndex:50,opening:0,pageDuration:.85,paperPhysics:'material',thicknessMode:'automatic'}))})
 await expect(host).toHaveAttribute('data-page-index','50')
 await page.getByRole('button',{name:'打开书籍',exact:true}).click()
 await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
 // No extra wait before the first input. Record real submitted poses via
 // MutationObserver, including the final landed index and every commit.
 await page.evaluate(()=>{
  const el=document.querySelector<HTMLElement>('.canvas-host')!,records:unknown[]=[],events:unknown[]=[]
  const state={records,events,start:performance.now()}
  Object.assign(window,{turnEvidence:state})
  const collect=()=>{const d=el.dataset;records.push({t:performance.now()-state.start,index:Number(d.pageIndex),target:Number(d.pageTarget),progress:Number(d.pageProgress),renderProgress:Number(d.pageRenderProgress),active:Number(d.activeLeaves),chunk:Number(d.chunkLeaves),mode:d.pageTurn})}
  new MutationObserver(collect).observe(el,{attributes:true,attributeFilter:['data-page-index','data-page-progress','data-page-turn']})
  for(const type of ['keydown','pointerdown','pointerup'])document.addEventListener(type,e=>events.push({t:performance.now()-state.start,type,key:(e as KeyboardEvent).key,button:(e as PointerEvent).button}),true)
  collect()
 })
 const next=page.getByRole('button',{name:'下一页',exact:true})
 const idle=async(index:number)=>{await expect(host).toHaveAttribute('data-page-index',String(index),{timeout:45000});await expect(host).toHaveAttribute('data-page-turn','idle')}
 const segments:unknown[]=[]
 const measure=async(label:string,index:number,fn:()=>Promise<unknown>)=>{
  const start=await page.evaluate(()=>performance.now());await fn();await idle(index)
  const state=await page.evaluate(()=>{const d=document.querySelector<HTMLElement>('.canvas-host')!.dataset;return {now:performance.now(),first:JSON.parse(d.firstMotion??'[]'),perf:JSON.parse(d.perf!),cache:JSON.parse(d.textureCache!),resources:JSON.parse(d.renderResources!)}})
  segments.push({label,elapsedMs:state.now-start,...state})
  expect(state.cache.size).toBeLessThanOrEqual(state.cache.capacity);expect(state.cache.estimatedBytes).toBeLessThanOrEqual(state.cache.budgetBytes)
 }
 await measure('first',51,()=>next.click())
 await measure('second',52,()=>next.click())
 // Native mouse down/up, not HTMLElement.click() or synthetic events.
 const box=(await next.boundingBox())!,hardware=process.env.BOOK3D_HARDWARE_GPU==='1',count=hardware?20:8
 await measure('button burst',52+count,async()=>{for(let i=0;i<count;i++){await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.waitForTimeout(75);const now=(await next.boundingBox())!;expect(Math.abs(now.x-box.x)).toBeLessThan(1)}})
 const from=52+count
 await measure('keyboard burst',from+8,async()=>{for(let i=0;i<8;i++){await page.keyboard.press('ArrowRight');await page.waitForTimeout(80)}})
 await measure('reverse',from+6,async()=>{await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);for(let i=0;i<4;i++)await page.keyboard.press('ArrowLeft')})
 const evidence=await page.evaluate(()=>(window as unknown as {turnEvidence:{records:{t:number;index:number;target:number;progress:number;renderProgress:number;active:number;chunk:number;mode:string}[];events:unknown[]}}).turnEvidence)
 const changes=evidence.records.filter((r,i)=>i===0||r.index!==evidence.records[i-1].index)
 expect(changes.slice(1).every((r,i)=>Math.abs(r.index-changes[i].index)===1)).toBe(true)
 expect(evidence.records.every((r,i)=>i===0||r.index===evidence.records[i-1].index||evidence.records[i-1].renderProgress===1)).toBe(true)
 expect(evidence.records.every(r=>r.chunk===0&&r.active<=6&&r.progress>=0&&r.progress<=1)).toBe(true)
 // An ordinary page-surface tap must also be a command; no active regrab
 // is involved in this first tap. Subsequent dragging explicitly cancels.
 const pick=JSON.parse((await host.getAttribute('data-right-pick'))!) as [number,number]
 await measure('page surface tap',from+7,()=>page.mouse.click(...pick))
 const p=JSON.parse((await host.getAttribute('data-right-pick'))!) as [number,number]
 await page.mouse.move(...p);await page.mouse.down();await page.mouse.move(p[0]-90,p[1],{steps:4});await page.mouse.move(p[0]+12,p[1],{steps:4});await page.mouse.up();await idle(from+7)
 const forward=JSON.parse((await host.getAttribute('data-right-pick'))!) as [number,number],bounds=(await host.boundingBox())!
 await page.mouse.move(...forward);await page.mouse.down();await page.mouse.move(forward[0]-bounds.width*.24,forward[1],{steps:8});await page.mouse.up();await idle(from+8)
 const final=await page.evaluate(()=>(window as unknown as {turnEvidence:unknown}).turnEvidence)
 expect(errors).toEqual([])
 await writeFile(info.outputPath('turn-input.json'),JSON.stringify({segments,evidence:final,renderer:await host.getAttribute('data-perf-renderer')},null,2))
})

// Surface clicks exercise pointer capture and the regrab/tap distinction.
// The injected task models an application stall, not a simulated event.
test('连续纸面点击、低帧率恢复及反复阅读资源边界',async({page},info)=>{
 test.setTimeout(120000)
 await page.goto('/?perf=1')
 const host=page.locator('.canvas-host'),errors:string[]=[]
 page.on('pageerror',e=>errors.push(e.message))
 await host.locator('canvas').waitFor()
 await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'surface.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,pageCount:2000,pageIndex:50,opening:0,pageDuration:.85,paperPhysics:'material',thicknessMode:'automatic'}))})
 await expect(host).toHaveAttribute('data-page-index','50')
 await page.getByRole('button',{name:'打开书籍',exact:true}).click()
 await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
 const idle=async(index:number)=>{await expect(host).toHaveAttribute('data-page-index',String(index),{timeout:30000});await expect(host).toHaveAttribute('data-page-turn','idle')}
 const point=JSON.parse((await host.getAttribute('data-right-pick'))!) as [number,number]
 const clickCount=6
 for(let i=0;i<clickCount;i++){await page.mouse.click(...point);await page.waitForTimeout(95)}
 await idle(50+clickCount)
 await page.keyboard.press('ArrowRight')
 await page.waitForTimeout(80)
 await page.evaluate(()=>{const start=performance.now();while(performance.now()-start<150){/* deliberate test stall */}})
 await page.keyboard.press('ArrowRight')
 await idle(58)
 const checkpoints=[]
 const cycles=process.env.BOOK3D_HARDWARE_GPU==='1'?3:1
 const count=process.env.BOOK3D_HARDWARE_GPU==='1'?20:8
 for(let j=0;j<cycles;j++){
  for(const [key,target] of [['ArrowRight',58+count],['ArrowLeft',58]] as const){
   for(let i=0;i<count;i++){await page.keyboard.press(key);await page.waitForTimeout(70)}
   await idle(target)
  }
  const data=await host.evaluate(el=>{const d=(el as HTMLElement).dataset;return {cache:JSON.parse(d.textureCache!),resources:JSON.parse(d.renderResources!),perf:JSON.parse(d.perf!),firstMotion:JSON.parse(d.firstMotion??'[]')}})
  expect(data.cache.size).toBeLessThanOrEqual(data.cache.capacity);expect(data.cache.estimatedBytes).toBeLessThanOrEqual(data.cache.budgetBytes)
  expect(data.cache.slots).toBeLessThanOrEqual(6);checkpoints.push(data)
 }
 expect(Number(await host.getAttribute('data-peak-chunk-leaves'))).toBe(0)
 expect(errors).toEqual([])
 await writeFile(info.outputPath('surface-input-stress.json'),JSON.stringify({cycles,count,checkpoints},null,2))
})

test('直接打开阅读项目的代表性材质准备不改变纸页状态',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('book3d.config',JSON.stringify({version:1,pageCount:80,pageIndex:10,opening:180,paperPhysics:'material',thicknessMode:'automatic'})))
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram/i.test(m.text()))errors.push(m.text())})
 await page.goto('/?perf=1')
 const host=page.locator('.canvas-host')
 await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
 await expect(host).toHaveAttribute('data-reading-warm','submitted',{timeout:15000})
 await expect(host).toHaveAttribute('data-page-index','10')
 await expect(host).toHaveAttribute('data-page-turn','idle')
 await page.getByRole('button',{name:'下一页',exact:true}).click()
 await expect(host).toHaveAttribute('data-page-index','11',{timeout:30000})
 await expect(host).toHaveAttribute('data-page-turn','idle')
 expect(errors).toEqual([])
})
