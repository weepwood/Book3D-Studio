import {describe,it,expect} from 'vitest'
import {defaults,parseConfig} from '../src/core/schema'
import {history,edit,undo,redo,removeProject,saveProject,validateWorkspace,resolveImport,storageRevision,type Workspace} from '../src/core/workspace'
const fixture:Workspace={active:'a',projects:[{id:'a',name:'A',config:defaults,updated:0},{id:'b',name:'B',config:defaults,updated:0}],assets:[]}
describe('工作区',()=>{
 it('连续滑块编辑合并并可撤销重做',()=>{let h=history(defaults);h=edit(h,{...defaults,width:160},'width',100);h=edit(h,{...defaults,width:170},'width',200);expect(h.past.length).toBe(1);h=undo(h);expect(h.present.width).toBe(150);h=redo(h);expect(h.present.width).toBe(170)})
 it('新编辑清除重做，历史限制40步',()=>{let h=history(defaults);for(let i=0;i<60;i++)h=edit(h,{...defaults,width:151+i});expect(h.past.length).toBe(40);h=edit(undo(h),defaults);expect(h.future).toHaveLength(0)})
 it('项目独立保存与删除切换',()=>{const w=saveProject(fixture,'a',{...defaults,width:180});expect(w.projects[1].config.width).toBe(150);const next=removeProject(w,'a');expect(next.active).toBe('b');expect(removeProject(next,'b')).toBe(next)})
 it('校验工作区并向旧配置填充表面属性',()=>{expect(validateWorkspace(fixture)).toEqual(fixture);expect(()=>validateWorkspace({...fixture,active:'bad'})).toThrow();expect(parseConfig({version:1}).spineZoom).toBe(1);expect(()=>parseConfig({...defaults,backImage:'https://example.com'})).toThrow()})
})


describe('异步导入事务边界',()=>{
 const a='data:image/png;base64,AA==',b='data:image/png;base64,AQ=='
 it('切换项目或修改原作品期间拒绝 JSON 覆盖',()=>{
  const h=history(defaults),operation={kind:'replace' as const,original:defaults,config:{...defaults,title:'Imported'}}
  expect(resolveImport(h,'b','a',operation).h).toBe(h)
  const changed=edit(h,{...defaults,title:'My changes'});expect(resolveImport(changed,'a','a',operation).h).toBe(changed)
  const result=resolveImport(h,'a','a',operation);expect(result.h.present.title).toBe('Imported');expect(undo(result.h).present).toBe(defaults)
 })
 it('内页导入追加到提交时的最新项目，保留期间的编辑',()=>{
  const h=history({...defaults,pageImages:[a],title:'Latest'}),result=resolveImport(h,'a','a',{kind:'pages',images:[b]});expect(result.h.present.pageImages).toEqual([a,b]);expect(result.h.present.title).toBe('Latest');expect(undo(result.h).present).toBe(h.present)
 })
 it('超限或无效图片原子拒绝，不改变历史',()=>{
  const h=history({...defaults,pageCount:40,pageImages:Array(40).fill(a)});expect(resolveImport(h,'a','a',{kind:'pages',images:[b]}).h).toBe(h)
  const h2=history(defaults);expect(resolveImport(h2,'a','a',{kind:'pages',images:['bad']}).h).toBe(h2)
 })
 it('重复素材 ID 拒绝写入无效索引',()=>{const asset={id:'dup',name:'A',data:a};expect(()=>validateWorkspace({...fixture,assets:[asset,asset]})).toThrow('无效素材索引')})
})


it('存储版本区分空记录、旧版记录与带版本记录，版本不进入项目数据',()=>{
 expect(storageRevision(undefined)).toBeNull();expect(storageRevision(fixture)).toBe('legacy');expect(storageRevision({...fixture,_storageRevision:'new'})).toBe('new');expect(validateWorkspace({...fixture,_storageRevision:'new'})).toEqual(fixture)
})
