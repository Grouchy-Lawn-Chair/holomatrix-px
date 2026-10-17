import {expect,it} from 'vitest'
import {defaults,generate,parseProject,type Settings} from './geometry'
import {buildPropFiles,xmodel} from './propExports'
import {powerInjectionPlan} from './powerInjection'
import {renderToStaticMarkup} from 'react-dom/server'
import {WiringOverlay} from './WiringOverlay'
import {existsSync,readFileSync} from 'node:fs'

function candles():Settings{
 const cells=new Map<string,{x:number;y:number;color:string}>()
 const add=(x:number,y:number)=>cells.set(`${x},${y}`,{x,y,color:'#ffa020'})
 for(const center of [1,5,9]){
  for(let y=0;y<=2;y++)for(let x=center-1;x<=center+1;x++)add(x,y)
  add(center,3) // Single-cell articulation point under each flame.
  for(let y=4;y<=8;y++)for(let x=center-1;x<=center+1;x++)add(x,y)
 }
 for(let x=0;x<=10;x++)add(x,9)
 for(let y=10;y<=13;y++)add(5,y)
 return {...defaults,shape:'sprite',sprite:{width:11,height:14,source:'Synthetic three-candle choke-point regression',cells:[...cells.values()]}}
}
for(const mode of ['rows','compact'] as const)it(`${mode}: one chain through three necks, every LED exactly once`,()=>{
 const s={...candles(),spriteWiring:mode},l=generate(s)
 expect(l.wireStrings).toHaveLength(1)
 expect(l.wiringComplete).toBe(true)
 expect(l.nodes.map(p=>p.id)).toEqual(Array.from({length:l.nodes.length},(_,i)=>i+1))
 expect(new Set(l.nodes.map(p=>`${p.x},${p.y}`)).size).toBe(s.sprite!.cells.length)
 expect(l.wireConnections).toHaveLength(l.nodes.length-1)
 for(const [i,c]of l.wireConnections.entries()){expect(c.from).toBe(i+1);expect(c.to).toBe(i+2)}
 expect(l.wireJumpers.length).toBeGreaterThan(0)
 expect(l.wireJumpers.some(j=>j.extension)).toBe(true)
 expect(l.wireJumpers.some(j=>j.exposed)).toBe(false)
 const occupied=new Set(l.pixels.map(p=>`${p.x},${p.y}`))
 for(const c of l.wireConnections)for(let i=1;i<c.path.length;i++){
  const a=c.path[i-1],b=c.path[i],steps=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)*10)
  for(let n=0;n<=steps;n++){
   const x=a.x+(b.x-a.x)*n/steps,y=a.y+(b.y-a.y)*n/steps
   expect([Math.floor(x+.5),Math.ceil(x-.5)].some(cx=>[Math.floor(y+.5),Math.ceil(y-.5)].some(cy=>occupied.has(`${cx},${cy}`)))).toBe(true)
  }
 }
 const power=powerInjectionPlan(l.nodes,s,l.wireStrings)
 expect(power.filter(p=>p.kind==='feed')).toHaveLength(1)
 expect(power.map(p=>p.pixel.id)).toEqual(l.nodes.filter((_,i)=>i%50===0).map(p=>p.id))
 expect(xmodel(s)).toContain('CustomStrings="1"')
 const files=buildPropFiles(s),csv=new TextDecoder().decode(files.find(f=>f.name==='JUMPERS.csv')!.bytes)
 expect(csv.split('\n')).toHaveLength(l.wireJumpers.length+1)
 expect(csv).toContain('estimated_extra_wire_mm')
})
it('does not mistake diagonally touching or detached islands for hidden cable support',()=>{
 const s={...candles(),sprite:{width:5,height:3,source:'Islands',cells:[{x:0,y:0,color:'#ffffff'},{x:1,y:1,color:'#ffffff'},{x:4,y:2,color:'#ffffff'}]}},l=generate(s)
 expect(l.wireStrings).toHaveLength(1);expect(l.wireConnections).toHaveLength(2)
 expect(l.wireJumpers.filter(j=>j.exposed)).toHaveLength(2)
})
it('changing measured stock leads changes extensions, not artwork or node order',()=>{
 const s=candles(),short=generate({...s,stockLeadMm:20}),long=generate({...s,stockLeadMm:2000})
 expect(short.nodes).toEqual(long.nodes)
 expect(short.wirePaths).toEqual(long.wirePaths)
 expect(short.wireJumpers.filter(j=>j.extension).length).toBeGreaterThan(long.wireJumpers.filter(j=>j.extension).length)
 expect(long.wireJumpers.every(j=>j.addedWireMm===0)).toBe(true)
 expect(parseProject(JSON.stringify({...s,stockLeadMm:100})).stockLeadMm).toBe(100)
 for(const stockLeadMm of [-1,2001,'100',null])expect(()=>parseProject(JSON.stringify({...s,stockLeadMm}))).toThrow()
})
it('labels one input/output, jumpers and separate power injection',()=>{
 const s=candles(),l=generate(s)
 const html=renderToStaticMarkup(<WiringOverlay paths={l.wirePaths} pixels={l.nodes} strings={l.wireStrings} connections={l.wireConnections} settings={s} active={0} onPick={()=>{}}/>)
 expect(html.match(/DATA IN/g)).toHaveLength(1);expect(html.match(/DATA OUT/g)).toHaveLength(1)
 expect(html).toContain('rear jumper');expect(html).toContain('Power');expect(html).not.toContain('Feed')
})
const candleFile='public/prop-library/jack-o-lantern/halloween-prop-355.json'
it.skipIf(!existsSync(candleFile))('regresses the supplied 175-light candle artwork without publishing it',()=>{
 const sprite=JSON.parse(readFileSync(candleFile,'utf8').replace(/^\uFEFF/,'')),s:Settings={...defaults,shape:'sprite',sprite},l=generate(s)
 expect(l.wireStrings).toHaveLength(1);expect(l.nodes).toHaveLength(175)
 expect(l.wireConnections).toHaveLength(174)
 expect(l.wireJumpers.some(j=>j.extension)).toBe(true)
 expect(l.wireJumpers.some(j=>j.exposed)).toBe(false)
 expect(l.wireConnections.every((c,i)=>c.from===i+1&&c.to===i+2)).toBe(true)
 expect(l.nodes.map(p=>`${p.x},${p.y}`).sort()).toEqual(sprite.cells.map((p:{x:number;y:number})=>`${p.x},${p.y}`).sort())
})
