import * as T from 'three'
// Independent procedural edge artwork: two paper seams per tile. Both the
// resting stack and moving block use identical physical UV density.
export function paperEdgeTexture(color:string,vertical:boolean){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64
 const ctx=canvas.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,64,64)
 for(const offset of [0,32]){
  ctx.fillStyle='#00000024';ctx.fillRect(vertical?offset:0,vertical?0:offset,vertical?3:64,vertical?64:3)
  ctx.fillStyle='#ffffff27';ctx.fillRect(vertical?offset+3:0,vertical?0:offset+3,vertical?2:64,vertical?64:2)
  ctx.fillStyle='#0000000a';ctx.fillRect(vertical?offset+18:0,vertical?0:offset+18,vertical?6:64,vertical?64:6)
 }
 // Deterministic, low-frequency paper fibre variation along the grain.
 for(let i=0;i<16;i++){const q=(i*37+11)%64;ctx.fillStyle=i%2?'#ffffff07':'#00000007';ctx.fillRect(vertical?0:q,vertical?q:0,vertical?64:1,vertical?1:64)}
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;return map
}
