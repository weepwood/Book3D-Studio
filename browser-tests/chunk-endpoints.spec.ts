import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
test('真实书籍模型的厚块起止曲面与近端点应变',async({page},info)=>{
 await page.goto('/')
 const records=await page.evaluate(async()=>{
  const bp='/src/core/book.ts',sp='/src/core/schema.ts',mp='/src/core/surfaceMetrics.ts'
  const {createBook}=await import(bp),{parseConfig}=await import(sp),{measureSurface}=await import(mp)
  const records=[]
  for(const envelope of [false,true]){
  history.replaceState(history.state,'',envelope?'/':'/?contactEnvelope=0')
  for(const spec of [{width:150,height:220,pageCount:2000,paperThickness:.06,index:50,span:190},{width:90,height:320,pageCount:400,paperThickness:.25,index:20,span:80},{width:90,height:320,pageCount:800,paperThickness:.25,index:0,span:400}]){
   const {index,span,...params}=spec,c=parseConfig({version:1,...params,thicknessMode:'automatic',paperPhysics:'material',pageIndex:index,opening:180}),book=createBook(c,()=>{})
   book.setOpening(180)
   for(const direction of [1,-1] as const){
    const start=direction===1?index:index+span,end=start+direction*span
    book.setReading(start,[]);const source=book.stationaryChunkHandoffPoints(-direction as 1|-1)
    book.setReading(end,[]);const dest=book.stationaryChunkHandoffPoints(direction)
    const poses=[]
    for(const mode of ['flat','auto-lift','grip-positive','grip-negative']){
    for(const progress of [0,.0001,.001,.005,.01,.025,.05,.1,.2,.35,.5,.65,.8,.9,.95,.975,.99,.995,.999,.9999,1]){
     if(mode!=='flat'&&(progress===0||progress===1))continue
     const lift=mode==='flat'?0:Math.min(1,progress*20,(1-progress)*10)
     book.setReading(start,[{direction,progress,span,chunkLift:lift,chunkGesture:mode.startsWith('grip'),grip:mode==='grip-negative'?-1:1}])
     const mesh=book.root.getObjectByName('Turning page block'),p=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv')
     // Original page dimensions from the model: matching material UV grid.
     const width=book.readingSurfaces[1].geometry.parameters.width,height=book.readingSurfaces[1].geometry.parameters.height
     const metrics=[4,5].map(f=>measureSurface(mesh.geometry,width,height,f))
     const dst=progress>.5?direction:-direction as 1|-1,points=book.activeChunkHandoffPoints(dst),ref=progress>.5?dest:source
     poses.push({mode,progress,maxAreaError:Math.max(...metrics.map(m=>m.maxAreaError)),invalid:metrics.reduce((sum,m)=>sum+m.invalid,0),endpointDistanceMm:Math.max(...points.map((v,i)=>v.distanceTo(ref[i])*100)),vertices:p.count,uvs:uv.count})
    }
    }
    records.push({envelope,spec,direction,poses})
   }
   book.dispose()
  }
  }
  return records
 })
 expect(records).toHaveLength(12)
 expect(records.every(r=>r.poses.every(p=>Number.isFinite(p.maxAreaError)&&Number.isFinite(p.endpointDistanceMm)&&p.invalid===0))).toBe(true)
 expect(Math.max(...records.flatMap(r=>r.poses.filter(p=>p.progress===0||p.progress===1).map(p=>p.endpointDistanceMm)))).toBeLessThan(.01)
 const before=records.filter(r=>!r.envelope).flatMap(r=>r.poses),after=records.filter(r=>r.envelope).flatMap(r=>r.poses)
 expect(before).toHaveLength(468);expect(after).toHaveLength(before.length)
 expect(Math.max(...after.map(p=>p.maxAreaError))).toBeLessThan(.5)
 expect(after.every((p,i)=>p.maxAreaError<=before[i].maxAreaError+1e-7)).toBe(true)
 await writeFile(info.outputPath('chunk-endpoints.json'),JSON.stringify(records,null,2))
})
