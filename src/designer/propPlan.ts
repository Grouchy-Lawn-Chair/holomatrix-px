import {bounds,presets,type Pixel,type Settings} from './geometry'
import {backingPlatePlan,type BackingPlate} from './backingPlate'
import {jointAnchors} from './jointPlacement'
import {emtHardwareSpec} from './emtHardware'

// Dense silhouettes can have seams meeting at four-section intersections.
// Use disjoint local pairs instead of overlapping, whole-interface caps.
export function diffuserJoinPlan(pixels:Pixel[],s:Settings):BackingPlate[]{
  if(s.shape!=='sprite')return backingPlatePlan(pixels)
  const used=new Set<number>(),result:BackingPlate[]=[]
  for(const anchor of jointAnchors(pixels)){
    const candidates=pixels.filter(p=>p.section===anchor.a.section).flatMap(a=>pixels.filter(b=>b.section===anchor.b.section&&Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1).map(b=>({a,b})))
    const pair=candidates.find(({a,b})=>a.led!==false&&b.led!==false&&!used.has(a.id)&&!used.has(b.id))
    if(!pair)continue // wall bridges still connect this interface
    used.add(pair.a.id);used.add(pair.b.id)
    result.push({...anchor,...pair,id:result.length+1,x:(pair.a.x+pair.b.x)/2,y:(pair.a.y+pair.b.y)/2,cells:[pair.a,pair.b],ties:[]})
  }
  return result
}

export const defaultFrame={enabled:false,axis:'vertical' as const,rails:2,offset:0,diameter:23.5,standOff:65}
export function framePlan(s:Settings,pixels:Pixel[]){
  const f=s.frame??defaultFrame,b=bounds(pixels),size=presets[s.diffuser].size
  if(!f.enabled||!pixels.length)return []
  return (f.axis==='cross'?['vertical','horizontal'] as const:[f.axis]).flatMap((axis,j)=>Array.from({length:f.rails},(_,i)=>{
    const t=(i+1)/(f.rails+1),raw=(axis==='vertical'?b.minX+b.width*t:b.minY+b.height*t)+f.offset
    const pos=Math.round(raw-.5)+.5 // same cell-edge datum as the section splitter
    const a=axis==='vertical'?{x:pos,y:b.minY-.5}:{x:b.minX-.5,y:pos}
    const z=axis==='vertical'?{x:pos,y:b.maxY+.5}:{x:b.maxX+.5,y:pos}
    const sections=[...new Set(pixels.filter(p=>Math.abs((axis==='vertical'?p.x:p.y)-pos)<=.5+f.diameter/size/2).map(p=>p.section))]
    const rear=settingsRear(s,f.standOff)
    return {id:j*f.rails+i+1,axis,a,b:z,rearCenter:rear+(f.axis==='cross'&&axis==='horizontal'?f.diameter:0),lengthMm:Math.hypot(a.x-z.x,a.y-z.y)*size,sections}
  }))
}
function settingsRear(s:Settings,standOff:number){return s.conduitClips?.mode==='existing'?Math.max(emtHardwareSpec.rearCenter,standOff):standOff}
