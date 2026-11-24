import * as T from 'three'
// Two paper seams per tile. The fine bands stay parallel to the physical
// layer axis on the fore-edge and head/tail. No geometry thickness changes.
export function paperEdgeTexture(color:string,vertical:boolean){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128
 const ctx=canvas.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,128,128)
 const band=(offset:number,width:number,tint:string)=>{ctx.fillStyle=tint;ctx.fillRect(vertical?offset:0,vertical?0:offset,vertical?width:128,vertical?128:width)}
 // A narrow cut shadow and broad soft fibre highlight, rather than a thick
 // periodic black stripe. Distinct neighbouring layers have unequal tint.
 for(const offset of [0,64]){
  band(offset,2,offset===0?'#00000036':'#00000029');band(offset+2,3,'#0000000e');band(offset+5,3,'#ffffff27');band(offset+8,5,'#ffffff10');band(offset+41,9,'#00000008')
 }
 // Seeded variation along the cut edge, with no random flicker between
 // builds or changes of page count. Keep the seams uninterrupted.
 let seed=193;for(let i=0;i<96;i++){seed=(seed*1664525+1013904223)>>>0;const u=seed%128;seed=(seed*1664525+1013904223)>>>0;const v=seed%128;ctx.fillStyle=i%2?'#ffffff09':'#00000009';ctx.fillRect(vertical?u:v,vertical?v:u,vertical?1:4,vertical?4:1)}
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;return map
}
