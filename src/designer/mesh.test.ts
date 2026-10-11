import { describe, expect, it } from 'vitest'
import { defaults, generate, presets, type Pixel } from './geometry'
import { binaryStl, carrierMesh, zipFiles } from './mesh'
import { pixelOpening,backerSpec } from './pixelOpening'
import {hardwareRuntime} from './hardware'
import {plateSeatSpec} from './backingPlate'
const pixel=(x:number,y:number,id:number):Pixel=>({x,y,id,row:0,section:0})
describe('manufacturing file export',()=>{
  it('relieves only the rear male rim corners, leaving the wall below intact',async()=>{
    const ts=await carrierMesh([pixel(0,0,1)],defaults),m=await hardwareRuntime()
    const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)})
    mesh.merge();const solid=new m.Manifold(mesh),cube=m.Manifold.cube([.1,.1,.2]),top=cube.translate([16.3,16.3,backerSpec.wallTop-plateSeatSpec.depth+.2]),lower=cube.translate([16.3,16.3,10]),a=solid.intersect(top),b=solid.intersect(lower)
    try{expect(a.volume()).toBeLessThan(.000001);expect(b.volume()).toBeCloseTo(.002,6)}
    finally{a.delete();b.delete();top.delete();lower.delete();cube.delete();solid.delete()}
  })
  it('keeps stair-corner reinforcement inside occupied cells, without a projecting column',async()=>{
    const ts=await carrierMesh([pixel(0,0,1),pixel(1,0,2),pixel(0,1,3)],defaults)
    const m=await hardwareRuntime(),mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)})
    mesh.merge();const solid=new m.Manifold(mesh),probe=m.Manifold.cube([1,1,5]),placed=probe.translate([.1,-1.1,10]),overlap=solid.intersect(placed)
    try{
      expect(solid.status()).toBe('NoError');expect(overlap.volume()).toBeLessThan(.001)
      const pieces=solid.decompose();expect(pieces.length).toBe(1);pieces.forEach(p=>p.delete())
    }finally{overlap.delete();placed.delete();probe.delete();solid.delete()}
  })
  it('keeps the traced bullet-pixel gripping profile 2.1 mm thick without raised pads',async()=>{
    for(const diffuser of ['mario','house'] as const){
      const vertices=(await carrierMesh([pixel(0,0,1)],{...defaults,diffuser})).flat()
      const rim=vertices.filter(v=>pixelOpening.some(([x,y])=>Math.hypot(v[0]-x,v[1]-y)<1e-4))
      expect(Math.max(...rim.map(v=>v[2]))).toBeCloseTo(2.1,5)
      expect(Math.min(...rim.map(v=>v[2]))).toBe(0)
      // Wall-only zip-tie pads extend 1.5 mm inward; the pixel floor itself
      // remains flat. Exclude those pads as well as the 2 mm perimeter wall.
      const interior=vertices.filter(v=>Math.abs(v[0])<presets[diffuser].size/2-3.51&&Math.abs(v[1])<presets[diffuser].size/2-3.51)
      expect(interior.length).toBeGreaterThan(0)
      expect(Math.max(...interior.map(v=>v[2]))).toBeCloseTo(backerSpec.floor,5)
    }
  })
  for(const diffuser of ['mario','house'] as const) it(`exports closed ${diffuser} carrier surfaces across full shared edges`,async()=>{
    const mesh=await carrierMesh([pixel(0,0,1),pixel(1,0,2),pixel(1,-1,3)],{...defaults,diffuser})
    const edges=new Map<string,number>(),direction=new Map<string,number>()
    for(const triangle of mesh) for(let i=0;i<3;i++) {
      const a=triangle[i].join(','),b=triangle[(i+1)%3].join(','),key=[a,b].sort().join('|')
      edges.set(key,(edges.get(key)||0)+1);direction.set(key,(direction.get(key)||0)+(a<b?1:-1))
    }
    expect([...edges.values()].every(value=>value===2),JSON.stringify([...edges.entries()].filter(([,n])=>n!==2).slice(0,8))).toBe(true)
    expect([...direction.values()].every(value=>value===0)).toBe(true)
    const stl=binaryStl(mesh),n=new DataView(stl.buffer).getUint32(80,true)
    expect(n).toBe(mesh.length);expect(stl.length).toBe(84+50*n);expect(n).toBeGreaterThan(0)
  })
  it('exports all generated multirow sections as closed meshes',async()=>{
    const settings={...defaults,rows:3},layout=generate(settings)
    for(const section of layout.sections) {
      const edges=new Map<string,number>()
      for(const t of await carrierMesh(section,settings))for(let i=0;i<3;i++){
        const key=[t[i].join(','),t[(i+1)%3].join(',')].sort().join('|');edges.set(key,(edges.get(key)||0)+1)
      }
      expect([...edges.values()].every(n=>n===2)).toBe(true)
    }
  })
  it('has tall cable walls only at exposed boundaries, not between adjoining cells',async()=>{
    const vertices=(await carrierMesh([pixel(0,0,1),pixel(1,0,2)],defaults)).flat()
    expect(Math.max(...vertices.map(v=>v[2]))).toBeCloseTo(backerSpec.wallTop,4)
    expect(vertices.some(v=>Math.abs(v[0])<.01&&Math.abs(v[1])<14&&v[2]>backerSpec.floor+.01)).toBe(false)
    expect(Math.max(...vertices.map(v=>v[0]))-Math.min(...vertices.map(v=>v[0]))).toBe(66)
  })
  it('creates a ZIP containing actual STL bytes and correct archive headers',async()=>{
    const stl=binaryStl(await carrierMesh([pixel(0,0,1)],defaults)),zip=zipFiles([{name:'section_01.stl',bytes:stl}]),v=new DataView(zip.buffer)
    expect(v.getUint32(0,true)).toBe(0x04034b50)
    expect(v.getUint32(zip.length-22,true)).toBe(0x06054b50)
    expect(v.getUint16(zip.length-14,true)).toBe(1)
    expect(zip.length).toBeGreaterThan(stl.length)
  })
})
