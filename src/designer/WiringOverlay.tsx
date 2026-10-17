import type {Point,Pixel,Settings} from './geometry'
import {powerInjectionPlan} from './powerInjection'
import {wireConnectionPlan} from './seriesWiring'
import {presets} from './geometry'

export function WiringOverlay({paths,pixels,strings,settings,active,onPick,connections}:{paths:Point[][];pixels:Pixel[];strings?:Pixel[][];settings:Settings;active:number;onPick:(i:number)=>void;connections?:ReturnType<typeof wireConnectionPlan>}){
  const byPosition=new Map(pixels.map(p=>[`${p.x},${p.y}`,p.id]))
  const chosen=paths[active],activeIds=new Set(chosen?[chosen[0],chosen.at(-1)!].map(p=>byPosition.get(`${p.x},${p.y}`)):[])
  const plan=connections??wireConnectionPlan(paths,pixels,presets[settings.diffuser].size,settings.stockLeadMm??100)
  return <g aria-label="Directed point-to-point wiring route">
    <defs><marker id="wire-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth=".22" markerHeight=".22" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#163c50"/></marker><marker id="jumper-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth=".25" markerHeight=".25" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#7845ab"/></marker></defs>
    {paths.map((path,i)=>{
      const a=path[0],b=path.at(-1)!,next=path[1],previous=path.at(-2)!
      const link=plan[i]
      let remaining=link.lengthMm/presets[settings.diffuser].size/2,mid=path[0]
      for(let n=1;n<path.length;n++){const p=path[n-1],q=path[n],length=Math.hypot(q.x-p.x,q.y-p.y);if(remaining<=length){const t=remaining/length;mid={x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};break}remaining-=length}
      const gap=.23
      const startLength=Math.hypot(next.x-a.x,next.y-a.y),endLength=Math.hypot(b.x-previous.x,b.y-previous.y)
      const points=[{x:a.x+(next.x-a.x)/startLength*gap,y:a.y+(next.y-a.y)/startLength*gap},...path.slice(1,-1),{x:b.x-(b.x-previous.x)/endLength*gap,y:b.y-(b.y-previous.y)/endLength*gap}].map(p=>`${p.x},${p.y}`).join(' ')
      return <g key={i} onClick={e=>{e.stopPropagation();onPick(i)}} style={{cursor:'pointer'}}>
        <title>{`#${link.from} → #${link.to}${link.jumper?` · J${link.jumper} ${link.exposed?'frame bridge':'rear jumper'} · ${Math.ceil(link.lengthMm)} mm route${link.extension?` · add at least ${link.addedWireMm} mm (estimate)`:''}`:''} · click to select connection`}</title>
        <polyline points={points} fill="none" stroke="white" strokeWidth={link.jumper?'.11':'.14'}/>
        <polyline points={points} fill="none" stroke={i===active?'#dd641d':link.jumper?'#7845ab':'#163c50'} strokeWidth={i===active?'.11':link.jumper?'.075':'.055'} strokeDasharray={link.jumper?'.13 .09':undefined} markerEnd={link.jumper?'url(#jumper-arrow)':'url(#wire-arrow)'}/>
        {link.jumper&&<g transform={`translate(${mid.x},${mid.y})`}><rect x="-.2" y="-.18" width=".4" height=".3" rx=".06" fill="#7845ab" stroke="white" strokeWidth=".025"/><text y=".035" fontSize=".18" textAnchor="middle" fill="white">J{link.jumper}</text></g>}
      </g>
    })}
    <g pointerEvents="none">{pixels.map(p=><g key={p.id}>
      <circle cx={p.x} cy={p.y} r=".21" fill={activeIds.has(p.id)?'#fff0cf':'white'} stroke="#163c50" strokeWidth=".025"/>
      <text x={p.x} y={p.y+.075} fontSize=".22" textAnchor="middle" fill="#163c50">{p.id}</text>
    </g>)}</g>
    <g pointerEvents="none">{powerInjectionPlan(pixels,settings,strings).map(({pixel:p,kind,after})=><g key={p.id}>
      <title>{`${kind==='feed'?'Initial power feed':`Power injection after ${after} LEDs`} · pixel ${p.id} · ${settings.pixelVoltage??5} V · planning estimate`}</title>
      <circle cx={p.x} cy={p.y} r=".23" fill={kind==='feed'?'#df7838':'#ab3051'} stroke="white" strokeWidth=".045"/>
      <text x={p.x} y={p.y+.075} textAnchor="middle" fontSize=".22" fill="white">{p.id}</text>
      <text x={p.x+.32} y={p.y-.48} fontSize=".3" fill="#8b2545" stroke="white" strokeWidth=".06" paintOrder="stroke">{kind==='feed'?'Power':`Inject ${after}`} · #{p.id}</text>
    </g>)}</g>
    {pixels.length>0&&<g pointerEvents="none" aria-label="One data input and one data output">{[{p:pixels[0],label:'DATA IN',dy:-.75},{p:pixels.at(-1)!,label:'DATA OUT',dy:.75}].map(({p,label,dy})=><g key={label}><text x={p.x-.35} y={p.y+dy} textAnchor="end" fontSize=".3" fill="#8ebaff" stroke="#080a10" strokeWidth=".08" paintOrder="stroke">{label} #{p.id}</text></g>)}</g>}
  </g>
}
