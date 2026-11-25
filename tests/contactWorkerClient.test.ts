import {expect,it,vi} from 'vitest'
import {ContactWorkerClient} from '../src/core/contactWorkerClient'
it('bounds pending work, ignores stale replies and terminates old workers',()=>{
 const instances:FakeWorker[]=[]
 class FakeWorker{
  onmessage:((e:{data:unknown})=>void)|null=null;onerror:unknown=null;postMessage=vi.fn();terminate=vi.fn()
  constructor(){instances.push(this)}
 }
 vi.stubGlobal('Worker',FakeWorker)
 try{
  const receive=vi.fn(),client=new ContactWorkerClient(receive),capture=vi.fn(()=>({opening:0,index:0,meshes:[]}))
  client.request(capture);client.request(capture);expect(capture).toHaveBeenCalledTimes(1);expect(client.dropped).toBe(1)
  client.reset();expect(instances[0].terminate).toHaveBeenCalledTimes(1)
  client.request(capture);instances[0].onmessage?.({data:{id:1,error:'stale'}});expect(receive).not.toHaveBeenCalled()
  instances[1].onmessage?.({data:{id:3,error:'current'}});expect(receive).toHaveBeenCalledOnce()
  client.dispose();client.request(capture);expect(capture).toHaveBeenCalledTimes(2);expect(instances[1].terminate).toHaveBeenCalledTimes(1)
 }finally{vi.unstubAllGlobals()}
})

it('recovers from an unresponsive worker without leaving a pending queue',()=>{
 vi.useFakeTimers()
 const terminate=vi.fn()
 class SilentWorker{onmessage=null;onerror=null;postMessage=vi.fn();terminate=terminate}
 vi.stubGlobal('Worker',SilentWorker)
 try{
  const receive=vi.fn(),client=new ContactWorkerClient(receive),capture=vi.fn(()=>({opening:0,index:0,meshes:[]}))
  client.request(capture);vi.advanceTimersByTime(5000)
  expect(terminate).toHaveBeenCalledOnce();expect(receive).toHaveBeenCalledWith({id:1,error:'Collision worker timed out'})
  client.request(capture);expect(capture).toHaveBeenCalledTimes(2);client.dispose()
  expect(vi.getTimerCount()).toBe(0)
 }finally{vi.unstubAllGlobals();vi.useRealTimers()}
})
