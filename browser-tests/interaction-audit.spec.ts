import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'

test('多纸叶反向取消必须先提交全部零端点',async({page},info)=>{
 test.setTimeout(90000)
 await page.addInitScript(()=>localStorage.setItem('book3d.config',JSON.stringify({version:1,pageCount:80,pageIndex:10,opening:180,pageDuration:2,paperPhysics:'material',thicknessMode:'automatic'})))
 await page.goto('/?perf=1')
 const host=page.locator('.canvas-host')
 await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
 await page.evaluate(()=>{
  const h=document.querySelector<HTMLElement>('.canvas-host')!,frames:unknown[]=[]
  Object.assign(window,{auditFrames:frames})
  const collect=()=>{const d=h.dataset;frames.push({index:Number(d.pageIndex),target:Number(d.pageTarget),mode:d.pageTurn,leaves:JSON.parse(d.activeEndpoints??'[]')})}
  new MutationObserver(collect).observe(h,{attributes:true,attributeFilter:['data-active-endpoints','data-page-index','data-page-turn']});collect()
 })
 // Deterministic same-task burst, followed by real browser frame progression.
 const commands=async(key:string,n:number)=>page.evaluate(({key,n})=>{for(let i=0;i<n;i++)window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}))},{key,n})
 await commands('ArrowRight',4)
 await expect.poll(async()=>Number(await host.getAttribute('data-active-leaves')),{timeout:30000}).toBeGreaterThanOrEqual(2)
 await expect(host).toHaveAttribute('data-page-index','10')
 await commands('ArrowLeft',4)
 await expect(host).toHaveAttribute('data-page-target','10')
 await expect(host).toHaveAttribute('data-page-turn','idle',{timeout:30000})
 await expect(host).toHaveAttribute('data-page-index','10')
 const frames=await page.evaluate(()=>(window as any).auditFrames as {index:number;mode:string;leaves:{progress:number;renderProgress:number;curlAmount:number}[]}[])
 expect(frames.some(f=>f.leaves.length>=2)).toBe(true)
 const lastActive=frames.filter(f=>f.mode==='active').at(-1)!
 expect(lastActive.leaves.length).toBeGreaterThan(0)
 expect(lastActive.leaves.every(t=>t.progress===0&&t.renderProgress===0&&t.curlAmount===0)).toBe(true)
 expect(frames.every(f=>f.index===10)).toBe(true)
 // When a tail disappears, its prior submitted frame must also be at
 // the exact cancellation endpoint, not merely within a tolerance.
 const removals=[]
 for(let i=1;i<frames.length;i++)if(frames[i].leaves.length<frames[i-1].leaves.length){
  const removed=frames[i-1].leaves.slice(frames[i].leaves.length)
  expect(removed.every(t=>t.progress===0&&t.renderProgress===0&&t.curlAmount===0)).toBe(true)
  removals.push(...removed)
 }
 expect(removals.length).toBeGreaterThanOrEqual(2)
 await page.getByRole('button',{name:'下一页',exact:true}).click()
 await expect(host).toHaveAttribute('data-page-index','11',{timeout:30000})
 await expect(host).toHaveAttribute('data-page-turn','idle')
 await writeFile(info.outputPath('cancel-endpoints.json'),JSON.stringify({frames,lastActive,removals,index:11},null,2))
})

test('触控拖动中重置视角和修改模型后可以继续翻页',async({browser},info)=>{
 test.setTimeout(120000)
 const context=await browser.newContext({hasTouch:true,viewport:{width:1280,height:800}})
 try{
  const page=await context.newPage(),errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>localStorage.setItem('book3d.config',JSON.stringify({version:1,pageCount:80,pageIndex:10,opening:180,pageDuration:.85,paperPhysics:'material',thicknessMode:'automatic'})))
  await page.goto('http://127.0.0.1:4173/?perf=1')
  const host=page.locator('.canvas-host'),cdp=await context.newCDPSession(page)
  await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
  const startDrag=async()=>{
   const [x,y]=JSON.parse((await host.getAttribute('data-right-pick'))!) as [number,number]
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]})
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-90,y,id:1}]})
   await expect(host).toHaveAttribute('data-touch-mode','page')
   await expect(host).toHaveAttribute('data-page-turn','active')
  }
  const finish=async(index:number)=>{
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
   await expect(host).toHaveAttribute('data-touch-mode','idle')
   await expect(host).toHaveAttribute('data-page-turn','idle',{timeout:30000})
   await expect(host).toHaveAttribute('data-page-index',String(index))
   await page.getByRole('button',{name:'下一页',exact:true}).click()
   await expect(host).toHaveAttribute('data-page-index',String(index+1),{timeout:30000})
   await expect(host).toHaveAttribute('data-page-turn','idle')
  }
  await startDrag()
  const reset=page.getByRole('button',{name:'重置视角',exact:true});await reset.focus();await page.keyboard.press('Enter')
  await finish(10)
  await startDrag()
  // Height changes rebuild the model; thickness changes only update its
  // existing geometry and used to clear the touch owner without ending drag.
  const thickness=page.getByRole('spinbutton',{name:'单张纸厚度 数值'})
  await thickness.fill('0.13');await thickness.press('Enter')
  await finish(11)
  expect(errors).toEqual([])
  await writeFile(info.outputPath('interrupted-touch.json'),JSON.stringify({reset:10,afterReset:11,edit:11,afterEdit:12,errors},null,2))
 }finally{await context.close()}
})
