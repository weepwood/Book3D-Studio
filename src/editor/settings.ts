import {defaults,presets,type BookConfig} from '../core/schema'
export const settingGroups={
 geometry:['width','height','thickness','thicknessMode','paperThickness','paperPhysics','paperGrammage','paperModulus','paperDamping','boardThickness','cornerRadius','pageInset','spineStyle'],
 pose:['yaw','pitch','coverFlex','pageCoupling'],
 material:['coverColor','inkColor','paperColor','finish','roughness'],
 reading:['pageCurl','pageDuration','pageCorner','pageHover','pageBleed'],
 scene:['light','background'], interaction:['interaction'],
 cover:['coverZoom','coverX','coverY'],back:['backZoom','backX','backY'],spine:['spineZoom','spineX','spineY']
} as const satisfies Record<string,readonly (keyof BookConfig)[]>
export type SettingGroup=keyof typeof settingGroups
export function resetSettings(c:BookConfig,...groups:SettingGroup[]):BookConfig{
 const next={...c};for(const group of groups)for(const key of settingGroups[group])Object.assign(next,{[key]:defaults[key]});return next
}
export function applyMaterialPreset(c:BookConfig,name:string):BookConfig{
 const preset=presets[name];if(!preset)return c
 const next={...c};for(const key of settingGroups.material)if(preset[key]!==undefined)Object.assign(next,{[key]:preset[key]});return next
}
export function commitNumber(draft:string,previous:number,min:number,max:number,step:number){
 if(!draft.trim()||!Number.isFinite(Number(draft)))return previous
 const n=Math.min(max,Math.max(min,Number(draft)))
 // Respect the control's step while allowing an exact legal upper bound.
 const precision=Math.min(10,Math.max((String(step).split('.')[1]||'').length,(String(min).split('.')[1]||'').length,(String(max).split('.')[1]||'').length))
 return n===max?max:Number(Math.min(max,Math.max(min,min+Math.round((n-min)/step)*step)).toFixed(precision))
}
