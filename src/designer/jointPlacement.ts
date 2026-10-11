import type {Pixel} from './geometry'
export type JointAnchor={id:number;a:Pixel;b:Pixel;x:number;y:number;angle:number}

// One representative full-edge seam per adjacent section pair. This is an
// interface graph, not printable geometry; backingPlatePlan finds usable rims.
export function jointAnchors(pixels:Pixel[]):JointAnchor[]{
  const cells=new Map(pixels.map(p=>[`${p.x},${p.y}`,p])),pairs=new Map<string,{a:Pixel;b:Pixel}[]>()
  for(const p of pixels)for(const [dx,dy] of [[1,0],[0,1]]){
    const q=cells.get(`${p.x+dx},${p.y+dy}`)
    if(!q||q.section===p.section)continue
    const [a,b]=p.section<q.section?[p,q]:[q,p],key=`${a.section},${b.section}`
    const seams=pairs.get(key)??[];seams.push({a,b});pairs.set(key,seams)
  }
  return [...pairs.values()].sort((x,y)=>x[0].a.section-y[0].a.section||x[0].b.section-y[0].b.section).map((seams,i)=>{
    const cx=seams.reduce((s,p)=>s+(p.a.x+p.b.x)/2,0)/seams.length,cy=seams.reduce((s,p)=>s+(p.a.y+p.b.y)/2,0)/seams.length
    seams.sort((p,q)=>Math.hypot((p.a.x+p.b.x)/2-cx,(p.a.y+p.b.y)/2-cy)-Math.hypot((q.a.x+q.b.x)/2-cx,(q.a.y+q.b.y)/2-cy)||p.a.x-q.a.x||p.a.y-q.a.y)
    const {a,b}=seams[0]
    return {id:i+1,a,b,x:(a.x+b.x)/2,y:(a.y+b.y)/2,angle:Math.atan2(-(b.y-a.y),b.x-a.x)||0}
  })
}
