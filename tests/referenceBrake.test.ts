import {describe,it,expect} from 'vitest'
import {isBrakeable,brakeRetention,PRESS_SCENE} from '../src/core/referenceScene'
describe('原版活动页制动门限',()=>{it('只对实际在途的角度开启制动',()=>{expect(isBrakeable(0)).toBe(false);expect(isBrakeable(.05)).toBe(false);expect(isBrakeable(.5)).toBe(true);expect(isBrakeable(.95)).toBe(false);expect(isBrakeable(1)).toBe(false);expect(PRESS_SCENE.brakeLockMs).toBe(200);expect(brakeRetention(400).drive).toBe(0)})})
