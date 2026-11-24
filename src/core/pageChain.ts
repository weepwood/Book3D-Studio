import {PRESS_REFERENCE as R} from './pressReference'
import {clamp} from './pagePhysics'
export type Chain={positions:Float64Array;tangents:Float64Array;width:number}
const smooth=(x:number)=>{x=clamp(x);return x*x*(3-2*x)}
// Independent CPU representation of the reference's 33-point position/tangent chain.
// The reference's static stack is curved too; our existing flat stacks require an
// endpoint blend until that stack is replaced. No proprietary mesh or shader copied.
export function makeChain(width:number,progress:number,flex:number):Chain{
  const n=R.chainNodes,positions=new Float64Array(n*2),tangents=new Float64Array(n*2)
  const p=clamp(progress),angle=p*Math.PI,blend=Math.sin(angle)*clamp(flex)
  const gravity=Math.PI/180*34*R.portal.gravityMul
  const rootAngle=Math.PI/2+(p-.5)*gravity
  const theta=(u:number)=>{const x=Math.pow(clamp(u),R.portal.bendFalloff),q=x<.5?2*x*x:1-2*(1-x)*(1-x);return angle+blend*(rootAngle+(angle-rootAngle)*Math.min(1,q*R.portal.bend)-angle)}
  const ds=width/(n-1)
  for(let i=0;i<n;i++){
    const a=theta(i/(n-1));tangents[i*2]=Math.cos(a);tangents[i*2+1]=Math.sin(a)
    if(i){const m=theta((i-.5)/(n-1));positions[i*2]=positions[(i-1)*2]+ds*Math.cos(m);positions[i*2+1]=positions[(i-1)*2+1]+ds*Math.sin(m)}
  }
  return {positions,tangents,width}
}
export function sampleChain(chain:Chain,u:number){
  const k=clamp(u)*(R.chainNodes-1),i=Math.min(R.chainNodes-2,Math.floor(k)),t=k-i,t2=t*t,t3=t2*t,d=chain.width/(R.chainNodes-1)
  const a=i*2,b=a+2,ps=chain.positions,ts=chain.tangents
  const h0=2*t3-3*t2+1,h1=t3-2*t2+t,h2=-2*t3+3*t2,h3=t3-t2
  const d0=6*t2-6*t,d1=3*t2-4*t+1,d2=-d0,d3=3*t2-2*t
  const x=h0*ps[a]+h1*d*ts[a]+h2*ps[b]+h3*d*ts[b],z=h0*ps[a+1]+h1*d*ts[a+1]+h2*ps[b+1]+h3*d*ts[b+1]
  const tx=d0*ps[a]+d1*d*ts[a]+d2*ps[b]+d3*d*ts[b],tz=d0*ps[a+1]+d1*d*ts[a+1]+d2*ps[b+1]+d3*d*ts[b+1],len=Math.hypot(tx,tz)||1
  return {x,z,tx:tx/len,tz:tz/len}
}
// Analytic roll on top of the chain: integrate the tangent along the fold line,
// map the landing coordinate back onto the chain, then lift outward only.
export function rollPoint(chain:Chain,u:number,v:number,height:number,amount:number,grip:number,grabU=1,progress=0){
  const c=R.curl,w=chain.width,x=u*w,y=v*height,base=sampleChain(chain,u)
  if(amount<=1e-6||u<=0)return [base.x,y,base.z] as const
  const tilt=grip*c.foldTiltDeg*Math.PI/180,dx=Math.cos(tilt),dy=Math.sin(tilt)
  const xi=(x-c.pivotU*w)*dx+(y-(c.pivotV-.5)*height)*dy
  if(xi<=0)return [base.x,y,base.z] as const
  const span=c.span/R.sourcePageWidth*w*(1+(1-clamp(grabU))*1.2),steps=Math.max(1,Math.ceil(xi/(span/64))),ds=xi/steps
  let along=0,out=0
  for(let i=0;i<steps;i++){const s=clamp((i+.5)*ds/span),a=Math.min(Math.PI,amount*Math.pow(s,c.power));along+=Math.cos(a)*ds;out+=Math.sin(a)*ds}
  const shift=along-xi,landX=x+shift*dx,landU=clamp(landX/w),land=sampleChain(chain,landU),extra=landX-landU*w,sign=progress>.5?-1:1
  return [land.x+land.tx*extra-land.tz*Math.max(0,out)*sign,y+shift*dy,land.z+land.tz*extra+land.tx*Math.max(0,out)*sign] as const
}
export function curlTarget(mode:'drag'|'hover'|'settle',progress:number,gripU:number,strength:number){
  const c=R.curl,angle=clamp(progress)*Math.PI,apex=smooth(Math.abs(Math.cos(angle))/.17),reach=1-.55*(1-clamp(gripU))
  if(mode==='hover')return c.amount*c.hoverFrac*2*reach*clamp(strength)
  if(mode==='drag')return c.amount*1.82*reach*apex*clamp(strength)
  return c.amount*1.82*(1-smooth((progress-.6)/.3))*.84*(1+.5*(1-smooth((progress-.35)/.15)))*apex*clamp(strength)
}
