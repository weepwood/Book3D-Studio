import React, {useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {BookRuntime} from './core/runtime'
import {defaults,parseConfig,presets,ranges,type BookConfig} from './core/schema'
import './style.css'

function download(name:string,content:Blob|string){const url=typeof content==='string'?content:URL.createObjectURL(content);const a=document.createElement('a');a.href=url;a.download=name;a.click();if(typeof content!=='string')setTimeout(()=>URL.revokeObjectURL(url),1000)}
function Range({label,value,min,max,step=1,unit='',onChange}:{label:string,value:number,min:number,max:number,step?:number,unit?:string,onChange:(n:number)=>void}){return <label className="range"><span>{label}<output>{Number(value.toFixed(2))}{unit}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)}/></label>}
function App(){
  const [config,setConfig]=useState<BookConfig>(()=>{try{return parseConfig(JSON.parse(localStorage.getItem('book3d.config')||'null'))}catch{return {...defaults}}})
  const [tab,setTab]=useState('模型')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [preview,setPreview]=useState(false)
  const [saved,setSaved]=useState(true)
  const host=useRef<HTMLDivElement>(null),runtime=useRef<BookRuntime|null>(null),initial=useRef(config),press=useRef<[number,number]|null>(null)
  const imageInput=useRef<HTMLInputElement>(null),projectInput=useRef<HTMLInputElement>(null)
  const change=<K extends keyof BookConfig>(key:K,value:BookConfig[K])=>setConfig(c=>({...c,[key]:value}))
  useEffect(()=>{if(!host.current)return;try{runtime.current=new BookRuntime(host.current,initial.current)}catch{setError('当前浏览器无法初始化 WebGL。请检查硬件加速设置。')}return()=>{runtime.current?.dispose();runtime.current=null}},[])
  useEffect(()=>{runtime.current?.update(config);try{localStorage.setItem('book3d.config',JSON.stringify(config));setSaved(true)}catch{setSaved(false)}},[config])
  const toggle=()=>setConfig(c=>({...c,opening:c.opening>0?0:115}))
  const range=(k:keyof typeof ranges,label:string,unit='',step=1)=><Range label={label} value={config[k]} min={ranges[k][0]} max={ranges[k][1]} step={step} unit={unit} onChange={v=>change(k,v)}/>
  const color=(k:'coverColor'|'paperColor'|'inkColor'|'background',label:string)=><label className="color"><span>{label}</span><input type="color" value={config[k]} onChange={e=>change(k,e.target.value)}/><code>{config[k]}</code></label>
  const upload=async(file:File|undefined)=>{if(!file)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw new Error('请选择不超过 8 MB 的 PNG、JPEG 或 WebP');const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>24_000_000)throw new Error('图片像素过多');const ratio=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法读取图像');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);change('coverImage',canvas.toDataURL('image/webp',.9));setNotice('封面已更新')}finally{bitmap.close()}}catch(e){setNotice(String(e))}}
  const importProject=async(file:File|undefined)=>{if(!file)return;try{if(file.size>13_000_000)throw new Error('项目文件过大');setConfig(parseConfig(JSON.parse(await file.text())));setNotice('项目已导入')}catch(e){setNotice(String(e))}}
  return <div className={'app'+(preview?' preview':'')}>
    <header><div className="brand"><span className="mark">B</span><strong>Book3D <small>Studio</small></strong><span className="version">0.2</span></div><div className="project">Untitled book <span>{saved?'· 已保存':'· 本地存储已满，请导出'}</span></div><div className="actions"><button onClick={()=>setPreview(p=>!p)}>{preview?'返回编辑':'预览'}</button><button className="primary" onClick={()=>download('book3d.json',new Blob([JSON.stringify(config,null,2)],{type:'application/json'}))}>导出项目 ↗</button></div></header>
    <main>
      {!preview&&<aside className="left"><div className="section-label">WORKSPACE</div>{['模型','材质','场景','交互','项目'].map(t=><button key={t} className={'nav '+(tab===t?'active':'')} onClick={()=>setTab(t)}><span>{({'模型':'◇','材质':'◐','场景':'☼','交互':'↗','项目':'▤'} as Record<string,string>)[t]}</span>{t}</button>)}<div className="section-label templates">PRESETS</div>{Object.entries(presets).map(([name,p])=><button key={name} className="preset" onClick={()=>setConfig(c=>({...c,...p,coverImage:''}))}><span style={{background:p.coverColor}} className="swatch"/>{name}</button>)}<div className="left-foot">LOCAL WORKSPACE<br/><span>独立三维渲染引擎</span></div></aside>}
      <section className="viewport" style={{background:config.background}}>
        <div className="viewport-top"><span>Perspective / 3D</span><button onClick={()=>runtime.current?.fit()}>重置视角</button></div>
        <div ref={host} className="canvas-host" onPointerDown={e=>{press.current=[e.clientX,e.clientY]}} onPointerCancel={()=>press.current=null} onPointerUp={e=>{const p=press.current;press.current=null;if(p&&Math.hypot(e.clientX-p[0],e.clientY-p[1])<5&&config.interaction==='click'&&runtime.current?.hitTest(e.clientX,e.clientY))toggle()}}/>
        {error&&<div className="fallback"><div className="fallback-book" style={{background:config.coverColor,color:config.inkColor}}>{config.title}</div><p>{error}</p></div>}
        <div className="viewport-bottom"><button onClick={toggle}>{config.opening?'闭合书籍':'打开书籍'}</button><button onClick={()=>{try{if(!runtime.current)throw new Error('预览不可用');download('book.png',runtime.current.capture())}catch(e){setNotice(String(e))}}}>保存 PNG</button></div>
        <span className="hint">拖动旋转 · 滚轮缩放 · 点击开合（交互模式）</span>
      </section>
      {!preview&&<aside className="right"><div className="panel-title"><strong>{tab}</strong><button onClick={()=>{setConfig({...defaults});setNotice('已恢复默认设置')}}>重置</button></div>
        {tab==='模型'&&<><div className="section-label">GEOMETRY</div>{range('width','宽度',' mm')}{range('height','高度',' mm')}{range('thickness','总厚度',' mm')}{range('boardThickness','封面厚度',' mm',.1)}{range('cornerRadius','封面圆角',' mm',.1)}{range('pageInset','书芯内缩',' mm',.1)}<label className="field">书脊形状<select value={config.spineStyle} onChange={e=>change('spineStyle',e.target.value as BookConfig['spineStyle'])}><option value="rounded">圆背</option><option value="square">方背</option></select></label><hr/><div className="section-label">TRANSFORM</div>{range('yaw','水平旋转','°')}{range('pitch','俯仰角','°')}{range('opening','封面开合','°')}{range('coverFlex','封面柔性','',.01)}{range('pageCoupling','书芯联动','',.01)}</>}
        {tab==='材质'&&<><div className="section-label">COVER ART</div>{(['title','subtitle','author'] as const).map((k,i)=><label className="field" key={k}>{['标题','副标题','作者'][i]}<input maxLength={160} value={config[k]} onChange={e=>change(k,e.target.value)}/></label>)}<button className="wide" onClick={()=>imageInput.current?.click()}>上传封面图片</button>{config.coverImage&&<button className="wide" onClick={()=>change('coverImage','')}>移除图片</button>}<hr/>{color('coverColor','封面')}{color('inkColor','文字')}{color('paperColor','书页')}<label className="field">材质<select value={config.finish} onChange={e=>change('finish',e.target.value as BookConfig['finish'])}><option value="cloth">布面</option><option value="matte">哑光</option><option value="gloss">光面</option></select></label>{range('roughness','粗糙度','',.01)}</>}
        {tab==='场景'&&<><div className="section-label">LIGHTING</div>{range('light','主光强度','',.1)}{color('background','背景')}<button className="wide" onClick={()=>runtime.current?.fit()}>适配相机</button></>}
        {tab==='交互'&&<><div className="section-label">BEHAVIOR</div><label className="field">交互模式<select value={config.interaction} onChange={e=>change('interaction',e.target.value as BookConfig['interaction'])}><option value="click">点击开合 + 拖动</option><option value="hover">指针倾斜</option><option value="orbit">仅自由旋转</option></select></label>{range('opening','目标开合角度','°')}<button className="wide" onClick={toggle}>测试开合动画</button><p className="note">开合采用实时弹簧阻尼，支持中途反向。五节骨骼蒙皮控制封面曲率，书芯按开合角度联动。</p></>}
        {tab==='项目'&&<><div className="section-label">PROJECT FILE</div><button className="wide" onClick={()=>projectInput.current?.click()}>导入 JSON</button><button className="wide" onClick={()=>download('book3d.json',new Blob([JSON.stringify(config,null,2)],{type:'application/json'}))}>导出 JSON</button><p className="note">本地自动保存，不上传素材。当前版本尚未实现独立 HTML / GLB 导出。</p></>}
      </aside>}
    </main>
    <footer><span>BOOK3D / WEBGL</span><span role="status">{notice||'本地渲染 · 无需账号'}</span><span>v0.2.0</span></footer>
    <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void upload(e.target.files?.[0]);e.target.value=''}}/><input ref={projectInput} hidden type="file" accept=".json,application/json" onChange={e=>{void importProject(e.target.files?.[0]);e.target.value=''}}/>
  </div>
}
createRoot(document.getElementById('root')!).render(<App/>)
