import {describe,it,expect} from 'vitest'
import {createStackGeometry,surfaceChain,edgeTriangleCenters} from '../src/core/stackGeometry'
import {PRESS_SCENE,READING_POSE_ADAPTER} from '../src/core/referenceScene'
import {applyPaperShading} from '../src/core/paperShading'
import * as T from 'three'
describe('书芯可见厚度及纸面着色',()=>{
 it('真实边缘三角形中心在厚度几何内',()=>{const g=createStackGeometry(1.5,2);g.pose([surfaceChain(1.5,0),surfaceChain(1.5,0),surfaceChain(1.5,0)],.3,1);const points=edgeTriangleCenters(g.g);expect(points.length).toBeGreaterThan(10);expect(points.some(p=>Math.abs(p.y+1)<1e-5&&p.z<0)).toBe(true);expect(points.every(p=>Math.abs(p.z)<=.150001)).toBe(true);g.g.dispose()})
 it('原版反弹、折缝和阴影参数独立于用户纹理',()=>{expect(PRESS_SCENE.paper.bounceScale).toBe(.29);expect(PRESS_SCENE.paper.creaseCore).toBe(.045);expect(READING_POSE_ADAPTER.pitchOffset).toBeLessThan(-22);const m=new T.MeshPhongMaterial();applyPaperShading(m);expect(m.customProgramCacheKey()).toBe('book3d-paper-gutter-v2');m.dispose()})
})
