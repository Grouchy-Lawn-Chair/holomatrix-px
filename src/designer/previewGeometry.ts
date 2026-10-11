import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { Triangle } from './mesh'
import { bounds, type Pixel } from './geometry'

// Display-only rigid translations. Never alter source pixel positions or STLs.
export function sectionOffsets(sections:Pixel[][],size:number,separated:boolean) {
  const b=bounds(sections.flat()),cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2
  return new Map(sections.filter(s=>s.length).map(section=>{
    const sb=bounds(section)
    return [section[0].section,{x:separated?((sb.minX+sb.maxX)/2-cx)*size*.28:0,y:separated?-((sb.minY+sb.maxY)/2-cy)*size*.28:0}]
  }))
}

export function triangleGeometry(triangles: Triangle[]) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(triangles.flat(2), 3))
  geometry.computeVertexNormals()
  return geometry
}

// Original STL coordinates are arbitrary. Centre in XY, put the opening at
// Z=0 and the closed diffuser face toward +Z, without scaling the source mesh.
export function orientCap(geometry: BufferGeometry) {
  geometry.computeBoundingBox()
  const box=geometry.boundingBox!,p=geometry.getAttribute('position')
  let bottom=0,top=0
  for(let i=0;i<p.count;i+=3) {
    const z=[p.getZ(i),p.getZ(i+1),p.getZ(i+2)]
    const area=Math.abs((p.getX(i+1)-p.getX(i))*(p.getY(i+2)-p.getY(i))-(p.getY(i+1)-p.getY(i))*(p.getX(i+2)-p.getX(i)))/2
    if(z.every(v=>Math.abs(v-box.min.z)<.02))bottom+=area
    if(z.every(v=>Math.abs(v-box.max.z)<.02))top+=area
  }
  if(bottom>top)geometry.rotateX(Math.PI)
  geometry.computeBoundingBox()
  const b=geometry.boundingBox!
  geometry.translate(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2,-b.min.z)
  geometry.computeBoundingBox()
  geometry.computeVertexNormals()
  return geometry
}
