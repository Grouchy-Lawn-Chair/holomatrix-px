import type {Point,Pixel,Settings} from './geometry'
import {powerInjectionPlan} from './powerInjection'

export function WiringOverlay({paths,pixels,strings,settings,active,onPick}:{paths:Point[][];pixels:Pixel[];strings?:Pixel[][];settings:Settings;active:number;onPick:(i:number)=>void}){
  const byPosition=new Map(pixels.map(p=>[`${p.x},${p.y}`,p.id]))
  const activeIds=new Set(paths[active]?.map(p=>byPosition.get(`${p.x},${p.y}`))??[])
  return <g aria-label="Directed point-to-point wiring route">
    <defs><marker id="wire-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth=".22" markerHeight=".22" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#163c50"/></marker></defs>
    {paths.map((path,i)=>{
      const a=path[0],b=path.at(-1)!,next=path[1],previous=path.at(-2)!
      const gap=.23
      const startLength=Math.hypot(next.x-a.x,next.y-a.y),endLength=Math.hypot(b.x-previous.x,b.y-previous.y)
      const points=[{x:a.x+(next.x-a.x)/startLength*gap,y:a.y+(next.y-a.y)/startLength*gap},...path.slice(1,-1),{x:b.x-(b.x-previous.x)/endLength*gap,y:b.y-(b.y-previous.y)/endLength*gap}].map(p=>`${p.x},${p.y}`).join(' ')
      return <g key={i} onClick={e=>{e.stopPropagation();onPick(i)}} style={{cursor:'pointer'}}>
        <title>#{byPosition.get(`${a.x},${a.y}`)} → #{byPosition.get(`${b.x},${b.y}`)} · click to select connection</title>
        <polyline points={points} fill="none" stroke="white" strokeWidth=".14"/>
        <polyline points={points} fill="none" stroke={i===active?'#dd641d':'#163c50'} strokeWidth={i===active?'.1':'.055'} markerEnd="url(#wire-arrow)"/>
      </g>
    })}
    <g pointerEvents="none">{pixels.map(p=><g key={p.id}>
      <circle cx={p.x} cy={p.y} r=".21" fill={activeIds.has(p.id)?'#fff0cf':'white'} stroke="#163c50" strokeWidth=".025"/>
      <text x={p.x} y={p.y+.075} fontSize=".22" textAnchor="middle" fill="#163c50">{p.id}</text>
    </g>)}</g>
    <g pointerEvents="none">{powerInjectionPlan(pixels,settings,strings).map(({pixel:p,kind,after})=><g key={p.id}>
      <title>{kind==='feed'?'Initial power feed':`Power injection after ${after} LEDs`} · pixel {p.id} · {settings.pixelVoltage??5} V · planning estimate</title>
      <circle cx={p.x} cy={p.y} r=".23" fill={kind==='feed'?'#df7838':'#ab3051'} stroke="white" strokeWidth=".045"/>
      <text x={p.x} y={p.y+.075} textAnchor="middle" fontSize=".22" fill="white">{p.id}</text>
      <text x={p.x+.32} y={p.y-.48} fontSize=".3" fill="#8b2545" stroke="white" strokeWidth=".06" paintOrder="stroke">{kind==='feed'?'Feed':`Inject ${after}`} · #{p.id}</text>
    </g>)}</g>
  </g>
}
