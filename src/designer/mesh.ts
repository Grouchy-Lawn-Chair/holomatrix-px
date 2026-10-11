import { bounds, presets, type Pixel, type Settings } from './geometry'
import { pixelOpening, backerSpec } from './pixelOpening'
import { capFootContours, capSeatSpec,longSeatSpec,toothClearanceTotal } from './capSeats'
import {stripSpec} from './strip'
import {bridgeSpec,plateSeatSpec,backingPlatePlan,type BackingPlate} from './backingPlate'
import {wallTiePlan,wallTieSpec} from './wallTies'
import {seamClipPlan,seamClipSpec,seamClipZ} from './seamClips'
import {jointSettings} from './sectionLayout'
export type Vertex = [number, number, number]
export type Triangle = [Vertex, Vertex, Vertex]
export const pixelMount={thickness:backerSpec.floor}
const carrierCache=new Map<string,Triangle[]>()

// Boolean union produces one printable floor and perimeter-only cable corral.
// Flat 2.1 mm mounting floor; no raised pixel or diffuser-foot pads.
export async function carrierMesh(pixels: Pixel[], settings: Settings, plates:BackingPlate[]=[],allPixels?:Pixel[]): Promise<Triangle[]> {
  if(!pixels.length)return []
  if(settings.lighting==='strip'&&settings.diffuser!=='house')throw new Error('Strip mode requires the House diffuser.')
  const {size} = presets[settings.diffuser], b = bounds(pixels)
  const cx=(b.minX+b.maxX)/2, cy=(b.minY+b.maxY)/2
  const strip=settings.lighting==='strip'?stripSpec(settings):null
  if(strip&&strip.channelWidth>14)throw new Error('Strip channel exceeds 14 mm and would leave thin diffuser feet.')
  const section=pixels[0].section
  const relevant=(allPixels?[]:plates).filter(p=>p.a.section===section||p.b.section===section)
  const clearance=toothClearanceTotal(settings)
  const seamClips=allPixels?seamClipPlan(allPixels,settings):[]
  const joint=jointSettings(settings),mates=new Map((allPixels??[]).map(p=>[`${p.x},${p.y}`,p]))
  const tiePoints=wallTiePlan(allPixels??(plates.length?[]:pixels),settings).filter(t=>t.pixel.section===section)
  const key=JSON.stringify(['puzzle-seams-v1',joint,settings.shape,allPixels?.map(p=>[p.x,p.y,p.section,p.jointMale,p.jointDx,p.jointDy]),allPixels!==undefined,seamClips.filter(p=>p.a.section===section||p.b.section===section).map(p=>[p.x-cx,p.y-cy,p.angle]),size,strip,settings.capFit,clearance,plateSeatSpec,pixels.map(p=>[p.x-cx,p.y-cy,p.led]),tiePoints.map(t=>[t.pixel.x-cx,t.pixel.y-cy,t.dx,t.dy]),relevant.map(p=>['kind' in p?p.kind:'legacy',p.x-cx,p.y-cy,p.angle,p.ties.filter(t=>t.pixel.section===section).map(t=>[t.pixel.x-cx,t.pixel.y-cy,t.dx,t.dy])])]),cached=carrierCache.get(key)
  if(cached)return cached
  const {hardwareRuntime}=await import('./hardware')
  const {Manifold:M,CrossSection}=await hardwareRuntime()
  const solids:InstanceType<typeof M>[]=[],keep=(s:InstanceType<typeof M>)=>{solids.push(s);return s}
  const box=(w:number,d:number,h:number,x:number,y:number,z:number)=>keep(keep(M.cube([w,d,h])).translate([x,y,z]))
  const profile=new CrossSection([pixelOpening]),occupied=new Set(pixels.map(p=>`${p.x},${p.y}`))
  const footProfile=new CrossSection(capFootContours(settings.diffuser))
  const seatProfile=footProfile.offset(clearance/2,'Miter')
  try {
    const adds:InstanceType<typeof M>[]=[],cuts:InstanceType<typeof M>[]=[]
    for(const p of pixels){
      const x=(p.x-cx)*size,y=-(p.y-cy)*size,s=size/2,t=backerSpec.wallThickness
      adds.push(box(size,size,backerSpec.floor,x-s,y-s,0))
      // Underside-entry pockets: print floor on bed, bridge the narrow roofs.
      // Leave the pixel gripping floor and rear cable wall intact above them.
      if(settings.capFit==='extended'){
        // Teeth pass through the flat floor; only 2.1 mm guides their sides.
        // Clear the full tooth length where the socket meets an outer wall.
        cuts.push(keep(keep(M.extrude(seatProfile,longSeatSpec.socketTop+.2)).translate([x,y,-.1])))
      }else cuts.push(keep(keep(M.extrude(seatProfile,capSeatSpec.depth+.1)).translate([x,y,-.1])))
      if(strip){
        // Front-side open strip channel. The LED package faces into the cap;
        // only the shallow PCB/sleeve seat is recessed into the mounting floor.
        cuts.push(box(size+.02,strip.channelWidth,strip.seatDepth+.1,x-s-.01,y-strip.channelWidth/2,-.1))
      }else if(p.led!==false){
        cuts.push(keep(keep(M.extrude(profile,backerSpec.floor+.2)).translate([x,y,-.1])))
      }
      const h=backerSpec.wallTop-backerSpec.floor
      if(!occupied.has(`${p.x-1},${p.y}`))adds.push(box(t,size,h,x-s,y-s,backerSpec.floor))
      if(!occupied.has(`${p.x+1},${p.y}`))adds.push(box(t,size,h,x+s-t,y-s,backerSpec.floor))
      if(!occupied.has(`${p.x},${p.y+1}`))adds.push(box(size,t,h,x-s,y-s,backerSpec.floor))
      if(!occupied.has(`${p.x},${p.y-1}`))adds.push(box(size,t,h,x-s,y+s-t,backerSpec.floor))
      if(settings.shape==='sprite'&&joint.enabled&&allPixels){
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const mate=mates.get(`${p.x+dx},${p.y+dy}`)
          if(!mate||mate.section===section)continue
          // Male tongue owns the clearance; receiving corners remain square.
          const tip=p.jointMale&&dx===p.jointDx&&dy===p.jointDy
          const gap=p.jointMale?(tip?joint.tipGap:joint.sideGap):mate.jointMale?0:joint.sideGap/2
          const edgeX=x+dx*s,edgeY=y-dy*s
          const edgeCut=(inset:number,z:number,height:number)=>{
            if(inset<=0)return
            cuts.push(dx?box(inset+.02,size+.02,height,edgeX-(dx>0?inset:.02),y-s-.01,z):box(size+.02,inset+.02,height,x-s-.01,edgeY-(dy<0?inset:.02),z))
          }
          edgeCut(gap,-.01,backerSpec.wallTop+.03)
          // Extra upper-wall space prevents a tall wall becoming a glue-up datum.
          edgeCut(gap+joint.upperRelief/2,backerSpec.floor+3,backerSpec.wallTop)
          if(joint.bottomRelief>0){
            const points:Vertex[]=[]
            for(const a of [-s-.01,s+.01])for(const [d,z] of [[-.02,-.01],[gap+joint.bottomRelief,-.01],[gap,joint.bottomRelief]])points.push([edgeX-dx*d+(dy?a:0),edgeY+dy*d+(dx?a:0),z])
            cuts.push(keep(M.hull(points)))
          }
        }
      }
    }
    // At re-entrant stair corners, two perimeter strips otherwise meet only
    // along a vertical edge. A solid corner web prevents that pinch seam.
    const nodes=new Set(pixels.flatMap(p=>[-.5,.5].flatMap(dx=>[-.5,.5].map(dy=>`${p.x+dx},${p.y+dy}`))))
    for(const node of nodes){
      const [nx,ny]=node.split(',').map(Number)
      const q=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([dx,dy])=>occupied.has(`${nx+dx},${ny+dy}`))
      if(q.filter(Boolean).length===1){
        if(settings.shape==='sprite'&&joint.enabled){
          const [dx,dy]=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]][q.indexOf(true)]
          const cell=mates.get(`${nx+dx},${ny+dy}`)
          if(cell?.jointMale){
            const sx=Math.sign(dx),sy=-Math.sign(dy),x=(nx-cx)*size,y=-(ny-cy)*size,c=joint.cornerChamfer
            cuts.push(keep(M.hull([-.01,backerSpec.wallTop+.1].flatMap(z=>[[x-sx*.01,y-sy*.01,z],[x+sx*c,y-sy*.01,z],[x-sx*.01,y+sy*c,z]] as Vertex[]))))
          }
        }
        // Only convex male rim corners, only in the rear plate's engagement
        // band. Do not bevel concave corners, the pixel floor or cap sockets.
        const [dx,dy]=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]][q.indexOf(true)]
        const sx=Math.sign(dx),sy=-Math.sign(dy),x=(nx-cx)*size,y=-(ny-cy)*size,c=plateSeatSpec.cornerChamfer
        const points:Vertex[]=[backerSpec.wallTop-plateSeatSpec.depth-.05,backerSpec.wallTop+.1].flatMap(z=>[[x-sx*.01,y-sy*.01,z],[x+sx*c,y-sy*.01,z],[x-sx*.01,y+sy*c,z]] as Vertex[])
        cuts.push(keep(M.hull(points)))
      }
      if(q.filter(Boolean).length===3||(q.filter(Boolean).length===2&&q[0]===q[2]&&q[1]===q[3])){
        const t=backerSpec.wallThickness
        if(q.filter(Boolean).length===3){
          // Keep the connection inside the occupied cells. The old full square
          // projected a needless column into the empty stair-corner quadrant.
          const quadrants=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]
          quadrants.forEach(([dx,dy],i)=>{
            if(q[i])adds.push(box(t,t,backerSpec.wallTop-backerSpec.floor,(nx-cx)*size+(dx<0?-t:0),-(ny-cy)*size+(dy>0?-t:0),backerSpec.floor))
          })
        }else adds.push(box(t*2,t*2,backerSpec.wallTop-backerSpec.floor,(nx-cx)*size-t,-(ny-cy)*size-t,backerSpec.floor))
      }
    }
    // Integral pads thicken the wall locally, not the pixel-retaining floor.
    // Horizontal slots bridge only 5.8 mm, with solid material above and below.
    for(const tie of tiePoints){
      const sp=wallTieSpec,t=backerSpec.wallThickness,s=size/2
      const x=(tie.pixel.x-cx)*size+tie.dx*(s-t/2),y=-(tie.pixel.y-cy)*size-tie.dy*(s-t/2)
      const total=t+sp.padThickness,px=x-tie.dx*sp.padThickness/2,py=y+tie.dy*sp.padThickness/2
      // At the bottom the pad matches the existing wall. Its inward face
      // expands 1.5 mm over 1.5 mm of height: a real 45-degree lower ramp.
      const points:Vertex[]=[]
      for(const z of [sp.padZ,sp.padZ+sp.padThickness,sp.padZ+sp.padHeight]){
        const inner=-t/2-(z===sp.padZ?0:sp.padThickness)
        for(const d of [inner,t/2])for(const a of [-sp.padWidth/2,sp.padWidth/2])points.push([x+tie.dx*d+tie.dy*a,y-tie.dy*d+tie.dx*a,z])
      }
      adds.push(keep(M.hull(points)))
      cuts.push(tie.dx?box(total+.2,sp.width,sp.height,px-total/2-.1,py-sp.width/2,sp.z):box(sp.width,total+.2,sp.height,px-sp.width/2,py-total/2-.1,sp.z))
    }
    for(const clip of seamClips.filter(p=>p.a.section===section||p.b.section===section)){
      const x=(clip.x-cx)*size,y=-(clip.y-cy)*size,horizontal=clip.a.x!==clip.b.x
      cuts.push(horizontal?box(4.2,5.8,3,x-2.1,y-2.9,18):box(5.8,4.2,3,x-2.9,y-2.1,18))
      // Local receiving relief for the bridge legs. Preserve both central
      // 2 mm seam walls, while clearing any nearby inward corner/pad bulges.
      const inner=(4+seamClipSpec.clearance)/2-.1,outer=seamClipSpec.width/2+.2,w=outer-inner,l=seamClipSpec.length+.4,z=seamClipZ-.2
      for(const sign of [-1,1]){
        const start=sign<0?-outer:inner
        cuts.push(horizontal?box(w,l,11,x+start,y-l/2,z):box(l,w,11,x-l/2,y+start,z))
      }
    }
    for(const plate of relevant){
      for(const tie of (allPixels||('kind' in plate&&plate.kind==='wall-mount')?[]:plate.ties.filter(t=>t.pixel.section===section))){
        const x=(tie.pixel.x-cx)*size,y=-(tie.pixel.y-cy)*size,s=size/2,t=backerSpec.wallThickness
        const z=backerSpec.wallTop-bridgeSpec.wallSlotDrop
        if(tie.dx)cuts.push(box(t+.2,bridgeSpec.tieWidth,bridgeSpec.wallSlotHeight,x+tie.dx*(s-t/2)-t/2-.1,y-bridgeSpec.tieWidth/2,z))
        else cuts.push(box(bridgeSpec.tieWidth,t+.2,bridgeSpec.wallSlotHeight,x-bridgeSpec.tieWidth/2,y-tie.dy*(s-t/2)-t/2-.1,z))
      }
      // A bridgeable cable passage through both opposed seam walls. Keep
      // the upper rim for the rear plate and the 2.1 mm pixel floor untouched.
      if('kind' in plate&&(plate.kind==='mount'||(plate.kind==='wall-mount'&&plate.a.section===plate.b.section)))continue
      for(const seam of allPixels?[]:plate.seams??[{a:plate.a,b:plate.b}]){
        const x=((seam.a.x+seam.b.x)/2-cx)*size,y=-((seam.a.y+seam.b.y)/2-cy)*size
        const horizontal=seam.a.x!==seam.b.x
        cuts.push(horizontal?box(4.2,12,12,x-2.1,y-6,7):box(12,4.2,12,x-6,y-2.1,7))
      }
    }
    const solid=keep(keep(keep(M.union(adds)).subtract(keep(M.union(cuts)))).simplify(.0001))
    if(solid.status()!=='NoError'||solid.volume()<=0)throw new Error('Could not create closed backer geometry.')
    const mesh=solid.getMesh(),triangles:Triangle[]=[]
    for(let i=0;i<mesh.triVerts.length;i+=3)triangles.push([0,1,2].map(j=>{
      const k=mesh.triVerts[i+j]*mesh.numProp
      return [mesh.vertProperties[k],mesh.vertProperties[k+1],mesh.vertProperties[k+2]] as Vertex
    }) as Triangle)
    if(carrierCache.size>=48)carrierCache.delete(carrierCache.keys().next().value!)
    carrierCache.set(key,triangles);return triangles
  } finally {
    solids.reverse().forEach(s=>s.delete());seatProfile.delete();footProfile.delete();profile.delete()
  }
}

