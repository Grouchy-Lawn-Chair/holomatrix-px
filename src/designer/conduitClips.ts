import {presets,type Pixel,type Settings} from './geometry'
import {framePlan} from './propPlan'

// Reservations for Mitchell's existing glued-on EMT hardware, NOT generated
// mounting heads. Conservative provisional envelope; confirm the chosen size.
export const conduitClipDefaults={mode:'none' as 'none'|'existing',length:50,width:55,clearance:3,spacing:150}
export const conduitClipSettings=(s:Settings)=>{const c={...conduitClipDefaults,...s.conduitClips};return {...c,length:Math.max(50,c.length),width:Math.max(55,c.width)}}
export type MountZone={id:number;x:number;y:number;width:number;height:number;rail:number;axis:'vertical'|'horizontal';sections:number[]}
type Rect={x:number;y:number;width:number;height:number}
export function overlapsZone(a:Rect,b:Rect){return Math.abs(a.x-b.x)<(a.width+b.width)/2&&Math.abs(a.y-b.y)<(a.height+b.height)/2}
export function conduitClipPlan(pixels:Pixel[],s:Settings):MountZone[]{
 const c=conduitClipSettings(s),rails=framePlan(s,pixels),size=presets[s.diffuser].size
 if(s.shape!=='sprite'||c.mode!=='existing'||!rails.length)return []
 const map=new Map(pixels.map(p=>[`${p.x},${p.y}`,p])),candidates:MountZone[]=[]
 for(const rail of rails){
  const vertical=rail.axis==='vertical',axis=vertical?rail.a.x:rail.a.y
  // Only straight TWO-wall seams on a rail axis. A zone is not invented over
  // an empty gap, a corner, or a single unsupported wall.
  const edges=pixels.flatMap(p=>{
   const q=map.get(`${p.x+(vertical?1:0)},${p.y+(vertical?0:1)}`)
   if(!q||q.section===p.section||Math.abs((vertical?p.x+.5:p.y+.5)-axis)>.001)return []
   return [{t:vertical?p.y:p.x,sections:[p.section,q.section].sort((a,b)=>a-b)}]
  }).sort((a,b)=>a.t-b.t)
  const runs:typeof edges[]=[]
  // Section IDs may change at a bed-split junction without interrupting the
  // physical pair of straight walls. Join by geometry, not by ownership.
  for(const e of edges){const run=runs.at(-1),last=run?.at(-1);if(last&&e.t===last.t+1)run!.push(e);else runs.push([e])}
  for(const run of runs){
   const half=(c.length+2*c.clearance)/size/2,lo=run[0].t-.5+half,hi=run.at(-1)!.t+.5-half
   if(lo>hi)continue
   const positions=[(lo+hi)/2,lo,hi]
   for(let t=lo;t<=hi;t+=.5)positions.push(t)
   for(const t of positions){
    const sections=[...new Set(run.filter(e=>e.t+.5>t-half&&e.t-.5<t+half).flatMap(e=>e.sections))].sort((a,b)=>a-b)
    const zone:MountZone={id:0,x:vertical?axis:t,y:vertical?t:axis,width:(vertical?c.width:c.length)+2*c.clearance,height:(vertical?c.length:c.width)+2*c.clearance,rail:rail.id,axis:rail.axis,sections}
    // Leave fitting / zip-tie access at crossed rails, not just mesh clearance.
    if(rails.some(other=>other.axis!==rail.axis&&(other.axis==='vertical'?Math.abs(zone.x-other.a.x)*size<(zone.width+s.frame!.diameter)/2:Math.abs(zone.y-other.a.y)*size<(zone.height+s.frame!.diameter)/2)))continue
    candidates.push(zone)
   }
  }
 }
 const chosen:MountZone[]=[],covered=new Set<number>()
 while(candidates.length){
  candidates.sort((a,b)=>b.sections.filter(n=>!covered.has(n)).length-a.sections.filter(n=>!covered.has(n)).length||a.rail-b.rail||a.y-b.y||a.x-b.x)
  const z=candidates.shift()!,rect={...z,x:z.x*size,y:z.y*size}
  if(chosen.some(p=>overlapsZone(rect,{...p,x:p.x*size,y:p.y*size})))continue
  if(z.sections.every(n=>covered.has(n))&&chosen.some(p=>p.rail===z.rail&&Math.hypot(p.x-z.x,p.y-z.y)*size<c.spacing))continue
  chosen.push({...z,id:chosen.length+1});z.sections.forEach(n=>covered.add(n))
 }
 return chosen
}
export function mountingConflict(x:number,y:number,width:number,height:number,zones:MountZone[],size:number){
 return zones.some(z=>overlapsZone({x:x*size,y:y*size,width,height},{...z,x:z.x*size,y:z.y*size}))
}
