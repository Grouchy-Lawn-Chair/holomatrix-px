import type {Point,Pixel} from './geometry'
const key=(p:Point)=>`${p.x},${p.y}`
const steps=[[1,0],[0,1],[-1,0],[0,-1]]
export function pathProgress(points:Point[],center:Point[]){
  return new Map(points.map(p=>{let best=Infinity,progress=0
    for(let i=1;i<center.length;i++){const a=center[i-1],b=center[i],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy
      if(!l)continue
      const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)),d=(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2
      if(d<best){best=d;progress=i-1+t}
    }
    return [key(p),progress]
  }))
}

// Diagnostic articulation test only. Never auto-thicken requested grid rows.
export function neckCells(points:Point[]){
  const map=new Map(points.map(p=>[key(p),p])),time=new Map<string,number>(),low=new Map<string,number>(),cuts=new Set<string>();let clock=0
  function visit(k:string,parent?:string){
    time.set(k,++clock);low.set(k,clock);let children=0
    const p=map.get(k)!
    for(const [dx,dy] of steps){const n=key({x:p.x+dx,y:p.y+dy});if(!map.has(n)||n===parent)continue
      if(!time.has(n)){children++;visit(n,k);low.set(k,Math.min(low.get(k)!,low.get(n)!));if(parent&&low.get(n)!>=time.get(k)!)cuts.add(k)}
      else low.set(k,Math.min(low.get(k)!,time.get(n)!))
    }
    if(!parent&&children>1)cuts.add(k)
  }
  for(const k of map.keys())if(!time.has(k))visit(k)
  return [...cuts].map(k=>map.get(k)!)
}


// A single simple chain: every LED once, each physical edge once. Diagonals
// are permitted only inside a completely occupied 2x2 block, never across
// concave gaps; opposite diagonals in that block cannot both be used.
export function weaveWiring(source:Pixel[],center:Point[]){
  if(!source.length)return {pixels:source,paths:[] as Point[][],complete:true}
  const map=new Map(source.map((p,i)=>[key(p),i]))
  const progress=pathProgress(source,center)
  const rank=(a:number,b:number)=>progress.get(key(source[a]))!-progress.get(key(source[b]))!||source[a].y-source[b].y||source[a].x-source[b].x
  const graph=source.map(p=>[...steps,[1,1],[-1,1],[1,-1],[-1,-1]].flatMap(([dx,dy])=>{
    const n=map.get(key({x:p.x+dx,y:p.y+dy}));if(n===undefined)return []
    if(dx&&dy&&(!map.has(key({x:p.x+dx,y:p.y}))||!map.has(key({x:p.x,y:p.y+dy}))))return []
    return [n]
  }))
  const diagonal=(a:number,b:number)=>{const p=source[a],q=source[b];return p.x!==q.x&&p.y!==q.y?`${Math.min(p.x,q.x)},${Math.min(p.y,q.y)}`:undefined}
  const used=new Uint8Array(source.length),diagonals=new Set<string>(),path:number[]=[];let best:number[]=[],attempts=0
  // Bounded search keeps unusual custom drawings from freezing the editor.
  const limit=25000
  function search(v:number):boolean{
    if(++attempts>limit)return false
    used[v]=1;path.push(v);if(path.length>best.length)best=[...path]
    if(path.length===source.length)return true
    const candidates=graph[v].filter(n=>!used[n]&&(!diagonal(v,n)||!diagonals.has(diagonal(v,n)!)))
    const degree=(n:number)=>graph[n].filter(q=>!used[q]).length
    candidates.sort((a,b)=>degree(a)-degree(b)||rank(a,b))
    for(const n of candidates){
      if(!degree(n)&&path.length<source.length-1)continue
      const d=diagonal(v,n);if(d)diagonals.add(d)
      // Removing the visited prefix must leave a connected future chain.
      const seen=new Set<number>([n]),queue=[n]
      for(let i=0;i<queue.length;i++)for(const q of graph[queue[i]])if(!used[q]&&!seen.has(q)){seen.add(q);queue.push(q)}
      if(seen.size===source.length-path.length&&search(n))return true
      if(d)diagonals.delete(d)
      if(attempts>limit)break
    }
    path.pop();used[v]=0;return false
  }
  const starts=source.map((_,i)=>i).sort(rank).slice(0,8)
  let complete=false
  for(const start of starts){if(search(start)){complete=true;best=[...path];break}if(attempts>limit)break}
  const chosen=new Set(best),order=[...best,...source.map((_,i)=>i).filter(i=>!chosen.has(i)).sort(rank)]
  const pixels=order.map((n,i)=>({...source[n],id:i+1}))
  return {pixels,paths:best.slice(1).map((n,i)=>[source[best[i]],source[n]]),complete}
}
