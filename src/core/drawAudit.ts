import type * as T from 'three'

// Opt-in CPU instrumentation for the pinned renderer. The shadow pass contains
// its draw calls, so those timings are nested, not additive. No GPU waits.
export class DrawAudit {
 private originalDraw:T.WebGLRenderer['renderBufferDirect']
 private originalShadow:T.WebGLRenderer['shadowMap']['render']
 private running=false
 private inShadow=false
 private shadowMs=0
 private groups:Record<string,{calls:number;ms:number;newPrograms:number}>={}
 private created:{group:string;object:string;skinned:boolean;side:number;mapped:boolean;keys:string[]}[]=[]
 private before={programs:0,textures:0,geometries:0}
 constructor(private renderer:T.WebGLRenderer){
  this.originalDraw=renderer.renderBufferDirect
  this.originalShadow=renderer.shadowMap.render
  const self=this
  renderer.renderBufferDirect=function(...args){
   if(!self.running)return self.originalDraw.apply(this,args)
   const material=args[3],object=args[4],start=performance.now(),programs=renderer.info.programs?.length??0
   try{return self.originalDraw.apply(this,args)}finally{
    const key=(self.inShadow?'shadow:':'color:')+(object.name==='Turning page'?'leaf':material.type)
    const entry=self.groups[key]??={calls:0,ms:0,newPrograms:0}
    entry.calls++;entry.ms+=performance.now()-start;entry.newPrograms+=Math.max(0,(renderer.info.programs?.length??0)-programs)
    if((renderer.info.programs?.length??0)>programs){
     const keys=(renderer.info.programs??[]).slice(programs).map(p=>(p as unknown as {cacheKey:string}).cacheKey)
     self.created.push({group:key,object:object.name,skinned:!!(object as T.SkinnedMesh).isSkinnedMesh,side:material.side,mapped:!!(material as T.MeshDepthMaterial).map,keys})
    }
   }
  }
  renderer.shadowMap.render=function(...args){
   if(!self.running)return self.originalShadow.apply(this,args)
   const start=performance.now();self.inShadow=true
   try{return self.originalShadow.apply(this,args)}finally{self.shadowMs+=performance.now()-start;self.inShadow=false}
  }
 }
 begin(){this.created=[];this.groups={};this.shadowMs=0;this.before={...this.renderer.info.memory,programs:this.renderer.info.programs?.length??0};this.running=true}
 end(){this.running=false;return {shadowMs:this.shadowMs,groups:this.groups,created:this.created,before:this.before,after:{...this.renderer.info.memory,programs:this.renderer.info.programs?.length??0}}}
 dispose(){this.running=false;this.renderer.renderBufferDirect=this.originalDraw;this.renderer.shadowMap.render=this.originalShadow}
}
