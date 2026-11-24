import {useEffect,useRef,useState} from 'react'
import {defaults,parseConfig,type BookConfig} from '../core/schema'
import {history,edit,undo,redo,initialWorkspace,loadWorkspace,persistWorkspace,newProject,saveProject,removeProject,resolveImport,WorkspaceConflictError,type StorageRevision,type ImportEdit,type Workspace,type History,type Asset} from '../core/workspace'
function legacy(){try{return parseConfig(JSON.parse(localStorage.getItem('book3d.config')||'null'))}catch{return {...defaults}}}
type State={w:Workspace;h:History;notice?:string}
function init():State{const c=legacy();return {w:initialWorkspace(c),h:history(c)}}
export function useWorkspace(){
  const [state,setState]=useState(init),[ready,setReady]=useState(false),[savedWorkspace,setSavedWorkspace]=useState<Workspace|null>(null),[storageError,setStorageError]=useState('')
  const writable=useRef(true),queue=useRef(Promise.resolve()),revision=useRef(0),storageVersion=useRef<StorageRevision>(null),persisted=useRef<Workspace|null>(null)
  useEffect(()=>{let alive=true;loadWorkspace().then(({workspace:w,revision:version})=>{if(!alive)return;storageVersion.current=version;if(w){persisted.current=w;setSavedWorkspace(w);setState({w,h:history(w.projects.find(p=>p.id===w.active)!.config)})}}).catch(()=>{if(alive){writable.current=false;setStorageError('无法读取本地工作区，已保护原数据不被覆盖，请导出备份。')}}).finally(()=>{if(alive)setReady(true)});return()=>{alive=false}},[])
  useEffect(()=>{if(!ready||!writable.current||state.w===persisted.current)return;const id=++revision.current,snapshot=state.w
    queue.current=queue.current.catch(()=>{}).then(async()=>{
      if(id!==revision.current||!writable.current)return
      try{storageVersion.current=await persistWorkspace(snapshot,storageVersion.current);persisted.current=snapshot;setSavedWorkspace(snapshot);if(id===revision.current)setStorageError('')}
      catch(e){if(e instanceof WorkspaceConflictError){writable.current=false;setStorageError(e.message)}else if(id===revision.current)setStorageError('本地保存失败，请导出项目备份。')}
    })
  },[state.w,ready])
  function apply(fn:(h:History)=>History){setState(s=>{const h=fn(s.h);return h===s.h?s:{...s,h,w:saveProject(s.w,s.w.active,h.present)}})}
  function setConfig(fn:BookConfig|((c:BookConfig)=>BookConfig),group=''){const now=Date.now();apply(h=>edit(h,typeof fn==='function'?fn(h.present):fn,group,now))}
  function select(id:string){setState(s=>{const p=s.w.projects.find(p=>p.id===id);return !p||id===s.w.active?s:{w:{...s.w,active:id},h:history(p.config)}})}
  function create(copy=false){setState(s=>{const old=s.w.projects.find(p=>p.id===s.w.active)!;const p=newProject(copy?old.name+' 副本':'未命名书籍',copy?{...s.h.present}:{...defaults});return {w:{...s.w,active:p.id,projects:[...s.w.projects,p]},h:history(p.config)}})}
  function remove(id:string){setState(s=>{const w=removeProject(s.w,id);return w===s.w?s:{w,h:w.active===s.w.active?s.h:history(w.projects.find(p=>p.id===w.active)!.config)}})}
  function rename(name:string){setState(s=>({...s,w:{...s.w,projects:s.w.projects.map(p=>p.id===s.w.active?{...p,name:name.slice(0,80)}:p)}}))}
  function setNotice(notice:string){setState(s=>({...s,notice}))}
  function commitImport(projectId:string,operation:ImportEdit){setState(s=>{const result=resolveImport(s.h,s.w.active,projectId,operation);return {...s,notice:result.notice,h:result.h,w:result.h===s.h?s.w:saveProject(s.w,s.w.active,result.h.present)}})}
  function addAsset(a:Asset,key:'coverImage'|'backImage'|'spineImage',projectId:string){setState(s=>{const w={...s.w,assets:[...s.w.assets,a]};if(s.w.active!==projectId)return {...s,w,notice:'素材已加入本地库；项目已切换，未应用到当前作品。'};const h=edit(s.h,{...s.h.present,[key]:a.data});return {...s,h,w:saveProject(w,w.active,h.present),notice:'素材已加入本地库'}})}
  function deleteAsset(id:string){setState(s=>({...s,w:{...s.w,assets:s.w.assets.filter(a=>a.id!==id)}}))}
  return {notice:state.notice??'',setNotice,commitImport,config:state.h.present,w:state.w,ready,saved:state.w===savedWorkspace,storageError,setConfig,undo:()=>apply(undo),redo:()=>apply(redo),canUndo:state.h.past.length>0,canRedo:state.h.future.length>0,select,create,remove,rename,addAsset,deleteAsset}
}
