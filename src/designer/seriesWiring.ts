import type {Pixel,Point} from './geometry'
const key=(p:Point)=>`${p.x},${p.y}`
const pair=(a:Point,b:Point)=>`${key(a)}>${key(b)}`
const adjacent=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1

/** Join local weaves into one data chain. Return legs use the rear cell-edge
 * network, not additional LEDs. Truly separate islands get an explicit bridge. */
export function stitchSeries(source:Pixel[][],routes:Point[][],support:Pixel[]){
 const chains=source.filter(c=>c.length).map(c=>[...c])
 const local=new Map(routes.map(p=>[pair(p[0],p.at(-1)!),p]))
 const route=(a:Pixel,b:Pixel)=>local.get(pair(a,b))??local.get(pair(b,a))?.slice().reverse()??[a,b]
 if(!chains.length)return {pixels:[] as Pixel[],strings:[] as Pixel[][],paths:[] as Point[][],complete:true,exposedPaths:[] as number[]}
 // Reduce needless extensions by joining available, edge-adjacent endpoints.
 let changed=true
 while(changed){changed=false
  outer:for(let i=0;i<chains.length;i++)for(let j=i+1;j<chains.length;j++)for(const reverseA of [false,true])for(const reverseB of [false,true]){
   const a=reverseA?chains[i][0]:chains[i].at(-1)!,b=reverseB?chains[j].at(-1)!:chains[j][0]
   if(adjacent(a,b)){chains[i]=[...(reverseA?chains[i].reverse():chains[i]),...(reverseB?chains[j].reverse():chains[j])];chains.splice(j,1);changed=true;break outer}
  }
 }
 const graph=new Map<string,{point:Point;next:Set<string>}>()
 const occupied=new Map(support.map(p=>[key(p),p])),component=new Map<string,number>();let componentId=0
 for(const cell of support){if(component.has(key(cell)))continue
  const pending=[cell];component.set(key(cell),componentId++)
  for(let i=0;i<pending.length;i++){const p=pending[i]
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=key({x:p.x+dx,y:p.y+dy}),n=occupied.get(k)
    if(n&&!component.has(k)){component.set(k,component.get(key(cell))!);pending.push(n)}
   }
  }
 }
 const vertexKey=(p:Point,cell:Point)=>`${component.get(key(cell))}:${key(p)}`
 const corners=(p:Point)=>[{x:p.x-.5,y:p.y-.5},{x:p.x+.5,y:p.y-.5},{x:p.x+.5,y:p.y+.5},{x:p.x-.5,y:p.y+.5}]
 for(const cell of support){const square=corners(cell)
  for(const p of square){const k=vertexKey(p,cell);if(!graph.has(k))graph.set(k,{point:p,next:new Set()})}
  for(let i=0;i<4;i++){const a=vertexKey(square[i],cell),b=vertexKey(square[(i+1)%4],cell);graph.get(a)!.next.add(b);graph.get(b)!.next.add(a)}
 }
 // Insert remaining weaves near their neighbors, rather than leaving
 // isolated branch tips until the end of a long prop.
 const order=chains.shift()!
 const distance=(a:Point|undefined,b:Point|undefined)=>a&&b?Math.hypot(a.x-b.x,a.y-b.y):0
 for(const chain of chains.sort((a,b)=>b.length-a.length)){
  let best={position:order.length,reverse:false,cost:Infinity}
  for(let position=0;position<=order.length;position++)for(const reverse of [false,true]){
   const a=reverse?chain.at(-1)!:chain[0],b=reverse?chain[0]:chain.at(-1)!
   const p=order[position-1],q=order[position]
   const cost=distance(p,a)+distance(b,q)-distance(p,q)
   if(cost<best.cost)best={position,reverse,cost}
  }
  order.splice(best.position,0,...(best.reverse?chain.reverse():chain))
 }
 const paths:Point[][]=[],exposedPaths:number[]=[]
 for(let index=1;index<order.length;index++){
  const a=order[index-1],b=order[index]
  if(component.get(key(a))!==component.get(key(b))){exposedPaths.push(paths.length);paths.push([a,b]);continue}
  if(adjacent(a,b)||local.has(pair(a,b))||local.has(pair(b,a))){paths.push(route(a,b));continue}
  const goals=new Set(corners(b).map(p=>vertexKey(p,b)))
  const queue=corners(a).map(p=>vertexKey(p,a)).filter(k=>graph.has(k)),previous=new Map(queue.map(k=>[k,null as string|null]))
  let found:string|undefined
  for(let i=0;i<queue.length;i++){
   const k=queue[i];if(goals.has(k)){found=k;break}
   for(const n of graph.get(k)!.next)if(!previous.has(n)){previous.set(n,k);queue.push(n)}
  }
  if(found){
   const rear:Point[]=[];let vertex:string|null=found
   while(vertex!==null){rear.push(graph.get(vertex)!.point);vertex=previous.get(vertex)!}
   paths.push([a,...rear.reverse(),b])
  }else{exposedPaths.push(paths.length);paths.push([a,b])}
 }
 const pixels=order.map((p,i)=>({...p,id:i+1}))
 const bridges=paths.flatMap((p,i)=>component.get(key(p[0]))!==component.get(key(p.at(-1)!))?[i]:[])
 return {pixels,strings:[pixels],paths,complete:true,exposedPaths:[...new Set([...exposedPaths,...bridges])]}
}

export function wireConnectionPlan(paths:Point[][],nodes:Pixel[],pitch:number,stockLeadMm=100,exposedPaths:number[]=[]){
 const ids=new Map(nodes.map(p=>[key(p),p.id])),exposed=new Set(exposedPaths);let jumper=0
 return paths.map((path,index)=>{
  const from=ids.get(key(path[0]))!,to=ids.get(key(path.at(-1)!))!
  const lengthMm=path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.y-path[i].y)*pitch,0)
  const addedWireMm=Math.max(0,Math.ceil(lengthMm+20-stockLeadMm))
  const rear=path.length>2||Math.max(Math.abs(path[0].x-path.at(-1)!.x),Math.abs(path[0].y-path.at(-1)!.y))>1
  const isJumper=rear||exposed.has(index)||addedWireMm>0
  return {index,from,to,path,lengthMm,addedWireMm,extension:addedWireMm>0,exposed:exposed.has(index),jumper:isJumper?++jumper:undefined}
 })
}
