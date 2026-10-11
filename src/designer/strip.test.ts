/// <reference types="node" />
import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
import {defaults,parseProject} from './geometry'
import {stripPresets,stripSpec} from './strip'
import {stripCapMesh} from './stripCap'
import {carrierMesh} from './mesh'
import {hardwareRuntime} from './hardware'

describe('30/m strip prototypes',()=>{
  it('uses the supplied product-image dimensions and a separate total allowance',()=>{
    expect(stripSpec({...defaults,stripType:'ip67'}).channelWidth).toBeCloseTo(12.7)
    expect(stripSpec({...defaults,stripType:'ip30'}).thickness).toBe(2.13)
    expect(stripSpec({...defaults,stripType:'ip65'}).thickness).toBe(3)
    expect(stripSpec(defaults).pitch).toBeCloseTo(1000/30)
    expect(()=>parseProject(JSON.stringify({...defaults,lighting:'strip',stripWidth:-1}))).toThrow()
    expect(()=>parseProject(JSON.stringify({...defaults,lighting:'strip',diffuser:'mario'}))).toThrow()
  })
  for(const stripType of Object.keys(stripPresets) as (keyof typeof stripPresets)[])it(`makes closed ${stripType} backers and derived caps with strip clearance`,async()=>{
    const settings={...defaults,lighting:'strip' as const,stripType},spec=stripSpec(settings)
    const bytes=readFileSync(new URL('../../diffuser_references/house_33mm.stl',import.meta.url))
    const cap=await stripCapMesh(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),settings)
    const backer=await carrierMesh([{x:0,y:0,id:1,row:0,section:0}],settings)
    const m=await hardwareRuntime()
    const from=(tris:typeof cap)=>{
      const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(tris.flat(2)),triVerts:Uint32Array.from({length:tris.length*3},(_,i)=>i)});mesh.merge();return new m.Manifold(mesh)
    }
    const c=from(cap),b=from(backer),cube=m.Manifold.cube([33,spec.width,spec.thickness]),strip=cube.translate([-16.5,-spec.width/2,spec.seatDepth-spec.thickness])
    const hitCap=c.intersect(strip),hitBacker=b.intersect(strip)
    try{
      expect(c.status()).toBe('NoError');expect(b.status()).toBe('NoError')
      expect(hitCap.volume()).toBeLessThan(.001);expect(hitBacker.volume()).toBeLessThan(.001)
      for(const tris of [cap,backer]){
        const edges=new Map<string,number>()
        for(const t of tris)for(let i=0;i<3;i++){const key=[t[i].join(','),t[(i+1)%3].join(',')].sort().join('|');edges.set(key,(edges.get(key)||0)+1)}
        expect([...edges.values()].every(n=>n===2)).toBe(true)
      }
      // Unlike bullet mode, there is a solid central floor under the strip.
      expect(b.volume()).toBeGreaterThan(0)
    }finally{hitCap.delete();hitBacker.delete();strip.delete();cube.delete();b.delete();c.delete()}
  })
})
