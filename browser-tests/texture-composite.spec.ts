import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
test('程序化纸面避免多余副本且异步正反图片保持正确渗色',async({page},info)=>{
 await page.goto('/')
 const result=await page.evaluate(async()=>{
  const pp='/src/core/pages.ts',sp='/src/core/schema.ts'
  const {createPageLayer}=await import(pp),{parseConfig}=await import(sp)
  const makeImage=(color:string)=>{const c=document.createElement('canvas');c.width=150;c.height=220;const g=c.getContext('2d')!;g.fillStyle=color;g.fillRect(0,0,c.width,c.height);return c.toDataURL()}
  const images=[makeImage('rgb(200,100,50)'),makeImage('rgb(100,200,250)')]
  const sample=(texture:any)=>{const c=texture.image as HTMLCanvasElement;return Array.from(c.getContext('2d')!.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data)}
  const build=(bleed:number,custom:string[])=>{
   const config=parseConfig({version:1,width:150,height:220,pageCount:4,pageImages:custom,pageBleed:bleed})
   let clones=0;const old=HTMLCanvasElement.prototype.cloneNode
   HTMLCanvasElement.prototype.cloneNode=function(deep?:boolean){clones++;return old.call(this,deep)}
   let layer:ReturnType<typeof createPageLayer>
   try{layer=createPageLayer(1.5,2.2,config,()=>{});layer.pose(0,2,[]);layer.cancelPreload()}finally{HTMLCanvasElement.prototype.cloneNode=old}
   return {layer,clones,texture:layer.right.material.map}
  }
  const plain=build(0,[]),synthetic=build(.1,[]),front=build(0,images),mixed=build(.1,images)
  try{
   for(let i=0;i<100&&(front.texture.userData.pending||mixed.texture.userData.pending);i++)await new Promise(r=>setTimeout(r,20))
   return {plainClones:plain.clones,syntheticClones:synthetic.clones,frontClones:front.clones,mixedClones:mixed.clones,frontPending:front.texture.userData.pending,mixedPending:mixed.texture.userData.pending,frontPixel:sample(front.texture),mixedPixel:sample(mixed.texture)}
  }finally{for(const {layer} of [plain,synthetic,front,mixed])layer.dispose()}
 })
 expect(result.plainClones).toBe(0);expect(result.syntheticClones).toBe(1)
 expect(result.frontClones).toBe(0);expect(result.mixedClones).toBe(2)
 expect(result.frontPending+result.mixedPending).toBe(0)
 expect(result.frontPixel).toEqual([200,100,50,255])
 // Multiply-blend at 10% opacity, with one blend after both images decode.
 for(const [i,expected] of [188,98,50,255].entries())expect(Math.abs(result.mixedPixel[i]-expected)).toBeLessThanOrEqual(2)
 await writeFile(info.outputPath('texture-composite.json'),JSON.stringify(result,null,2))
})
