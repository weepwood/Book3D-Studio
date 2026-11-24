import * as T from 'three'
import {PRESS_REFERENCE as R} from './pressReference'
import {makeChain,rollPoint,type Chain} from './pageChain'
export function packChain(chain:Chain,data=new Float32Array(R.chainNodes*2*4)){
  for(let i=0;i<R.chainNodes;i++){
    const a=i*4,b=(R.chainNodes+i)*4
    data[a]=chain.positions[i*2];data[a+1]=chain.positions[i*2+1];data[a+2]=0;data[a+3]=1
    data[b]=chain.tangents[i*2];data[b+1]=chain.tangents[i*2+1];data[b+2]=0;data[b+3]=1
  }
  return data
}
// Three.js material integration of the observed chain/Hermite/roll architecture.
// The CPU chain and local unit conversion remain shared with the reference tests.
const shaderSource=`
uniform sampler2D ppChain;
uniform float ppWidth,ppHeight,ppAmount,ppTilt,ppSpan,ppLift;
vec4 ppSample(float u){
  float k=clamp(u,0.0,1.0)*32.0;
  float i=min(31.0,floor(k)), t=k-i, t2=t*t, t3=t2*t, ds=ppWidth/32.0;
  vec2 a=texture2D(ppChain,vec2((i+.5)/33.0,.25)).xy;
  vec2 b=texture2D(ppChain,vec2((i+1.5)/33.0,.25)).xy;
  vec2 ta=texture2D(ppChain,vec2((i+.5)/33.0,.75)).xy*ds;
  vec2 tb=texture2D(ppChain,vec2((i+1.5)/33.0,.75)).xy*ds;
  vec2 x=(2.0*t3-3.0*t2+1.0)*a+(t3-2.0*t2+t)*ta+(-2.0*t3+3.0*t2)*b+(t3-t2)*tb;
  vec2 d=(6.0*t2-6.0*t)*a+(3.0*t2-4.0*t+1.0)*ta+(-6.0*t2+6.0*t)*b+(3.0*t2-2.0*t)*tb;
  return vec4(x,length(d)>1e-7?normalize(d):vec2(1.0,0.0));
}
vec3 ppShape(vec3 p,out vec3 n){
  float x=p.x+ppWidth*.5,y=p.y,u=clamp(x/ppWidth,0.0,1.0);
  vec4 s=ppSample(u); n=vec3(-s.w,0.0,s.z);
  vec3 base=vec3(s.x,y,s.y);
  vec2 d=vec2(cos(ppTilt),sin(ppTilt));
  float xi=dot(vec2(x-.74*ppWidth,y),d);
  if(ppAmount<1e-6||xi<=0.0||u<=0.0)return base;
  float steps=max(1.0,ceil(xi/(ppSpan/64.0))),ds=xi/steps;
  vec2 roll=vec2(0.0);
  for(int i=0;i<128;i++){
    if(float(i)>=steps)break;
    float a=min(3.14159265,ppAmount*pow(clamp((float(i)+.5)*ds/ppSpan,0.0,1.0),.86));
    roll+=vec2(cos(a),sin(a))*ds;
  }
  float shift=roll.x-xi,landX=x+shift*d.x,landU=clamp(landX/ppWidth,0.0,1.0);
  vec4 land=ppSample(landU);
  vec3 t=vec3(land.z,0.0,land.w),outward=vec3(-land.w,0.0,land.z)*ppLift;
  float av=min(3.14159265,ppAmount*pow(clamp(xi/ppSpan,0.0,1.0),.86));
  n=normalize(cos(av)*outward-sin(av)*(d.x*t+vec3(0.0,d.y,0.0)))*ppLift;
  return vec3(land.x,y+shift*d.y,land.y)+t*(landX-landU*ppWidth)+outward*max(0.0,roll.y);
}
`
export function createGpuPage(width:number,height:number){
  const data=packChain(makeChain(width,0,0))
  const texture=new T.DataTexture(data,R.chainNodes,2,T.RGBAFormat,T.FloatType)
  texture.minFilter=texture.magFilter=T.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true
  const uniforms={ppChain:{value:texture},ppWidth:{value:width},ppHeight:{value:height},ppAmount:{value:0},ppTilt:{value:0},ppSpan:{value:R.curl.span/R.sourcePageWidth*width},ppLift:{value:1}}
  function attach(material:T.Material){
    const prior=material.onBeforeCompile.bind(material),priorKey=material.customProgramCacheKey()
    material.customProgramCacheKey=()=> 'book3d-chain-roll-v1:'+priorKey
    material.onBeforeCompile=(shader,renderer)=>{
      prior(shader,renderer)
      Object.assign(shader.uniforms,uniforms)
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+shaderSource)
        .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvec3 ppNormal; ppShape(position,ppNormal); objectNormal=ppNormal;')
        .replace('#include <begin_vertex>','vec3 ppUnusedNormal; vec3 transformed=ppShape(position,ppUnusedNormal);')
    }
  }
  const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide});attach(depth)
  let current=makeChain(width,0,0),pose={progress:0,amount:0,grip:0,grabU:1}
  function update(progress:number,flex:number,amount:number,grip:number,grabU:number,chain?:Chain){
    current=chain??makeChain(width,progress,flex);pose={progress,amount,grip,grabU};packChain(current,data);texture.needsUpdate=true
    uniforms.ppAmount.value=amount;uniforms.ppTilt.value=grip*R.curl.foldTiltDeg*Math.PI/180
    uniforms.ppSpan.value=R.curl.span/R.sourcePageWidth*width*(1+(1-Math.max(0,Math.min(1,grabU)))*1.2)
    uniforms.ppLift.value=progress>.5?-1:1
  }
  return {attach,depth,texture,update,pickPoint(u:number,v:number){return new T.Vector3(...rollPoint(current,u,v,height,pose.amount,pose.grip,pose.grabU,pose.progress))},pickGeometry(){const g=new T.PlaneGeometry(width,height,48,18),uv=g.getAttribute('uv'),p=g.getAttribute('position');for(let i=0;i<p.count;i++){const xyz=rollPoint(current,uv.getX(i),uv.getY(i)-.5,height,pose.amount,pose.grip,pose.grabU,pose.progress);p.setXYZ(i,...xyz)}p.needsUpdate=true;g.computeBoundingSphere();return g},dispose(){texture.dispose();depth.dispose()}}
}
