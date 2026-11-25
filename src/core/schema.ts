export type BookConfig = {
  version: 1
  title: string
  subtitle: string
  author: string
  width: number
  height: number
  thickness: number
  thicknessMode: 'manual' | 'automatic'
  paperThickness: number
  boardThickness: number
  cornerRadius: number
  pageInset: number
  spineStyle: 'rounded' | 'square'
  coverFlex: number
  pageCoupling: number
  coverColor: string
  paperColor: string
  inkColor: string
  finish: 'cloth' | 'matte' | 'gloss'
  roughness: number
  coverImage: string
  backImage: string
  spineImage: string
  backText: string
  spineText: string
  coverZoom: number
  coverX: number
  coverY: number
  backZoom: number
  backX: number
  backY: number
  spineZoom: number
  spineX: number
  spineY: number
  opening: number
  pageImages: string[]
  pageIndex: number
  pageCurl: number
  pageDuration: number
  pageBleed: number
  pageHover: number
  pageCorner: number
  pageCount: number
  yaw: number
  pitch: number
  light: number
  background: string
  interaction: 'orbit' | 'hover' | 'click'
}
export const defaults: BookConfig = {
  version: 1, title: 'The Art of Making', subtitle: 'FIELD NOTES / VOLUME 01',
  author: 'STUDIO EDITIONS', width: 150, height: 220, thickness: 32, thicknessMode: 'manual', paperThickness: .1, boardThickness: 2.5, cornerRadius: 1.2, pageInset: 2.5,
  spineStyle: 'rounded', coverFlex: .28, pageCoupling: .45,
  coverColor: '#354d40', paperColor: '#e8dfca', inkColor: '#dec48d',
  finish: 'cloth', roughness: 0.68, coverImage: '', backImage:'', spineImage:'', backText:'', spineText:'',
  coverZoom:1, coverX:0, coverY:0, backZoom:1, backX:0, backY:0, spineZoom:1, spineX:0, spineY:0, opening: 0, pageImages:[], pageIndex:0, pageCurl:.72, pageDuration:.85, pageBleed:.065, pageHover:.7, pageCorner:.65, pageCount:12, yaw: -28, pitch: 12,
  light: 3, background: '#e9e7df', interaction: 'click'
}
export const ranges = {
  width:[90,250], height:[120,320], thickness:[8,80], paperThickness:[.04,.25],
  boardThickness:[.8,3], cornerRadius:[0,4], pageInset:[1,4], coverFlex:[0,1], pageCoupling:[0,1],
  coverZoom:[1,3], coverX:[-1,1], coverY:[-1,1], backZoom:[1,3], backX:[-1,1], backY:[-1,1], spineZoom:[1,3], spineX:[-1,1], spineY:[-1,1],
  roughness:[0.05,1], opening:[0,180], pageCurl:[0,1], pageDuration:[.3,2], pageBleed:[0,.18], pageHover:[0,1], pageCorner:[0,1], pageCount:[2,2000], pageIndex:[0,1000], yaw:[-180,180], pitch:[-65,65], light:[0.2,6]
} as const
export function parseConfig(raw: unknown): BookConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('无效项目文件')
  const v = raw as Record<string, unknown>
  if(v.version !== 1) throw new Error('不支持的项目版本')
  const out = {...defaults}
  for (const k of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const x = v[k] ?? defaults[k]
    const [min,max] = ranges[k]
    if(typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) throw new Error('无效参数: '+k)
    out[k] = x
  }
  for(const k of ['title','subtitle','author','backText','spineText'] as const) {
    const x = v[k] ?? defaults[k]
    if(typeof x !== 'string' || x.length > 160) throw new Error('无效文字')
    out[k] = x
  }
  for(const k of ['coverColor','paperColor','inkColor','background'] as const) {
    const x = v[k] ?? defaults[k]
    if(typeof x !== 'string' || !/^#[0-9a-f]{6}$/i.test(x)) throw new Error('无效颜色')
    out[k] = x
  }
  if(v.thicknessMode !== undefined) {
    if(v.thicknessMode !== 'automatic' && v.thicknessMode !== 'manual') throw Error('无效厚度模式')
    out.thicknessMode=v.thicknessMode
  }
  if(v.spineStyle !== undefined) {
    if(v.spineStyle !== 'rounded' && v.spineStyle !== 'square') throw new Error('无效书脊结构')
    out.spineStyle = v.spineStyle
  }
  if(v.finish !== undefined) {
    if(v.finish !== 'cloth' && v.finish !== 'matte' && v.finish !== 'gloss') throw new Error('无效材质')
    out.finish = v.finish
  }
  if(v.interaction !== undefined) {
    if(v.interaction !== 'orbit' && v.interaction !== 'hover' && v.interaction !== 'click') throw new Error('无效交互')
    out.interaction = v.interaction
  }
  for(const k of ['coverImage','backImage','spineImage'] as const){
    const image=v[k]??''
    if(typeof image !== 'string' || image.length > 12_000_000 || (image !== '' && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image))) throw new Error('仅支持内嵌 PNG、JPEG、WebP 图片')
    out[k]=image
  }
  const images=v.pageImages??[]
  if(!Array.isArray(images)||images.length>40||images.some(x=>typeof x!=='string'||x.length>1_500_000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(x))||images.reduce((sum,x)=>sum+x.length,0)>24_000_000)throw Error('无效或过大的内页素材')
  out.pageImages=images.slice();out.pageCount=Math.max(2,Math.min(ranges.pageCount[1],Math.round(out.pageCount)));out.pageCount=Math.max(out.pageCount,images.length);out.pageIndex=Math.min(Math.floor(out.pageIndex),Math.ceil(out.pageCount/2))
  return out
}
export const presets: Record<string, Partial<BookConfig>> = {
  'Field Notes': {title:'The Art of Making',coverColor:'#354d40',inkColor:'#dec48d',finish:'cloth',roughness:.68},
  'Modern Press': {title:'Modern Systems',coverColor:'#e5d5b7',inkColor:'#293338',finish:'matte',roughness:.85},
  'Night Edition': {title:'After the Light',coverColor:'#202b44',inkColor:'#c7d6f0',finish:'gloss',roughness:.24}
}
export function springStep(current:number, velocity:number, target:number, dt:number) {
  const step = Math.max(0, Math.min(dt, 1/30))
  const speed = velocity + (target-current)*100*step - velocity*20*step
  return Math.abs(target-current)<0.0001 && Math.abs(speed)<0.0001 ? [target,0] as const : [current+speed*step,speed] as const
}
