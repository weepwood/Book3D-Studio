import type {BookConfig} from './schema'
// A printed page is one face of a physical leaf. Preserve manual dimensions
// for legacy projects; automatic dimensions are derived, never duplicated.
export function physicalBook(c:Pick<BookConfig,'pageCount'|'pageImages'|'thickness'|'thicknessMode'|'paperThickness'|'boardThickness'>){
 const leaves=Math.ceil(Math.max(2,c.pageCount,c.pageImages.length)/2)
 const automatic=c.thicknessMode==='automatic'
 const core=automatic?leaves*c.paperThickness:c.thickness-2*c.boardThickness
 return {leaves,core,thickness:core+2*c.boardThickness,paperThickness:core/leaves}
}
