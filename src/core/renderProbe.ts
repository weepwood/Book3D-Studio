// Explicit ?perf=1 only. CPU submit time is not GPU execution or display latency.
type TimerExtension={TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number}
const limit=300
export class RenderProbe {
 private samples:Record<string,number[]>={frameGap:[],cpuFrame:[],cpuPick:[],inputToSubmit:[],gpuRender:[]}
 private ext:TimerExtension|null
 private pending:WebGLQuery[]=[]
 private active:WebGLQuery|null=null
 private started=0;private last=0;private input=0;private frames=0
 constructor(private gl:WebGL2RenderingContext,private host:HTMLElement){this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');const debug=gl.getExtension('WEBGL_debug_renderer_info');host.dataset.perfRenderer=String(debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));host.dataset.perfGpuSupported=String(!!this.ext)}
 private add(key:string,n:number){if(!Number.isFinite(n)||n<0)return;const a=this.samples[key];a.push(n);if(a.length>limit)a.shift()}
 start(now:number){this.started=performance.now();if(this.last&&now-this.last<500)this.add('frameGap',now-this.last);this.last=now;this.collect()}
 markInput(){this.input=performance.now()}
 pick(ms:number){this.add('cpuPick',ms)}
 beginGpu(){if(!this.ext||this.pending.length>=4)return;this.active=this.gl.createQuery();if(this.active)this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT,this.active)}
 endGpu(){if(!this.ext||!this.active)return;this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.pending.push(this.active);this.active=null}
 private collect(){if(!this.ext)return;if(this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)){for(const q of this.pending)this.gl.deleteQuery(q);this.pending=[];this.samples.gpuRender=[];return}while(this.pending.length&&this.gl.getQueryParameter(this.pending[0],this.gl.QUERY_RESULT_AVAILABLE)){const q=this.pending.shift()!;this.add('gpuRender',this.gl.getQueryParameter(q,this.gl.QUERY_RESULT)/1e6);this.gl.deleteQuery(q)}}
 finish(){const now=performance.now();this.add('cpuFrame',now-this.started);if(this.input){this.add('inputToSubmit',now-this.input);this.input=0}this.frames++;const stats=Object.fromEntries(Object.entries(this.samples).map(([k,v])=>{const s=v.slice().sort((a,b)=>a-b);return [k,{n:s.length,p50:s.length?s[Math.floor((s.length-1)*.5)]:null,p95:s.length?s[Math.floor((s.length-1)*.95)]:null}]}));this.host.dataset.perf=JSON.stringify({frames:this.frames,...stats})}
 dispose(){for(const q of this.pending)this.gl.deleteQuery(q);this.pending=[];if(this.active){this.gl.deleteQuery(this.active);this.active=null}}
}
