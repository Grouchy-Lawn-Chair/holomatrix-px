import {readFileSync,existsSync} from 'node:fs'
import {expect,it,vi} from 'vitest'
import {defaults,generate,bounds,presets,type Settings} from './geometry'
import {emtHardware,emtMountPose,emtPrintPose,emtCompatible,emtMountParts} from './emtHardware'
import {hardwareRuntime} from './hardware'
import type {Triangle} from './mesh'
import {carrierMesh} from './mesh'
import {conduitClipPlan} from './conduitClips'
import {framePlan} from './propPlan'
import {buildDirectTieFiles} from './directTieExports'

it('loads actual derived solids, fits the paired walls and clears the head/base mate',async()=>{
 vi.stubGlobal('fetch',async(url:string)=>{
  const name=String(url).split('/').at(-1)!,folder=name.includes('25_08mm')||name.includes('33mm')?'../../diffuser_references/':'../../public/hardware/emt/',data=readFileSync(new URL(folder+name,import.meta.url))
  return {ok:true,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)}
 })
 try{
  const s:Settings={...defaults},parts=await emtHardware(s),m=await hardwareRuntime()
  const solid=(ts:Triangle[])=>{const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();return new m.Manifold(mesh)}
  for(const rear of [68.520308667,92.020308667,120]){
   const pose=emtMountPose(parts,rear),base=solid(pose.base),head=solid(pose.head)
   expect(base.status()).toBe('NoError');expect(head.status()).toBe('NoError')
   const interference=base.intersect(head);expect(interference.volume()).toBeLessThan(.001);interference.delete()
   for(const x of [-2.05,.05]){
    const wall=m.Manifold.cube([2,50,23.296]).translate([x,-25,2.1]),hit=base.intersect(wall)
    expect(hit.volume()).toBeLessThan(.001);hit.delete();wall.delete()
   }
   for(const ts of Object.values(pose))expect(Math.min(...emtPrintPose(ts).flat().map(v=>v[2]))).toBeCloseTo(0)
   base.delete();head.delete()
  }
  expect(emtCompatible({...s,frame:{enabled:true,axis:'vertical',rails:2,offset:0,standOff:65,diameter:30}})).toBe(false)
  // Optional local regression fixtures are not redistributed with public source.
  if(!existsSync('mounting-flow-review/reported-mounting-plan.json')||!existsSync('public/prop-library/jack-o-lantern/jack-o-lantern-535.json'))return
  const reported=JSON.parse(readFileSync(new URL('../../mounting-flow-review/reported-mounting-plan.json',import.meta.url),'utf8')).settings as Settings
  const house:Settings={...reported,diffuser:'house',sprite:JSON.parse(readFileSync(new URL('../../public/prop-library/jack-o-lantern/jack-o-lantern-535.json',import.meta.url),'utf8')),frame:{...reported.frame!,axis:'cross',rails:1}}
  for(const reported of [reportedSettings(),house]){
  const l=generate(reported),size=presets[reported.diffuser].size,rails=framePlan(reported,l.pixels)
  const trays=await Promise.all(l.sections.map(async c=>{
   const b=bounds(c),cx=(b.minX+b.maxX)/2*size,cy=-(b.minY+b.maxY)/2*size
   const ts=await carrierMesh(c,reported,[],l.pixels)
   return solid(ts.map(t=>t.map(([x,y,z])=>[x+cx,y+cy,z]) as Triangle))
  }))
  for(const zone of conduitClipPlan(l.pixels,reported)){
   const parts=await emtMountParts(reported,l.pixels,zone,rails.find(r=>r.id===zone.rail)!.rearCenter)
   const mount=solid(parts.base.map(t=>t.map(([x,y,z])=>zone.axis==='vertical'?[x+zone.x*size,y-zone.y*size,z]:[-y+zone.x*size,x-zone.y*size,z]) as Triangle))
   for(const tray of trays){const hit=mount.intersect(tray);expect(hit.volume(),`mount ${zone.id}`).toBeLessThan(.01);hit.delete()}
   mount.delete()
  }
  trays.forEach(t=>t.delete())
  }
  const files=await buildDirectTieFiles(reported)
  expect(files.filter(f=>/^conduit_base_mount_/.test(f.name))).toHaveLength(5)
  expect(files.filter(f=>/^conduit_head_rail_/.test(f.name))).toHaveLength(2)
  expect(new TextDecoder().decode(files.find(f=>f.name==='CONDUIT_PRINT_QUANTITIES.csv')!.bytes)).toContain('conduit_head_rail_1_SIDE_DOWN.stl,2')
 }finally{vi.unstubAllGlobals()}
},30000)
function reportedSettings():Settings{return JSON.parse(readFileSync(new URL('../../mounting-flow-review/reported-mounting-plan.json',import.meta.url),'utf8')).settings}
