import {bounds,guide,presets,type Pixel,type Settings} from './geometry'
import {backingPlatePlan,type BackingPlate,type TieMount} from './backingPlate'
import {backerSpec} from './pixelOpening'
import {hardwareRuntime} from './hardware'
import type {Triangle,Vertex} from './mesh'

// Adaptation of Mitchell's slotted wall bridges, not a scaled EMT clip.
// Coordinates: printable base has wall-slot mouths at Z=0, roofs at Z=6.
export const wallMountSpec={slotDepth:6,slotClearance:.8,shoeLength:10,shoeWidth:9,
  rail:5,crossbar:10,roof:6,pad:20,padTop:12,seat:3,hole:4.5,nutFlats:7.1,nutDepth:3.3,
  pipeOD:21.336,pipeClearance:.6,saddleWall:3,saddleLength:14,tieWidth:4.5,tieDepth:1.2,
  maxUnsupported:200}
export const wallMountZ=backerSpec.wallTop-wallMountSpec.slotDepth
export const swivelSeatZ=wallMountSpec.padTop+wallMountSpec.seat
export type WallMount=BackingPlate&{kind:'wall-mount';purpose:'joint'|'support';head:'fixed'|'swivel';headAngle:number}

function tangent(x:number,y:number,s:Settings){
  const path=guide(s);let distance=Infinity,angle=0
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy
    if(!l)continue
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/l)),d=Math.hypot(x-a.x-t*dx,y-a.y-t*dy)
    if(d<distance){distance=d;angle=Math.atan2(-dy,dx)-Math.PI/2}
  }
  return angle // original clip's pipe axis is local Y, independent of wall slots
}
export function wallMountPlan(pixels:Pixel[],s:Settings):WallMount[]{
  const size=presets[s.diffuser].size,head=s.shape==='line'?'fixed':'swivel'
  const seams=backingPlatePlan(pixels)
  const result:WallMount[]=seams.map(p=>({...p,kind:'wall-mount',purpose:'joint',head,headAngle:tangent(p.x,p.y,s)}))
  const occupied=new Map(pixels.map(p=>[`${p.x},${p.y}`,p]))
  // Add supported cross-ribbon stations only where seams leave a long span.
  // Never suppress a seam mount merely to avoid an overlap: report it instead.
  for(const section of [...new Set(pixels.map(p=>p.section))]){
    const cells=pixels.filter(p=>p.section===section),mid=cells[Math.floor(cells.length/2)]
    const candidates=cells.flatMap(p=>[[1,0],[0,1]].flatMap(([dx,dy])=>{
      let a=p,b=p
      while(occupied.get(`${a.x-dx},${a.y-dy}`)?.section===section)a=occupied.get(`${a.x-dx},${a.y-dy}`)!
      while(occupied.get(`${b.x+dx},${b.y+dy}`)?.section===section)b=occupied.get(`${b.x+dx},${b.y+dy}`)!
      if(occupied.has(`${a.x-dx},${a.y-dy}`)||occupied.has(`${b.x+dx},${b.y+dy}`))return []
      const run=cells.filter(c=>dx?c.y===a.y&&c.x>=a.x&&c.x<=b.x:c.x===a.x&&c.y>=a.y&&c.y<=b.y)
      return [{a,b,cells:run,x:(a.x+b.x)/2,y:(a.y+b.y)/2,ties:[{pixel:a,dx:-dx,dy:-dy},{pixel:b,dx,dy}] as TieMount[]}]
    })).sort((a,b)=>a.cells.length-b.cells.length||Math.hypot(a.x-mid.x,a.y-mid.y)-Math.hypot(b.x-mid.x,b.y-mid.y))
    const targets=[mid,...cells.filter(p=>p.row===0&&(p===cells[0]||p===cells.at(-1)))]
    for(const target of targets){
      if(result.some(p=>Math.hypot(p.x-target.x,p.y-target.y)*size<wallMountSpec.maxUnsupported))continue
      const candidate=[...candidates].sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y)||a.cells.length-b.cells.length).find(c=>!result.some(p=>{
        const a=bounds(c.cells),b=bounds(p.cells??[p.a,p.b])
        return a.minX-.4<b.maxX&&a.maxX+.4>b.minX&&a.minY-.4<b.maxY&&a.maxY+.4>b.minY
      }))
      if(candidate)result.push({...candidate,id:seams.length+result.filter(p=>p.purpose==='support').length+1,angle:0,seatCells:pixels,kind:'wall-mount',purpose:'support',head,headAngle:tangent(candidate.x,candidate.y,s)})
    }
  }
  return result
}
export function wallMountFits(p:WallMount,s:Settings){
  const b=bounds(p.cells??[p.a,p.b]),size=presets[s.diffuser].size,w=b.width*size+12,h=b.height*size+12
  return s.bed.shape==='circle'?Math.hypot(w,h)<=s.bed.width-2*s.bed.margin:w<=s.bed.width-2*s.bed.margin&&h<=s.bed.depth-2*s.bed.margin
}
export async function wallMountMesh(p:WallMount,s:Settings):Promise<Triangle[]>{
  if(!p.ties.length)throw new Error(`Mount ${p.id} has no accessible walls on both sections.`)
  const {Manifold:M}=await hardwareRuntime(),items:InstanceType<typeof M>[]=[],sp=wallMountSpec,size=presets[s.diffuser].size
  const keep=(o:InstanceType<typeof M>)=>{items.push(o);return o}
  const box=(w:number,d:number,h:number,x:number,y:number,z:number)=>keep(keep(M.cube([w,d,h])).translate([x,y,z]))
  const cyl=(h:number,r:number,n=64)=>keep(M.cylinder(h,r,r,n))
  const transform=(o:InstanceType<typeof M>,x=0,y=0,z=0)=>keep(o.translate([x,y,z]))
  const centres=(p.cells??[p.a,p.b]).map(c=>({x:(c.x-p.x)*size,y:-(c.y-p.y)*size}))
  try{
    const rings=centres.map(c=>keep(box(size+12,size+12,sp.roof,c.x-size/2-6,c.y-size/2-6,sp.slotDepth).subtract(box(size-2*sp.rail,size-2*sp.rail,sp.roof+.2,c.x-size/2+sp.rail,c.y-size/2+sp.rail,sp.slotDepth-.1))))
    const b=bounds(p.cells??[p.a,p.b]),w=b.width*size+12
    const adds=[...rings,box(w,sp.crossbar,sp.roof,-w/2,-sp.crossbar/2,sp.slotDepth),box(sp.pad,sp.pad,sp.padTop-sp.slotDepth,-sp.pad/2,-sp.pad/2,sp.slotDepth)]
    // U-shaped shoes drop over actual wall centres. Their square receiving
    // corners remain square; the extra slot width is explicit total clearance.
    for(const t of p.ties){
      const x=(t.pixel.x-p.x)*size+t.dx*(size/2-backerSpec.wallThickness/2)
      const y=-(t.pixel.y-p.y)*size-t.dy*(size/2-backerSpec.wallThickness/2)
      const slot=backerSpec.wallThickness+sp.slotClearance
      const shoe=t.dx?box(sp.shoeWidth,sp.shoeLength,sp.slotDepth+.2,x-sp.shoeWidth/2,y-sp.shoeLength/2,0):box(sp.shoeLength,sp.shoeWidth,sp.slotDepth+.2,x-sp.shoeLength/2,y-sp.shoeWidth/2,0)
      const cut=t.dx?box(slot,sp.shoeLength+.2,sp.slotDepth+.1,x-slot/2,y-sp.shoeLength/2-.1,-.1):box(sp.shoeLength+.2,slot,sp.slotDepth+.1,x-sp.shoeLength/2-.1,y-slot/2,-.1)
      adds.push(keep(shoe.subtract(cut)))
    }
    let solid=keep(M.union(adds))
    if(p.head==='swivel'){
      // Flat rear face over the ENTIRE frame. The seat is a separate washer;
      // printing boss-down previously left the frame starting in mid-air.
      const hole=transform(cyl(swivelSeatZ+.2,sp.hole/2),0,0,-.1)
      const nut=transform(cyl(sp.nutDepth+.1,sp.nutFlats/Math.sqrt(3),6),0,0,sp.slotDepth-.1)
      solid=keep(solid.subtract(keep(M.union([hole,nut]))))
    }else{
      // Broad open half-saddle, not a snap arm. Pipe is secured by a zip tie.
      const r=(sp.pipeOD+sp.pipeClearance)/2,outer=r+sp.saddleWall,centre=sp.padTop+outer-.8
      const annulus=keep(cyl(sp.saddleLength,outer).subtract(transform(cyl(sp.saddleLength+.2,r),0,0,-.1)))
      const turned=transform(keep(keep(transform(annulus,0,0,-sp.saddleLength/2).rotate([90,0,0])).rotate([0,0,p.headAngle*180/Math.PI])),0,0,centre)
      const half=keep(turned.intersect(box(60,60,outer+.1,-30,-30,sp.padTop-.1)))
      // A recessed band around the saddle locates the tie without small hooks.
      const grooveRing=keep(cyl(sp.tieWidth,outer+.2).subtract(transform(cyl(sp.tieWidth+.2,outer-sp.tieDepth),0,0,-.1)))
      const groove=transform(keep(keep(transform(grooveRing,0,0,-sp.tieWidth/2).rotate([90,0,0])).rotate([0,0,p.headAngle*180/Math.PI])),0,0,centre)
      // Continue the band through the saddle's embedded root: otherwise the
      // base pad would fill its lowest point and block threading the tie.
      solid=keep(keep(M.union([solid,half])).subtract(groove))
    }
    if(solid.status()!=='NoError'||solid.volume()<=0)throw new Error(`Invalid wall mount ${p.id}`)
    const pieces=solid.decompose(),n=pieces.filter(x=>x.volume()>.001).length;pieces.forEach(x=>x.delete())
    if(n!==1)throw new Error(`Disconnected wall mount ${p.id}`)
    const mesh=solid.getMesh(),out:Triangle[]=[]
    for(let i=0;i<mesh.triVerts.length;i+=3)out.push([0,1,2].map(j=>{const k=mesh.triVerts[i+j]*mesh.numProp;return [mesh.vertProperties[k],mesh.vertProperties[k+1],mesh.vertProperties[k+2]] as Vertex}) as Triangle)
    return out
  }finally{items.reverse().forEach(x=>x.delete())}
}

