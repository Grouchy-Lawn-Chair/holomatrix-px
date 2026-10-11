/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { Vector3 } from 'three'
import { orientCap, sectionOffsets, triangleGeometry } from './previewGeometry'
import { defaults, generate, presets } from './geometry'
import { carrierMesh } from './mesh'

describe('3D preview uses manufacturing geometry',()=>{
  it('separates sections only for display without changing manufacturing positions',()=>{
    const layout=generate({...defaults,rows:2}),original=JSON.stringify(layout.sections)
    const assembled=sectionOffsets(layout.sections,33,false),spread=sectionOffsets(layout.sections,33,true)
    expect([...assembled.values()].every(p=>p.x===0&&p.y===0)).toBe(true)
    expect(new Set([...spread.values()].map(p=>`${p.x},${p.y}`)).size).toBeGreaterThan(1)
    expect(JSON.stringify(layout.sections)).toBe(original)
    const single=sectionOffsets([layout.sections[0]],33,true)
    expect(single.get(0)).toEqual({x:0,y:-0})
  })
  for(const diffuser of ['house','mario'] as const)it(`preserves the original ${diffuser} cap dimensions and faces its opening toward the backer`,()=>{
    const path=diffuser==='house'?'house_33mm.stl':'mario_25_08mm.stl'
    const source=readFileSync(new URL(`../../diffuser_references/${path}`,import.meta.url))
    const mesh=new STLLoader().parse(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength))
    const count=mesh.getAttribute('position').count
    orientCap(mesh)
    const b=mesh.boundingBox!,size=b.getSize(new Vector3())
    expect(size.x).toBeCloseTo(presets[diffuser].size,2)
    expect(size.y).toBeCloseTo(presets[diffuser].size,2)
    expect(size.z).toBeCloseTo(presets[diffuser].depth,2)
    expect(b.min.z).toBeCloseTo(0,5)
    expect(b.getCenter(new Vector3()).x).toBeCloseTo(0,5)
    expect(b.getCenter(new Vector3()).y).toBeCloseTo(0,5)
    expect(mesh.getAttribute('position').count).toBe(count)
    // The closed face should cover more XY area than the open rim.
    const p=mesh.getAttribute('position');let low=0,high=0
    for(let i=0;i<p.count;i+=3){
      const area=Math.abs((p.getX(i+1)-p.getX(i))*(p.getY(i+2)-p.getY(i))-(p.getY(i+1)-p.getY(i))*(p.getX(i+2)-p.getX(i)))/2
      if([0,1,2].every(j=>Math.abs(p.getZ(i+j))<.02))low+=area
      if([0,1,2].every(j=>Math.abs(p.getZ(i+j)-size.z)<.02))high+=area
    }
    expect(high).toBeGreaterThan(low)
    mesh.dispose()
  })
  it('renders precisely the same backer triangles as STL export',async()=>{
    const settings={...defaults,rows:2},section=generate(settings).sections[0]
    const triangles=await carrierMesh(section,settings),mesh=triangleGeometry(triangles)
    const positions=mesh.getAttribute('position')
    expect(positions.count).toBe(triangles.length*3)
    triangles.flat().forEach((v,i)=>v.forEach((value,axis)=>expect(positions.getComponent(i,axis)).toBeCloseTo(value,3)))
    mesh.dispose()
  })
})
