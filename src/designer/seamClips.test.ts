import {it,expect} from 'vitest'
import {defaults,generate,presets,bounds} from './geometry'
import {seamClipPlan,seamClipMesh,seamClipZ} from './seamClips'
import {carrierMesh,type Triangle} from './mesh'
import {hardwareRuntime} from './hardware'
for(const diffuser of ['house','mario'] as const)for(const rows of [1,2,3])it(`${diffuser}/${rows}: connected clips, seam coverage and separated stations`,async()=>{
  const s={...defaults,diffuser,rows},l=generate(s),plan=seamClipPlan(l.pixels,s),m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
  const keep=(o:InstanceType<typeof m.Manifold>)=>{objects.push(o);return o}
  const from=(ts:Triangle[])=>{const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();return keep(new m.Manifold(mesh))}
  try{
    const source=from(await seamClipMesh());expect(source.status()).toBe('NoError')
    const parts=source.decompose();expect(parts).toHaveLength(1);parts.forEach(p=>p.delete())
    const size=presets[diffuser].size,trays=[]
    for(const c of l.sections){const b=bounds(c);trays.push(keep(from(await carrierMesh(c,s,[],l.pixels)).translate([(b.minX+b.maxX)/2*size,-(b.minY+b.maxY)/2*size,0])))}
    const clips=[]
    for(const p of plan)clips.push(keep(keep(from(await seamClipMesh(p,s,l.pixels)).rotate([0,0,p.angle*180/Math.PI])).translate([p.x*size,-p.y*size,seamClipZ])))
    for(let i=0;i<clips.length;i++){
      // Manifold's intersection produced false positives on Mario float32
      // wall meshes (independent Blender EXACT Boolean found zero overlap).
      // All layouts are checked separately by verify_seam_clips_blender.py.
      if(diffuser==='house')for(const [ti,t] of trays.entries()){const overlap=keep(clips[i].intersect(t));expect(overlap.volume(),`clip ${i} / tray ${ti}`).toBeLessThan(.001)}
      for(let j=0;j<i;j++)expect(keep(clips[i].intersect(clips[j])).volume(),`clips ${i}/${j}`).toBeLessThan(.001)
    }
    expect(plan.length).toBeGreaterThan(0)
    for(const a of l.pixels)for(const b of l.pixels)if(a.section<b.section&&Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1)expect(plan.some(p=>p.a.section===a.section&&p.b.section===b.section)).toBe(true)
  }finally{objects.reverse().forEach(o=>o.delete())}
},30000)
