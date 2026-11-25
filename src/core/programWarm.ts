// Never call gl.finish or wait synchronously on a shader compiler. This probe
// observes only the actual program handles submitted at the time of the scan.
export function observePrograms(gl:WebGL2RenderingContext,programs:readonly WebGLProgram[],report:(state:string)=>void){
 const ext=gl.getExtension('KHR_parallel_shader_compile') as {COMPLETION_STATUS_KHR:number}|null
 if(!ext||!programs.length){report('unavailable');return ()=>{}}
 const started=performance.now();let timer:ReturnType<typeof setTimeout>|null=null,canceled=false
 const poll=()=>{
  timer=null;if(canceled||gl.isContextLost())return
  try{
   if(programs.some(p=>!gl.isProgram(p))){report('invalidated');return}
   if(programs.every(p=>gl.getProgramParameter(p,ext.COMPLETION_STATUS_KHR))){report('complete');return}
   if(performance.now()-started>3000){report('timeout');return}
   timer=setTimeout(poll,25)
  }catch{report('unavailable')}
 }
 report('pending');timer=setTimeout(poll,0)
 return ()=>{canceled=true;if(timer!==null)clearTimeout(timer)}
}
