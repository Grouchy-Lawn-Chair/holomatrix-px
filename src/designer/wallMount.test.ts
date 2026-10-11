import {describe,it,expect} from 'vitest'
import {defaults,generate,presets,bounds,type Settings,type Pixel} from './geometry'
import {wallMountPlan,wallMountMesh,validateWallMounts,wallMountZ,wallMountSpec} from './wallMount'
import {backingPlatePlan} from './backingPlate'
import {hardwareRuntime} from './hardware'
import {carrierMesh,type Triangle} from './mesh'

describe('glued wall bridges with fixed/swivel heads',()=>{
  for(const shape of ['arch','line'] as const)for(const rows of [1,2,3])it(`${shape}, ${rows} rows: every seam supported on both sections`,async()=>{
    const s={...defaults,shape,rows},l=generate(s),plan=wallMountPlan(l.pixels,s),seams=backingPlatePlan(l.pixels)
    expect(plan.filter(p=>p.purpose==='joint')).toHaveLength(seams.length)
    for(const p of plan){
      expect(p.head).toBe(shape==='line'?'fixed':'swivel')
      expect(p.ties.some(t=>t.pixel.section===p.a.section)).toBe(true)
      expect(p.ties.some(t=>t.pixel.section===p.b.section)).toBe(true)
    }
    expect(await validateWallMounts(plan,l.pixels,s)).toBe('')
  },30000)
  const cells:Pixel[]=[{x:0,y:0,id:1,row:0,section:0},{x:1,y:0,id:2,row:0,section:1}]
  for(const shape of ['arch','line'] as const)for(const diffuser of ['house','mario'] as const)it(`${shape}/${diffuser}: connected printable base, clear wall slots and no tray collision`,async()=>{
    const s:Settings={...defaults,shape,diffuser},plan=wallMountPlan(cells,s),ts=await wallMountMesh(plan[0],s),m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
    const keep=(o:InstanceType<typeof m.Manifold>)=>{objects.push(o);return o}
    const from=(ts:Triangle[])=>{const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();return keep(new m.Manifold(mesh))}
    try{
      const local=from(ts),components=local.decompose();expect(components.filter(c=>c.volume()>.001)).toHaveLength(1);components.forEach(c=>c.delete())
      expect(local.status()).toBe('NoError')
      const size=presets[diffuser].size,world=keep(local.translate([plan[0].x*size,-plan[0].y*size,wallMountZ]))
      for(const section of [[cells[0]],[cells[1]]]){
        const b=bounds(section),tray=keep(from(await carrierMesh(section,s,plan)).translate([(b.minX+b.maxX)/2*size,-(b.minY+b.maxY)/2*size,0]))
        expect(keep(world.intersect(tray)).volume()).toBeLessThan(.001)
      }
      if(shape==='arch'){
        const bore=keep(m.Manifold.cylinder(20,wallMountSpec.hole/2-.01,wallMountSpec.hole/2-.01,48))
        expect(keep(local.intersect(bore)).volume()).toBeLessThan(.001)
      }else{
        const channel=keep(keep(m.Manifold.cube([2,.4,.3])).translate([-1,-.2,wallMountSpec.padTop-.5]))
        expect(keep(local.intersect(channel)).volume(),'tie channel must remain open through the saddle root').toBeLessThan(.001)
      }
    }finally{objects.reverse().forEach(x=>x.delete())}
  })
  it('does not silently drop mandatory seams when the bed cannot fit a mount',async()=>{
    const s={...defaults,bed:{...defaults.bed,width:50}},plan=wallMountPlan(cells,s)
    expect(plan.filter(p=>p.purpose==='joint')).toHaveLength(1)
    expect(await validateWallMounts(plan,cells,s)).toContain('exceeds')
  })
  it('keeps all shoes and bridges clear of a complete three-row stair-stepped arch',async()=>{
    const s={...defaults,rows:3},l=generate(s),plan=wallMountPlan(l.pixels,s),m=await hardwareRuntime(),solids:InstanceType<typeof m.Manifold>[]=[]
    const keep=(o:InstanceType<typeof m.Manifold>)=>{solids.push(o);return o}
    const from=(ts:Triangle[])=>{const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();return keep(new m.Manifold(mesh))}
    try{
      const trays=[]
      for(const cells of l.sections){const b=bounds(cells);trays.push(keep(from(await carrierMesh(cells,s,plan)).translate([(b.minX+b.maxX)/2*33,-(b.minY+b.maxY)/2*33,0])))}
      for(const p of plan){
        const mount=keep(from(await wallMountMesh(p,s)).translate([p.x*33,-p.y*33,wallMountZ]))
        for(const tray of trays)expect(keep(mount.intersect(tray)).volume(),`Mount ${p.id} must clear all tray walls`).toBeLessThan(.001)
      }
    }finally{solids.reverse().forEach(o=>o.delete())}
  },30000)
})
