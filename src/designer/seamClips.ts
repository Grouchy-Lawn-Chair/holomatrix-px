import {presets,type Pixel,type Settings} from './geometry'
import {backerSpec} from './pixelOpening'
import {hardwareRuntime} from './hardware'
import type {Triangle,Vertex} from './mesh'
import {framePlan} from './propPlan'
import {conduitClipPlan,mountingConflict} from './conduitClips'
// 20 mm along the seam: doubles contact length while leaving 2.54 mm at
// each end of a 25.08 mm cell for its perpendicular corner walls.
export const seamClipSpec={length:20,width:12,depth:10,roof:3,clearance:.8}
export type SeamClip={id:number;a:Pixel;b:Pixel;x:number;y:number;angle:number}
// One broad centered bridge per candidate edge, not a backing plate.
export function seamClipPlan(pixels:Pixel[],s:Settings):SeamClip[]{
  const size=presets[s.diffuser].size,out:SeamClip[]=[]
  const neighbors=new Map(pixels.map(p=>[`${p.x},${p.y}`,p]))
  for(const a of pixels)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const b=neighbors.get(`${a.x+dx},${a.y+dy}`);if(!b)continue
    if(a.section>=b.section||Math.abs(a.x-b.x)+Math.abs(a.y-b.y)!==1)continue
    const horizontal=a.x!==b.x
    out.push({id:out.length+1,a,b,x:(a.x+b.x)/2,y:(a.y+b.y)/2,angle:horizontal?Math.PI/2:0})
  }
  // Staircase interfaces can turn 90 degrees. Keep only non-overlapping
  // stations; never let neighboring bridges occupy the same corner.
  const rails=s.shape==='sprite'?framePlan(s,pixels):[]
  const railDistance=(p:SeamClip)=>Math.min(Infinity,...rails.map(r=>r.axis==='vertical'?Math.abs(p.x-r.a.x):Math.abs(p.y-r.a.y)))
  if(rails.length)out.sort((a,b)=>railDistance(a)-railDistance(b)||a.a.section-b.a.section||a.b.section-b.b.section)
  const selected:SeamClip[]=[],zones=conduitClipPlan(pixels,s)
  const half=(p:SeamClip)=>p.angle?[seamClipSpec.width/2,seamClipSpec.length/2]:[seamClipSpec.length/2,seamClipSpec.width/2]
  for(const p of out){const h=half(p);if(mountingConflict(p.x,p.y,h[0]*2,h[1]*2,zones,size))continue;if(selected.every(q=>{const j=half(q);return Math.abs(p.x-q.x)*size>=h[0]+j[0]+.4||Math.abs(p.y-q.y)*size>=h[1]+j[1]+.4}))selected.push({...p,id:selected.length+1})}
  if(s.shape==='sprite'){
    const pairs=new Map<string,SeamClip[]>()
    for(const p of selected){const k=`${p.a.section}/${p.b.section}`,group=pairs.get(k)??[];group.push(p);pairs.set(k,group)}
    const sparse=[...pairs.values()].flatMap(group=>{
      const a=group[0],b=[...group].sort((p,q)=>Math.hypot(q.x-a.x,q.y-a.y)-Math.hypot(p.x-a.x,p.y-a.y))[0]
      return a!==b&&Math.hypot(a.x-b.x,a.y-b.y)*size>25?[a,b]:[a]
    })
    return sparse.map((p,i)=>({...p,id:i+1}))
  }
  return selected
}
export const seamClipZ=backerSpec.wallTop-seamClipSpec.depth
export async function seamClipMesh(p?:SeamClip,s?:Settings,pixels?:Pixel[]):Promise<Triangle[]>{
  const {Manifold:M}=await hardwareRuntime(),sp=seamClipSpec,objects:InstanceType<typeof M>[]=[]
  const keep=(o:InstanceType<typeof M>)=>{objects.push(o);return o}
  const box=(w:number,d:number,h:number,x:number,y:number,z:number)=>keep(keep(M.cube([w,d,h])).translate([x,y,z]))
  try{
    const slot=2*backerSpec.wallThickness+sp.clearance
    const body=box(sp.length,sp.width,sp.depth+sp.roof,-sp.length/2,-sp.width/2,0)
    const mouth=box(sp.length+.2,slot,sp.depth+.1,-sp.length/2-.1,-slot/2,-.1)
    const keeper=box(5.8,sp.width+.2,3,-2.9,-sp.width/2-.1,18-seamClipZ)
    let solid=keep(keep(keep(body.subtract(mouth)).subtract(keeper)).simplify(.0001))
    if(solid.status()!=='NoError')throw new Error('Invalid seam clip')
    const parts=solid.decompose(),n=parts.length;parts.forEach(o=>o.delete());if(n!==1)throw new Error('Seam clip requires a custom repair before export')
    const mesh=solid.getMesh(),ts:Triangle[]=[]
    for(let i=0;i<mesh.triVerts.length;i+=3)ts.push([0,1,2].map(j=>{const k=mesh.triVerts[i+j]*mesh.numProp;return [mesh.vertProperties[k],mesh.vertProperties[k+1],mesh.vertProperties[k+2]] as Vertex}) as Triangle)
    return ts
  }finally{objects.reverse().forEach(o=>o.delete())}
}
