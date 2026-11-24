import * as T from 'three'

export const BONE_COUNT=5
export function skinWeights(x:number,width:number){
  const u=T.MathUtils.clamp(x/width,0,1)*(BONE_COUNT-1)
  const a=Math.floor(u),b=Math.min(a+1,BONE_COUNT-1),f=u-a
  return {indices:[a,b,0,0],weights:[1-f,f,0,0]}
}
export function bookDimensions(width:number,height:number,thickness:number,boardThickness:number,pageInset:number){
  const w=width/100,h=height/100,d=thickness/100,t=boardThickness/100
  const inset=pageInset/100
  return {w,h,d,t,inset,pageWidth:w-2*inset,pageHeight:h-2*inset,pageDepth:d-2*t,coverZ:(d-t)/2}
}
export function openingPose(degrees:number,flex:number,coupling:number){
  const open=T.MathUtils.clamp(degrees,0,150)
  const angle=T.MathUtils.degToRad(open)
  const flexAngle=T.MathUtils.degToRad(24)*T.MathUtils.clamp(flex,0,1)*Math.sin(angle/2)/(BONE_COUNT-1)
  const pageAngle=T.MathUtils.degToRad(Math.min(open*.24,18))*T.MathUtils.clamp(coupling,0,1)
  return {hinge:-angle,bone:-flexAngle,page:-pageAngle}
}

// Give the segmented board a true rounded planform and retain continuous UVs.
// The fine edge bands make small corner radii independent of overall book size.
export function boardGeometry(w:number,h:number,t:number,radius:number,segments=32){
  const r=Math.min(Math.max(0,radius),w/4,h/4)
  const g=new T.BoxGeometry(w,h,t,segments,segments,1)
  const p=g.getAttribute('position'),uv=g.getAttribute('uv')
  const remap=(v:number,half:number)=>{
    if(r===0)return v
    const q=(v+half)/(2*half)*segments
    if(q<1.00001)return -half+q*r
    if(q>segments-1.00001)return half-(segments-q)*r
    return -half+r+(q-1)/(segments-2)*(2*half-2*r)
  }
  for(let i=0;i<p.count;i++){
    let x=remap(p.getX(i),w/2),y=remap(p.getY(i),h/2)
    const cx=Math.max(-w/2+r,Math.min(w/2-r,x))
    const cy=Math.max(-h/2+r,Math.min(h/2-r,y))
    const dx=x-cx,dy=y-cy,dist=Math.hypot(dx,dy)
    if(r>0&&dist>r){x=cx+dx*r/dist;y=cy+dy*r/dist}
    // Only the large front/back surfaces use artwork UVs.
    if(Math.abs(g.getAttribute('normal').getZ(i))>.9){
      const front=g.getAttribute('normal').getZ(i)>0
      uv.setXY(i,front?(x/w+.5):(.5-x/w),y/h+.5)
    }
    p.setXYZ(i,x+w/2,y,p.getZ(i))
  }
  p.needsUpdate=true;uv.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere()
  return g
}

export function skinnedBoard(w:number,h:number,t:number,radius:number,materials:T.Material[]){
  const g=boardGeometry(w,h,t,radius)
  const p=g.getAttribute('position'),indices:number[]=[],weights:number[]=[]
  for(let i=0;i<p.count;i++){
    const s=skinWeights(p.getX(i),w);indices.push(...s.indices);weights.push(...s.weights)
  }
  g.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4))
  g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4))
  const bones=Array.from({length:BONE_COUNT},()=>new T.Bone())
  bones.forEach((b,i)=>{b.name='cover_'+i;if(i){b.position.x=w/(BONE_COUNT-1);bones[i-1].add(b)}})
  const mesh=new T.SkinnedMesh(g,materials)
  mesh.add(bones[0]);mesh.updateMatrixWorld(true)
  const skeleton=new T.Skeleton(bones);mesh.bind(skeleton)
  // The pose-dependent bounds are refreshed only for actual pose changes.
  mesh.frustumCulled=false
  return {mesh,bones,skeleton}
}
