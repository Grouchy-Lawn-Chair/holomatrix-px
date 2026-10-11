import type {Triangle} from './mesh'
import {presets,type Settings,type Pixel} from './geometry'
import type {MountZone} from './conduitClips'
import baseUrl from '../../public/hardware/emt/base-assembled.stl?url'
import emtUrl from '../../public/hardware/emt/head-23.5-assembled.stl?url'
import pvcUrl from '../../public/hardware/emt/head-21.336-assembled.stl?url'

export const emtHardwareSpec={rearCenter:68.520308667,pipeOD:23.5,pvcOD:21.336,along:44.73,across:44.79,diametralAllowance:.6}
export function emtCompatible(s:Settings){const d=s.frame?.diameter??23.5;return Math.abs(d-23.5)<.01||Math.abs(d-21.336)<.01}
const cache=new Map<string,Promise<Triangle[]>>()
async function load(url:string):Promise<Triangle[]>{
 if(!cache.has(url))cache.set(url,(async()=>{
  const response=await fetch(url);if(!response.ok)throw new Error('Could not load the EMT mounting hardware.')
  const data=await response.arrayBuffer(),v=new DataView(data),n=v.getUint32(80,true)
  if(data.byteLength!==84+50*n)throw new Error('Invalid EMT hardware STL.')
  return Array.from({length:n},(_,i)=>Array.from({length:3},(_,j)=>Array.from({length:3},(_,k)=>v.getFloat32(84+i*50+12+j*12+k*4,true)))) as Triangle[]
 })().catch(e=>{cache.delete(url);throw e}))
 return cache.get(url)!
}
export async function emtHardware(s:Settings){
 if(!emtCompatible(s))throw new Error('Choose a modeled 23.5 mm EMT or 21.336 mm PVC mounting head; other measured pipe sizes need a new fit variant.')
 const [base,head]=await Promise.all([load(baseUrl),load(Math.abs((s.frame?.diameter??23.5)-21.336)<.01?pvcUrl:emtUrl)])
 return {base,head}
}
export function emtMountPose(parts:{base:Triangle[];head:Triangle[]},rearCenter:number){
 const delta=Math.max(0,rearCenter-emtHardwareSpec.rearCenter)
 return {
  base:parts.base.map(t=>t.map(([x,y,z])=>[x,y,z+delta*Math.max(0,Math.min(1,(z-30.4)/5))]) as Triangle),
  head:parts.head.map(t=>t.map(([x,y,z])=>[x,y,z+delta]) as Triangle)
 }
}
// A continuous mounting seam can cross a perpendicular tray seam. Relieve
// the underside locally instead of pushing the clip through those walls.
export async function emtMountParts(s:Settings,pixels:Pixel[],zone:MountZone,rearCenter:number){
 const parts=emtMountPose(await emtHardware(s),rearCenter),size=presets[s.diffuser].size,vertical=zone.axis==='vertical'
 const map=new Map(pixels.map(p=>[`${p.x},${p.y}`,p])),stations=new Set<number>()
 for(const p of pixels){
  const q=map.get(`${p.x+(vertical?0:1)},${p.y+(vertical?1:0)}`)
  if(!q||p.section===q.section)continue
  const across=Math.abs(vertical?p.x-zone.x:p.y-zone.y)*size
  const along=-((vertical?p.y-zone.y:p.x-zone.x)+.5)*size
  if(across<=size/2+7&&Math.abs(along)<22.365+2.4)stations.add(along)
 }
 if(!stations.size)return parts
 const {hardwareRuntime}=await import('./hardware'),m=await hardwareRuntime()
 const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(parts.base.flat(2)),triVerts:Uint32Array.from({length:parts.base.length*3},(_,i)=>i)});mesh.merge()
 let base=new m.Manifold(mesh)
 try{
  for(const y of stations){const raw=m.Manifold.cube([14,4.8,25.596]),cut=raw.translate([-7,y-2.4,0]),next=base.subtract(cut);raw.delete();cut.delete();base.delete();base=next}
  if(base.status()!=='NoError')throw new Error('Conduit base relief needs repair.')
  const pieces=base.decompose(),count=pieces.length;pieces.forEach(p=>p.delete());if(count!==1)throw new Error('Mounting base relief would separate the clip. Move this mount.')
  const out=base.getMesh(),triangles:Triangle[]=[]
  for(let i=0;i<out.triVerts.length;i+=3)triangles.push([0,1,2].map(j=>{const k=out.triVerts[i+j]*out.numProp;return [out.vertProperties[k],out.vertProperties[k+1],out.vertProperties[k+2]]}) as Triangle)
  return {...parts,base:triangles}
 }finally{base.delete()}
}
// Side-print orientation: receiving gap stays in the layer plane, not upright.
export function emtPrintPose(ts:Triangle[]):Triangle[]{
 const rotated=ts.map(t=>t.map(([x,y,z])=>[z,x,y]) as Triangle),min=Math.min(...rotated.flat().map(v=>v[2]))
 return rotated.map(t=>t.map(([x,y,z])=>[x,y,z-min]) as Triangle)
}
