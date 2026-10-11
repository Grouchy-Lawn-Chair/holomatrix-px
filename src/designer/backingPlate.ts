import {bounds,presets,type Pixel,type Settings} from './geometry'
import {backerSpec} from './pixelOpening'
import {jointAnchors,type JointAnchor} from './jointPlacement'
import {hardwareRuntime} from './hardware'
import type {Triangle,Vertex} from './mesh'

// A separate rear bridge, not a test coupon embedded in the pixel floor.
// Cable ties wrap through a tray-wall slot and two plate slots around that wall.
export const bridgeSpec={thickness:3,overhang:6,rail:6,tieWidth:4,tieSlot:1.8,wallSlotHeight:3,wallSlotDrop:5}
// Shallow rear-face nest: 0.40 mm each side, with a 1.8 mm bridge roof.
// The plate drops over the tray rim; ties retain it, not an interference fit.
export const plateSeatSpec={depth:1.2,clearanceTotal:.8,cornerChamfer:.8,entryRelief:.3,entryHeight:.4}
// Square tapered mouth, not a bevel across the concave XY receiving corners.
export function plateSeatLeadInPoints(x:number,y:number,size:number):Vertex[]{
  return [-.1,0,plateSeatSpec.entryHeight].flatMap(z=>{
    const r=(size+plateSeatSpec.clearanceTotal)/2+(z<=0?plateSeatSpec.entryRelief:0)
    return [[x-r,y-r,z],[x+r,y-r,z],[x+r,y+r,z],[x-r,y+r,z]] as Vertex[]
  })
}
export type TieMount={pixel:Pixel;dx:number;dy:number}
export type BackingPlate=JointAnchor&{ties:TieMount[];cells?:Pixel[];seatCells?:Pixel[];seams?:{a:Pixel;b:Pixel}[]}
export function backingPlatePlan(pixels:Pixel[]){
  const occupied=new Set(pixels.map(p=>`${p.x},${p.y}`))
  const mounts=(p:Pixel):TieMount[]=>[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>!occupied.has(`${p.x+dx},${p.y+dy}`)).map(([dx,dy])=>({pixel:p,dx,dy}))
  return jointAnchors(pixels).map(anchor=>{
    // Search the whole interface: a middle cell in a wide ribbon has no outer rim.
    const candidates=pixels.filter(p=>p.section===anchor.a.section).flatMap(a=>pixels.filter(b=>b.section===anchor.b.section&&Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1).map(b=>({a,b,ta:mounts(a),tb:mounts(b)})))
    candidates.sort((p,q)=>Number(q.ta.length>0&&q.tb.length>0)-Number(p.ta.length>0&&p.tb.length>0)||Math.hypot((p.a.x+p.b.x)/2-anchor.x,(p.a.y+p.b.y)/2-anchor.y)-Math.hypot((q.a.x+q.b.x)/2-anchor.x,(q.a.y+q.b.y)/2-anchor.y)||p.a.x-q.a.x||p.a.y-q.a.y)
    const c=candidates[0]
    if(!c)return {...anchor,ties:[]} as BackingPlate
    const cells=[...new Map(candidates.flatMap(c=>[c.a,c.b]).map(p=>[p.id,p])).values()],b=bounds(cells)
    const ties=cells.flatMap(mounts)
    const accessible=ties.some(t=>t.pixel.section===anchor.a.section)&&ties.some(t=>t.pixel.section===anchor.b.section)
    return {...anchor,x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2,angle:0,cells,seatCells:pixels,seams:candidates.map(c=>({a:c.a,b:c.b})),ties:accessible?ties:[]} as BackingPlate
  })
}
export function plateFitsBed(size:number,s:Settings){
  const w=2*size+2*bridgeSpec.overhang,h=size+2*bridgeSpec.overhang
  return s.bed.shape==='circle'?Math.hypot(w,h)<=s.bed.width-2*s.bed.margin:w<=s.bed.width-2*s.bed.margin&&h<=s.bed.depth-2*s.bed.margin
}
export function plateFootprint(p:BackingPlate,size:number){
  const b=bounds(p.cells??[p.a,p.b]),o=bridgeSpec.overhang
  return {width:b.width*size+2*o,depth:b.height*size+2*o}
}
export function plateSeatCenters(p:BackingPlate,size:number,footprint=plateFootprint(p,size)){
  const co=Math.cos(p.angle),si=Math.sin(p.angle)
  return (p.seatCells??p.cells??[p.a,p.b]).map(c=>{
    const x=(c.x-p.x)*size,y=-(c.y-p.y)*size
    return {x:co*x+si*y,y:-si*x+co*y}
  }).filter(c=>Math.abs(c.x)<(footprint.width+size)/2&&Math.abs(c.y)<(footprint.depth+size)/2)
}
export async function backingPlateMesh(plate:BackingPlate,s:Settings):Promise<Triangle[]>{
  if(!plate.ties.length)throw new Error(`Joint ${plate.id} has no accessible outer wall on both sections.`)
  const size=presets[s.diffuser].size,{Manifold:M}=await hardwareRuntime(),objects:InstanceType<typeof M>[]=[]
  const keep=(v:InstanceType<typeof M>)=>{objects.push(v);return v}
  const box=(w:number,d:number,h:number,x:number,y:number,z=0)=>keep(keep(M.cube([w,d,h])).translate([x,y,z]))
  try{
    const cells=plate.cells??[plate.a,plate.b],o=bridgeSpec.overhang
    const cos=Math.cos(plate.angle),sin=Math.sin(plate.angle)
    const centres=cells.map(p=>{const wx=(p.x-plate.x)*size,wy=-(p.y-plate.y)*size;return {x:cos*wx+sin*wy,y:-sin*wx+cos*wy}})
    const cuts=centres.map(p=>box(size-12,size-12,3.2,p.x-size/2+6,p.y-size/2+6,-.1))
    const gap=plateSeatSpec.clearanceTotal/2
    const seatCentres=plateSeatCenters(plate,size)
    const pocket=keep(M.union(seatCentres.map(p=>box(size+2*gap,size+2*gap,plateSeatSpec.depth+.1,p.x-size/2-gap,p.y-size/2-gap,-.1))))
    cuts.push(pocket)
    cuts.push(...seatCentres.map(p=>keep(M.hull(plateSeatLeadInPoints(p.x,p.y,size)))))
    for(const tie of plate.ties){
      const wx=(tie.pixel.x-plate.x)*size,wy=-(tie.pixel.y-plate.y)*size
      const x=cos*wx+sin*wy,y=-sin*wx+cos*wy,dx=cos*tie.dx-sin*tie.dy,dy=-sin*tie.dx-cos*tie.dy
      for(const distance of [size/2-3.5,size/2+3]){
        const px=x+dx*distance,py=y+dy*distance
        cuts.push(Math.abs(dx)>.5?box(bridgeSpec.tieSlot,bridgeSpec.tieWidth,3.2,px-bridgeSpec.tieSlot/2,py-bridgeSpec.tieWidth/2,-.1):box(bridgeSpec.tieWidth,bridgeSpec.tieSlot,3.2,px-bridgeSpec.tieWidth/2,py-bridgeSpec.tieSlot/2,-.1))
      }
    }
    const footprint=keep(M.union(centres.map(p=>box(size+2*o,size+2*o,bridgeSpec.thickness,p.x-size/2-o,p.y-size/2-o))))
    const solid=keep(footprint.subtract(keep(M.union(cuts))))
    if(solid.status()!=='NoError'||solid.volume()<=0)throw new Error('Invalid backing plate solid.')
    const components=solid.decompose();const n=components.length;components.forEach(c=>c.delete());if(n!==1)throw new Error('Backing plate must be one connected solid.')
    const mesh=solid.getMesh(),triangles:Triangle[]=[]
    for(let i=0;i<mesh.triVerts.length;i+=3)triangles.push([0,1,2].map(j=>{const k=mesh.triVerts[i+j]*mesh.numProp;return [mesh.vertProperties[k],mesh.vertProperties[k+1],mesh.vertProperties[k+2]] as Vertex}) as Triangle)
    return triangles
  }finally{objects.reverse().forEach(o=>o.delete())}
}
export const plateAssemblyZ=backerSpec.wallTop-plateSeatSpec.depth

