import {describe,it,expect} from 'vitest'
import {defaults,generate,presets,type Pixel} from './geometry'
import {backingPlatePlan,backingPlateMesh,plateFitsBed,plateAssemblyZ,plateSeatSpec} from './backingPlate'
import {carrierMesh,type Triangle} from './mesh'
import {hardwareRuntime} from './hardware'
const cells:Pixel[]=[{x:0,y:0,id:1,row:0,section:0},{x:1,y:0,id:2,row:0,section:1}]
describe('separate rear backing plates',()=>{
  it('has a shallow rim nest, a solid roof, and no complete-arch tray interference',async()=>{
    const m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
    const keep=(o:InstanceType<typeof m.Manifold>)=>{objects.push(o);return o}
    const from=async(ts:Triangle[])=>{const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();return keep(new m.Manifold(mesh))}
    try{
      const p=backingPlatePlan(cells)[0],plate=await from(await backingPlateMesh(p,defaults))
      const probe=(z:number)=>keep(keep(m.Manifold.cube([1,1,.5])).translate([-32,15,z]))
      expect(keep(plate.intersect(probe(.1))).volume()).toBeLessThan(.001)
      expect(keep(plate.intersect(probe(plateSeatSpec.depth+.1))).volume()).toBeCloseTo(.5)
      // The bed-facing mouth is wider, but straight seating walls above it
      // retain the requested 0.4 mm per-side working clearance.
      const mouthProbe=(z:number)=>keep(keep(m.Manifold.cube([.05,.05,.05])).translate([-33.6,15,z]))
      expect(keep(plate.intersect(mouthProbe(.02))).volume()).toBeLessThan(.000001)
      expect(keep(plate.intersect(mouthProbe(.6))).volume()).toBeGreaterThan(.0001)
      for(const rows of [1,2,3]){
        const s={...defaults,rows},layout=generate(s),plates=backingPlatePlan(layout.pixels)
        const {pvcMountPlan,pvcMountMesh}=await import('./pvcMount'),mounts=pvcMountPlan(layout.pixels,s)
        const trays=[]
        for(const section of layout.sections){
          const xs=section.map(p=>p.x),ys=section.map(p=>p.y)
          trays.push(keep((await from(await carrierMesh(section,s,[...plates,...mounts]))).translate([(Math.min(...xs)+Math.max(...xs))*33/2,-(Math.min(...ys)+Math.max(...ys))*33/2,0])))
        }
        const allTrays=keep(m.Manifold.union(trays))
        for(const p of [...plates,...mounts]){
          const ts='kind' in p?await pvcMountMesh(p as typeof mounts[number],s):await backingPlateMesh(p,s)
          const world=keep(keep((await from(ts)).rotate([0,0,p.angle*180/Math.PI])).translate([p.x*33,-p.y*33,plateAssemblyZ]))
          expect(keep(world.intersect(allTrays)).volume(),`rows ${rows}, station ${p.id}`).toBeLessThan(.001)
        }
      }
    }finally{objects.reverse().forEach(o=>o.delete())}
  },30000)
  it('finds accessible rim attachments on both trays for one- and two-row arches',()=>{
    for(const rows of [1,2]){
      const plan=backingPlatePlan(generate({...defaults,rows}).pixels)
      expect(plan.length).toBeGreaterThan(0)
      for(const p of plan){expect(p.ties.some(t=>t.pixel.section===p.a.section)).toBe(true);expect(p.ties.some(t=>t.pixel.section===p.b.section)).toBe(true)}
    }
  })
  it('reaches outside rims across the full three-row seam',()=>{
    const plan=backingPlatePlan(generate({...defaults,rows:3}).pixels)
    expect(plan.every(p=>p.ties.length>0)).toBe(true)
    expect(plan.some(p=>(p.cells?.length??0)>2)).toBe(true)
  })
  for(const diffuser of ['house','mario'] as const)it(`makes a closed flat ${diffuser} plate without colliding with either tray`,async()=>{
    const settings={...defaults,diffuser},plan=backingPlatePlan(cells),triangles=await backingPlateMesh(plan[0],settings)
    const edges=new Map<string,number>()
    for(const t of triangles)for(let i=0;i<3;i++){const k=[t[i].join(','),t[(i+1)%3].join(',')].sort().join('|');edges.set(k,(edges.get(k)||0)+1)}
    expect([...edges.values()].every(n=>n===2)).toBe(true)
    expect(Math.min(...triangles.flat().map(v=>v[2]))).toBe(0)
    expect(Math.max(...triangles.flat().map(v=>v[2]))).toBe(3)
    const m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
    const keep=(o:InstanceType<typeof m.Manifold>)=>{objects.push(o);return o}
    const from=(ts:Triangle[])=>{const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();return keep(new m.Manifold(mesh))}
    try{
      const plate=keep(from(triangles).translate([presets[diffuser].size/2,0,plateAssemblyZ]))
      for(const p of cells){
        const tray=keep(from(await carrierMesh([p],settings,plan)).translate([p.x*presets[diffuser].size,0,0]))
        expect(tray.status()).toBe('NoError');expect(keep(tray.intersect(plate)).volume()).toBeLessThan(.001)
        const parts=tray.decompose();expect(parts.length).toBe(1);parts.forEach(p=>p.delete())
      }
    }finally{objects.reverse().forEach(o=>o.delete())}
    expect(plateFitsBed(presets[diffuser].size,settings)).toBe(true)
    expect(plateFitsBed(presets[diffuser].size,{...settings,bed:{...settings.bed,width:40,depth:40}})).toBe(false)
  })
  it('rotates wall attachment slots with a vertical seam',async()=>{
    const vertical=cells.map((p,i)=>({...p,x:0,y:i})),plan=backingPlatePlan(vertical)
    expect(plan[0].angle).toBe(0)
    expect(plan[0].cells!.every(p=>p.x===0)).toBe(true)
    expect((await backingPlateMesh(plan[0],defaults)).length).toBeGreaterThan(0)
  })
  it('does not overlap backing plates on complete one- and two-row arches',async()=>{
    const m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
    const keep=(o:InstanceType<typeof m.Manifold>)=>{objects.push(o);return o}
    try{
      for(const rows of [1,2,3]){
        const s={...defaults,rows},plan=backingPlatePlan(generate(s).pixels),solids=[]
        for(const p of plan){
          const ts=await backingPlateMesh(p,s),mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge()
          solids.push(keep(keep(keep(new m.Manifold(mesh)).rotate([0,0,p.angle*180/Math.PI])).translate([p.x*33,-p.y*33,plateAssemblyZ])))
        }
        for(let i=0;i<solids.length;i++)for(let j=i+1;j<solids.length;j++)expect(keep(solids[i].intersect(solids[j])).volume(),`rows ${rows}, plates ${i+1}/${j+1}`).toBeLessThan(.001)
      }
    }finally{objects.reverse().forEach(o=>o.delete())}
  })
})