export function binaryStl(triangles: Triangle[]): Uint8Array {
  const buffer=new ArrayBuffer(84+50*triangles.length), view=new DataView(buffer), bytes=new Uint8Array(buffer)
  bytes.set(new TextEncoder().encode('HoloProp Matrix | Prototype carrier | millimetres'))
  view.setUint32(80,triangles.length,true)
  triangles.forEach(([a,b,c],index)=>{
    const u=b.map((v,i)=>v-a[i]),v=c.map((value,i)=>value-a[i])
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal)||1
    let offset=84+50*index
    for(const value of [...normal.map(value=>value/length),...a,...b,...c]) {view.setFloat32(offset,value,true);offset+=4}
  })
  return bytes
}

function crc32(bytes: Uint8Array): number {
  let crc=0xffffffff
  for(const byte of bytes) {crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
  return (crc^0xffffffff)>>>0
}

export function zipFiles(files: {name:string;bytes:Uint8Array}[]): Uint8Array {
  const chunks:Uint8Array[]=[], central:Uint8Array[]=[], encoder=new TextEncoder();let offset=0,centralLength=0
  for(const file of files) {
    const name=encoder.encode(file.name),crc=crc32(file.bytes),local=new Uint8Array(30+name.length),lv=new DataView(local.buffer)
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint32(14,crc,true);lv.setUint32(18,file.bytes.length,true);lv.setUint32(22,file.bytes.length,true);lv.setUint16(26,name.length,true);local.set(name,30)
    const directory=new Uint8Array(46+name.length),dv=new DataView(directory.buffer)
    dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);dv.setUint32(16,crc,true);dv.setUint32(20,file.bytes.length,true);dv.setUint32(24,file.bytes.length,true);dv.setUint16(28,name.length,true);dv.setUint32(42,offset,true);directory.set(name,46)
    chunks.push(local,file.bytes);central.push(directory);offset+=local.length+file.bytes.length;centralLength+=directory.length
  }
  const end=new Uint8Array(22),ev=new DataView(end.buffer)
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralLength,true);ev.setUint32(16,offset,true)
  const result=new Uint8Array(offset+centralLength+end.length);let cursor=0
  for(const chunk of [...chunks,...central,end]){result.set(chunk,cursor);cursor+=chunk.length}
  return result
}
