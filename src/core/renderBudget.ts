// Presentation quality only. Do not feed these levels into the physical clock,
// leaf count, geometry resolution, collision checks or commit conditions.
export class RenderBudget {
 level=0
 private slow=0
 private fast=0
 private cooldown=0
 observe(renderMs:number,gapMs:number,moving:boolean){
  if(!moving){this.slow=0;this.fast=0;this.cooldown=0;this.level=0;return}
  if(this.cooldown>0)this.cooldown--
  // Require sustained pressure; a single compile/GC stall cannot change quality.
  if(renderMs>24||gapMs>38){this.slow++;this.fast=0}
  else if(renderMs<12&&gapMs<22){this.fast++;this.slow=0}
  else{this.slow=0;this.fast=0}
  if(!this.cooldown&&this.slow>=3&&this.level<2){this.level++;this.slow=0;this.fast=0;this.cooldown=10}
  if(!this.cooldown&&this.fast>=45&&this.level>0){this.level--;this.fast=0;this.cooldown=30}
 }
 get scale(){return [1,.75,.5][this.level]}
 shadowSize(full:number){return Math.min(full,[full,1024,512][this.level])}
 reset(){this.level=0;this.slow=0;this.fast=0;this.cooldown=0}
}

export function renderProfileLevel(profile:string|null){return profile==='balanced'?1:profile==='economy'?2:0}

export type RenderProfile='full'|'balanced'|'economy'
export const RENDER_PROFILE_KEY='book3d.renderProfile'
export function parseRenderProfile(value:unknown):RenderProfile|null{return value==='full'||value==='balanced'||value==='economy'?value:null}
export function readRenderProfile():RenderProfile{
 const query=parseRenderProfile(new URLSearchParams(location.search).get('renderProfile'))
 if(query)return query
 try{return parseRenderProfile(localStorage.getItem(RENDER_PROFILE_KEY))??'full'}catch{return 'full'}
}
export function saveRenderProfile(profile:RenderProfile){
 try{localStorage.setItem(RENDER_PROFILE_KEY,profile)}catch{/* Preview remains usable without storage. */}
 // An explicit UI choice supersedes a diagnostic URL override.
 try{const url=new URL(location.href);if(url.searchParams.has('renderProfile')){url.searchParams.delete('renderProfile');history.replaceState(history.state,'',url)}}catch{}
}
