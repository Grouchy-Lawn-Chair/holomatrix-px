/// <reference types="node" />
import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
import {bulletCapMesh} from './bulletCap'
import {extendedCapMesh} from './extendedCap'
import {stripCapMesh} from './stripCap'
import {carrierMesh,type Triangle} from './mesh'
import {defaults,presets} from './geometry'
import {hardwareRuntime} from './hardware'

describe('bullet-only closed diffuser walls',()=>{
  for(const diffuser of ['house','mario'] as const)for(const capFit of ['original','extended'] as const)it(`closes ${diffuser} ${capFit} passages while preserving dimensions and carrier fit`,async()=>{
    const b=readFileSync(new URL(`../../diffuser_references/${diffuser==='house'?'house_33mm':'mario_25_08mm'}.stl`,import.meta.url)),source=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),s={...defaults,diffuser,capFit,lighting:'bullet' as const}
    const ts=capFit==='extended'?await extendedCapMesh(source,s):await bulletCapMesh(source,s),m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
    const keep=(o:InstanceType<typeof m.Manifold>)=>{objects.push(o);return o}
    const from=(ts:Triangle[])=>{const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();return keep(new m.Manifold(mesh))}
    try{
      const cap=from(ts),box=cap.boundingBox(),size=presets[diffuser].size
      expect(cap.status()).toBe('NoError');expect(box.max[0]-box.min[0]).toBeCloseTo(size,3)
      const probe=keep(keep(m.Manifold.cube([.2,.2,.2])).translate([size/2-.3,0,diffuser==='house'?-3:-13]))
      expect(keep(cap.intersect(probe)).volume()).toBeCloseTo(.008,5)
      const tray=from(await carrierMesh([{x:0,y:0,id:1,row:0,section:0}],s))
      expect(keep(cap.intersect(tray)).volume()).toBeLessThan(.001)
      const cavity=keep(keep(m.Manifold.cube([8,8,5])).translate([-4,-4,-10]))
      expect(keep(cap.intersect(cavity)).volume()).toBeLessThan(.001)
      if(diffuser==='house'){
        const strip=from(await stripCapMesh(source,{...s,lighting:'strip'}))
        expect(keep(strip.intersect(probe)).volume()).toBeLessThan(.000001)
      }
    }finally{objects.reverse().forEach(o=>o.delete())}
  })
})
