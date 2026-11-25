import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
test('材料模式窄幅厚书正反向厚块扫掠、实际网格和重抓',async({page},info)=>{
 test.setTimeout(120000)
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram/i.test(m.text()))errors.push(m.text())})
 await page.goto('/?surface=1&meshCollision=5&handoff=1'+(process.env.BOOK3D_SLIP==='0'?'&slip=0':'')+(process.env.BOOK3D_ELASTIC==='1'?'&elastic=1':'')+(process.env.BOOK3D_LAYERS==='1'?'&layers=1':'')+(process.env.BOOK3D_ENVELOPE==='1'?'&contactEnvelope=1':''));const host=page.locator('.canvas-host');await expect(host.locator('canvas')).toBeVisible({timeout:15000})
 await host.evaluate(el=>{const reports:unknown[]=[];Object.assign(window,{materialSweeps:reports});new MutationObserver(()=>{const s=el.getAttribute('data-swept-collision');if(s&&reports.length<256)reports.push(JSON.parse(s))}).observe(el,{attributes:true,attributeFilter:['data-swept-collision']})})
 await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'thick-material.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,thicknessMode:'automatic',paperPhysics:'material',width:90,height:320,paperThickness:.25,paperGrammage:220,paperModulus:4.5,pageCount:400,pageIndex:0,opening:0,pageDuration:.5}))})
 await expect(page.getByTestId('physical-thickness')).toContainText('55.00 mm')
 await page.getByRole('button',{name:'打开书籍',exact:true}).click();await expect(host).toHaveAttribute('data-page-ready','true',{timeout:25000})
 await page.locator('.left').getByRole('button',{name:/内页/}).click();const jump=page.getByRole('spinbutton',{name:'目标跨页 数值'})
 for(const index of [1,80,20]){await jump.fill(String(index));await jump.press('Enter');await expect(host).toHaveAttribute('data-page-index',String(index),{timeout:30000});await expect(host).toHaveAttribute('data-page-turn','idle')}
 await jump.fill('100');await jump.press('Enter')
 const point=await page.waitForFunction(()=>{const d=document.querySelector<HTMLElement>('.canvas-host')?.dataset;return d&&Number(d.chunkLeaves)>6&&d.activePick&&Number(d.pageProgress)>.12&&Number(d.pageProgress)<.72?JSON.parse(d.activePick):null},{},{timeout:20000});await page.mouse.move(...await point.jsonValue() as [number,number]);await page.mouse.down();await expect(host).toHaveAttribute('data-drag-accepted','regrab');await page.screenshot({path:info.outputPath('material-regrab.png')});await host.dispatchEvent('pointercancel',{pointerType:'mouse',pointerId:1,isPrimary:true});await page.mouse.up();await expect(host).toHaveAttribute('data-page-turn','idle',{timeout:30000});await expect(host).toHaveAttribute('data-page-index','20')
 const reports=await page.evaluate(()=>(window as unknown as {materialSweeps:{reset:boolean;pairs:{a:string;b:string;tested:number;hits:number;uncertain:number;support:number;touch:number;complete:boolean}[]}[]}).materialSweeps)
 const pairs=reports.flatMap(r=>r.pairs);expect(pairs.some(p=>p.a==='chunk'||p.b==='chunk')).toBe(true);expect(pairs.every(p=>p.tested<=64&&p.hits+p.uncertain+p.support+p.touch<=p.tested)).toBe(true)
 const chunkHandoff=JSON.parse((await host.getAttribute('data-chunk-handoff-quality'))!);expect(chunkHandoff.commits).toBeGreaterThanOrEqual(2);expect(chunkHandoff.cancels).toBeGreaterThanOrEqual(1);expect(chunkHandoff.maxMm).toBeLessThan(.01);expect(chunkHandoff.invalid).toBe(0)
 const surface=JSON.parse((await host.getAttribute('data-surface-quality'))!);expect(surface.chunk.samples).toBeGreaterThan(0);expect(surface.leaf.invalid+surface.chunk.invalid+surface.handoff.invalid).toBe(0);expect(errors).toEqual([])
 await writeFile(info.outputPath('material-contact.json'),JSON.stringify({reports,surface,chunkHandoff},null,2));await page.screenshot({path:info.outputPath('material-contact-settled.png')})
})
