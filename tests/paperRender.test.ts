import {describe,it,expect} from 'vitest'
import * as T from 'three'
import {paperShadowChunk,paperGrainAmplitude} from '../src/core/paperShading'
import {createTextureWarmer} from '../src/core/textureWarm'
import {PRESS_SCENE} from '../src/core/referenceScene'
describe('纸面双次阴影与纹理预热',()=>{
 it('深色环衬颗粒受亮度限制而明亮纸张保持原有强度',()=>{expect(paperGrainAmplitude(0)).toBe(0);expect(paperGrainAmplitude(.01)).toBeCloseTo(.0045);for(const l of [.001,.02,.05,.1,.2,.3,1,2]){expect(paperGrainAmplitude(l)).toBeGreaterThanOrEqual(0);expect(paperGrainAmplitude(l)).toBeLessThanOrEqual(l*.45+1e-9)}expect(paperGrainAmplitude(.3)).toBeCloseTo(PRESS_SCENE.paper.shadowGrain*.75)})
 it('Three r174 shader 注入点真实存在，保留原有阴影条件',()=>{const source=T.ShaderChunk.lights_fragment_begin,next=paperShadowChunk(source);expect(next).not.toBe(source);expect((next.match(/0\.5 \* getShadow\( directionalShadowMap/g)||[]).length).toBe(2);expect(next).toContain('directLight.visible && receiveShadow');expect(PRESS_SCENE.paper.shadowPasses).toBe(2);expect(PRESS_SCENE.paper.edgeBand).toBe(.006)})
 it('同一纹理版本只上传一次，重绘后再次上传，未解码/销毁不上传',()=>{let n=0;const warm=createTextureWarmer(()=>n++),t={version:1,userData:{pending:1,disposed:false}};expect(warm(t)).toBe(false);t.userData.pending=0;expect(warm(t)).toBe(true);expect(warm(t)).toBe(true);expect(n).toBe(1);t.version++;expect(warm(t)).toBe(true);expect(n).toBe(2);t.userData.disposed=true;expect(warm(t)).toBe(false);expect(n).toBe(2)})
})
