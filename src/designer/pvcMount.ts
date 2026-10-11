import {presets,type Pixel,type Settings} from './geometry'
import {backingPlatePlan,plateFootprint,plateSeatCenters,plateSeatLeadInPoints,bridgeSpec,plateSeatSpec,type BackingPlate} from './backingPlate'
import {hardwareRuntime} from './hardware'
import type {Triangle,Vertex} from './mesh'

// Original STL mounting face is Y=19, NOT its minimum-Y lip.
// Measured source hole centre X=12.8, Z~7.56. Hardware is a provisional M4 coupon.
export const pvcMountSpec={plate:6,seat:3,seatWidth:20,seatLength:18,
  holeDiameter:4.5,nutAcrossFlats:7.1,nutDepth:3.3,boltDiameter:4,
  clipBaseY:19,clipHoleX:12.8,clipHoleZ:7.56,pipeCenterY:5.2,pipeOD:21.336}
export type PvcMount=BackingPlate&{kind:'mount';width:number;depth:number}
export function pvcMountPlan(pixels:Pixel[],s:Settings):PvcMount[]{
  const size=presets[s.diffuser].size,occupied=new Map(pixels.map(p=>[`${p.x},${p.y}`,p])),bridges=backingPlatePlan(pixels)
  const sections=[...new Set(pixels.map(p=>p.section))],result:PvcMount[]=[]
  for(const section of sections){
    const cells=pixels.filter(p=>p.section===section),mid=cells[Math.floor(cells.length/2)]
    const candidates=cells.flatMap(p=>[[1,0],[0,1]].flatMap(([dx,dy])=>{
      let a=p,b=p
      while(occupied.get(`${a.x-dx},${a.y-dy}`)?.section===section)a=occupied.get(`${a.x-dx},${a.y-dy}`)!
      while(occupied.get(`${b.x+dx},${b.y+dy}`)?.section===section)b=occupied.get(`${b.x+dx},${b.y+dy}`)!
      if(occupied.has(`${a.x-dx},${a.y-dy}`)||occupied.has(`${b.x+dx},${b.y+dy}`))return []
      const width=(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+1)*size+12,depth=size+12
      const x=(a.x+b.x)/2,y=(a.y+b.y)/2,angle=dx?0:-Math.PI/2
      // Reject every bridge collision using separating axes, not just centre distance.
      const overlaps=bridges.some(j=>{
        const ax=[[Math.cos(angle),Math.sin(angle)],[-Math.sin(angle),Math.cos(angle)]],bx=[[Math.cos(j.angle),Math.sin(j.angle)],[-Math.sin(j.angle),Math.cos(j.angle)]]
        return [...ax,...bx].every(([vx,vy])=>{
          const r=width/2*Math.abs(vx*ax[0][0]+vy*ax[0][1])+depth/2*Math.abs(vx*ax[1][0]+vy*ax[1][1])
          const f=plateFootprint(j,size),q=f.width/2*Math.abs(vx*bx[0][0]+vy*bx[0][1])+f.depth/2*Math.abs(vx*bx[1][0]+vy*bx[1][1])
          return Math.abs((x-j.x)*size*vx-(y-j.y)*size*vy)<r+q+.1
        })
      })
      if(overlaps)return []
      return [{a,b,x,y,angle,width,depth,ties:[{pixel:a,dx:-dx,dy:-dy},{pixel:b,dx,dy}]}]
    })).sort((a,b)=>a.width-b.width||Math.hypot(a.x-mid.x,a.y-mid.y)-Math.hypot(b.x-mid.x,b.y-mid.y))
    const c=candidates[0];if(!c)continue // Never float a mount with no supported opposite rims.
    if(s.bed.shape==='circle'?Math.hypot(c.width,c.depth)>s.bed.width-2*s.bed.margin:c.width>s.bed.width-2*s.bed.margin||c.depth>s.bed.depth-2*s.bed.margin)continue
    result.push({...c,seatCells:pixels,kind:'mount',id:section+1})
  }
  return result
}
export async function pvcMountMesh(p:PvcMount,s:Settings):Promise<Triangle[]>{
  const {Manifold:M}=await hardwareRuntime(),objects:InstanceType<typeof M>[]=[]
  const keep=(v:InstanceType<typeof M>)=>{objects.push(v);return v}
  const box=(w:number,d:number,h:number,x:number,y:number,z:number)=>keep(keep(M.cube([w,d,h])).translate([x,y,z]))
  const size=presets[s.diffuser].size,sp=pvcMountSpec,w=p.width,d=p.depth
  try{
    const adds=[box(w,d,sp.plate,-w/2,-d/2,0),box(sp.seatWidth,sp.seatLength,sp.seat,-sp.seatWidth/2,-sp.seatLength/2,sp.plate)]
    // Solid longitudinal shoulders constrain the 14.998 mm clip extrusion.
    // Hole centre is slightly off the extrusion midpoint: do not centre the cradle blindly.
    for(const y of [-sp.clipHoleZ-.05-3,14.998-sp.clipHoleZ+.05])adds.push(box(20,3,2,-10,y,sp.plate+sp.seat))
    const cuts=[keep(keep(M.cylinder(12,sp.holeDiameter/2,sp.holeDiameter/2,48)).translate([0,0,-.1])),
      keep(keep(M.cylinder(sp.nutDepth+.1,sp.nutAcrossFlats/Math.sqrt(3),sp.nutAcrossFlats/Math.sqrt(3),6)).translate([0,0,-.1]))]
    // Full-width shallow nest on the tray-facing side, square inside corners.
    // Seats over the complete supported row, without shrinking the wire space.
    const gap=plateSeatSpec.clearanceTotal/2
    const seatCentres=plateSeatCenters(p,size,{width:w,depth:d})
    cuts.push(keep(M.union(seatCentres.map(c=>box(size+2*gap,size+2*gap,plateSeatSpec.depth+.1,c.x-size/2-gap,c.y-size/2-gap,-.1)))))
    cuts.push(...seatCentres.map(c=>keep(M.hull(plateSeatLeadInPoints(c.x,c.y,size)))))
    // Large open windows outside the supporting centre rib.
    for(const x of [-w/2+10,7])cuts.push(box(w/2-17,size-8,sp.plate+.2,x,-size/2+4,-.1))
    for(const t of p.ties)for(const d of [size/2-3.5,size/2+3]){
      const co=Math.cos(p.angle),si=Math.sin(p.angle),dx=co*t.dx-si*t.dy,dy=-si*t.dx-co*t.dy,wx=(t.pixel.x-p.x)*size,wy=-(t.pixel.y-p.y)*size,x=co*wx+si*wy+dx*d,y=-si*wx+co*wy+dy*d
      cuts.push(Math.abs(dx)>.5?box(bridgeSpec.tieSlot,4,sp.plate+.2,x-.9,y-2,-.1):box(4,bridgeSpec.tieSlot,sp.plate+.2,x-2,y-.9,-.1))
    }
    const solid=keep(keep(M.union(adds)).subtract(keep(M.union(cuts))))
    if(solid.status()!=='NoError')throw new Error('Invalid PVC mounting plate')
    const parts=solid.decompose(),n=parts.length;parts.forEach(p=>p.delete());if(n!==1)throw new Error('Disconnected PVC seat')
    const mesh=solid.getMesh(),ts:Triangle[]=[]
    for(let i=0;i<mesh.triVerts.length;i+=3)ts.push([0,1,2].map(j=>{const k=mesh.triVerts[i+j]*mesh.numProp;return [mesh.vertProperties[k],mesh.vertProperties[k+1],mesh.vertProperties[k+2]] as Vertex}) as Triangle)
    return ts
  }finally{objects.reverse().forEach(o=>o.delete())}
}
