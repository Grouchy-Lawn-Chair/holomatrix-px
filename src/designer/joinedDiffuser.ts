import {bounds,presets,type Settings} from './geometry'
import type {BackingPlate} from './backingPlate'
import {hardwareRuntime} from './hardware'
import {extendedCapMesh} from './extendedCap'
import {stripCapMesh} from './stripCap'
import {bulletCapMesh} from './bulletCap'
import type {Triangle,Vertex} from './mesh'

export function joinedDiffuserFits(p:BackingPlate,s:Settings){
  const b=bounds(p.cells??[p.a,p.b]),size=presets[s.diffuser].size,w=b.width*size,h=b.height*size
  return s.bed.shape==='circle'?Math.hypot(w,h)<=s.bed.width-2*s.bed.margin:w<=s.bed.width-2*s.bed.margin&&h<=s.bed.depth-2*s.bed.margin
}
export function joinedDiffuserConflicts(plates:BackingPlate[]){
  const used=new Set<number>()
  for(const p of plates)for(const c of p.cells??[p.a,p.b]){if(used.has(c.id))return 'Neighboring seam diffusers share a pixel. Use larger sections or a custom combined connector before export.';used.add(c.id)}
  return ''
}
// One real connected mesh over EVERY cell touching this section interface.
// Retain each source cavity; only their existing touching walls are fused.
export async function joinedDiffuserMesh(source:ArrayBuffer,s:Settings,p:BackingPlate):Promise<Triangle[]>{
  let ts:Triangle[]
  if(s.capFit==='extended')ts=await extendedCapMesh(source,s)
  else if(s.lighting==='strip')ts=await stripCapMesh(source,s)
  else ts=await bulletCapMesh(source,s)
  const m=await hardwareRuntime(),mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge()
  const cap=new m.Manifold(mesh),size=presets[s.diffuser].size,parts=(p.cells??[p.a,p.b]).map(c=>cap.translate([(c.x-p.x)*size,-(c.y-p.y)*size,0]))
  // A narrow solid bond strip within the closed-face border avoids relying
  // on exactly coincident STL faces (float32 edges can leave micron gaps).
  const cells=p.cells??[p.a,p.b],faceZ=cap.boundingBox().min[2]
  for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
    const a=cells[i],b=cells[j];if(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)!==1)continue
    const x=((a.x+b.x)/2-p.x)*size,y=-((a.y+b.y)/2-p.y)*size,horizontal=a.x!==b.x
    const box=m.Manifold.cube(horizontal?[6,size-8,.5]:[size-8,6,.5]),strip=box.translate([x-(horizontal?3:(size-8)/2),y-(horizontal?(size-8)/2:3),faceZ+.1]);box.delete();parts.push(strip)
  }
  // Remove sub-micron Boolean slivers inherited from float32 source faces;
  // 0.0001 mm is far below the configurable mechanical fit allowance.
  const joined=m.Manifold.union(parts),result=joined.simplify(.0001);joined.delete()
  try{
    if(result.status()!=='NoError')throw new Error(`Seam diffuser ${p.id} could not be joined`)
    // Decomposition can include negative-volume inner cavity boundaries.
    // Those are voids in one body, not disconnected printable cap pieces.
    const pieces=result.decompose(),n=pieces.filter(p=>p.volume()>.001).length;pieces.forEach(p=>p.delete());if(n!==1)throw new Error(`Seam ${p.id} is disconnected; a custom connector is needed.`)
    const out=result.getMesh(),triangles:Triangle[]=[]
    for(let i=0;i<out.triVerts.length;i+=3)triangles.push([0,1,2].map(j=>{const k=out.triVerts[i+j]*out.numProp;return [out.vertProperties[k],out.vertProperties[k+1],out.vertProperties[k+2]] as Vertex}) as Triangle)
    return triangles
  }finally{result.delete();parts.forEach(p=>p.delete());cap.delete()}
}
