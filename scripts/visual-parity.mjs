import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
const dir='visual-parity'
await mkdir(dir,{recursive:true})
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const viewport={width:1280,height:900}
const results=[]
const captures=[]
async function record(label,fn){try{await fn();results.push({label,status:'captured'})}catch(e){results.push({label,status:'unverified',error:String(e).slice(0,500)})}}
async function shot(page,name){await page.screenshot({path:dir+'/'+name+'.png'});captures.push(name)}
const local=await browser.newPage({viewport})
const localErrors=[];local.on('pageerror',e=>localErrors.push(e.message));local.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram|GL_INVALID|VALIDATE_STATUS/i.test(m.text()))localErrors.push(m.text().slice(0,2000))})
await record('local closed/open/turn',async()=>{
 await local.goto(process.env.LOCAL_URL||'http://127.0.0.1:4173/')
 await local.locator('.canvas-host canvas').waitFor()
 await shot(local,'local-closed')
 await local.getByRole('button',{name:'打开书籍',exact:true}).click()
 await local.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageReady==='true')
 await local.waitForTimeout(900);await shot(local,'local-open')
 await local.getByRole('button',{name:'下一页',exact:true}).click()
 await local.waitForFunction(()=>Number(document.querySelector('.canvas-host')?.dataset.pageProgress)>.25,{},{timeout:30000})
 await shot(local,'local-turn')
 await local.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageIndex==='1',{},{timeout:60000})
 await local.getByRole('button',{name:'下一页',exact:true}).evaluate(b=>{b.click();b.click()})
 await local.waitForFunction(()=>document.querySelector('.canvas-host')?.dataset.pageIndex==='3',{},{timeout:60000})
 await shot(local,'local-middle-spread')
 if(localErrors.length)throw Error('Local runtime/shader errors: '+localErrors.join('; ').slice(0,400))
})
await writeFile(dir+'/local-diagnostics.json',JSON.stringify(localErrors,null,2))
await local.close()
const source=await browser.newPage({viewport})
source.setDefaultTimeout(30000)
const diagnostics=[];source.on('pageerror',e=>diagnostics.push(e.message));source.on('console',m=>{if(m.type()==='error')diagnostics.push(m.text().slice(0,240))})
await record('Stripe Press source browse',async()=>{
 await source.goto('https://stripe.press/',{waitUntil:'domcontentloaded',timeout:45000})
 await source.locator('canvas').first().waitFor({timeout:60000})
 await source.getByRole('button',{name:/^Open book:/i}).filter({visible:true}).first().waitFor({timeout:60000})
 await source.waitForTimeout(3500);await shot(source,'reference-browse')
})
await record('Stripe Press open book',async()=>{
 // Public landing page contains Open book; exact interaction/edition may vary.
 const open=source.getByRole('button',{name:/^Open book:/i}).filter({visible:true}).first()
 await open.waitFor({state:'visible',timeout:30000})
 // Use the public button's actual activation; the carousel can move it
 // during CDP mouse dispatch in SwiftShader. The fallback is explicitly logged.
 try{const rect=await open.boundingBox();if(!rect)throw Error('No visible button bounds');await source.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2,{delay:30});diagnostics.push('activation: pointer')}catch(e){diagnostics.push('pointer activation: '+String(e).slice(0,300))}
 // The verified stable screenshot shows CLOSE BOOK [-]. Match its text
 // literally and tolerate the UI's casing/spacing without double escapes.
 const closed=source.getByText(/Close book\s*\[\s*-\s*\]/i).filter({visible:true}).first()
 try{await closed.waitFor({state:'visible',timeout:15000})}catch(e){
   diagnostics.push('close wait: '+String(e).slice(0,300))
   if(await open.isVisible()){await open.evaluate(button=>button.click());diagnostics.push('activation fallback: public button DOM click')}
   else diagnostics.push('open button absent after pointer; waiting for reader')
   try{await closed.waitFor({state:'visible',timeout:30000})}catch(e){
     await shot(source,'reference-state-unverified')
     await writeFile(dir+'/reference-visible-text.txt',(await source.locator('body').innerText()).slice(0,5000))
     throw e
   }
 }
 await source.waitForTimeout(800)
 await shot(source,'reference-opening-early')
 await source.waitForTimeout(2700);await shot(source,'reference-after-open')
 await source.waitForTimeout(6500);await shot(source,'reference-open-late')
 await source.waitForTimeout(2500);await shot(source,'reference-open-late-check')
 // A Close book control only proves the reader was requested, not that
 // the rendered book has opened. Require the real spread control and a
 // changed page readout after activating a public pagination button.
 const spread=source.locator('[data-readout="spread"]').filter({visible:true}).first()
 await spread.waitFor({state:'visible',timeout:30000})
 const before=(await spread.innerText()).trim()
 const next=source.getByRole('button',{name:'Next page',exact:true}).filter({visible:true}).first()
 const prev=source.getByRole('button',{name:'Previous page',exact:true}).filter({visible:true}).first()
 const changed=async()=>{const after=(await spread.innerText()).trim();return after!==before&&after.length>0}
 await next.click({force:true,timeout:10000})
 let advanced=false
 for(let i=0;i<12;i++){if(await changed()){advanced=true;break}await source.waitForTimeout(500)}
 if(!advanced){await prev.click({force:true,timeout:10000});for(let i=0;i<12;i++){if(await changed()){advanced=true;break}await source.waitForTimeout(500)}}
 const after=(await spread.innerText()).trim();diagnostics.push('spread before: '+before,'spread after: '+after)
 await source.waitForTimeout(3500);await shot(source,'reference-after-page-control')
 await source.waitForTimeout(2500);await shot(source,'reference-spread-check')
 const body=await source.locator('body').innerText()
 await writeFile(dir+'/reference-visible-text.txt',body.slice(-10000))
 if(!advanced)throw Error('Public pagination did not change the spread readout; not verified')
})
await browser.close()
await writeFile(dir+'/source-diagnostics.json',JSON.stringify(diagnostics,null,2))
await writeFile(dir+'/report.json',JSON.stringify({viewport,results,captures,limitations:'Different books/assets; original camera interaction not locked. Reference early/late frames and pagination proof are separate; human inspection must confirm an actually unfolded spread. These are evidence captures, not pixel-level parity.'},null,2))
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;')
await writeFile(dir+'/index.html','<!doctype html><meta charset=utf-8><title>Stripe Press 对照</title><style>body{font:15px system-ui;background:#eee;margin:24px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}img{width:100%;display:block}figure{margin:0;background:white;padding:8px}pre{white-space:pre-wrap}</style><h1>Book3D / Stripe Press 对照</h1><p>同视口证据截图，素材和相机尚未锁定；需要人工验收。</p><main>'+captures.map(n=>'<figure><figcaption>'+esc(n)+'</figcaption><img src="'+n+'.png"></figure>').join('')+'</main><pre>'+esc(JSON.stringify(results,null,2))+'</pre>')
if(results.some(r=>r.status==='unverified'))process.exitCode=1
