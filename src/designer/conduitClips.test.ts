import {expect,it} from 'vitest'
import {defaults,generate,parseProject,presets,type Settings,type Pixel} from './geometry'
import {defaultFrame} from './propPlan'
import {conduitClipDefaults,conduitClipPlan,mountingConflict,overlapsZone} from './conduitClips'
import {seamClipPlan,seamClipSpec} from './seamClips'
import {wallTiePlan,wallTieSpec} from './wallTies'
import {buildPropFiles} from './propExports'
import {carrierMesh} from './mesh'
import {hardwareRuntime} from './hardware'
import {readFileSync,existsSync} from 'node:fs'
const settings:Settings={...defaults,shape:'sprite',frame:{...defaultFrame,enabled:true,rails:1},conduitClips:{...conduitClipDefaults,mode:'existing'},sprite:{width:10,height:12,source:'test rectangle',cells:Array.from({length:120},(_,i)=>({x:i%10,y:Math.floor(i/10),color:'#ffffff'}))}}
const cells:Pixel[]=Array.from({length:120},(_,i)=>({x:i%10,y:Math.floor(i/10),id:i+1,row:0,section:i%10<5?0:1}))
it.skipIf(!existsSync('public/prop-library/jack-o-lantern/halloween-prop-103.json'))('finds mounts on the reported 269-light prop with Mario caps and puzzle joins',()=>{
 const sprite=JSON.parse(readFileSync('public/prop-library/jack-o-lantern/halloween-prop-103.json','utf8').replace(/^\uFEFF/,''))
 const s:Settings={...settings,sprite,diffuser:'mario',frame:{...defaultFrame,enabled:true,rails:2},sectionJoints:{enabled:true,sideGap:.1,tipGap:.25,cornerChamfer:2,bottomRelief:1.3,upperRelief:.15}}
 const l=generate(s),zones=conduitClipPlan(l.pixels,s)
 expect(l.pixels).toHaveLength(269)
 expect(zones.length).toBeGreaterThan(0)
 expect(new Set(zones.map(z=>z.rail)).size).toBe(2)
 expect(l.printable).toBe(true)
})
it('recognizes continuous walls across changes of section ownership',()=>{
 const tiled=cells.map(p=>({...p,section:p.section+Math.floor(p.y/2)*2}))
 const zones=conduitClipPlan(tiled,settings)
 expect(zones.length).toBeGreaterThan(0)
 expect(zones.some(z=>z.sections.length>2)).toBe(true)
})
it('reserves spaced non-overlapping straight seam zones only when enabled',()=>{
 const zones=conduitClipPlan(cells,settings)
 expect(zones.length).toBeGreaterThan(0)
 for(const z of zones){expect(z.x).toBe(4.5);expect(z.sections).toEqual([0,1]);expect(z.y-z.height/66).toBeGreaterThanOrEqual(-.5);expect(z.y+z.height/66).toBeLessThanOrEqual(11.5)}
 for(let i=0;i<zones.length;i++)for(let j=0;j<i;j++)expect(overlapsZone({...zones[i],x:zones[i].x*33,y:zones[i].y*33},{...zones[j],x:zones[j].x*33,y:zones[j].y*33})).toBe(false)
 expect(conduitClipPlan(cells,{...settings,conduitClips:undefined})).toEqual([])
 expect(conduitClipPlan(cells,{...settings,frame:{...settings.frame!,enabled:false}})).toEqual([])
 expect(conduitClipPlan(cells,{...settings,shape:'arch'})).toEqual([])
})
it('keeps seam bridges and whole reinforcement pads outside mounting zones',()=>{
 const zones=conduitClipPlan(cells,settings),size=presets[settings.diffuser].size
 expect(zones.length).toBeGreaterThan(0)
 expect(seamClipPlan(cells,settings).every(p=>!mountingConflict(p.x,p.y,p.angle?seamClipSpec.width:seamClipSpec.length,p.angle?seamClipSpec.length:seamClipSpec.width,zones,size))).toBe(true)
 for(const t of wallTiePlan(cells,settings))expect(mountingConflict(t.pixel.x+t.dx*(.5-3.5/2/size),t.pixel.y+t.dy*(.5-3.5/2/size),t.dx?3.5:wallTieSpec.padWidth,t.dy?3.5:wallTieSpec.padWidth,zones,size)).toBe(false)
})
it('does not invent mounts on short seams, empty gaps or crossed-rail fitting areas',()=>{
 const short=cells.filter(p=>p.y===0);expect(conduitClipPlan(short,settings)).toEqual([])
 const gap=cells.filter(p=>p.x!==5);expect(conduitClipPlan(gap,settings)).toEqual([])
 const cross={...settings,frame:{...settings.frame!,axis:'cross' as const}},zones=conduitClipPlan(cells,cross)
 for(const z of zones)expect(Math.abs(z.y-5.5)*33).toBeGreaterThanOrEqual((z.height+cross.frame.diameter)/2)
})
it('persists hardware options and exports an honest reservation plan',()=>{
 expect(parseProject(JSON.stringify(settings))).toEqual(settings)
 expect(()=>parseProject(JSON.stringify({...settings,conduitClips:{...settings.conduitClips,length:-1}}))).toThrow()
 const files=buildPropFiles(settings),plan=files.find(f=>f.name==='CONDUIT_CLIP_PLAN.csv')!,notes=new TextDecoder().decode(files.find(f=>f.name==='CONDUIT_CLIPS.txt')!.bytes)
 expect(plan).toBeDefined();expect(notes).toContain('Full print export includes the actual base/head STLs');expect(notes).toContain('Original source meshes are preserved')
 expect(buildPropFiles({...settings,conduitClips:undefined}).some(f=>f.name==='CONDUIT_CLIP_PLAN.csv')).toBe(false)
 expect(generate(settings).pixels.map(p=>[p.x,p.y])).toEqual(generate({...settings,conduitClips:undefined}).pixels.map(p=>[p.x,p.y]))
})
it('keeps regenerated reserved-zone trays closed single solids',async()=>{
 const l=generate(settings),runtime=await hardwareRuntime()
 expect(conduitClipPlan(l.pixels,settings).length).toBeGreaterThan(0)
 for(const section of l.sections){
  const ts=await carrierMesh(section,settings,[],l.pixels),mesh=new runtime.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();const solid=new runtime.Manifold(mesh)
  try{expect(solid.status()).toBe('NoError');const parts=solid.decompose();expect(parts).toHaveLength(1);parts.forEach(p=>p.delete())}finally{solid.delete()}
 }
},30000)
