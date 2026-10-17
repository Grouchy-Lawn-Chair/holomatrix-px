import type {Pixel, Point} from './geometry'
import {weaveWiring} from './wiring'
import {stitchSeries} from './seriesWiring'

export type SpriteCell=Point&{color:string}
export type Sprite={width:number;height:number;cells:SpriteCell[];source:string}
export type PumpkinFace='plain'|'happy'|'scary'|'goofy'
export const spriteLimit=48
export const cellKey=(p:Point)=>`${p.x},${p.y}`

// Flood only through transparent background and near-black cells. Enclosed
// dark faces remain LEDs; the original artwork and plastic silhouette survive.
export function exteriorDarkCells(s:Sprite):Set<string>{
  const cells=new Map(s.cells.map(c=>[cellKey(c),c])),seen=new Set<string>(),dark=new Set<string>(),queue:Point[]=[{x:-1,y:-1}]
  for(let i=0;i<queue.length;i++){
    const p=queue[i],k=cellKey(p)
    if(seen.has(k)||p.x< -1||p.y< -1||p.x>s.width||p.y>s.height)continue
    seen.add(k)
    const c=cells.get(k)
    if(c){const rgb=[1,3,5].map(n=>parseInt(c.color.slice(n,n+2),16));if(Math.max(...rgb)>32)continue;dark.add(k)}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])queue.push({x:p.x+dx,y:p.y+dy})
  }
  return dark
}

// Original procedural artwork. Color/off-state is independent of occupancy.
export function pumpkinSprite(width=16,height=16,face:PumpkinFace='happy',cutouts=false):Sprite{
  width=Math.max(8,Math.min(spriteLimit,Math.round(width)));height=Math.max(8,Math.min(spriteLimit,Math.round(height)))
  const cells:SpriteCell[]=[]
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=(x+.5)/width,v=(y+.5)/height
    const body=((u-.5)/.49)**2+((v-.58)/.41)**2<=1
    const stem=u>=.45&&u<.59&&v>=.02&&v<.23
    if(!body&&!stem)continue
    let color=stem?'#52833a':Math.abs(u-.5)<.17?'#ffad24':Math.abs(u-.5)<.33?'#f58a16':'#d76512'
    let feature=false
    if(face!=='plain'&&body){
      const eye=(cx:number)=>face==='scary'?Math.abs(u-cx)<.1&&v>.37+Math.abs(u-cx)*.5&&v<.49:Math.abs(u-cx)<.075&&v>.36&&v<.48
      const eyes=eye(.31)||eye(.69)
      const nose=Math.abs(u-.5)<.045&&v>.49&&v<.59
      const mouth=face==='goofy'?(u>.26&&u<.76&&v>.65&&v<.77&&!(u>.44&&u<.54&&v<.72)):
        u>.23&&u<.77&&v>(face==='scary'?.65:.64+Math.abs(u-.5)*.25)&&v<.8-Math.abs(u-.5)*.12&&!(Math.floor(u*width)%4===0&&v<.72)
      feature=eyes||nose||mouth
    }
    if(feature){if(cutouts)continue;color='#10151c'}
    cells.push({x,y,color})
  }
  return {width,height,cells,source:`Original pumpkin · ${face}${cutouts?' · physical face cutouts':''}`}
}

export function validateSprite(value:unknown):asserts value is Sprite{
  const s=value as Sprite
  if(!s||!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<1||s.height<1||s.width>spriteLimit||s.height>spriteLimit||!Array.isArray(s.cells)||s.cells.length>s.width*s.height||typeof s.source!=='string'||s.source.length>200)throw new Error('Invalid sprite grid (maximum 48 × 48).')
  const seen=new Set<string>()
  for(const c of s.cells){if(!c||!Number.isInteger(c.x)||!Number.isInteger(c.y)||c.x<0||c.y<0||c.x>=s.width||c.y>=s.height||!/^#[0-9a-f]{6}$/i.test(c.color)||seen.has(cellKey(c)))throw new Error('Invalid or duplicate sprite pixel.');seen.add(cellKey(c))}
}

export function resizeSprite(s:Sprite,width:number,height:number):Sprite{
  const source=new Map(s.cells.map(c=>[cellKey(c),c.color])),cells:SpriteCell[]=[]
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const color=source.get(`${Math.floor(x*s.width/width)},${Math.floor(y*s.height/height)}`)
    if(color)cells.push({x,y,color})
  }
  return {...s,width,height,cells}
}

export function spriteFromRgba(width:number,height:number,rgba:ArrayLike<number>,source:string,background?:string):Sprite{
  const cells:SpriteCell[]=[]
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,color='#'+[rgba[i],rgba[i+1],rgba[i+2]].map(n=>n.toString(16).padStart(2,'0')).join('')
    if(rgba[i+3]>=128&&color.toLowerCase()!==background?.toLowerCase())cells.push({x,y,color})
  }
  const sprite={width,height,cells,source:source.slice(0,200)};validateSprite(sprite);return sprite
}

