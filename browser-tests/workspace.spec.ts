import {choose} from './select-helper'
import {test,expect,type Page} from '@playwright/test'
import {readFile} from 'node:fs/promises'
const json=(config:Record<string,unknown>)=>({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,...config}))})
const input=(page:Page)=>page.locator('input[type=file][accept=".json,application/json"]')
const projectTab=async(page:Page)=>{await page.locator('.left').getByRole('button',{name:'项目',exact:false}).click()}
const ready=async(page:Page)=>{await page.goto('/');await expect(page.locator('main')).toHaveAttribute('aria-busy','false',{timeout:15000});await expect(page.locator('.project')).toContainText('已保存',{timeout:15000});await expect(page.locator('.canvas-host canvas')).toBeVisible({timeout:15000})}
const status=(page:Page)=>page.locator('footer [role=status]')
const host=(page:Page)=>page.locator('.canvas-host')
async function gateFileText(page:Page){await page.addInitScript(()=>{const original=File.prototype.text;const w=window as Window&{releaseImport?:()=>void;importStarted?:boolean};File.prototype.text=async function(){if(this.name==='test.json'){w.importStarted=true;await new Promise<void>(resolve=>{w.releaseImport=resolve})}return original.call(this)}})}
async function release(page:Page){await page.evaluate(()=>{(window as Window&{releaseImport?:()=>void}).releaseImport?.()})}
async function started(page:Page){await expect.poll(()=>page.evaluate(()=>Boolean((window as Window&{importStarted?:boolean}).importStarted))).toBe(true)}
async function png(page:Page){const uri=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=8;const ctx=c.getContext('2d')!;ctx.fillStyle='#53765a';ctx.fillRect(0,0,8,8);return c.toDataURL('image/png')});return Buffer.from(uri.split(',')[1],'base64')}

test('异步 JSON 导入遇到项目切换时不覆盖另一项目',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await gateFileText(page);await ready(page);await projectTab(page)
 await input(page).setInputFiles(json({title:'不应覆盖',width:240}));await started(page)
 await page.getByRole('button',{name:'新建',exact:true}).click();await release(page)
 await expect(status(page)).toContainText('项目已切换');await page.locator('.left').getByRole('button',{name:/模型/}).click();await expect(page.getByRole('spinbutton',{name:'宽度 数值'})).toHaveValue('150')
 await projectTab(page);await page.getByRole('button',{name:'我的书籍',exact:true}).click();await page.locator('.left').getByRole('button',{name:/模型/}).click();await expect(page.getByRole('spinbutton',{name:'宽度 数值'})).toHaveValue('150')
})

test('JSON 导入期间手动编辑不被异步覆盖',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await gateFileText(page);await ready(page)
 await input(page).setInputFiles(json({width:240}));await started(page)
 const width=page.getByRole('spinbutton',{name:'宽度 数值'});await width.fill('180');await width.press('Enter');await release(page)
 await expect(status(page)).toContainText('导入期间项目已修改');await expect(width).toHaveValue('180')
})

test('异步内页导入保留期间删除操作，导出、撤销、重做及刷新一致',async({page},testInfo)=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(()=>{const original=window.createImageBitmap;const w=window as Window&{releaseImport?:()=>void;importStarted?:boolean};window.createImageBitmap=async (...args:Parameters<typeof createImageBitmap>)=>{const source=args[0];if(source instanceof File&&source.name==='02.png'){w.importStarted=true;await new Promise<void>(resolve=>{w.releaseImport=resolve})}return Reflect.apply(original,window,args)}});await ready(page)
 const buffer=await png(page),uri='data:image/png;base64,'+buffer.toString('base64');await input(page).setInputFiles(json({title:'Persisted work',pageCount:4,pageImages:[uri]}));await expect(status(page)).toContainText('项目已导入')
 await page.locator('.left').getByRole('button',{name:/内页/}).click();await expect(page.getByRole('button',{name:'删除内页'})).toHaveCount(1)
 await page.getByLabel('批量内页文件').setInputFiles({name:'02.png',mimeType:'image/png',buffer});await started(page);await page.getByRole('button',{name:'删除内页'}).click();await expect(page.getByRole('button',{name:'删除内页'})).toHaveCount(0);await release(page)
 await expect(status(page)).toContainText('内页已按文件名顺序导入');await expect(page.getByRole('button',{name:'删除内页'})).toHaveCount(1)
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.getByRole('button',{name:'删除内页'})).toHaveCount(0);await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.getByRole('button',{name:'删除内页'})).toHaveCount(1)
 await expect(page.locator('.project')).toContainText('已保存');const pending=page.waitForEvent('download');await page.getByRole('button',{name:/导出项目/}).click();const download=await pending;const path=testInfo.outputPath('export.json');await download.saveAs(path);const exported=JSON.parse(await readFile(path,'utf8'));expect(exported.title).toBe('Persisted work');expect(exported.pageImages).toHaveLength(1);expect(exported.pageImages[0]).toMatch(/^data:image\/(webp|png);base64,/)
 await page.reload();await expect(host(page).locator('canvas')).toBeVisible({timeout:15000});await page.locator('.left').getByRole('button',{name:/内页/}).click();await expect(page.getByRole('button',{name:'删除内页'})).toHaveCount(1)
})

test('相同书籍尺寸的项目切换清理活动翻页与相机视角',async({page})=>{
 await ready(page);await input(page).setInputFiles(json({opening:180,pageCount:40,pageDuration:2}));await expect(status(page)).toContainText('项目已导入');await expect(host(page)).toHaveAttribute('data-page-ready','true',{timeout:15000})
 await projectTab(page);await page.getByRole('button',{name:'复制',exact:true}).click();await expect(host(page)).toHaveAttribute('data-page-index','0');await page.getByRole('button',{name:'我的书籍',exact:true}).click()
 await choose(page.getByRole('combobox',{name:'视口方向'}),'side');await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(host(page)).toHaveAttribute('data-page-turn','active');await page.getByRole('button',{name:'我的书籍 副本',exact:true}).click()
 await expect(host(page)).toHaveAttribute('data-page-index','0');await expect(host(page)).toHaveAttribute('data-page-turn','idle');await expect(page.getByRole('combobox',{name:'视口方向'})).toHaveAttribute('data-value','perspective');await expect(host(page)).toHaveAttribute('data-read-zoom','1.0000')
 await page.getByRole('button',{name:'我的书籍',exact:true}).click();await expect(host(page)).toHaveAttribute('data-page-index','1');await expect(host(page)).toHaveAttribute('data-page-turn','idle')
})


test('多个窗口同时编辑时拒绝过期保存，磁盘仍保留先提交作品',async({page,context})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await ready(page)
 const other=await context.newPage();try{await other.emulateMedia({reducedMotion:'reduce'});await ready(other)
  const width=page.getByRole('spinbutton',{name:'宽度 数值'});await width.fill('180');await width.press('Enter');await expect(page.locator('.project')).toContainText('已保存',{timeout:15000})
  const stale=other.getByRole('spinbutton',{name:'宽度 数值'});await stale.fill('210');await stale.press('Enter');await expect(status(other)).toContainText('其他窗口已保存更新',{timeout:15000});await expect(stale).toHaveValue('210');await expect(other.locator('.project')).toContainText('未保存')
  await other.reload();await expect(other.locator('.canvas-host canvas')).toBeVisible({timeout:15000});await expect(stale).toHaveValue('180');await expect(other.locator('.project')).toContainText('已保存')
 }finally{await other.close()}
})
