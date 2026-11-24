export type BookConfig = {
  version: 1
  title: string
  subtitle: string
  author: string
  width: number
  height: number
  thickness: number
  coverColor: string
  paperColor: string
  inkColor: string
  finish: 'cloth' | 'matte' | 'gloss'
  roughness: number
  coverImage: string
  opening: number
  yaw: number
  pitch: number
  light: number
  background: string
  interaction: 'orbit' | 'hover' | 'click'
}
export const defaults: BookConfig = {
  version: 1, title: 'The Art of Making', subtitle: 'FIELD NOTES / VOLUME 01',
  author: 'STUDIO EDITIONS', width: 150, height: 220, thickness: 32,
  coverColor: '#354d40', paperColor: '#e8dfca', inkColor: '#dec48d',
  finish: 'cloth', roughness: 0.68, coverImage: '', opening: 0, yaw: -28, pitch: 12,
  light: 3, background: '#e9e7df', interaction: 'click'
}
export const ranges = {
  width:[90,250], height:[120,320], thickness:[8,80],
  roughness:[0.05,1], opening:[0,150], yaw:[-180,180], pitch:[-65,65], light:[0.2,6]
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
  for(const k of ['title','subtitle','author'] as const) {
    const x = v[k] ?? defaults[k]
    if(typeof x !== 'string' || x.length > 160) throw new Error('无效文字')
    out[k] = x
  }
  for(const k of ['coverColor','paperColor','inkColor','background'] as const) {
    const x = v[k] ?? defaults[k]
    if(typeof x !== 'string' || !/^#[0-9a-f]{6}$/i.test(x)) throw new Error('无效颜色')
    out[k] = x
  }
  if(v.finish !== undefined) {
    if(v.finish !== 'cloth' && v.finish !== 'matte' && v.finish !== 'gloss') throw new Error('无效材质')
    out.finish = v.finish
  }
  if(v.interaction !== undefined) {
    if(v.interaction !== 'orbit' && v.interaction !== 'hover' && v.interaction !== 'click') throw new Error('无效交互')
    out.interaction = v.interaction
  }
  if(v.coverImage !== undefined) {
    if(typeof v.coverImage !== 'string' || v.coverImage.length > 12_000_000 ||
      (v.coverImage !== '' && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v.coverImage))) throw new Error('仅支持内嵌 PNG、JPEG、WebP 图片')
    out.coverImage = v.coverImage
  }
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
