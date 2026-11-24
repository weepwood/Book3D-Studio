import {defaults,parseConfig,type BookConfig} from './schema'
export type Project={id:string;name:string;config:BookConfig;updated:number}
export type Asset={id:string;name:string;data:string}
export type Workspace={active:string;projects:Project[];assets:Asset[]}
export type History={past:BookConfig[];present:BookConfig;future:BookConfig[];group:string;at:number}
export const history=(present:BookConfig):History=>({past:[],present,future:[],group:'',at:0})
export function edit(h:History,next:BookConfig,group='',at=0):History{
  if(Object.keys(next).every(k=>next[k as keyof BookConfig]===h.present[k as keyof BookConfig]))return h
  const merge=!!group&&h.group===group&&at>=h.at&&at-h.at<500
  return {past:merge?h.past:[...h.past.slice(-39),h.present],present:next,future:[],group,at}
}
export function undo(h:History):History{
  if(!h.past.length)return h
  return {past:h.past.slice(0,-1),present:h.past[h.past.length-1],future:[h.present,...h.future],group:'',at:0}
}
export function redo(h:History):History{
  if(!h.future.length)return h
  return {past:[...h.past,h.present],present:h.future[0],future:h.future.slice(1),group:'',at:0}
}
export function newProject(name='未命名书籍',config:BookConfig={...defaults}):Project{return {id:crypto.randomUUID(),name,config,updated:Date.now()}}
export function initialWorkspace(config:BookConfig):Workspace{const p=newProject('我的书籍',config);return {active:p.id,projects:[p],assets:[]}}
export function saveProject(w:Workspace,id:string,config:BookConfig):Workspace{return {...w,projects:w.projects.map(p=>p.id===id?{...p,config,updated:Date.now()}:p)}}
export function removeProject(w:Workspace,id:string):Workspace{
  if(w.projects.length<=1)return w
  const projects=w.projects.filter(p=>p.id!==id)
  return {...w,projects,active:w.active===id?projects[0].id:w.active}
}
export function validateWorkspace(raw:unknown):Workspace{
  const w=raw as Workspace
  if(!w||!Array.isArray(w.projects)||!w.projects.length||!Array.isArray(w.assets))throw Error('无效工作区')
  const projects=w.projects.map(p=>{if(typeof p.id!=='string'||typeof p.name!=='string'||!Number.isFinite(p.updated))throw Error('无效项目');return {...p,config:parseConfig(p.config)}})
  if(new Set(projects.map(p=>p.id)).size!==projects.length||!projects.some(p=>p.id===w.active))throw Error('无效项目索引')
  const assets=w.assets.map(a=>{if(typeof a.id!=='string'||typeof a.name!=='string')throw Error('无效素材');return {...a,data:parseConfig({version:1,coverImage:a.data}).coverImage}})
  return {...w,projects,assets}
}
function openDB():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  const request=indexedDB.open('book3d-studio',1)
  request.onupgradeneeded=()=>request.result.createObjectStore('workspace')
  request.onsuccess=()=>resolve(request.result)
  request.onerror=()=>reject(request.error)
  request.onblocked=()=>reject(Error('数据库被其他窗口占用'))
})}
export async function loadWorkspace():Promise<Workspace|null>{
  const db=await openDB()
  try{return await new Promise((resolve,reject)=>{
    const q=db.transaction('workspace').objectStore('workspace').get('current')
    q.onsuccess=()=>{try{resolve(q.result===undefined?null:validateWorkspace(q.result))}catch(e){reject(e)}}
    q.onerror=()=>reject(q.error)
  })}finally{db.close()}
}
export async function persistWorkspace(w:Workspace):Promise<void>{
  const db=await openDB()
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('workspace','readwrite')
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
    tx.objectStore('workspace').put(w,'current')
  })}finally{db.close()}
}
