// A per-book queue shares each in-flight image between front, flipped and
// bleed textures. No full-resolution decoded image is retained as a cache.
export type DecodedPage={source:CanvasImageSource;width:number;height:number;retainedBytes?:number;close?:()=>void}
type Listener={done:(page:DecodedPage|null)=>void;visible:()=>boolean}
type Job={url:string;listeners:Set<Listener>;running:boolean}
export const PAGE_DECODE_CONCURRENCY=2
export function createPageDecodeQueue(decode:(url:string)=>Promise<DecodedPage>,limit=PAGE_DECODE_CONCURRENCY,budget=0){
 const jobs=new Map<string,Job>(),cache=new Map<string,DecodedPage>()
 let cacheBytes=0,peakCacheBytes=0,cacheHits=0,cacheEvictions=0,epoch=0
 let active=0,peakActive=0,requested=0,shared=0,started=0,failed=0,deliveryFailed=0,canceled=0,completed=0,decodeMs=0,peakDecodeMs=0,closed=false
 let timer:ReturnType<typeof setTimeout>|null=null
 const schedule=()=>{
  if(closed||timer!==null||active>=limit||![...jobs.values()].some(j=>!j.running&&j.listeners.size))return
  timer=setTimeout(()=>{timer=null;pump()},0)
 }
 const run=async(job:Job)=>{
  job.running=true;active++;peakActive=Math.max(peakActive,active)
  const version=epoch;let page:DecodedPage|null=cache.get(job.url)??null
  if(page){cache.delete(job.url);cacheBytes-=page.retainedBytes??0;cacheHits++}
  else{
   const t=performance.now();started++
   try{page=await decode(job.url);completed++}catch{failed++}
   const elapsed=performance.now()-t;decodeMs+=elapsed;peakDecodeMs=Math.max(peakDecodeMs,elapsed)
  }
  try{
   // One delivery per task, visible subscribers first. This prevents a
   // shared high-resolution decode from synchronously compositing many maps.
   while(!closed&&job.listeners.size){
    const listener=[...job.listeners].find(l=>l.visible())??job.listeners.values().next().value!
    job.listeners.delete(listener);try{listener.done(page)}catch{deliveryFailed++}
    if(job.listeners.size)await new Promise<void>(resolve=>setTimeout(resolve,0))
   }
  }finally{
   const bytes=page?.retainedBytes??0
   if(page&&!closed&&version===epoch&&bytes>0&&bytes<=budget){
    while(cacheBytes+bytes>budget&&cache.size){const [key,entry]=cache.entries().next().value!;cache.delete(key);cacheBytes-=entry.retainedBytes??0;entry.close?.();cacheEvictions++}
    cache.set(job.url,page);cacheBytes+=bytes;peakCacheBytes=Math.max(peakCacheBytes,cacheBytes)
   }else page?.close?.()
   if(jobs.get(job.url)===job)jobs.delete(job.url);active--;schedule()
  }
 }
 function pump(){
  while(!closed&&active<limit){
   const pending=[...jobs.values()].filter(j=>!j.running&&j.listeners.size)
   const job=pending.find(j=>[...j.listeners].some(l=>l.visible()))??pending[0]
   if(!job)break
   void run(job)
  }
 }
 function request(url:string,done:Listener['done'],visible:Listener['visible']){
  if(closed)return ()=>{}
  requested++;let job=jobs.get(url)
  if(job)shared++
  else{job={url,listeners:new Set(),running:false};jobs.set(url,job)}
  const listener={done,visible};job.listeners.add(listener);schedule()
  return ()=>{if(job!.listeners.delete(listener)){canceled++;if(!job!.running&&!job!.listeners.size&&jobs.get(url)===job)jobs.delete(url)}}
 }
 function clearCache(){epoch++;for(const page of cache.values())page.close?.();cache.clear();cacheBytes=0}
 function dispose(){closed=true;clearCache();if(timer!==null)clearTimeout(timer);timer=null;for(const j of jobs.values()){canceled+=j.listeners.size;j.listeners.clear()}jobs.clear()}
 return {request,dispose,clearCache,metrics:()=>({cacheBytes,peakCacheBytes,cacheHits,cacheEvictions,cacheBudget:budget,active,peakActive,queued:[...jobs.values()].filter(j=>!j.running).length,requested,shared,started,completed,failed,deliveryFailed,canceled,decodeMs,peakDecodeMs,limit})}
}
function retainedBitmap(bitmap:ImageBitmap,width:number,height:number):DecodedPage{
 return {source:bitmap,width,height,retainedBytes:bitmap.width*bitmap.height*4,close:()=>bitmap.close()}
}
export async function decodePageBitmap(url:string,maxWidth:number,maxHeight:number):Promise<DecodedPage>{
 // Only validated embedded image data is accepted; no external requests.
 if(!/^data:image\/(png|jpeg|webp);base64,/.test(url))throw Error('unsupported page image')
 const blob=await (await fetch(url)).blob()
 const original=await createImageBitmap(blob)
 const width=original.width,height=original.height
 const scale=Math.min(1,maxWidth/width,maxHeight/height)
 if(scale>=1)return retainedBitmap(original,width,height)
 try{
  const bitmap=await createImageBitmap(original,{resizeWidth:Math.max(1,Math.round(width*scale)),resizeHeight:Math.max(1,Math.round(height*scale)),resizeQuality:'high'})
  return retainedBitmap(bitmap,width,height)
 }finally{original.close()}
}
export async function decodePageImage(url:string,maxWidth:number,maxHeight:number):Promise<DecodedPage>{
 const image=new Image()
 const release=()=>{image.onload=null;image.onerror=null;image.removeAttribute('src')}
 let transferred=false
 try{
  if(typeof image.decode==='function'){image.src=url;await image.decode()}
  else await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('page decode failed'));image.src=url})
  image.onload=null;image.onerror=null
  const width=image.naturalWidth,height=image.naturalHeight
  if(!width||!height)throw Error('empty page image')
  const scale=Math.min(1,maxWidth/width,maxHeight/height)
  if(scale<1&&typeof createImageBitmap==='function'){
   try{
    const bitmap=await createImageBitmap(image,{resizeWidth:Math.max(1,Math.round(width*scale)),resizeHeight:Math.max(1,Math.round(height*scale)),resizeQuality:'high'})
    return retainedBitmap(bitmap,width,height)
   }catch{/* Older engines can still draw the decoded image directly. */}
  }
  transferred=true
  return {source:image,width,height,close:release}
 }finally{if(!transferred)release()}
}