// Deterministic local weaves, joined as one series data chain. Necessary
// rear returns and explicit island bridges are tracked as physical jumpers.
export function spriteWiring(source:Pixel[],mode:'rows'|'compact'='compact',support:Pixel[]=source){
  if(mode==='rows'){const local=rowWiring(source,support);return stitchSeries(local.strings,local.paths,support)}
  // First try the existing bounded, gap-aware simple-chain solver. Small
  // filled silhouettes often need just one feed, not one per scanline.
  if(mode==='compact'&&source.length>0&&source.length<=512){
    const solved=weaveWiring(source,[])
    if(solved.complete)return {...solved,strings:[solved.pixels],exposedPaths:[] as number[]}
  }
  const unused=new Map(source.map(p=>[cellKey(p),p])),chains:Pixel[][]=[]
  const rows=[...new Set(source.map(p=>p.y))].sort((a,b)=>a-b)
  for(const [row,y] of rows.entries()){
    const cells=source.filter(p=>p.y===y).sort((a,b)=>row%2?b.x-a.x:a.x-b.x)
    for(const p of cells){
      if(!unused.has(cellKey(p)))continue
      const last=chains.at(-1),end=last?.at(-1)
      if(end&&Math.abs(end.x-p.x)+Math.abs(end.y-p.y)===1)last!.push(p)
      else chains.push([p])
      unused.delete(cellKey(p))
    }
  }
  // Join chains at matching endpoints; reversing changes direction only,
  // never retraces an edge. Endpoints still meet along a full cell edge.
  let changed=true
  while(mode==='compact'&&changed){changed=false
    outer:for(let i=0;i<chains.length;i++)for(let j=i+1;j<chains.length;j++)for(const a of [false,true])for(const b of [false,true]){
      const first=a?[...chains[i]].reverse():chains[i],second=b?[...chains[j]].reverse():chains[j],p=first.at(-1)!,q=second[0]
      if(Math.abs(p.x-q.x)+Math.abs(p.y-q.y)===1){chains[i]=[...first,...second];chains.splice(j,1);changed=true;break outer}
    }
  }
  let id=0
  const strings=chains.map(chain=>chain.map(p=>({...p,id:++id})))
  return stitchSeries(strings,strings.flatMap(chain=>chain.slice(1).map((p,i)=>[chain[i],p])),support)
}

// Finish each row, then connect along the boundary behind occupied plastic.
// Boundary turns avoid crossing row-center wires or visiting a node twice.
function rowWiring(source:Pixel[],support:Pixel[]){
  const occupied=new Set(support.map(cellKey)),rows=[...new Set(source.map(p=>p.y))].sort((a,b)=>a-b)
  const chains:Pixel[][]=[],routes:Point[][]=[]
  for(const [i,y] of rows.entries()){
    const row=source.filter(p=>p.y===y).sort((a,b)=>i%2?b.x-a.x:a.x-b.x)
    for(const p of row){
      const chain=chains.at(-1),end=chain?.at(-1)
      let path:Point[]|undefined
      if(end&&end.y===p.y&&Math.abs(end.x-p.x)===1)path=[end,p]
      else if(end&&p.y-end.y===1){
        const lo=Math.min(end.x,p.x),hi=Math.max(end.x,p.x)
        if(Array.from({length:hi-lo+1},(_,n)=>lo+n).every(x=>occupied.has(`${x},${end.y}`)||occupied.has(`${x},${p.y}`))){
          path=end.x===p.x?[end,p]:[end,{x:end.x,y:end.y+.5},{x:p.x,y:end.y+.5},p]
        }
      }
      if(path){chain!.push(p);routes.push(path)}else chains.push([p])
    }
  }
  let id=0
  const strings=chains.map(c=>c.map(p=>({...p,id:++id})))
  return {pixels:strings.flat(),strings,paths:routes,complete:true}
}
