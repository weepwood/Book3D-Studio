import {expect,it,vi} from 'vitest'
import {createPageDecodeQueue,type DecodedPage} from '../src/core/pageDecode'
const raster=(close=()=>{})=>({source:{} as CanvasImageSource,width:20,height:30,close})
it('coalesces identical sources, prioritizes current pages and bounds concurrent decoding',async()=>{
 const order:string[]=[],ready=new Map<string,(p:DecodedPage)=>void>(),calls:string[]=[],close=vi.fn()
 const q=createPageDecodeQueue(url=>{order.push(url);return new Promise(resolve=>ready.set(url,resolve))})
 q.request('prefetch',()=>calls.push('prefetch'),()=>false)
 q.request('current',()=>calls.push('current-front'),()=>true)
 q.request('current',()=>calls.push('current-back'),()=>true)
 const cancel=q.request('obsolete',()=>calls.push('obsolete'),()=>false);cancel()
 q.request('next',()=>calls.push('next'),()=>false)
 await vi.waitFor(()=>expect(order).toEqual(['current','prefetch']))
 expect(q.metrics()).toMatchObject({active:2,peakActive:2,shared:1,queued:1,canceled:1})
 ready.get('current')!(raster(close))
 await vi.waitFor(()=>expect(order).toEqual(['current','prefetch','next']))
 expect(calls).toEqual(['current-front','current-back'])
 ready.get('prefetch')!(raster(close));ready.get('next')!(raster(close))
 await vi.waitFor(()=>expect(q.metrics().active).toBe(0))
 expect(close).toHaveBeenCalledTimes(3);expect(q.metrics()).toMatchObject({started:3,completed:3,failed:0,deliveryFailed:0})
 q.dispose()
})
it('cancels running subscribers on disposal and releases their eventual result',async()=>{
 let resolve!:(p:DecodedPage)=>void
 const done=vi.fn(),close=vi.fn(),q=createPageDecodeQueue(()=>new Promise(r=>resolve=r))
 q.request('current',done,()=>true)
 await vi.waitFor(()=>expect(q.metrics().active).toBe(1))
 q.dispose();resolve(raster(close))
 await vi.waitFor(()=>expect(q.metrics().active).toBe(0))
 expect(done).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();expect(q.metrics().canceled).toBe(1)
})
it('failed decode settles listeners without stopping later jobs',async()=>{
 const done=vi.fn(),q=createPageDecodeQueue(async url=>{if(url==='bad')throw Error('bad');return raster()},1)
 q.request('bad',done,()=>true);q.request('good',done,()=>true)
 await vi.waitFor(()=>expect(q.metrics().active+q.metrics().queued).toBe(0))
 expect(done.mock.calls[0]).toEqual([null]);expect(done.mock.calls[1][0]).toMatchObject({width:20,height:30});expect(q.metrics().failed).toBe(1)
 q.dispose()
})

it('reuses bounded resized bitmaps, evicts LRU and clears a generation',async()=>{
 const close=vi.fn(),decode=vi.fn(async()=>({...raster(close),retainedBytes:8})),q=createPageDecodeQueue(decode,1,16)
 const run=async(url:string)=>{q.request(url,()=>{},()=>true);await vi.waitFor(()=>expect(q.metrics().active+q.metrics().queued).toBe(0))}
 await run('a');await run('b');await run('a');expect(decode).toHaveBeenCalledTimes(2);expect(q.metrics().cacheHits).toBe(1)
 await run('c');expect(q.metrics()).toMatchObject({cacheBytes:16,cacheEvictions:1});expect(close).toHaveBeenCalledOnce()
 q.clearCache();expect(close).toHaveBeenCalledTimes(3);expect(q.metrics().cacheBytes).toBe(0)
 await run('a');q.dispose();expect(close).toHaveBeenCalledTimes(4)
})