export async function validatePlateAssembly(plates:BackingPlate[],s:Settings):Promise<string>{
  if(!plates.length)return ''
  if(plates.some(p=>!p.ties.length))return 'Some seams have no accessible rim on both trays; custom backing plates are needed before export.'
  const size=presets[s.diffuser].size
  if(plates.some(p=>{const {width:w,depth:h}=plateFootprint(p,size);return s.bed.shape==='circle'?Math.hypot(w,h)>s.bed.width-2*s.bed.margin:w>s.bed.width-2*s.bed.margin||h>s.bed.depth-2*s.bed.margin}))return 'A full-row rear bridge does not fit the bed. Reduce rows or use a larger bed; mating parts are never scaled.'
  const m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
  const keep=(o:InstanceType<typeof m.Manifold>)=>{objects.push(o);return o}
  try{
    const solids=[]
    for(const p of plates){
      const ts=await backingPlateMesh(p,s),mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge()
      solids.push(keep(keep(keep(new m.Manifold(mesh)).rotate([0,0,p.angle*180/Math.PI])).translate([p.x*size,-p.y*size,plateAssemblyZ])))
    }
    for(let i=0;i<solids.length;i++)for(let j=i+1;j<solids.length;j++)if(keep(solids[i].intersect(solids[j])).volume()>.001)return `Backing plates ${plates[i].id} and ${plates[j].id} overlap; this layout needs a custom bridge before export.`
    return ''
  }finally{objects.reverse().forEach(o=>o.delete())}
}
