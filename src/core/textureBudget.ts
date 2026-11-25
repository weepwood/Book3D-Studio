// Account conservatively for three RGBA canvases plus a mipmapped GPU copy.
// This is a residency estimate, not browser/driver allocation telemetry.
export const PAGE_TEXTURE_BUDGET=192*1024*1024
export const PAGE_TEXTURE_MAX_PIXELS=640*1024
export function pageRaster(width:number,height:number){
 const logicalWidth=640,logicalHeight=Math.round(640*height/width)
 const scale=Math.min(1,Math.sqrt(PAGE_TEXTURE_MAX_PIXELS/(logicalWidth*logicalHeight)))
 const w=Math.max(1,Math.floor(logicalWidth*scale)),h=Math.max(1,Math.floor(logicalHeight*scale))
 return {width:w,height:h,logicalWidth,logicalHeight,estimatedBytes:Math.ceil(w*h*4*(3+4/3))}
}
export function textureEvictions<T>(cache:ReadonlyMap<string,{texture:T;bytes:number}>,pinned:ReadonlySet<T>,capacity:number,budget:number){
 let bytes=0,size=cache.size;for(const entry of cache.values())bytes+=entry.bytes
 const keys:string[]=[]
 for(const [key,entry] of cache){if(size<=capacity&&bytes<=budget)break;if(pinned.has(entry.texture))continue;keys.push(key);bytes-=entry.bytes;size--}
 return {keys,bytes,size,overBudget:Math.max(0,bytes-budget)}
}
