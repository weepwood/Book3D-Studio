import {describe,it,expect} from 'vitest'
import {curlPoint,deformPage,createCurlGeometry,pageFaces,turnFaces,leafCount,nextLeaf,easeTurn} from '../src/core/pages'
import {defaults,parseConfig} from '../src/core/schema'
describe('逐页阅读',()=>{
 it('正反面顺序与边界',()=>{expect(pageFaces(0,6)).toEqual({left:-1,right:0});expect(pageFaces(6,6)).toEqual({left:11,right:-1});expect(turnFaces(0,1)).toEqual({front:0,back:1});expect(turnFaces(1,-1)).toEqual({front:0,back:1});expect(nextLeaf(0,-1,6)).toBe(0);expect(nextLeaf(6,1,6)).toBe(6);expect(leafCount({...defaults,pageCount:13})).toBe(7)})
 it('曲面始末平坦，翻页中间抬起且固定装订边',()=>{expect(curlPoint(1,0,0,2,3,1)[0]).toBeCloseTo(2);expect(curlPoint(1,0,1,2,3,1)[0]).toBeCloseTo(-2);expect(curlPoint(1,0,.5,2,3,1)[2]).toBeGreaterThan(1);expect(curlPoint(0,.5,.5,2,3,1)).toEqual([0,1.5,0]);expect(easeTurn(.5)).toBe(.5)})
 it('动态网格产生有限的坐标与法线',()=>{const g=createCurlGeometry(1,2);for(const p of [0,.2,.5,.9,1]){deformPage(g,1,2,p,.8);expect(Array.from(g.getAttribute('position').array).every(Number.isFinite)).toBe(true);expect(Array.from(g.getAttribute('normal').array).every(Number.isFinite)).toBe(true)}g.dispose()})
 it('旧配置与素材验证',()=>{expect(parseConfig({version:1}).pageCount).toBe(12);expect(parseConfig({...defaults,pageCount:2,pageIndex:6}).pageIndex).toBe(1);expect(()=>parseConfig({...defaults,pageImages:['https://example.org']})).toThrow();expect(parseConfig({...defaults,opening:180}).opening).toBe(180)})
})
