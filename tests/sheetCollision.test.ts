import {it,expect} from 'vitest'
import {sectionCrossings} from '../src/core/sheetCollision'
it('截面交叉诊断识别真正穿越，不把相邻页共用装订端点计为碰撞',()=>{const a=[{x:0,z:0},{x:1,z:1}],b=[{x:0,z:1},{x:1,z:0}];expect(sectionCrossings(a,b)).toBe(1);expect(sectionCrossings(a,[{x:0,z:0},{x:1,z:2}])).toBe(0);expect(sectionCrossings(a,a)).toBe(0)})
