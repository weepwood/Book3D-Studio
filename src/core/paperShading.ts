import * as T from 'three'
import {PRESS_SCENE as R} from './referenceScene'
// Match the pinned Three r174 directional shadow call only. The unrolled
// loop indices remain intact; two deterministic texel-offset PCF samples.
export function paperShadowChunk(source:string){
 const call='getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )'
 const sample=(sign:number)=>call.replace('vDirectionalShadowCoord[ i ] )', 'vDirectionalShadowCoord[ i ] + vec4( vec2( '+(sign*.45).toFixed(2)+', '+(sign*.25).toFixed(2)+' ) / directionalLightShadow.shadowMapSize * vDirectionalShadowCoord[ i ].w, 0.0, 0.0 ) )')
 return source.replace(call,'( 0.5 * '+sample(1)+' + 0.5 * '+sample(-1)+' )')
}
export function applyPaperShading(mat:T.MeshPhongMaterial,flip=false){
 const p=R.paper,side=flip?1:0
 mat.customProgramCacheKey=()=> 'book3d-paper-gutter-v2'
 mat.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,{paperFlip:{value:side},paperBounce:{value:new T.Color(...p.bounceColor)},paperGrain:{value:p.shadowGrain},paperEdge:{value:new T.Vector3(p.edgeBand,p.edgeBright,p.edgeDark)}})
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 paperUV;').replace('#include <uv_vertex>','#include <uv_vertex>\npaperUV=uv;')
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 paperUV; uniform float paperFlip; uniform vec3 paperBounce; uniform float paperGrain; uniform vec3 paperEdge;')
     .replace('#include <lights_fragment_begin>',paperShadowChunk(T.ShaderChunk.lights_fragment_begin))
     .replace('#include <opaque_fragment>',`
       float spineU=clamp(mix(paperUV.x,1.0-paperUV.x,paperFlip),0.0,1.0);
       float tilt=pow(clamp(1.0-abs(dot(normalize(normal),normalize(vViewPosition))),0.0,1.0),1.5);
       float bounce=pow(1.0-smoothstep(0.0,.29,spineU),1.87)*(.8+.6*tilt);
       outgoingLight+=paperBounce*bounce*.39*.6;
       float band=1.0-smoothstep(0.0,.14,spineU);
       float core=1.0-smoothstep(0.0,.045,spineU);
       float crease=min(.6,.18*band*band*(.6+.4*tilt)+.34*core*core*core);
       vec3 hue=vec3(0.0);
       #if NUM_DIR_LIGHTS > 0
       for(int j=0;j<NUM_DIR_LIGHTS;j++){hue+=directionalLights[j].color;}
       #endif
       float hueLum=dot(hue,vec3(.2126,.7152,.0722));
       hue=hueLum>1e-4?hue/hueLum:vec3(1.0);
       outgoingLight*=(1.0-crease)*mix(vec3(1.0),hue,clamp(crease*3.3,0.0,.6));
       // Surface tangents from the UV Jacobian, rather than screen-axis
       // derivatives. The independent cover basis may mirror the left page.
       vec2 du=dFdx(paperUV),dv=dFdy(paperUV);
       vec3 dx=-dFdx(vViewPosition),dy=-dFdy(vViewPosition);
       float det=du.x*dv.y-du.y*dv.x;
       if(abs(det)>1e-9){
         vec3 U=(dx*dv.y-dy*du.y)*sign(det)*(1.0-2.0*paperFlip);
         vec3 V=(dy*du.x-dx*dv.x)*sign(det);
         vec3 view=normalize(vViewPosition);
         float fore=smoothstep(1.0-paperEdge.x,1.0,spineU)*max(0.0,dot(view,normalize(U)));
         float head=smoothstep(1.0-paperEdge.x,1.0,paperUV.y)*max(0.0,dot(view,normalize(V)));
         float tail=(1.0-smoothstep(0.0,paperEdge.x,paperUV.y))*max(0.0,dot(view,-normalize(V)));
         float edge=max(fore,max(head,tail));
         outgoingLight*=mix(1.0,mix(paperEdge.y,paperEdge.z,abs(dot(normalize(normal),view))),edge);
       }
       // Independent stable screen-space grain (no perpetual animation).
       vec2 pxy=gl_FragCoord.xy;
       vec3 noise=vec3(fract(sin(dot(pxy,vec2(17.31,87.19)))*23453.123),fract(sin(dot(pxy,vec2(43.73,19.81)))*34732.321),fract(sin(dot(pxy,vec2(79.39,53.11)))*19721.213))-.5;
       float lum=dot(outgoingLight,vec3(.2126,.7152,.0722));
       outgoingLight+=noise*(.3+.7*(1.0-smoothstep(.3,1.2,lum)))*paperGrain*.75;
       #include <opaque_fragment>
     `)
 }
}
