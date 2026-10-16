import type {Settings,generate} from './geometry'
import {defaultFrame} from './propPlan'
import {conduitClipSettings,conduitClipPlan} from './conduitClips'
import {emtCompatible} from './emtHardware'
import {wallTiePlan} from './wallTies'

export default function ConduitClipPanel({settings,layout,onChange,showGuides=false,onShowGuides}:{showGuides?:boolean;onShowGuides?:(v:boolean)=>void;settings:Settings;layout:ReturnType<typeof generate>;onChange:(s:Partial<Settings>)=>void}){
 const c=conduitClipSettings(settings),zones=conduitClipPlan(layout.pixels,settings),covered=new Set(zones.flatMap(z=>z.sections)),ties=wallTiePlan(layout.pixels,settings),unsupported=layout.sections.filter((_,i)=>!covered.has(i))
 return <section className="ps-conduit-options">
  <p className="ps-help">Support each section on the pipe. Seam joins align pieces; they do not replace the support frame.</p>
  <label className="ps-field"><span>Attachment</span><select aria-label="Conduit clips" value={c.mode} onChange={e=>onChange({conduitClips:{...c,mode:e.target.value as typeof c.mode},...(e.target.value==='existing'?{frame:{...(settings.frame??defaultFrame),enabled:true}}:{})})}>
   <option value="none">Direct zip ties to pipe</option>
   <option value="existing">Two-wall conduit clips</option>
  </select></label>
  {c.mode==='existing'&&<>
   <div className={'ps-mount-status '+(zones.length&&emtCompatible(settings)?'ps-mount-ready':'')} role="status"><b>{zones.length?`${zones.length} conduit mounts`:'No clip locations fit this layout'}</b>{!zones.length&&<p>Adjust the frame layout or use direct ties.</p>}</div>
<label className="ps-field"><span>Mounting head</span><select aria-label="Mounting head" value={emtCompatible(settings)?String(settings.frame?.diameter??23.5):'custom'} onChange={e=>onChange({frame:{...(settings.frame??defaultFrame),diameter:Number(e.target.value)}})}><option value="23.5">EMT · 23.5 mm OD</option><option value="21.336">½-inch PVC · straight</option>{!emtCompatible(settings)&&<option value="custom">Custom OD · no matching head</option>}</select></label><label className="ps-field"><span>Frame layout</span><select aria-label="Frame direction" value={(settings.frame??defaultFrame).axis} onChange={e=>onChange({frame:{...(settings.frame??defaultFrame),axis:e.target.value as typeof defaultFrame.axis}})}><option value="vertical">Vertical posts</option><option value="horizontal">Horizontal rails</option><option value="cross">Posts + cross rails</option></select></label>
<label className="ps-field"><span>Rails per direction</span><select aria-label="Rails per direction" value={(settings.frame??defaultFrame).rails} onChange={e=>onChange({frame:{...(settings.frame??defaultFrame),rails:Number(e.target.value)}})}>{Array.from({length:8},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label>
{onShowGuides&&<label className="ps-long-teeth"><input type="checkbox" checked={showGuides} onChange={e=>onShowGuides(e.target.checked)}/> Show rail guides in Design</label>}
<details className="ps-advanced"><summary>Advanced mounting</summary><p className="ps-help">Actual two-part mounts are shown in 3D and included in STL exports. Print the derived hardware as a fit test before production.</p><label className="ps-long-teeth"><input type="checkbox" checked={settings.frame?.enabled??false} onChange={e=>onChange({frame:{...(settings.frame??defaultFrame),enabled:e.target.checked}})}/> Plan seams around frame rails</label>
{([['Rail offset (grid)','offset',-48,48,.25],['Measured pipe OD (mm)','diameter',10,60,.1],['Rear center distance (mm)','standOff',68.521,200,1]] as const).map(([label,k,min,max,step])=><label className="ps-field" key={k}><span>{label}</span><input aria-label={label} type="number" value={k==='standOff'?Math.max(68.5203,(settings.frame??defaultFrame)[k]):(settings.frame??defaultFrame)[k]} min={min} max={max} step={step} onChange={e=>onChange({frame:{...(settings.frame??defaultFrame),[k]:Math.max(min,Math.min(max,Number(e.target.value)||min))}})}/></label>)}
<p className="ps-help">Derived from your supplied base and medium head; originals stay unchanged. The head turns 90° to follow the seam. The receiving stem is relieved, the bore is adapted with 0.6 mm diametral allowance, and base mouths clear the floor. Print the fit-test hardware before a full build.</p>
   {([['Mount length along rail (mm)','length',20,100,1],['Mount width across seam (mm)','width',10,100,1],['Installation clearance (mm)','clearance',1,15,.5],['Mount spacing target (mm)','spacing',60,500,10]] as const).map(([label,k,min,max,step])=><label className="ps-field" key={k}><span>{label}</span><input aria-label={label} type="number" value={c[k]} min={min} max={max} step={step} onChange={e=>onChange({conduitClips:{...c,[k]:Math.max(min,Math.min(max,Number(e.target.value)||min))}})}/></label>)}
   <p className="ps-help">Mount footprint: at least 50 × 55 mm plus installation clearance. Rear pipe center starts at 68.52 mm; larger stand-off extends only the mounting stem. Cross rails are offset behind posts. Fixed heads are for straight pipe; curved arches still use direct ties. Check glue, tie routing and physical retention.</p>
   <p role="status" className="ps-help">{zones.length} mounting zones · {covered.size}/{layout.sections.length} sections adjacent to a zone. Seam clips and reinforced wall-tie holes avoid these zones. {ties.length} wall-tie slots remain.</p>
   {(!settings.frame?.enabled||!zones.length)&&<p role="alert" className="ps-help">No suitable mounting zones. Enable frame rails, align them with longer straight two-wall seams, or enter a smaller measured footprint. No mounts are placed across unsupported gaps.</p>}
   {unsupported.length>0&&<p className="ps-help">{unsupported.length} sections have no planned conduit-clip zone: use direct ties or additional frame supports. Zone adjacency is not proof of attachment or load capacity.</p>}
   <p className="ps-help">Only straight seam stations are proposed. Rail crossings are kept clear for fittings; confirm actual glue surfaces, head stand-off, installation and wiring access before printing.</p>
  </details></>}
  {c.mode==='none'&&<p className="ps-help">Use the reinforced wall slots to tie each section directly to straight or curved pipe.</p>}
 </section>
}
