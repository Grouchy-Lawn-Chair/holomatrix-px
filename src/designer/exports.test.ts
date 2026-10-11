/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildHardwareFiles, buildStlFiles, buildStripFitFiles,buildBackingPlateFitFiles } from './exports'
import { defaults, generate } from './geometry'
import { binaryStl, carrierMesh, zipFiles } from './mesh'
import {buildWallMountFitFiles} from './wallMountExports'
import {backingPlatePlan} from './backingPlate'

afterEach(() => vi.unstubAllGlobals())
describe('complete STL package', () => {
  it('uses integral wall tie slots on a straight run without heads or clip fetches',async()=>{
    const source=readFileSync(new URL('../../diffuser_references/house_33mm.stl',import.meta.url)),fetchMock=vi.fn().mockImplementation(()=>Promise.resolve(new Response(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength))))
    vi.stubGlobal('fetch',fetchMock)
    const files=await buildStlFiles({...defaults,shape:'line',width:24,rows:2})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(files.some(f=>f.name==='WALL_TIES.txt')).toBe(true)
    expect(files.some(f=>f.name.includes('pvc_house_clip'))).toBe(false)
    expect(files.filter(f=>f.name.startsWith('wall_mount_'))).toHaveLength(0)
    for(const f of files.filter(f=>f.name.startsWith('section_'))){
      const v=new DataView(f.bytes.buffer),z=[]
      for(let i=0;i<v.getUint32(80,true);i++)for(let j=0;j<3;j++)z.push(v.getFloat32(84+i*50+12+j*12+8,true))
      expect(Math.min(...z)).toBe(0)
    }
  })
  it('exports a complete two-tray wall-mount sample with one merged cap and unchanged swivel clip',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockImplementation((url:string)=>{
      const name=url.includes('pvc_house_clip')?'pvc_house_clip.stl':'house_33mm.stl',b=readFileSync(new URL(`../../diffuser_references/${name}`,import.meta.url))
      return Promise.resolve(new Response(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)))
    }))
    const files=await buildWallMountFitFiles({...defaults,capFit:'extended'})
    expect(files.filter(f=>f.name.startsWith('section_'))).toHaveLength(2)
    expect(files.filter(f=>f.name.startsWith('wall_mount_joint_'))).toHaveLength(1)
    expect(files.filter(f=>f.name.startsWith('joined_diffuser_'))).toHaveLength(1)
    expect(files.find(f=>f.name==='pvc_house_clip_ORIGINAL_UNCHANGED.stl')!.bytes).toEqual(new Uint8Array(readFileSync(new URL('../../diffuser_references/pvc_house_clip.stl',import.meta.url))))
  })
  it('exports matching derived long-teeth caps closed-face down',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockImplementation((url:string)=>{
      const name=url.includes('pvc_house_clip')?'pvc_house_clip.stl':'house_33mm.stl',b=readFileSync(new URL(`../../diffuser_references/${name}`,import.meta.url))
      return Promise.resolve(new Response(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)))
    }))
    const files=await buildStlFiles({...defaults,shape:'line',width:8,capFit:'extended'})
    const cap=files.find(f=>f.name.includes('LONG_TEETH')&&f.name.endsWith('.stl'))!.bytes,view=new DataView(cap.buffer,cap.byteOffset,cap.byteLength),z=[]
    for(let i=0;i<view.getUint32(80,true);i++)for(let j=0;j<3;j++)z.push(view.getFloat32(84+i*50+12+j*12+8,true))
    expect(Math.min(...z)).toBe(0);expect(Math.max(...z)).toBeGreaterThan(24)
    expect(files.some(f=>f.name==='LONG_TEETH.txt')).toBe(true)
  })
  it('exports a small rear-bridge sample without fetching caps or scaling fit dimensions',async()=>{
    const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock)
    const files=await buildBackingPlateFitFiles(defaults)
    expect(files.filter(f=>f.name.endsWith('.stl'))).toHaveLength(3)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(files.some(f=>f.name==='rear_backing_plate_FLAT.stl')).toBe(true)
  })
  it('exports a two-cell strip coupon with the currently measured fit allowance',async()=>{
    const original=readFileSync(new URL('../../diffuser_references/house_33mm.stl',import.meta.url))
    vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(new Response(original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength)))))
    const files=await buildStripFitFiles({...defaults,lighting:'strip',stripType:'ip67',stripWidth:12.4,stripClearance:.5})
    expect(files.filter(f=>f.name.startsWith('section_'))).toHaveLength(1)
    expect(new TextDecoder().decode(files.find(f=>f.name==='START_HERE.txt')!.bytes)).toContain('2 lights / 1 carrier sections')
    expect(new TextDecoder().decode(files.find(f=>f.name==='STRIP_README.txt')!.bytes)).toContain('channel width 12.9 mm')
    expect(files.some(f=>f.name==='FIT_SAMPLE.txt')).toBe(true)
  })
  for(const stripType of ['ip30','ip65','ip67'] as const)it(`exports derived ${stripType} caps with strip-specific routing notes`,async()=>{
    const original=readFileSync(new URL('../../diffuser_references/house_33mm.stl',import.meta.url))
    vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(new Response(original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength)))))
    const files=await buildStlFiles({...defaults,shape:'line',width:8,lighting:'strip',stripType})
    const cap=files.find(f=>f.name===`diffuser_cap_STRIP_${stripType}_DERIVED.stl`)!
    expect(cap).toBeDefined();expect(cap.bytes).not.toEqual(new Uint8Array(original))
    const notes=new TextDecoder().decode(files.find(f=>f.name==='STRIP_README.txt')!.bytes)
    expect(notes).toContain('NO bullet-pixel holes');expect(notes).toContain('not this printed enclosure')
    expect(notes).toContain('33 mm touching diffuser centers')
  })
  it('includes both joint coupons and the exact original PVC clip bytes in the fit-test package',async()=>{
    const original=readFileSync(new URL('../../diffuser_references/pvc_house_clip.stl',import.meta.url))
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength))))
    const files=await buildHardwareFiles()
    expect(files.filter(f=>f.name.endsWith('.stl'))).toHaveLength(6)
    expect(files.find(f=>f.name==='pvc_house_clip_ORIGINAL_UNCHANGED.stl')!.bytes).toEqual(new Uint8Array(original))
    expect(new TextDecoder().decode(files.find(f=>f.name==='FIT_TEST_README.txt')!.bytes)).toContain('0.05 mm each side')
  })
  for (const diffuser of ['house', 'mario'] as const) it(`includes the closed bullet ${diffuser} cap and quantity`, async () => {
    const settings = { ...defaults, diffuser }
    const source = new Uint8Array(readFileSync(new URL(`../../diffuser_references/${diffuser==='house'?'house_33mm':'mario_25_08mm'}.stl`,import.meta.url)))
    const fetchMock = vi.fn().mockImplementation(()=>Promise.resolve(new Response(source.slice().buffer)))
    vi.stubGlobal('fetch', fetchMock)
    const files = await buildStlFiles(settings)
    expect(fetchMock.mock.calls[0][0]).toContain(diffuser === 'house' ? 'house_33mm.stl' : 'mario_25_08mm.stl')
    const caps = files.filter(f => f.name.startsWith('diffuser_cap_'))
    expect(caps).toHaveLength(1)
    expect(caps[0].name).toBe(`diffuser_cap_${diffuser}_BULLET_CLOSED_DERIVED.stl`)
    expect(caps[0].bytes).not.toEqual(source)
    expect(files.filter(f => f.name.startsWith('section_'))).toHaveLength(generate(settings).sections.length)
    expect(files.filter(f=>f.name.startsWith('backing_plate_'))).toHaveLength(0)
    expect(files.some(f=>f.name==='WALL_TIES.txt')).toBe(true)
    expect(files.some(f=>f.name.startsWith('wall_mount_'))).toBe(false)
    expect(files.some(f=>f.name==='pvc_house_clip_ORIGINAL_UNCHANGED.stl')).toBe(false)
    expect(new TextDecoder().decode(files.find(f=>f.name==='WALL_TIES.txt')!.bytes)).toContain('Tie EVERY section')
    const readme = new TextDecoder().decode(files.find(f => f.name === 'START_HERE.txt')!.bytes)
    expect(readme).toContain(`together cover ${generate(settings).pixels.length} lights`)
    expect(files.filter(f=>f.name.startsWith('joined_diffuser_'))).toHaveLength(backingPlatePlan(generate(settings).pixels).length)
    const archive = zipFiles(files)
    expect(new DataView(archive.buffer).getUint16(archive.length - 14, true)).toBe(files.length)
  })
  it('stops rather than downloading an incomplete package when cap loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
    await expect(buildStlFiles(defaults)).rejects.toThrow('Could not load the diffuser cap')
  })
  it('rejects an empty cap STL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(84).buffer)))
    await expect(buildStlFiles(defaults)).rejects.toThrow('STL is invalid')
  })
})
