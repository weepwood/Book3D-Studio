import type {BookConfig} from './schema'
import {physicalBook} from './physicalBook'
import {clamp} from './pagePhysics'
// Illustrative effective isotropic parameters, not measured stock datasheets.
// The real paper is orthotropic; the editor accepts measured caliper separately.
export const paperPresets={
 thin:{label:'薄型书纸',paperThickness:.06,paperGrammage:50,paperModulus:2,paperDamping:1.15},
 standard:{label:'普通书纸',paperThickness:.1,paperGrammage:80,paperModulus:3,paperDamping:1},
 coated:{label:'较厚涂布纸',paperThickness:.15,paperGrammage:130,paperModulus:4,paperDamping:1.2},
 card:{label:'厚型卡纸',paperThickness:.25,paperGrammage:220,paperModulus:4.5,paperDamping:1.3}
} as const
export function applyPaperPreset(c:BookConfig,key:keyof typeof paperPresets):BookConfig{
 const {label,...values}=paperPresets[key];return {...c,...values,paperPhysics:'material',thicknessMode:'automatic'}
}
export function paperMaterial(c:BookConfig){
 const h=c.paperThickness/1000,E=c.paperModulus*1e9,nu=.3
 const rigidity=E*h**3/(12*(1-nu*nu)),reference=3e9*1e-12/(12*(1-nu*nu))
 const massPerArea=c.paperGrammage/1000,massPerLeaf=massPerArea*(c.width-c.pageInset-Math.min(c.pageInset,c.width*.02/15.6))*(c.height-2*c.pageInset)/1e6
 const legacy=c.paperPhysics!=='material',ratio=rigidity/reference
 // Bounded, dimensionless presentation adapter; not a calibrated elastic FEM.
 const flex=legacy?1:clamp(ratio**(-.25),.35,1.5)
 const response=legacy?1:clamp(Math.sqrt((c.paperGrammage/80)/(ratio**.25))*.5+.5,.65,1.7)
 return {rigidity,massPerArea,massPerLeaf,estimatedPaperMass:massPerLeaf*physicalBook(c).leaves,flex,response,damping:legacy?1:c.paperDamping}
}
