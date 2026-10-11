import Module, { type Manifold, type ManifoldToplevel, type Vec3 } from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { type Triangle, type Vertex } from './mesh'

export const fitSpec={clearanceTotal:.1,chamferXY:.6,thickness:6,pipeOD: .840*25.4,material:'PETG',tieHoleDiameter:4}
export const puzzleKey:[number,number][]=[[-.3,-6],[5.4,-6],[6,-6.6],[6,-9.4],[6.6,-10],[19.4,-10],[20,-9.4],[20,9.4],[19.4,10],[6.6,10],[6,9.4],[6,6.6],[5.4,6],[-.3,6]]
export const tieHoleCenters={male:[[-6,-16],[-6,16]],female:[[6,-16],[6,16]]} as const
let runtime:Promise<ManifoldToplevel>|undefined
export function hardwareRuntime(){
  return runtime??=(typeof window==='undefined'?Module():Module({locateFile:()=>wasmUrl})).then(m=>{m.setup();return m})
}
export type FitPart={name:string;triangles:Triangle[];volume:number;dimensions:Vec3}

// Coupons only. The original PVC clip is included separately, untouched.
// These joints are deliberately not applied to prop sections before a fit test.
export async function buildJointFitParts(clearanceTotal=fitSpec.clearanceTotal):Promise<FitPart[]> {
  if(!Number.isFinite(clearanceTotal)||clearanceTotal<.02||clearanceTotal>.5)throw new Error('Joint clearance must be 0.02–0.5 mm total.')
  const {Manifold:M,CrossSection}=await hardwareRuntime(),objects:Manifold[]=[]
  const keep=(s:Manifold)=>{objects.push(s);return s}
  const box=(size:Vec3,at:Vec3)=>keep(keep(M.cube(size)).translate(at))
  const add=(a:Manifold,b:Manifold)=>keep(a.add(b))
  const sub=(a:Manifold,b:Manifold)=>keep(a.subtract(b))
  const profile=new CrossSection([puzzleKey]),pocketProfile=profile.offset(clearanceTotal/2,'Miter')
  try {
    // Solid, full-thickness puzzle key: 12 mm root and 20 mm head.
    // Press together perpendicular to the plate; the wider head prevents
    // pulling apart in-plane. No roofs, flexures, latches or hidden pockets.
    let male=add(box([44,44,fitSpec.thickness],[-44-clearanceTotal,-22,0]),keep(M.extrude(profile,fitSpec.thickness)))
    const cutter=keep(keep(M.extrude(pocketProfile,fitSpec.thickness+.2)).translate([0,0,-.1]))
    let female=sub(box([44,44,fitSpec.thickness],[0,-22,0]),cutter)
    const hole=(x:number,y:number)=>keep(keep(M.cylinder(fitSpec.thickness+.2,fitSpec.tieHoleDiameter/2,fitSpec.tieHoleDiameter/2,32)).translate([x,y,-.1]))
    for(const [x,y] of tieHoleCenters.male)male=sub(male,hole(x,y))
    for(const [x,y] of tieHoleCenters.female)female=sub(female,hole(x,y))
    const convert=(solid:Manifold,name:string):FitPart=>{
      if(solid.status()!=='NoError'||solid.volume()<=0)throw new Error('Could not create a closed joint solid.')
      const components=solid.decompose();const count=components.length;components.forEach(c=>c.delete())
      if(count!==1)throw new Error('Joint contains disconnected pieces.')
      const mesh=solid.getMesh(),triangles:Triangle[]=[],stride=mesh.numProp
      for(let i=0;i<mesh.triVerts.length;i+=3){
        const triangle:Vertex[]=[]
        for(let j=0;j<3;j++){const v=mesh.triVerts[i+j]*stride;triangle.push([mesh.vertProperties[v],mesh.vertProperties[v+1],mesh.vertProperties[v+2]])}
        triangles.push(triangle as Triangle)
      }
      const b=solid.boundingBox()
      return{name,triangles,volume:solid.volume(),dimensions:b.max.map((v,i)=>v-b.min[i]) as Vec3}
    }
    return [convert(male,'puzzle_male_coupon.stl'),convert(female,'puzzle_female_coupon.stl')]
  } finally {objects.reverse().forEach(o=>o.delete());pocketProfile.delete();profile.delete()}
}
