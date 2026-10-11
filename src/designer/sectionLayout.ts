import type {Pixel,Settings} from './geometry'
import {presets} from './geometry'
import {conduitClipPlan,mountingConflict} from './conduitClips'
type Fit=(cells:Pixel[])=>boolean
const key=(p:{x:number;y:number})=>`${p.x},${p.y}`
const directions=[[1,0],[-1,0],[0,1],[0,-1]]
export const jointDefaults={enabled:true,sideGap:.1,tipGap:.25,cornerChamfer:2,bottomRelief:1.3,upperRelief:.15}
export function jointSettings(s:Settings){return {...jointDefaults,...s.sectionJoints}}
function components(cells:Pixel[]){
 const left=new Map(cells.map(p=>[key(p),p])),result:Pixel[][]=[]
 while(left.size){const stack=[left.values().next().value!],part:Pixel[]=[];left.delete(key(stack[0]))
  while(stack.length){const p=stack.pop()!;part.push(p);for(const [dx,dy] of directions){const q=left.get(`${p.x+dx},${p.y+dy}`);if(q){left.delete(key(q));stack.push(q)}}}result.push(part)
 }return result
}
// Split by physical mounting axes before bed packing; electrical order is independent.
export function spriteSections(pixels:Pixel[],s:Settings,fits:Fit):Pixel[][]{
 if(!pixels.length)return []
 const sections:Pixel[][]=[]
 const split=(cells:Pixel[])=>{
  if(fits(cells)){sections.push(cells);return}
  const x0=Math.min(...cells.map(p=>p.x)),x1=Math.max(...cells.map(p=>p.x)),y0=Math.min(...cells.map(p=>p.y)),y1=Math.max(...cells.map(p=>p.y))
  const axis=x1-x0>=y1-y0?'x':'y',mid=Math.floor(((axis==='x'?x0:y0)+(axis==='x'?x1:y1))/2)+.5
  const a=cells.filter(p=>p[axis]<mid),b=cells.filter(p=>p[axis]>mid)
  if(!a.length||!b.length){sections.push(cells);return}
  for(const part of [...components(a),...components(b)])split(part)
 }
 const x0=Math.min(...pixels.map(p=>p.x)),x1=Math.max(...pixels.map(p=>p.x)),y0=Math.min(...pixels.map(p=>p.y)),y1=Math.max(...pixels.map(p=>p.y))
 const frame=s.frame,axes=frame?.enabled?(frame.axis==='cross'?['x','y']:frame.axis==='vertical'?['x']:['y']):['x']
 let regions=components(pixels)
 for(const axis of axes as ('x'|'y')[]){
  if((axis==='x'?x1-x0:y1-y0)<2)continue // keep two-cell-wide poles/ribbons together
  const n=frame?.enabled?frame.rails:1,min=axis==='x'?x0-.5:y0-.5,max=axis==='x'?x1+.5:y1+.5
  for(let i=1;i<=n;i++){
   const cut=Math.round(min+(max-min)*i/(n+1)+(frame?.enabled?frame.offset:0)-.5)+.5
   regions=regions.flatMap(c=>{const a=c.filter(p=>p[axis]<cut),b=c.filter(p=>p[axis]>cut);return a.length&&b.length?[...components(a),...components(b)]:[c]})
  }
 }
 for(const c of regions)split(c)
 sections.forEach((c,i)=>c.forEach(p=>{p.section=i;delete p.jointMale;delete p.jointDx;delete p.jointDy}))
 if(!jointSettings(s).enabled)return sections
 // Reserve usable straight mounting surfaces BEFORE exchanging puzzle cells.
 // This is the same footprint used later to exclude seam clips and tie pads.
 const mountZones=conduitClipPlan(pixels,s),pitch=presets[s.diffuser].size
 // Exchange a complete occupied cell, not an added peg. The original light grid
 // and cap seats stay unchanged; neighboring tray outlines become complementary.
 const map=new Map(pixels.map(p=>[key(p),p])),interfaces=new Map<string,{a:Pixel;b:Pixel}[]>()
 for(const a of pixels)for(const [dx,dy] of [[1,0],[0,1]]){const b=map.get(`${a.x+dx},${a.y+dy}`);if(!b||a.section===b.section)continue
  const k=[a.section,b.section].sort((a,b)=>a-b).join('/'),list=interfaces.get(k)??[];list.push({a,b});interfaces.set(k,list)
 }
 const transferred:Pixel[]=[]
 for(const edges of interfaces.values()){
  if(edges.length<2)continue
  const center={x:edges.reduce((v,e)=>v+(e.a.x+e.b.x)/2,0)/edges.length,y:edges.reduce((v,e)=>v+(e.a.y+e.b.y)/2,0)/edges.length}
  const ordered=[...edges].sort((p,q)=>Math.hypot(p.a.x-center.x,p.a.y-center.y)-Math.hypot(q.a.x-center.x,q.a.y-center.y))
  for(const edge of ordered){
   let accepted=false
   for(const [root,candidate] of [[edge.a,edge.b],[edge.b,edge.a]]){
    if(mountingConflict(candidate.x,candidate.y,pitch,pitch,mountZones,pitch))continue
    if(root.section===candidate.section||transferred.some(p=>Math.abs(p.x-candidate.x)+Math.abs(p.y-candidate.y)<3))continue
    const from=candidate.section,to=root.section,receiver=sections[from].filter(p=>p!==candidate),donor=[...sections[to],candidate]
    if(!receiver.length||components(receiver).length!==1||components(donor).length!==1||!fits(donor)||!fits(receiver))continue
    // Require a genuine recess (another receiving wall next to the tongue).
    if(directions.filter(([dx,dy])=>map.get(`${candidate.x+dx},${candidate.y+dy}`)?.section===from).length<1)continue
    sections[from]=receiver;sections[to]=donor;candidate.section=to;candidate.jointMale=true
    candidate.jointDx=candidate.x-root.x;candidate.jointDy=candidate.y-root.y
    transferred.push(candidate);accepted=true;break
   }
   if(accepted)break
  }
 }
 return sections
}
