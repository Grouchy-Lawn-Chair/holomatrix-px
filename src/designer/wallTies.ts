import {presets,type Pixel,type Settings} from './geometry'
import {conduitClipPlan,mountingConflict} from './conduitClips'

// Dimensions are millimetres. Clearance accommodates a nominal 4.8 mm tie,
// but actual tie heads and installed cable paths still need a physical test.
export const wallTieSpec={width:5.8,height:3,z:18,padWidth:12,padHeight:9,padZ:15,padThickness:1.5,spacing:100}
export type WallTie={pixel:Pixel;dx:number;dy:number}
export function wallTiePlan(pixels:Pixel[],s:Settings):WallTie[]{
  const size=presets[s.diffuser].size,occupied=new Map(pixels.map(p=>[`${p.x},${p.y}`,p])),result:WallTie[]=[],zones=conduitClipPlan(pixels,s)
  for(const section of [...new Set(pixels.map(p=>p.section))]){
    const cells=pixels.filter(p=>p.section===section)
    const candidates=cells.flatMap(p=>[[1,0],[0,1]].flatMap(([dx,dy])=>{
      let a=p,b=p
      while(occupied.get(`${a.x-dx},${a.y-dy}`)?.section===section)a=occupied.get(`${a.x-dx},${a.y-dy}`)!
      while(occupied.get(`${b.x+dx},${b.y+dy}`)?.section===section)b=occupied.get(`${b.x+dx},${b.y+dy}`)!
      // Only exposed outer walls: never put a tie slot over a seam cable hole.
      if(s.shape!=='sprite'&&(occupied.has(`${a.x-dx},${a.y-dy}`)||occupied.has(`${b.x+dx},${b.y+dy}`)))return []
      const ties=[{pixel:a,dx:-dx,dy:-dy},{pixel:b,dx,dy}]
      // Reserve the entire inward pad, not only the slot center. Relocate the
      // opposed pair together; never leave an unreinforced hole at a mount.
      if(ties.some(t=>mountingConflict(t.pixel.x+t.dx*(.5-(2+wallTieSpec.padThickness)/2/size),t.pixel.y+t.dy*(.5-(2+wallTieSpec.padThickness)/2/size),t.dx?2+wallTieSpec.padThickness:wallTieSpec.padWidth,t.dy?2+wallTieSpec.padThickness:wallTieSpec.padWidth,zones,size)))return []
      return [{x:(a.x+b.x)/2,y:(a.y+b.y)/2,length:Math.abs(a.x-b.x)+Math.abs(a.y-b.y),ties}]
    }))
    const stations:{x:number;y:number}[]=[]
    // End cells first, then fill gaps. Prefer a short cross-ribbon tie path.
    const targets=[cells[0],cells.at(-1)!,...cells]
    for(const target of targets){
      const limit=stations.length<2?.6:wallTieSpec.spacing/size
      if(stations.some(p=>Math.hypot(p.x-target.x,p.y-target.y)<limit))continue
      const c=[...candidates].sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y)||a.length-b.length)
        .find(c=>!stations.some(p=>Math.hypot(p.x-c.x,p.y-c.y)<.6))
      if(c){stations.push(c);result.push(...c.ties)}
    }
  }
  return [...new Map(result.map(t=>[`${t.pixel.id}/${t.dx}/${t.dy}`,t])).values()]
}
