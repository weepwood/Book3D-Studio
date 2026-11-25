import {it,expect,vi} from 'vitest'
import {observePrograms} from '../src/core/programWarm'

const mock=()=>{
 const program={} as WebGLProgram
 const complete=vi.fn(()=>false),valid=vi.fn(()=>true),lost=vi.fn(()=>false)
 const gl={getExtension:()=>({COMPLETION_STATUS_KHR:42}),isProgram:valid,isContextLost:lost,getProgramParameter:complete} as unknown as WebGL2RenderingContext
 return {gl,program,complete,valid,lost}
}
it('polls only nonblocking completion and stops after completion',async()=>{
 vi.useFakeTimers()
 try{
  const {gl,program,complete}=mock(),report=vi.fn()
  observePrograms(gl,[program],report)
  expect(report).toHaveBeenLastCalledWith('pending')
  await vi.advanceTimersByTimeAsync(25)
  complete.mockReturnValue(true);await vi.advanceTimersByTimeAsync(25)
  expect(report).toHaveBeenLastCalledWith('complete')
  expect(vi.getTimerCount()).toBe(0)
 }finally{vi.useRealTimers()}
})
it('cancels before invalid handles can be polled, and detects invalidation',async()=>{
 vi.useFakeTimers()
 try{
  const {gl,program,complete,valid}=mock(),report=vi.fn()
  const cancel=observePrograms(gl,[program],report);cancel();await vi.advanceTimersByTimeAsync(100)
  expect(complete).not.toHaveBeenCalled()
  valid.mockReturnValue(false);observePrograms(gl,[program],report);await vi.advanceTimersByTimeAsync(1)
  expect(report).toHaveBeenLastCalledWith('invalidated')
  expect(vi.getTimerCount()).toBe(0)
 }finally{vi.useRealTimers()}
})
