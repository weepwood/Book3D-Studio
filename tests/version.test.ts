import {describe,it,expect} from 'vitest'
import {APP_VERSION} from '../src/version'
import pkg from '../package.json'
describe('版本一致性',()=>{it('界面与构建使用同一语义版本',()=>{expect(APP_VERSION).toBe(pkg.version);expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)})})
