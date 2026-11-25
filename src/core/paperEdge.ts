import * as T from 'three'
// Two paper seams per tile. The fine bands stay parallel to the physical
// layer axis on the fore-edge and head/tail. No geometry thickness changes.
export function paperEdgeTexture(color:string,vertical:boolean){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256
 const ctx=canvas.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,256,256)
 const band=(offset:number,width:number,tint:string)=>{ctx.fillStyle=tint;ctx.fillRect(vertical?offset:0,vertical?0:offset,vertical?width:256,vertical?256:width)}
 // A narrow cut shadow and broad soft fibre highlight, rather than a thick
 // periodic black stripe. Distinct neighbouring layers have unequal tint.
 for(const offset of [0,128]){
  band(offset,2,offset===0?'#00000042':'#00000032');band(offset+2,4,'#00000020');band(offset+6,8,'#ffffff23');band(offset+14,10,'#ffffff0b');band(offset+82,18,'#0000000a')
 }
 // Seeded variation along the cut edge, with no random flicker between
 // builds or changes of page count. Keep the seams uninterrupted.
 let seed=193;for(let i=0;i<240;i++){seed=(seed*1664525+1013904223)>>>0;const u=(seed>>>8)%256;seed=(seed*1664525+1013904223)>>>0;const v=(seed>>>8)%256;ctx.fillStyle=i%2?'#ffffff10':'#0000000c';ctx.fillRect(vertical?u:v,vertical?v:u,vertical?1:4,vertical?4:1)}
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;return map
}
