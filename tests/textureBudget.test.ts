import {expect,it} from 'vitest'
import {pageRaster,PAGE_TEXTURE_MAX_PIXELS,PAGE_TEXTURE_BUDGET,textureEvictions} from '../src/core/textureBudget'
it('宽高极值的保守纹理预算覆盖16个同时使用材质，普通书籍保持原清晰度',()=>{
 expect(pageRaster(150,220).width).toBe(640)
 for(const width of [90,150,250])for(const height of [120,220,320]){
  const r=pageRaster(width,height);expect(r.width*r.height).toBeLessThanOrEqual(PAGE_TEXTURE_MAX_PIXELS)
  expect(r.estimatedBytes*16).toBeLessThanOrEqual(PAGE_TEXTURE_BUDGET)
 }
})
it('LRU同时执行数量与字节限制，跳过活跃纹理并报告不可回收超额',()=>{
 const cache=new Map([['a',{texture:'a',bytes:10}],['b',{texture:'b',bytes:10}],['c',{texture:'c',bytes:10}]])
 expect(textureEvictions(cache,new Set(['a']),3,20)).toEqual({keys:['b'],bytes:20,size:2,overBudget:0})
 expect(textureEvictions(cache,new Set(['a','b']),1,10)).toEqual({keys:['c'],bytes:20,size:2,overBudget:10})
})
