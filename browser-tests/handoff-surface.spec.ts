import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
test('交接纸叶真实网格同姿态书芯扭转约束实验',async({page},info)=>{
 await page.goto('/')
 const records=await page.evaluate(async()=>{
  const bp='/src/core/book.ts',sp='/src/core/schema.ts',mp='/src/core/surfaceMetrics.ts'
  const {createBook}=await import(bp),{parseConfig}=await import(sp),{measureSurface}=await import(mp)
  const out=[]
  for(const limited of [false,true]){
   history.replaceState(history.state,'',limited?'/?limitedTwist=1':'/')
   for(const spec of [{width:150,height:220,pageCount:40,paperThickness:.15,index:2,span:12},{width:90,height:320,pageCount:400,paperThickness:.25,index:20,span:80},{width:150,height:220,pageCount:2000,paperThickness:.065,index:50,span:190}]){
    const {index,span,...params}=spec,book=createBook(parseConfig({version:1,...params,thicknessMode:'automatic',paperPhysics:'material',pageIndex:index,opening:180}),()=>{})
    book.setOpening(180)
    try{
     const width=book.readingSurfaces[1].geometry.parameters.width,height=book.readingSurfaces[1].geometry.parameters.height
     for(const direction of [1,-1] as const)for(const progress of [0,.005,.025,.06,.12,.25])for(const grip of [-1,0,1])for(const curl of [0,.3,1.2]){
      const start=direction===1?index:index+span
      book.setReading(start,[{direction,progress,span,chunkLift:Math.min(.8,progress*10),chunkGesture:true,grip,grabU:.85,handoffCurl:curl}])
      const mesh=book.root.getObjectByName('Turning page block'),leaf=mesh.getObjectByName('Chunk handoff leaf')
      const m=measureSurface(leaf.geometry,width,height),support=measureSurface(mesh.geometry,width,height,direction===1?4:5),p=leaf.geometry.getAttribute('position'),base=mesh.geometry.getAttribute('position'),uv=leaf.geometry.getAttribute('uv')
      const indices=new Set<number>(Array.from(leaf.geometry.index.array) as number[])
      let rootGap=0,displacement=0
      for(const i of indices){
       const gap=Math.hypot(p.getX(i)-base.getX(i),p.getY(i)-base.getY(i),p.getZ(i)-base.getZ(i))
       if(Math.abs(uv.getX(i)-(direction===1?0:1))<1e-6)rootGap=Math.max(rootGap,gap)
       displacement=Math.max(displacement,gap)
      }
      out.push({limited,spec,direction,progress,grip,curl,...m,support,rootGap,displacement})
     }
    }finally{book.dispose()}
   }
  }
  return out
 })
 const a=records.filter(r=>!r.limited),b=records.filter(r=>r.limited)
 expect(a).toHaveLength(324);expect(b).toHaveLength(a.length)
 expect(records.every(r=>r.triangles===1152&&r.invalid===0&&[r.maxAreaError,r.maxCompression,r.rootGap,r.displacement].every(Number.isFinite))).toBe(true)
 expect(Math.max(...b.map(r=>r.rootGap))).toBeLessThan(.002)
 await writeFile(info.outputPath('handoff-surface.json'),JSON.stringify(records,null,2))
})
