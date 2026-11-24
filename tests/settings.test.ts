import {describe,it,expect} from 'vitest'
import {defaults} from '../src/core/schema'
import {resetSettings,applyMaterialPreset,commitNumber} from '../src/editor/settings'
describe('安全设置编辑',()=>{
 it('局部重置保留文字、图片、阅读页码、数量和其他组',()=>{const c={...defaults,title:'我的书',coverImage:'test',pageImages:['test'],pageCount:40,pageIndex:10,width:230,roughness:.2,pageCurl:.1,opening:180};const n=resetSettings(c,'geometry','reading');expect(n).toEqual({...c,width:defaults.width,pageCurl:defaults.pageCurl});expect(n.pageImages).toBe(c.pageImages)})
 it('材质预设只变更材质而不清除封面或标题',()=>{const c={...defaults,title:'我的书',coverImage:'test',pageIndex:2};const n=applyMaterialPreset(c,'Night Edition');expect(n.title).toBe(c.title);expect(n.coverImage).toBe(c.coverImage);expect(n.pageIndex).toBe(2);expect(n.finish).toBe('gloss');expect(n.roughness).toBe(.24)})
 it('数字输入处理空值、非法值、步长和边界',()=>{expect(commitNumber('',156,90,250,1)).toBe(156);expect(commitNumber('NaN',156,90,250,1)).toBe(156);expect(commitNumber('500',156,90,250,1)).toBe(250);expect(commitNumber('.126',.2,0,1,.01)).toBe(.13);expect(commitNumber('.25',.3,.3,2,.05)).toBe(.3)})
})
