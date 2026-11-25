import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'

test('共享正反纸面Source保留独立UV、异步更新和GPU释放',async({page},info)=>{
 const results=[]
 for(const shared of [false,true]){
  await page.goto('/?sharedFaces='+(shared?1:0))
  const data=await page.evaluate(async()=>{
   const pp='/src/core/pages.ts',sp='/src/core/schema.ts',bp='/src/core/book.ts',tp='/node_modules/.vite/deps/three.js'
   const {createPageLayer}=await import(pp),{parseConfig}=await import(sp),{disposeTree}=await import(bp),T=await import(tp)
   const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=3072
   const g=canvas.getContext('2d')!;g.fillStyle='rgb(225,35,20)';g.fillRect(0,0,1024,3072);g.fillStyle='rgb(20,45,230)';g.fillRect(1024,0,1024,3072)
   const uri=canvas.toDataURL('image/png')
   const c=parseConfig({version:1,width:150,height:220,pageCount:4,pageImages:[uri,uri],pageBleed:0})
   const layer=createPageLayer(1.5,2.2,c,()=>{})
   layer.pose(1,2,[])
   const normal=layer.left.material.map
   layer.pose(0,2,[{direction:1,progress:.3,grip:0,velocity:0}]);layer.cancelPreload()
   const flipped=layer.slots[0].back.map
   const renderer=new T.WebGLRenderer({antialias:false}),scene=new T.Scene(),camera=new T.OrthographicCamera(-2,2,1,-1,.1,10),target=new T.WebGLRenderTarget(128,64)
   camera.position.z=4
   const geometry=new T.PlaneGeometry(2,2),materials=[new T.MeshBasicMaterial({map:normal}),new T.MeshBasicMaterial({map:flipped})]
   for(let i=0;i<2;i++){const mesh=new T.Mesh(geometry,materials[i]);mesh.position.x=i?1:-1;scene.add(mesh)}
   const read=()=>{
    renderer.setRenderTarget(target);renderer.render(scene,camera)
    const pixels=[]
    for(const x of [16,48,80,112]){const rgba=new Uint8Array(4);renderer.readRenderTargetPixels(target,x,32,1,1,rgba);pixels.push([...rgba])}
    return pixels
   }
   try{
    const before=read()
    for(let i=0;i<600&&(normal.userData.pending||flipped.userData.pending);i++)await new Promise(r=>setTimeout(r,10))
    const after=read(),metrics=layer.textureMetrics(),textureCount=renderer.info.memory.textures
    const sameSource=normal.source===flipped.source,repeat=[normal.repeat.x,flipped.repeat.x],pending=normal.userData.pending+flipped.userData.pending
    layer.dispose();disposeTree(layer.root);target.dispose()
    return {before,after,metrics,textureCount,sameSource,repeat,pending,released:normal.image===null&&flipped.image===null,remaining:renderer.info.memory.textures}
   }finally{geometry.dispose();materials.forEach(m=>m.dispose());renderer.dispose()}
  })
  expect(data.pending).toBe(0)
  expect(data.sameSource).toBe(shared)
  expect(data.repeat).toEqual([1,-1])
  expect(data.after[0]).toEqual(data.after[3]);expect(data.after[1]).toEqual(data.after[2]);expect(data.after[0]).not.toEqual(data.after[1])
  expect(data.after).not.toEqual(data.before)
  expect(data.remaining).toBe(0);expect(data.released).toBe(true)
  results.push(data)
 }
 expect(results[1].after).toEqual(results[0].after)
 expect(results[1].textureCount).toBe(results[0].textureCount-1)
 expect(results[1].metrics.size).toBeLessThan(results[0].metrics.size)
 await writeFile(info.outputPath('shared-face.json'),JSON.stringify(results,null,2))
})
