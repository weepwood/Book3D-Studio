import {test,expect} from '@playwright/test'
import {readFile,writeFile} from 'node:fs/promises'

test('本机渲染质量切换、动画期间延迟应用、项目及导出隔离',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{if(!localStorage.getItem('book3d.config'))localStorage.setItem('book3d.config',JSON.stringify({version:1,pageCount:80,pageIndex:10,opening:180,pageDuration:2,paperPhysics:'material',thicknessMode:'automatic'}))})
 await page.goto('/?perf=1&renderProfile=full')
 const host=page.locator('.canvas-host'),canvas=host.locator('canvas')
 await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
 const initial=await canvas.evaluate((c:HTMLCanvasElement)=>({w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight}))
 await page.locator('.left').getByRole('button',{name:/场景/}).click()
 const select=page.getByRole('combobox',{name:'渲染质量'})
 await select.click();await page.getByRole('option',{name:'均衡 · 75%'}).click()
 await expect(host).toHaveAttribute('data-render-profile-pending','false')
 await expect.poll(()=>canvas.evaluate((c:HTMLCanvasElement)=>c.width)).toBe(Math.floor(initial.cw*.75))
 await page.getByRole('button',{name:'下一页',exact:true}).click()
 await expect(host).toHaveAttribute('data-page-turn','active')
 // Actual select UI while a page is moving. Record backing sizes until landing.
 await page.evaluate(()=>{const h=document.querySelector<HTMLElement>('.canvas-host')!,frames:unknown[]=[];Object.assign(window,{profileFrames:frames});new MutationObserver(()=>{const c=h.querySelector('canvas')!;frames.push({turn:h.dataset.pageTurn,index:h.dataset.pageIndex,width:c.width,pending:h.dataset.renderProfilePending})}).observe(h,{attributes:true,attributeFilter:['data-page-progress','data-page-index','data-render-profile-pending']})})
 await select.click();await page.getByRole('option',{name:'经济 · 50%'}).click()
 await expect(host).toHaveAttribute('data-page-index','11',{timeout:45000})
 await expect(host).toHaveAttribute('data-page-turn','idle')
 await expect(host).toHaveAttribute('data-render-profile-pending','false')
 const frames=await page.evaluate(()=>(window as any).profileFrames as {turn:string;index:string;width:number;pending:string}[])
 expect(frames.some(f=>f.turn==='active'&&f.pending==='true')).toBe(true)
 expect(frames.filter(f=>f.turn==='active').every(f=>f.width===Math.floor(initial.cw*.75))).toBe(true)
 expect(await canvas.evaluate((c:HTMLCanvasElement)=>c.width)).toBe(Math.floor(initial.cw*.5))
 const [project]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:/导出项目/}).click()])
 const file=info.outputPath('project.json');await project.saveAs(file)
 const config=JSON.parse(await readFile(file,'utf8'));expect(config.pageIndex).toBe(11);expect(config).not.toHaveProperty('renderProfile')
 const [png]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'保存 PNG'}).click()])
 const pngFile=info.outputPath('profile.png');await png.saveAs(pngFile);const bytes=await readFile(pngFile)
 expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual([initial.cw,initial.ch])
 expect(await canvas.evaluate((c:HTMLCanvasElement)=>c.width)).toBe(Math.floor(initial.cw*.5))
 await expect(page.locator('header .project')).toContainText('已保存')
 await page.reload();await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
 await expect(host).toHaveAttribute('data-render-profile','2');await expect(host).toHaveAttribute('data-page-index','11')
 expect(await page.evaluate(()=>localStorage.getItem('book3d.renderProfile'))).toBe('economy')
 expect(errors).toEqual([])
 await writeFile(info.outputPath('profile-ui.json'),JSON.stringify({initial,frames,profile:'economy',index:11,exportSize:[initial.cw,initial.ch]},null,2))
})

