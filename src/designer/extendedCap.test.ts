/// <reference types="node" />
import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
import {extendedCapMesh} from './extendedCap'
import {carrierMesh,type Triangle} from './mesh'
import {defaults} from './geometry'
import {hardwareRuntime} from './hardware'
import {toothClearanceTotal} from './capSeats'
describe('long diffuser teeth and through-floor seating',()=>{
  it('uses extra side space only for long teeth and rejects invalid clearances',()=>{
    expect(toothClearanceTotal({capFit:'extended'})).toBe(.3)
    expect(toothClearanceTotal({capFit:'extended',toothClearance:.5})).toBe(.5)
    expect(toothClearanceTotal({capFit:'original',toothClearance:.5})).toBe(.1)
    expect(()=>toothClearanceTotal({capFit:'extended',toothClearance:2})).toThrow()
  })
  it('regenerates wider slots when the fit allowance changes',async()=>{
    const cell=[{x:0,y:0,id:1,row:0,section:0}],s={...defaults,capFit:'extended' as const}
    const narrow=await carrierMesh(cell,{...s,toothClearance:.1}),wide=await carrierMesh(cell,{...s,toothClearance:.5})
    expect(wide).not.toEqual(narrow)
  })
  for(const diffuser of ['house','mario'] as const)for(const lighting of (diffuser==='house'?['bullet','strip']:['bullet']) as ('bullet'|'strip')[])it(`fits ${diffuser} ${lighting} teeth through flat-floor slots`,async()=>{
    const s={...defaults,diffuser,lighting,capFit:'extended' as const},bytes=readFileSync(new URL(`../../diffuser_references/${diffuser==='house'?'house_33mm':'mario_25_08mm'}.stl`,import.meta.url))
    const ts=await extendedCapMesh(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),s),trayTs=await carrierMesh([{x:0,y:0,id:1,row:0,section:0}],s)
    const m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
    const keep=(o:InstanceType<typeof m.Manifold>)=>{objects.push(o);return o}
    const from=(ts:Triangle[])=>{const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();return keep(new m.Manifold(mesh))}
    try{
      const cap=from(ts),tray=from(trayTs);expect(cap.status()).toBe('NoError');expect(tray.status()).toBe('NoError')
      for(const solid of [cap,tray]){const parts=solid.decompose();expect(parts.length).toBe(1);parts.forEach(p=>p.delete())}
      expect(cap.boundingBox().max[2]).toBeCloseTo(3.5,1)
      expect(keep(cap.intersect(tray)).volume()).toBeLessThan(.001)
      // The floor of the slot is open, rather than the former 0.95 mm blind pocket.
      const x=diffuser==='house'?15.2:11.6
      const probe=keep(keep(m.Manifold.cube([.2,.2,3.5])).translate([x,4,0]))
      expect(keep(probe.intersect(tray)).volume()).toBeLessThan(.001)
    }finally{objects.reverse().forEach(o=>o.delete())}
  })
})
