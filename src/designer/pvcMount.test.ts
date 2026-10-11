import {describe,it,expect} from 'vitest'
import {defaults,generate,presets,type Pixel} from './geometry'
import {pvcMountPlan,pvcMountMesh,pvcMountSpec} from './pvcMount'
import {carrierMesh,type Triangle} from './mesh'
import {hardwareRuntime} from './hardware'
import {plateAssemblyZ,backingPlatePlan,backingPlateMesh} from './backingPlate'
describe('supported bolt-on PVC mounts',()=>{
  const cells:Pixel[]=Array.from({length:8},(_,x)=>({x,y:0,id:x+1,row:0,section:0}))
  for(const diffuser of ['house','mario'] as const)it(`creates a connected ${diffuser} seat, open bolt bore, captive nut recess and no tray collision`,async()=>{
    const s={...defaults,diffuser},plan=pvcMountPlan(cells,s)
    expect(plan).toHaveLength(1);expect(plan[0].ties).toHaveLength(2)
    const ts=await pvcMountMesh(plan[0],s),m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
    const keep=(o:InstanceType<typeof m.Manifold>)=>{objects.push(o);return o}
    const from=(ts:Triangle[])=>{const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();return keep(new m.Manifold(mesh))}
    try{
      const local=from(ts),components=local.decompose();expect(components.length).toBe(1);components.forEach(p=>p.delete())
      expect(local.status()).toBe('NoError')
      const bore=keep(m.Manifold.cylinder(14,2.2,2.2,32));expect(keep(local.intersect(bore)).volume()).toBeLessThan(.001)
      const nut=keep(m.Manifold.cylinder(3.2,7/Math.sqrt(3),7/Math.sqrt(3),6));expect(keep(local.intersect(nut)).volume()).toBeLessThan(.001)
      const world=keep(keep(local.rotate([0,0,plan[0].angle*180/Math.PI])).translate([plan[0].x*presets[diffuser].size,0,plateAssemblyZ]))
      const tray=from(await carrierMesh(cells,s,plan));const center=(cells.length-1)*presets[diffuser].size/2
      expect(keep(world.intersect(keep(tray.translate([center,0,0])))).volume()).toBeLessThan(.001)
      expect(pvcMountSpec.clipBaseY).toBe(19)
    }finally{objects.reverse().forEach(o=>o.delete())}
  })
  it('omits interior and overlapping stations instead of floating them',()=>{
    for(const rows of [1,2,3]){
      const s={...defaults,rows},l=generate(s),plan=pvcMountPlan(l.pixels,s)
      if(rows<=2)expect(plan.length).toBeGreaterThan(0)
      for(const p of plan){expect(p.ties).toHaveLength(2);expect(p.ties[0].dx+p.ties[1].dx).toBe(0);expect(p.ties[0].dy+p.ties[1].dy).toBe(0)}
    }
  })
  it('keeps complete one- and two-row mount plates clear of bridges and other mounts',async()=>{
    const m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
    const keep=(o:InstanceType<typeof m.Manifold>)=>{objects.push(o);return o}
    try{
      for(const rows of [1,2]){
        const s={...defaults,rows},pixels=generate(s).pixels,mounts=pvcMountPlan(pixels,s),plates=backingPlatePlan(pixels),all=[]
        for(const p of [...plates,...mounts]){
          const ts='kind' in p?await pvcMountMesh(p as typeof mounts[number],s):await backingPlateMesh(p,s)
          const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge()
          all.push(keep(keep(keep(new m.Manifold(mesh)).rotate([0,0,p.angle*180/Math.PI])).translate([p.x*33,-p.y*33,plateAssemblyZ])))
        }
        for(let i=plates.length;i<all.length;i++)for(let j=0;j<i;j++)expect(keep(all[i].intersect(all[j])).volume(),`rows ${rows}, plates ${i}/${j}`).toBeLessThan(.001)
      }
    }finally{objects.reverse().forEach(o=>o.delete())}
  })
})