test('Blob位图解码与现有图片解码的真实像素对照及损坏素材释放',async({page},info)=>{
 await page.goto('/')
 const evidence=await page.evaluate(async()=>{
  const mod='/src/core/pageDecode.ts',{decodePageBitmap,decodePageImage}=await import(mod)
  const results=[]
  for(const mime of ['image/png','image/jpeg','image/webp'])for(const size of [[120,160],[2048,3072]]){
   const c=document.createElement('canvas');c.width=size[0];c.height=size[1];const g=c.getContext('2d')!
   g.fillStyle='rgba(200,45,100,.5)';g.fillRect(0,0,c.width/2,c.height);g.fillStyle='#55aadd';g.fillRect(c.width/2,0,c.width/2,c.height)
   const url=c.toDataURL(mime,.9)
   const decode=async(fn:typeof decodePageImage)=>{const start=performance.now(),d=await fn(url,384,512);try{const out=document.createElement('canvas');out.width=384;out.height=512;const ctx=out.getContext('2d')!;ctx.drawImage(d.source,0,0,384,512);return {pixels:ctx.getImageData(0,0,384,512).data,width:d.width,height:d.height,ms:performance.now()-start,bytes:d.retainedBytes??0}}finally{d.close?.()}}
   const a=await decode(decodePageImage),b=await decode(decodePageBitmap)
   let total=0,max=0;for(let i=0;i<a.pixels.length;i++){const v=Math.abs(a.pixels[i]-b.pixels[i]);total+=v;max=Math.max(max,v)}
   results.push({mime,size,mean:total/a.pixels.length,max,dimensions:[a.width,a.height,b.width,b.height],imageMs:a.ms,bitmapMs:b.ms,bitmapBytes:b.bytes})
  }
  const rejected=[]
  for(const fn of [decodePageImage,decodePageBitmap]){try{const d=await fn('data:image/png;base64,AAAA',384,512);d.close?.();rejected.push(false)}catch{rejected.push(true)}}
  return {results,rejected}
 })
 expect(evidence.rejected).toEqual([true,true])
 for(const r of evidence.results){expect(r.dimensions).toEqual([...r.size,...r.size]);expect(r.mean).toBeLessThan(.5)}
 await writeFile(info.outputPath('decode-comparison.json'),JSON.stringify(evidence,null,2))
})

test('不同指针的取消通知不会打断实际鼠标翻页',async({page},info)=>{
 await page.addInitScript(()=>localStorage.setItem('book3d.config',JSON.stringify({version:1,pageCount:80,pageIndex:10,opening:180,pageDuration:1.2,paperPhysics:'material',thicknessMode:'automatic'})))
 await page.goto('/?perf=1')
 const host=page.locator('.canvas-host')
 await expect(host).toHaveAttribute('data-page-ready','true',{timeout:30000})
 const p=JSON.parse((await host.getAttribute('data-right-pick'))!) as [number,number],b=(await host.boundingBox())!
 await page.mouse.move(...p);await page.mouse.down();await page.mouse.move(p[0]-b.width*.12,p[1],{steps:5})
 await expect(host).toHaveAttribute('data-drag-accepted','new')
 // Synthetic unrelated pointer cancellation, while the actual mouse remains
 // captured. This is a handler-isolation test, not a native pen-device claim.
 await host.dispatchEvent('pointercancel',{pointerId:999,pointerType:'pen',isPrimary:true,bubbles:true})
 await page.mouse.move(p[0]-b.width*.26,p[1],{steps:8});await page.mouse.up()
 await expect(host).toHaveAttribute('data-page-index','11',{timeout:30000})
 await expect(host).toHaveAttribute('data-page-turn','idle')
 // Another native click after release proves the owner was cleared.
 await page.getByRole('button',{name:'下一页',exact:true}).click()
 await expect(host).toHaveAttribute('data-page-index','12',{timeout:30000})
 await expect(host).toHaveAttribute('data-page-turn','idle')
 await writeFile(info.outputPath('pointer-owner.json'),JSON.stringify({initial:10,afterDrag:11,afterClick:12},null,2))
})
