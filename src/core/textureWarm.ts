// Track the uploaded revision, not just object identity: a CanvasTexture may
// be redrawn after the front or reverse image finishes decoding.
export type Warmable={version:number;userData:Record<string,unknown>}
export function createTextureWarmer<T extends Warmable>(upload:(texture:T)=>void){
 const versions=new WeakMap<T,number>()
 return (texture:T)=>{
   if(texture.userData.disposed||Number(texture.userData.pending??0)>0)return false
   if(versions.get(texture)===texture.version)return true
   upload(texture);versions.set(texture,texture.version);return true
 }
}
