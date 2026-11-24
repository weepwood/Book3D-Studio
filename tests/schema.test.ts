import {describe,it,expect} from 'vitest'
import {defaults,parseConfig,springStep} from '../src/core/schema'
describe('配置',()=>{
  it('默认配置可往返',()=>expect(parseConfig(JSON.parse(JSON.stringify(defaults)))).toEqual(defaults))
  it('拒绝未知版本和非有限参数',()=>{expect(()=>parseConfig({version:2})).toThrow();expect(()=>parseConfig({...defaults,width:Infinity})).toThrow()})
  it('拒绝外部图片和无效颜色',()=>{expect(()=>parseConfig({...defaults,coverImage:'https://example.com/a.png'})).toThrow();expect(()=>parseConfig({...defaults,coverColor:'red'})).toThrow()})
  it('忽略未定义字段',()=>expect(parseConfig({...defaults,unknown:'bad'})).toEqual(defaults))
})
describe('弹簧',()=>{
  it('收敛并可反向',()=>{let x=0,v=0;for(let i=0;i<240;i++) [x,v]=springStep(x,v,115,1/60);expect(x).toBeCloseTo(115,3);for(let i=0;i<240;i++) [x,v]=springStep(x,v,0,1/60);expect(x).toBeCloseTo(0,3)})
})
