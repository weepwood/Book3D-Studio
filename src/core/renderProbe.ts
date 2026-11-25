// Explicit ?perf=1 only. CPU submit time is not GPU execution or display latency.
type TimerExtension={TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number}
const limit=300
export class RenderProbe {
 private samples:Record<string,number[]>={frameGap:[],cpuFrame:[],cpuPick:[],inputToSubmit:[],gpuRender:[]}
 private ext:TimerExtension|null
 private pending:WebGLQuery[]=[]
 private active:WebGLQuery|null=null
 private phaseAt=0;private phases:Record<string,number>={};private slowFrames:{duration:number;state:string;phases:Record<string,number>}[]=[];private started=0;private last=0;private input=0;private frames=0;private published=0;private publishedAt=-Infinity;private fullRate=new URLSearchParams(location.search).get('perfPublish')==='frame'
 constructor(private gl:WebGL2RenderingContext,private host:HTMLElement){this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');const debug=gl.getExtension('WEBGL_debug_renderer_info');host.dataset.perfRenderer=String(debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));host.dataset.perfGpuSupported=String(!!this.ext)}
 private add(key:string,n:number){if(!Number.isFinite(n)||n<0)return;const a=this.samples[key];a.push(n);if(a.length>limit)a.shift()}
 start(now:number){this.started=performance.now();this.phaseAt=this.started;this.phases={};if(this.last&&now-this.last<500)this.add('frameGap',now-this.last);this.last=now;this.collect()}
 phase(name:string){const now=performance.now();this.phases[name]=now-this.phaseAt;this.phaseAt=now}
 frameSnapshot(){return {startedAt:this.started,elapsedMs:performance.now()-this.started,phases:{...this.phases}}}
 markInput(){this.input=performance.now()}
 pick(ms:number){this.add('cpuPick',ms)}
 beginGpu(){if(!this.ext||this.pending.length>=4)return;this.active=this.gl.createQuery();if(this.active)this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT,this.active)}
 endGpu(){if(!this.ext||!this.active)return;this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.pending.push(this.active);this.active=null}
 private collect(){if(!this.ext)return;if(this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)){for(const q of this.pending)this.gl.deleteQuery(q);this.pending=[];this.samples.gpuRender=[];return}while(this.pending.length&&this.gl.getQueryParameter(this.pending[0],this.gl.QUERY_RESULT_AVAILABLE)){const q=this.pending.shift()!;this.add('gpuRender',this.gl.getQueryParameter(q,this.gl.QUERY_RESULT)/1e6);this.gl.deleteQuery(q)}}
 finish(state='idle'){const now=performance.now(),duration=now-this.started;this.add('cpuFrame',duration);if(duration>33.4){this.slowFrames.push({duration,state,phases:{...this.phases}});if(this.slowFrames.length>24)this.slowFrames.shift()}const hadInput=!!this.input;if(this.input){this.add('inputToSubmit',now-this.input);this.input=0}this.frames++;if(!this.fullRate&&state!=='idle'&&!hadInput&&now-this.publishedAt<100)return;this.publishedAt=now;this.published++;const stats=Object.fromEntries(Object.entries(this.samples).map(([k,v])=>{const s=v.slice().sort((a,b)=>a-b);return [k,{n:s.length,p50:s.length?s[Math.floor((s.length-1)*.5)]:null,p95:s.length?s[Math.floor((s.length-1)*.95)]:null,p99:s.length?s[Math.floor((s.length-1)*.99)]:null}]}));this.host.dataset.perf=JSON.stringify({frames:this.frames,published:this.published,...stats,slowFrames:this.slowFrames})}
 dispose(){for(const q of this.pending)this.gl.deleteQuery(q);this.pending=[];if(this.active){this.gl.deleteQuery(this.active);this.active=null}}
}
