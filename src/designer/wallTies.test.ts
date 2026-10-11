import {describe,it,expect,vi,afterEach} from 'vitest'
import {readFileSync} from 'node:fs'
import {defaults,generate,presets,bounds} from './geometry'
import {wallTiePlan,wallTieSpec} from './wallTies'
import {carrierMesh,type Triangle} from './mesh'
import {hardwareRuntime} from './hardware'
import {buildDirectTieFiles} from './directTieExports'
afterEach(()=>vi.unstubAllGlobals())
describe('PVC backbone with integral reinforced wall tie slots',()=>{
  for(const shape of ['arch','line'] as const)for(const rows of [1,2,3])it(`${shape}/${rows}: every section has exposed paired wall slots; closed connected geometry`,async()=>{
    const s={...defaults,shape,rows},l=generate(s),ties=wallTiePlan(l.pixels,s),occupied=new Set(l.pixels.map(p=>`${p.x},${p.y}`)),m=await hardwareRuntime()
    const from=(ts:Triangle[])=>{const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();return new m.Manifold(mesh)}
    for(const cells of l.sections){
      const points=ties.filter(t=>t.pixel.section===cells[0].section)
      expect(points.length).toBeGreaterThanOrEqual(2)
      const ts=await carrierMesh(cells,s,[],l.pixels),solid=from(ts),b=bounds(cells),size=presets[s.diffuser].size
      try{
        expect(solid.status()).toBe('NoError')
        const parts=solid.decompose();expect(parts.filter(p=>p.volume()>.001)).toHaveLength(1);parts.forEach(p=>p.delete())
        expect(Math.min(...ts.flat().map(v=>v[2]))).toBe(0)
        expect(Math.max(...ts.flat().map(v=>v[2]))).toBeCloseTo(25.396,3)
        for(const t of points){
          expect(occupied.has(`${t.pixel.x+t.dx},${t.pixel.y+t.dy}`)).toBe(false)
          const x=(t.pixel.x-(b.minX+b.maxX)/2)*size+t.dx*(size/2-1),y=-(t.pixel.y-(b.minY+b.maxY)/2)*size-t.dy*(size/2-1)
          const cube=m.Manifold.cube(t.dx?[6,wallTieSpec.width-.1,wallTieSpec.height-.1]:[wallTieSpec.width-.1,6,wallTieSpec.height-.1])
          const probe=cube.translate([x-(t.dx?3:(wallTieSpec.width-.1)/2),y-(t.dx?(wallTieSpec.width-.1)/2:3),wallTieSpec.z+.05]),overlap=solid.intersect(probe)
          expect(overlap.volume(),'slot must go through the entire reinforced wall').toBeLessThan(.001)
          overlap.delete();probe.delete();cube.delete()
        }
      }finally{solid.delete()}
    }
  },30000)
  it('exports the direct-tie sample with no mounting heads or fasteners',async()=>{
    const b=readFileSync(new URL('../../diffuser_references/house_33mm.stl',import.meta.url))
    const fetchMock=vi.fn().mockImplementation(()=>Promise.resolve(new Response(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))))
    vi.stubGlobal('fetch',fetchMock)
    const files=await buildDirectTieFiles({...defaults,capFit:'extended'},true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(files.filter(f=>f.name.startsWith('section_'))).toHaveLength(2)
    expect(files.filter(f=>f.name.startsWith('joined_diffuser_'))).toHaveLength(1)
    expect(files.some(f=>/mount|pvc_house_clip|spacer|bolt/.test(f.name))).toBe(false)
    expect(files.some(f=>f.name.startsWith('seam_wall_bridge_'))).toBe(true)
    expect(files.some(f=>f.name==='WALL_TIES.txt')).toBe(true)
  })
  it('ramps the inward pad at 45 degrees, with no flat unsupported underside',async()=>{
    const cells=[{x:0,y:0,id:1,row:0,section:0}],s={...defaults},ts=await carrierMesh(cells,s,[],cells)
    const m=await hardwareRuntime(),mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge()
    const solid=new m.Manifold(mesh),t=wallTiePlan(cells,s)[0],size=presets[s.diffuser].size
    const probe=(inward:number,z:number)=>{
      const x=t.dx*(size/2-2-inward),y=-t.dy*(size/2-2-inward),c=m.Manifold.cube([.1,.1,.1]),p=c.translate([x-.05,y-.05,z]),o=solid.intersect(p),v=o.volume()
      o.delete();p.delete();c.delete();return v
    }
    try{
      expect(probe(1,wallTieSpec.padZ+.3)).toBeLessThan(.00001)
      expect(probe(.2,wallTieSpec.padZ+.5)).toBeCloseTo(.001,5)
      expect(probe(1,wallTieSpec.padZ+1.3)).toBeCloseTo(.001,5)
    }finally{solid.delete()}
  })
})
