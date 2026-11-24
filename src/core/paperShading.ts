import * as T from 'three'
import {PRESS_SCENE as R} from './referenceScene'
export function applyPaperShading(mat:T.MeshPhongMaterial,flip=false){
 const p=R.paper,side=flip?1:0
 mat.customProgramCacheKey=()=> 'book3d-paper-gutter-v1'
 mat.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,{paperFlip:{value:side},paperBounce:{value:new T.Color(...p.bounceColor)},paperGrain:{value:p.shadowGrain}})
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float paperU;').replace('#include <uv_vertex>','#include <uv_vertex>\npaperU=uv.x;')
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float paperU; uniform float paperFlip; uniform vec3 paperBounce; uniform float paperGrain;')
     .replace('#include <opaque_fragment>',`
       float spineU=clamp(mix(paperU,1.0-paperU,paperFlip),0.0,1.0);
       float tilt=pow(clamp(1.0-abs(dot(normalize(normal),normalize(vViewPosition))),0.0,1.0),1.5);
       float bounce=pow(1.0-smoothstep(0.0,.29,spineU),1.87)*(.8+.6*tilt);
       outgoingLight+=paperBounce*bounce*.39*.6;
       float band=1.0-smoothstep(0.0,.14,spineU);
       float core=1.0-smoothstep(0.0,.045,spineU);
       float crease=min(.6,.18*band*band*(.6+.4*tilt)+.34*core*core*core);
       outgoingLight*=1.0-crease;
       // Independent stable screen-space grain (no perpetual animation).
       vec2 pxy=gl_FragCoord.xy;
       vec3 noise=vec3(fract(sin(dot(pxy,vec2(17.31,87.19)))*23453.123),fract(sin(dot(pxy,vec2(43.73,19.81)))*34732.321),fract(sin(dot(pxy,vec2(79.39,53.11)))*19721.213))-.5;
       float lum=dot(outgoingLight,vec3(.2126,.7152,.0722));
       outgoingLight+=noise*(.3+.7*(1.0-smoothstep(.3,1.2,lum)))*paperGrain*.75;
       #include <opaque_fragment>
     `)
 }
}
