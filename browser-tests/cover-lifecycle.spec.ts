import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'

test('封面替换、损坏图片和模型释放清理旧Image并保留真实新图像',async({page},info)=>{
 await page.goto('/')
 const result=await page.evaluate(async()=>{
  const bp='/src/core/book.ts',sp='/src/core/schema.ts',tp='/node_modules/.vite/deps/three.js'
  const {createBook}=await import(bp),{parseConfig}=await import(sp),T=await import(tp)
  const source=(color:string)=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d')!;g.fillStyle=color;g.fillRect(0,0,64,64);return c.toDataURL('image/png')}
  const orig=window.Image,images:HTMLImageElement[]=[]
  window.Image=class extends orig{constructor(w?:number,h?:number){super(w,h);images.push(this)}}
  let updates=0
  const c=parseConfig({version:1,coverImage:source('#d02030'),backImage:source('#3020d0'),spineImage:source('#20d030')})
  const book=createBook(c,()=>updates++)
  const released=(i:HTMLImageElement)=>i.getAttribute('src')===null&&i.onload===null&&i.onerror===null
  try{
   const old=[...images]
   book.updateAppearance({...c,coverImage:source('#28b8e0'),backImage:'data:image/png;base64,AAAA',spineImage:source('#bbcc44')})
   const canceled=old.map(released)
   const current=images.slice(old.length)
   for(let i=0;i<200&&current.some(i=>!released(i));i++)await new Promise(r=>setTimeout(r,10))
   const pixels:number[][]=[]
   book.root.traverse((o:any)=>{
    if(!(o instanceof T.Mesh))return
    for(const m of Array.isArray(o.material)?o.material:[o.material]){const raster=m.map?.image;if(raster instanceof HTMLCanvasElement){const g=raster.getContext('2d')!;pixels.push([...g.getImageData(Math.floor(raster.width/2),Math.floor(raster.height/2),1,1).data])}}
   })
   book.updateAppearance({...c,coverImage:source('#888888')})
   const pending=images.slice(old.length+current.length)
   book.dispose()
   return {canceled,finished:current.map(released),pending:pending.map(released),pixels,updates}
  }finally{window.Image=orig}
 })
 expect(result.canceled).toEqual([true,true,true])
 expect(result.finished).toEqual([true,true,true])
 expect(result.pending.length).toBeGreaterThan(0);expect(result.pending.every(Boolean)).toBe(true)
 expect(result.pixels).toContainEqual([40,184,224,255])
 expect(result.pixels).toContainEqual([187,204,68,255])
 await writeFile(info.outputPath('cover-lifecycle.json'),JSON.stringify(result,null,2))
})
