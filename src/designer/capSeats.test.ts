/// <reference types="node" />
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {STLLoader} from 'three/addons/loaders/STLLoader.js'
import {capSeatSpec,capFootContours} from './capSeats'
import {carrierMesh} from './mesh'
import {defaults,presets} from './geometry'
import {orientCap} from './previewGeometry'
import {hardwareRuntime} from './hardware'

describe('original diffuser-foot seats',()=>{
  it('uses 0.1 mm total clearance and leaves a bridge roof in the floor',()=>{
    expect(capSeatSpec.clearanceTotal).toBe(.1)
    expect(capSeatSpec.depth).toBeGreaterThan(capSeatSpec.insertion)
    expect(2.1-capSeatSpec.depth).toBeCloseTo(1.15)
  })
  for(const diffuser of ['house','mario'] as const)it(`seats unchanged ${diffuser} feet without intersecting the backer or neighboring cap`,async()=>{
    const m=await hardwareRuntime()
    const file=diffuser==='house'?'house_33mm.stl':'mario_25_08mm.stl'
    const bytes=readFileSync(new URL(`../../diffuser_references/${file}`,import.meta.url))
    const geometry=orientCap(new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)))
    geometry.rotateX(Math.PI);geometry.translate(0,0,capSeatSpec.insertion)
    const a=geometry.getAttribute('position')
    const capMesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(a.array),triVerts:Uint32Array.from({length:a.count},(_,i)=>i)})
    capMesh.merge();const cap=new m.Manifold(capMesh)
    const tris=await carrierMesh([{x:0,y:0,id:1,row:0,section:0}],{...defaults,diffuser})
    const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(tris.flat(2)),triVerts:Uint32Array.from({length:tris.length*3},(_,i)=>i)})
    mesh.merge();const backer=new m.Manifold(mesh),collision=backer.intersect(cap)
    try{
      expect(cap.status()).toBe('NoError');expect(backer.status()).toBe('NoError')
      expect(capFootContours(diffuser)).toHaveLength(4)
      expect(collision.volume()).toBeLessThan(.001)
      const neighbor=cap.translate([presets[diffuser].size,0,0]),overlap=cap.intersect(neighbor)
      try{expect(overlap.volume()).toBeLessThan(.001)}finally{overlap.delete();neighbor.delete()}
      const roof=tris.flat().filter(v=>Math.abs(v[2]-capSeatSpec.depth)<1e-5)
      expect(roof.length).toBeGreaterThan(0)
    }finally{collision.delete();backer.delete();cap.delete();geometry.dispose()}
  })
})
