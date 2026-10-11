import {hardwareRuntime,type FitPart} from './hardware'
import type {Triangle,Vertex} from './mesh'

export const pinJointSpec={bodyThickness:6.1,tongueThickness:3,tongueWidth:20,overlap:16,clearanceTotal:.1,pinWidth:6.8,pinDepth:5.3,pinHeadThickness:2,holeWidth:8.1,holeDepth:6.1,seamRelief:.5,maleBodyLength:20,femaleBodyLength:25,bodyWidth:30}
// Local R2 calibration only: the unscaled 8 x 6 shaft printed 8.6 x 6.5,
// and the 8.1 x 6.1 holes printed about 7.5 x 5.9. Aim for a printed
// 7.4 x 5.8 shaft (.1 total clearance). This estimate needs another print.
export const pinPrintCalibration={measuredPin:[8.6,6.5],measuredHole:[7.5,5.9],estimatedGrowth:[.6,.5],targetPrintedPin:[7.4,5.8]}
const chamfered=(x0:number,y0:number,x1:number,y1:number,c=.6):[number,number][]=>[[x0+c,y0],[x1-c,y0],[x1,y0+c],[x1,y1-c],[x1-c,y1],[x0+c,y1],[x0,y1-c],[x0,y0+c]]
const rectangle=(x0:number,y0:number,x1:number,y1:number):[number,number][]=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]

// Stage-2 coupons only. Female and pin are already flipped for support-free
// printing. Assemble by turning them over; no tiny flexures or integral pegs.
export async function buildPinJointParts():Promise<FitPart[]>{
  const {Manifold:M,CrossSection}=await hardwareRuntime(),objects:InstanceType<typeof M>[]=[]
  const keep=(s:InstanceType<typeof M>)=>{objects.push(s);return s}
  const box=(w:number,d:number,h:number,x:number,y:number,z=0)=>keep(keep(M.cube([w,d,h])).translate([x,y,z]))
  const tongueProfile=new CrossSection([chamfered(-.3,-10,16,10)])
  // Square receiving corners; only the inserting solids get chamfers.
  // Tongue pocket still has .1 mm total allowance. Pin has local compensation.
  const socketProfile=new CrossSection([rectangle(-.35,-10.05,16.05,10.05)])
  const pinProfile=new CrossSection([chamfered(-pinJointSpec.pinWidth/2,-pinJointSpec.pinDepth/2,pinJointSpec.pinWidth/2,pinJointSpec.pinDepth/2,.5)])
  const holeProfile=new CrossSection([rectangle(-4.05,-3.05,4.05,3.05)])
  try{
    const hole=keep(keep(M.extrude(holeProfile,6.3)).translate([8,0,-.1]))
    const tongue=keep(M.extrude(tongueProfile,3))
    const male=keep(keep(box(pinJointSpec.maleBodyLength,pinJointSpec.bodyWidth,6.1,-pinJointSpec.maleBodyLength-.1,-pinJointSpec.bodyWidth/2).add(tongue)).subtract(hole))
    const socket=keep(keep(M.extrude(socketProfile,3.2)).translate([0,0,-.1]))
    // Recess only the meeting face, not the hole center or socket end.
    const femaleAssembled=keep(keep(box(pinJointSpec.femaleBodyLength-pinJointSpec.seamRelief,pinJointSpec.bodyWidth,6.1,pinJointSpec.seamRelief,-pinJointSpec.bodyWidth/2).subtract(socket)).subtract(hole))
    const female=keep(keep(femaleAssembled.rotate([180,0,0])).translate([0,0,6.1]))
    // Print head on the bed. Assembly flips it so the shaft goes downward.
    const shaft=keep(keep(M.extrude(pinProfile,6.1)).translate([0,0,2]))
    const pin=keep(box(12,10,2,-6,-5).add(shaft))
    const convert=(solid:InstanceType<typeof M>,name:string):FitPart=>{
      if(solid.status()!=='NoError'||solid.volume()<=0)throw new Error('Pin joint could not form a closed solid.')
      const pieces=solid.decompose(),count=pieces.length;pieces.forEach(p=>p.delete())
      if(count!==1)throw new Error('Pin joint contains disconnected geometry.')
      const mesh=solid.getMesh(),triangles:Triangle[]=[]
      for(let i=0;i<mesh.triVerts.length;i+=3)triangles.push([0,1,2].map(j=>{
        const k=mesh.triVerts[i+j]*mesh.numProp
        return [mesh.vertProperties[k],mesh.vertProperties[k+1],mesh.vertProperties[k+2]] as Vertex
      }) as Triangle)
      const b=solid.boundingBox();return{name,triangles,volume:solid.volume(),dimensions:b.max.map((v,i)=>v-b.min[i]) as [number,number,number]}
    }
    return [convert(male,'pin_joint_male_PRINT_FLAT.stl'),convert(female,'pin_joint_female_POCKET_UP.stl'),convert(pin,'pin_joint_pin_HEAD_DOWN.stl')]
  }finally{objects.reverse().forEach(s=>s.delete());holeProfile.delete();pinProfile.delete();socketProfile.delete();tongueProfile.delete()}
}
