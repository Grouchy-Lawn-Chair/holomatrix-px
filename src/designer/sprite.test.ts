import {describe,it,expect} from 'vitest'
import {defaults,generate,parseProject,presets,type Settings} from './geometry'
import {pumpkinSprite,resizeSprite,spriteFromRgba,validateSprite,cellKey} from './sprite'
import {xmodel,spriteBmp,buildPropFiles} from './propExports'
import {diffuserJoinPlan,framePlan,defaultFrame} from './propPlan'
import {joinedDiffuserConflicts,joinedDiffuserFits} from './joinedDiffuser'
import {wallTiePlan} from './wallTies'
import {carrierMesh} from './mesh'
import {hardwareRuntime} from './hardware'
const prop=(patch:Partial<Settings>={}):Settings=>({...defaults,shape:'sprite',sprite:pumpkinSprite(),capFit:'extended',lighting:'bullet',...patch})
describe('sprite prop blueprint',()=>{
  for(const face of ['plain','happy','scary','goofy'] as const)it(`${face}: valid artwork and conservative connected print sections`,()=>{
    const s=prop({sprite:pumpkinSprite(16,16,face)}),l=generate(s)
    validateSprite(s.sprite)
    expect(l.pixels.length).toBe(s.sprite!.cells.length);expect(l.printable).toBe(true);expect(l.connected).toBe(true)
    expect(l.widthMm).toBe(s.sprite!.width*presets[s.diffuser].size)
    expect(l.wireStrings.flat().length).toBe(l.pixels.length)
    expect(new Set(l.wireStrings.flat().map(p=>p.id)).size).toBe(l.pixels.length)
    for(const path of l.wirePaths){
      const a=path[0],b=path.at(-1)!
      expect(l.nodes.some(p=>p.x===a.x&&p.y===a.y)).toBe(true)
      expect(l.nodes.some(p=>p.x===b.x&&p.y===b.y)).toBe(true)
      const link=l.wireConnections[l.wirePaths.indexOf(path)]
      expect(link.to).toBe(link.from+1)
    }
    expect(l.wirePaths.length).toBe(l.pixels.length-l.wireStrings.length)
    const joins=diffuserJoinPlan(l.pixels,s)
    expect(joinedDiffuserConflicts(joins)).toBe('');expect(joins.every(p=>joinedDiffuserFits(p,s))).toBe(true)
    const ties=wallTiePlan(l.pixels,s)
    expect(l.sections.every(c=>ties.some(t=>t.pixel.section===c[0].section))).toBe(true)
  })
  it('changes colors without removing face nodes unless physical cutouts are selected',()=>{
    const plain=pumpkinSprite(16,16,'plain'),face=pumpkinSprite(),cut=pumpkinSprite(16,16,'happy',true)
    expect(face.cells.map(cellKey)).toEqual(plain.cells.map(cellKey));expect(face.cells).not.toEqual(plain.cells);expect(cut.cells.length).toBeLessThan(face.cells.length)
  })
  it('supports islands independently but joins data with an explicit frame bridge',()=>{
    const s=prop({sprite:{width:5,height:3,source:'test',cells:[{x:0,y:0,color:'#ff0000'},{x:1,y:0,color:'#00ff00'},{x:4,y:2,color:'#0000ff'}]}}),l=generate(s)
    expect(l.connected).toBe(false);expect(l.sections.length).toBe(2);expect(l.wireStrings.length).toBe(1);expect(l.wirePaths.length).toBe(2);expect(l.printable).toBe(true)
    expect(l.wireJumpers.filter(j=>j.exposed)).toHaveLength(1)
    expect(xmodel(s)).toContain('CustomStrings="1"');expect(xmodel(s)).not.toContain('NodeStart2')
  })
  it('round-trips artwork, frame and imported colors, and rejects malformed cells',()=>{
    const s=prop({frame:{...defaultFrame,enabled:true}});expect(parseProject(JSON.stringify(s))).toEqual(s)
    expect(()=>parseProject(JSON.stringify(prop({sprite:{...pumpkinSprite(),cells:[{x:-1,y:0,color:'#fff'}]}})))).toThrow()
    expect(()=>parseProject(JSON.stringify({...s,frame:{...s.frame,rails:1.5}}))).toThrow()
    expect(()=>parseProject(JSON.stringify({...s,lighting:'strip'}))).toThrow()
  })
  it('preserves RGB colors and alpha; black is a physical node',()=>{
    const s=spriteFromRgba(3,1,[0,0,0,255,255,0,0,255,255,255,255,0],'import')
    expect(s.cells).toEqual([{x:0,y:0,color:'#000000'},{x:1,y:0,color:'#ff0000'}])
    expect(spriteFromRgba(1,1,[255,255,255,255],'import','#ffffff').cells).toEqual([])
    expect(resizeSprite(s,6,2).cells).toHaveLength(8)
  })
  it('exports exact top-to-bottom numbering and native-size BMP colors',()=>{
    const sprite={width:2,height:2,source:'asymmetric',cells:[{x:0,y:0,color:'#ff0000'},{x:1,y:0,color:'#00ff00'},{x:1,y:1,color:'#0000ff'}]},s=prop({sprite,name:'A & "B"'}),l=generate(s),model=xmodel(s)
    expect(model).toContain('A &amp; &quot;B&quot;')
    const grid=model.match(/CustomModel="([^"]+)"/)![1].split(';').map(r=>r.split(','))
    for(const p of l.pixels)expect(Number(grid[p.y][p.x])).toBe(p.id)
    const bmp=spriteBmp(sprite),v=new DataView(bmp.buffer)
    expect(v.getInt32(18,true)).toBe(2);expect(v.getInt32(22,true)).toBe(2);expect(v.getUint16(28,true)).toBe(24)
    expect([...bmp.slice(54+8,54+11)]).toEqual([0,0,255]);expect([...bmp.slice(57,60)]).toEqual([255,0,0])
    const files=buildPropFiles(s);expect(new Set(files.map(f=>f.name)).size).toBe(files.length)
    const csv=new TextDecoder().decode(files.find(f=>f.name==='WIRING_ROUTE.csv')!.bytes)
    expect(csv.split('\n')).toHaveLength(l.wirePaths.length+1)
  })
  it('plans frame rail centerline lengths without claiming fittings or supports',()=>{
    const s=prop({frame:{...defaultFrame,enabled:true}}),l=generate(s),rails=framePlan(s,l.pixels)
    expect(rails).toHaveLength(2);expect(rails.every(r=>r.lengthMm>0)).toBe(true)
  })
  it('rejects empty geometry for exports but permits a blank editable canvas',()=>{
    const s=prop({sprite:{width:16,height:16,cells:[],source:'blank'}})
    expect(generate(s).printable).toBe(false);expect(()=>buildPropFiles(s)).toThrow();expect(parseProject(JSON.stringify(s))).toEqual(s)
  })
  it('creates closed single-solid carrier meshes for every pumpkin section',async()=>{
    const s=prop({sprite:pumpkinSprite(12,12)}),l=generate(s),m=await hardwareRuntime()
    for(const c of l.sections){
      const ts=await carrierMesh(c,s,[],l.pixels),mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)})
      mesh.merge();const solid=new m.Manifold(mesh)
      try{expect(solid.status()).toBe('NoError');const pieces=solid.decompose();expect(pieces.filter(p=>p.volume()>.001)).toHaveLength(1);pieces.forEach(p=>p.delete())}finally{solid.delete()}
    }
  },30000)
})