export async function swivelSpacerMesh():Promise<Triangle[]>{
  const {Manifold:M}=await hardwareRuntime(),sp=wallMountSpec
  const outer=M.cylinder(sp.seat,10,10,64),inner=M.cylinder(sp.seat+.2,sp.hole/2,sp.hole/2,48),cut=inner.translate([0,0,-.1]),solid=outer.subtract(cut)
  try{
    const mesh=solid.getMesh(),out:Triangle[]=[]
    for(let i=0;i<mesh.triVerts.length;i+=3)out.push([0,1,2].map(j=>{const k=mesh.triVerts[i+j]*mesh.numProp;return [mesh.vertProperties[k],mesh.vertProperties[k+1],mesh.vertProperties[k+2]] as Vertex}) as Triangle)
    return out
  }finally{solid.delete();cut.delete();inner.delete();outer.delete()}
}

export async function validateWallMounts(plan:WallMount[],pixels:Pixel[],s:Settings){
  if(backingPlatePlan(pixels).some(j=>!plan.some(p=>p.purpose==='joint'&&p.a.section===j.a.section&&p.b.section===j.b.section)))return 'A section seam has no mounting bridge.'
  if(plan.some(p=>!p.ties.some(t=>t.pixel.section===p.a.section)||!p.ties.some(t=>t.pixel.section===p.b.section)))return 'A joint mount cannot engage walls on both sections.'
  if(plan.some(p=>!wallMountFits(p,s)))return 'A wall mount exceeds the usable bed; reduce rows or increase the bed. Parts are not scaled.'
  if(pixels.some(c=>!plan.some(p=>p.a.section===c.section||p.b.section===c.section)))return 'A section has no supported wall mount.'
  const {Manifold:M,Mesh}=await hardwareRuntime(),solids:InstanceType<typeof M>[]=[]
  try{
    for(const p of plan){
      const ts=await wallMountMesh(p,s),mesh=new Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge()
      const local=new M(mesh),world=local.translate([p.x*presets[s.diffuser].size,-p.y*presets[s.diffuser].size,wallMountZ]);local.delete();solids.push(world)
    }
    for(let i=0;i<solids.length;i++)for(let j=0;j<i;j++){
      const overlap=solids[i].intersect(solids[j]),volume=overlap.volume();overlap.delete()
      if(volume>.01)return `Wall mounts ${plan[j].id} and ${plan[i].id} overlap; change section spacing before export.`
    }
    return ''
  }finally{solids.forEach(x=>x.delete())}
}
