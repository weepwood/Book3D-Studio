import type {ContactRequest,ContactReply} from './contactWorkerProtocol'
// One in-flight request; no unbounded queue. Only detached copies are sent.
export class ContactWorkerClient {
 private worker:Worker|null=null
 private id=0
 private pending=false
 private disposed=false
 private timer:ReturnType<typeof setTimeout>|null=null
 private clearDeadline(){if(this.timer!==null){clearTimeout(this.timer);this.timer=null}}
 dropped=0
 constructor(private receive:(reply:ContactReply)=>void){}
 request(capture:()=>Omit<ContactRequest,'id'>){
  if(this.disposed)return
  if(this.pending){this.dropped++;return}
  try{
   if(!this.worker){
    this.worker=new Worker(new URL('./contact.worker.ts',import.meta.url),{type:'module'})
    const worker=this.worker
    worker.onmessage=(event:MessageEvent<ContactReply>)=>{if(this.worker!==worker||event.data.id!==this.id||this.disposed)return;this.clearDeadline();this.pending=false;this.receive(event.data)}
    worker.onerror=event=>{if(this.worker!==worker||this.disposed)return;this.clearDeadline();this.pending=false;this.worker?.terminate();this.worker=null;this.receive({id:this.id,error:event.message||'Collision worker failed'})}
   }
   const id=++this.id,started=performance.now(),data=capture(),captureMs=performance.now()-started;this.pending=true
   this.worker.postMessage({...data,id,captureMs},data.meshes.flatMap(m=>[m.positions.buffer,m.indices.buffer]))
   this.timer=setTimeout(()=>{if(this.pending&&id===this.id){this.reset();this.receive({id,error:'Collision worker timed out'})}},5000)
  }catch(error){this.clearDeadline();this.pending=false;this.receive({id:this.id,error:String(error)})}
 }
 reset(){this.clearDeadline();this.id++;this.clearDeadline();this.pending=false;this.worker?.terminate();this.worker=null}
 dispose(){this.disposed=true;this.reset()}
}
