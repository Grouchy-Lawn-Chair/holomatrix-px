import {it,expect} from 'vitest'
import {readFileSync,readdirSync,existsSync} from 'node:fs'
import {pumpkinSprite} from './sprite'
import {defaults,generate,parseProject,type Settings,bounds,presets} from './geometry'
import {jointSettings} from './sectionLayout'
import {framePlan,defaultFrame} from './propPlan'
import {carrierMesh,type Triangle} from './mesh'
import {hardwareRuntime} from './hardware'
import {seamClipPlan,seamClipMesh,seamClipZ} from './seamClips'
const root='public/prop-library/jack-o-lantern/'
const sprite=(name:string)=>existsSync(root+name)?JSON.parse(readFileSync(root+name,'utf8').replace(/^\uFEFF/,'')):pumpkinSprite(19,19,'happy',false)
const prop=(patch:Partial<Settings>={}):Settings=>({...defaults,shape:'sprite',sprite:sprite('jack-o-lantern-535.json'),capFit:'extended',...patch})
it.skipIf(!existsSync(root+'jack-o-lantern-535.json'))('retains every original bitmap coordinate/color through puzzle partitioning',()=>{
 const names=readdirSync(root).filter(n=>n.endsWith('.json')&&n!=='manifest.json');expect(names).toHaveLength(23)
 for(const name of names){const s=prop({sprite:sprite(name)}),l=generate(s)
  expect(l.pixels.length,name).toBe(s.sprite!.cells.length);expect(l.printable,name).toBe(true)
  expect(new Set(l.sections.flat().map(p=>`${p.x},${p.y}`)).size,name).toBe(l.pixels.length)
  expect(l.wiringComplete,name).toBe(true);expect(l.wireStrings.flat().length,name).toBe(l.pixels.length)
 }
},30000)
it('keeps two-cell poles intact and gives their end joins broad steps',()=>{
 const s=prop({sprite:{width:2,height:20,source:'pole',cells:Array.from({length:40},(_,i)=>({x:i%2,y:Math.floor(i/2),color:'#ffffff'}))}}),l=generate(s)
 expect(l.sections.every(c=>new Set(c.map(p=>p.x)).size===2)).toBe(true)
 expect(l.pixels.some(p=>p.jointMale)).toBe(true);expect(l.printable).toBe(true)
})
it('supports crossmember axes and persists independent clearance controls',()=>{
 const s=prop({frame:{...defaultFrame,axis:'cross',rails:1,enabled:true},sectionJoints:jointSettings(prop())}),l=generate(s),rails=framePlan(s,l.pixels)
 expect(rails.map(r=>r.axis)).toEqual(['vertical','horizontal']);expect(rails[1].rearCenter-rails[0].rearCenter).toBe(defaultFrame.diameter)
 expect(rails.every(r=>r.a.x%1===.5||r.a.y%1===.5)).toBe(true)
 expect(parseProject(JSON.stringify(s))).toEqual(s)
 expect(()=>parseProject(JSON.stringify({...s,sectionJoints:{...s.sectionJoints,sideGap:-1}}))).toThrow()
})
it('creates single-solid puzzle trays and non-intersecting seam bridges',async()=>{
 const s=prop({frame:{...defaultFrame,enabled:true,rails:1,axis:'cross'}}),l=generate(s),runtime=await hardwareRuntime(),owned:InstanceType<typeof runtime.Manifold>[]=[]
 const keep=(o:InstanceType<typeof runtime.Manifold>)=>{owned.push(o);return o}
 const from=(ts:Triangle[])=>{const mesh=new runtime.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();const solid=keep(new runtime.Manifold(mesh));expect(solid.status()).toBe('NoError');return solid}
 try{
  const trays=[]
  for(const c of l.sections){const t=from(await carrierMesh(c,s,[],l.pixels)),parts=t.decompose();expect(parts).toHaveLength(1);parts.forEach(p=>p.delete());const b=bounds(c),size=presets[s.diffuser].size;trays.push(keep(t.translate([(b.minX+b.maxX)/2*size,-(b.minY+b.maxY)/2*size,0])))}
  for(let i=0;i<trays.length;i++)for(let j=0;j<i;j++)expect(keep(trays[i].intersect(trays[j])).volume()).toBeLessThan(.002)
  const size=presets[s.diffuser].size
  for(const p of seamClipPlan(l.pixels,s)){const clip=keep(keep(from(await seamClipMesh()).rotate([0,0,p.angle*180/Math.PI])).translate([p.x*size,-p.y*size,seamClipZ]));for(const tray of trays)expect(keep(clip.intersect(tray)).volume()).toBeLessThan(.002)}
 }finally{owned.reverse().forEach(o=>o.delete())}
},30000)
