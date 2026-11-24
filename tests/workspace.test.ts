import {describe,it,expect} from 'vitest'
import {defaults,parseConfig} from '../src/core/schema'
import {history,edit,undo,redo,removeProject,saveProject,validateWorkspace,type Workspace} from '../src/core/workspace'
const fixture:Workspace={active:'a',projects:[{id:'a',name:'A',config:defaults,updated:0},{id:'b',name:'B',config:defaults,updated:0}],assets:[]}
describe('工作区',()=>{
 it('连续滑块编辑合并并可撤销重做',()=>{let h=history(defaults);h=edit(h,{...defaults,width:160},'width',100);h=edit(h,{...defaults,width:170},'width',200);expect(h.past.length).toBe(1);h=undo(h);expect(h.present.width).toBe(150);h=redo(h);expect(h.present.width).toBe(170)})
 it('新编辑清除重做，历史限制40步',()=>{let h=history(defaults);for(let i=0;i<60;i++)h=edit(h,{...defaults,width:151+i});expect(h.past.length).toBe(40);h=edit(undo(h),defaults);expect(h.future).toHaveLength(0)})
 it('项目独立保存与删除切换',()=>{const w=saveProject(fixture,'a',{...defaults,width:180});expect(w.projects[1].config.width).toBe(150);const next=removeProject(w,'a');expect(next.active).toBe('b');expect(removeProject(next,'b')).toBe(next)})
 it('校验工作区并向旧配置填充表面属性',()=>{expect(validateWorkspace(fixture)).toEqual(fixture);expect(()=>validateWorkspace({...fixture,active:'bad'})).toThrow();expect(parseConfig({version:1}).spineZoom).toBe(1);expect(()=>parseConfig({...defaults,backImage:'https://example.com'})).toThrow()})
})
