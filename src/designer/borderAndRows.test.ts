import {expect,it} from 'vitest'
import {defaults,generate,parseProject,type Settings} from './geometry'
import {exteriorDarkCells,pumpkinSprite,type Sprite} from './sprite'
import {buildPropFiles,xmodel} from './propExports'
import {carrierMesh} from './mesh'
import {hardwareRuntime} from './hardware'
const sprite:Sprite={width:5,height:5,source:'black outline and enclosed dark face',cells:Array.from({length:25},(_,i)=>({x:i%5,y:Math.floor(i/5),color:i%5===0||i%5===4||i<5||i>=20||i===12?'#101010':'#ff8800'}))}
const settings:Settings={...defaults,shape:'sprite',sprite,solidDarkBorder:true}
it('makes outer dark pixels optional, keeps interior animation nodes and silhouette',()=>{
 expect(exteriorDarkCells(sprite).size).toBe(16)
 const l=generate(settings),full=generate({...settings,solidDarkBorder:false})
 expect(l.pixels).toHaveLength(25);expect(l.nodes).toHaveLength(9);expect(full.nodes).toHaveLength(25)
 expect(l.nodes.find(p=>p.x===2&&p.y===2)).toBeDefined()
 expect(l.pixels.filter(p=>p.led===false).every(p=>p.id<0)).toBe(true)
 expect(l.nodes.map(p=>p.id)).toEqual(Array.from({length:9},(_,i)=>i+1))
 expect(parseProject(JSON.stringify(settings))).toEqual(settings)
 const model=xmodel(settings),grid=model.match(/CustomModel="([^"]+)"/)![1].split(';').map(r=>r.split(','))
 expect(grid[0]).toEqual(['','','','','']);expect(Number(grid[2][2])).toBeGreaterThan(0)
 const files=buildPropFiles(settings),nodes=new TextDecoder().decode(files.find(f=>f.name==='NODE_MAP.csv')!.bytes)
 expect(nodes.split('\n')).toHaveLength(10)
 expect(new TextDecoder().decode(files.find(f=>f.name==='SOLID_BORDER.csv')!.bytes).split('\n')).toHaveLength(17)
})
it('closes the actual mounting holes, not only the preview, without stale mesh caching',async()=>{
 const m=await hardwareRuntime()
 const volume=async(s:Settings)=>{
  const l=generate(s);let sum=0
  for(const c of l.sections){const ts=await carrierMesh(c,s,[],l.pixels),mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();const solid=new m.Manifold(mesh);expect(solid.status()).toBe('NoError');sum+=solid.volume();solid.delete()}
  return sum
 }
 expect(await volume(settings)).toBeGreaterThan(await volume({...settings,solidDarkBorder:false})+2000)
},30000)
it('finishes rows and routes row turns along plastic without extra feeds on a pumpkin',()=>{
 const l=generate({...defaults,shape:'sprite',sprite:pumpkinSprite(),spriteWiring:'rows'})
 expect(l.wireStrings).toHaveLength(1)
 expect(l.nodes.map(p=>p.y)).toEqual([...l.nodes.map(p=>p.y)].sort((a,b)=>a-b))
 expect(l.wirePaths).toHaveLength(l.nodes.length-1)
 const occupied=new Set(l.pixels.map(p=>`${p.x},${p.y}`))
 for(const path of l.wirePaths)for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],n=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)*10)
  for(let j=0;j<=n;j++){
   const x=a.x+(b.x-a.x)*j/n,y=a.y+(b.y-a.y)*j/n
   expect([Math.floor(x+.5),Math.ceil(x-.5)].some(cx=>[Math.floor(y+.5),Math.ceil(y-.5)].some(cy=>occupied.has(`${cx},${cy}`)))).toBe(true)
  }
 }
})
