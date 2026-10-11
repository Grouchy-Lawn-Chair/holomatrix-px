/// <reference types="node" />
import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
import {bounds,defaults,generate,presets,type Pixel} from './geometry'
import {backingPlatePlan,backingPlateMesh} from './backingPlate'
import {joinedDiffuserMesh,joinedDiffuserConflicts,joinedDiffuserFits} from './joinedDiffuser'
import {hardwareRuntime} from './hardware'
import {carrierMesh,type Triangle} from './mesh'
describe('full-row seam diffusers',()=>{
  for(const diffuser of ['house','mario'] as const)for(const rows of [1,2,3])it(`joins ${rows} rows of ${diffuser} caps into one material body with matching backer seats`,async()=>{
    const s={...defaults,diffuser,rows,capFit:'extended' as const},size=presets[diffuser].size
    const cells:Pixel[]=Array.from({length:rows},(_,y)=>[0,1].map(x=>({x,y,id:y*2+x+1,row:y,section:x}))).flat(),p=backingPlatePlan(cells)[0]
    expect(p.cells).toHaveLength(rows*2);expect(p.ties.some(t=>t.pixel.row===rows-1)).toBe(true)
    const b=readFileSync(new URL(`../../diffuser_references/${diffuser==='house'?'house_33mm':'mario_25_08mm'}.stl`,import.meta.url)),ts=await joinedDiffuserMesh(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),s,p)
    const m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
    const keep=(o:InstanceType<typeof m.Manifold>)=>{objects.push(o);return o}
    const from=(ts:Triangle[])=>{const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();return keep(new m.Manifold(mesh))}
    try{
      const cap=from(ts);expect(cap.status()).toBe('NoError');const parts=cap.decompose();expect(parts.filter(p=>p.volume()>.001)).toHaveLength(1);parts.forEach(p=>p.delete())
      const bb=cap.boundingBox();expect(bb.max[1]-bb.min[1]).toBeCloseTo(rows*size,3)
      const world=keep(cap.translate([p.x*size,-p.y*size,0]))
      for(const section of [0,1]){const c=cells.filter(c=>c.section===section),b=bounds(c),tray=keep(from(await carrierMesh(c,s,[p])).translate([(b.minX+b.maxX)/2*size,-(b.minY+b.maxY)/2*size,0]));expect(keep(world.intersect(tray)).volume()).toBeLessThan(.001)}
      expect((await backingPlateMesh(p,s)).length).toBeGreaterThan(0)
      expect(joinedDiffuserFits(p,s)).toBe(true)
      expect(joinedDiffuserFits(p,{...s,bed:{...s.bed,width:40,depth:40}})).toBe(false)
    }finally{objects.reverse().forEach(o=>o.delete())}
  })
  it('covers every actual cross-section edge, including staircase seams',()=>{
    for(const rows of [1,2,3]){
      const cells=generate({...defaults,rows}).pixels,plan=backingPlatePlan(cells)
      for(const a of cells)for(const b of cells.filter(b=>b.section!==a.section&&Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1)){
        expect(plan.some(p=>p.cells?.some(c=>c.id===a.id)&&p.cells.some(c=>c.id===b.id))).toBe(true)
      }
      expect(joinedDiffuserConflicts(plan)).toBe('')
    }
  })
})
