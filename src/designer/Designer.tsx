import { lazy, Suspense, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { bounds, defaults, generate, parseProject, presets, withCount, type Point, type Settings } from './geometry'
import { download, exportHardwareTests, exportStls, exportSvg, exportStripFitTest } from './exports'
import './designer.css'
import './workflow.css'
import './holoTheme.css'
import HoloLogo from './HoloLogo'
import ConduitClipPanel from './ConduitClipPanel'
import {stripPresets,stripSpec} from './strip'
import {toothClearanceTotal} from './capSeats'
import {buildDirectTieFiles,buildPuzzleFitFiles} from './directTieExports'
import {powerInjectionPlan,injectionInterval} from './powerInjection'
import {WiringOverlay} from './WiringOverlay'
import {zipFiles} from './mesh'
import SpritePanel from './SpritePanel'
import {pumpkinSprite,cellKey} from './sprite'
import {buildPropFiles,spritePng} from './propExports'
import {framePlan} from './propPlan'
import {conduitClipPlan} from './conduitClips'
const Preview3D=lazy(()=>import('./Preview3D'))

const colors = ['#9cbd9b', '#e5b27c', '#8cb6b8', '#b7a6cc', '#d9948d', '#c4bd7f']
const saved = () => { try { const raw = localStorage.getItem('pixel-studio.v1'),s=raw?parseProject(raw):defaults;return {...s,capFit:s.capFit??'extended' as const} } catch { return {...defaults,capFit:'extended' as const} } }
export default function Designer() {
  const [settings, setSettings] = useState<Settings>(saved)
  const [materializeRequest,setMaterializeRequest]=useState(0)
  const [view, setView] = useState<'design' | 'prints' | '3d'>('design')
  const [panelOpen,setPanelOpen]=useState(true),[showFrameGuides,setShowFrameGuides]=useState(false)
  const chooseView=(next:'design'|'3d'|'prints'|'wire')=>{setWire(next==='wire');setPixelTool('inspect');setDrawing(false);setView(next==='wire'?'design':next)}

  const [threeToolbar,setThreeToolbar]=useState<HTMLDivElement|null>(null)
  const [drawing, setDrawing] = useState(false)
  const [wire, setWire] = useState(false)
  const [pixelTool,setPixelTool]=useState<'inspect'|'paint'|'erase'>('inspect')
  const [paintColor,setPaintColor]=useState('#ff8b19')
  const [artwork,setArtwork]=useState(true)
  const paintStroke=useRef<Settings|null>(null)
  const [wiringStep,setWiringStep]=useState(0)
  const [labels, setLabels] = useState(false)
  const [guideVisible, setGuideVisible] = useState(true)
  const [selected, setSelected] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [message, setMessage] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  useEffect(()=>{
    if(!exportOpen)return
    const close=(e:PointerEvent|globalThis.PointerEvent)=>{if(!(e.target as Element)?.closest('.ps-export-wrap'))setExportOpen(false)}
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setExportOpen(false)}
    document.addEventListener('pointerdown',close as EventListener);document.addEventListener('keydown',key)
    return()=>{document.removeEventListener('pointerdown',close as EventListener);document.removeEventListener('keydown',key)}
  },[exportOpen])
  const [countDraft, setCountDraft] = useState('100')
  const [history, setHistory] = useState<Settings[]>([])
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ kind: 'height' | 'width' | 'point' | 'draw'; index?: number; before: Settings } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const layout = useMemo(() => generate(settings), [settings])
  useEffect(()=>setWiringStep(n=>Math.max(0,Math.min(n,layout.wirePaths.length-1))),[layout.wirePaths.length])
  const injectionPoints=powerInjectionPlan(layout.nodes,settings,layout.wireStrings)
  const spriteColors=new Map(settings.sprite?.cells.map(c=>[cellKey(c),c.color])??[])
  const frame=framePlan(settings,layout.pixels)
  const mountZones=conduitClipPlan(layout.pixels,settings)
  const preset = presets[settings.diffuser]
  const strip=stripSpec(settings)
  const update = (patch: Partial<Settings>) => { setHistory(h => [...h.slice(-29), settings]); setSettings(s => ({ ...s, ...patch })) }
  useEffect(() => { const timeout = setTimeout(() => localStorage.setItem('pixel-studio.v1', JSON.stringify(settings)), 250); return () => clearTimeout(timeout) }, [settings])
  useEffect(() => { if (selected >= layout.sections.length) setSelected(0) }, [layout.sections.length, selected])
  useEffect(() => setCountDraft(String(settings.requestedCount)), [settings.requestedCount])
  const undo = () => { if (history.length) { setSettings(history.at(-1)!); setHistory(h => h.slice(0,-1)) } }
  const w = Math.max(1, Math.round(settings.width * 25.4 / preset.size)), h = Math.max(1, Math.round(settings.height * 25.4 / preset.size))
  const b = settings.shape==='sprite'&&settings.sprite?bounds([{x:0,y:0},{x:settings.sprite.width-1,y:settings.sprite.height-1}]):drag.current ? generate(drag.current.before).bounds : layout.bounds
  const padding = Math.max(2.5, b.width * .065)
  const vb = { x: b.minX-padding, y: b.minY-padding, w: b.width+2*padding, h: b.height+2*padding }
  const activeLink=layout.wirePaths[wiringStep]
  const activeNodeIds=activeLink?[activeLink[0],activeLink.at(-1)!].map(q=>layout.nodes.find(p=>p.x===q.x&&p.y===q.y)?.id):[]
  const wireFocus=wire&&zoom>1&&activeLink?{x:(activeLink[0].x+activeLink.at(-1)!.x)/2,y:(activeLink[0].y+activeLink.at(-1)!.y)/2}:null
  const viewBox = `${wireFocus?wireFocus.x-vb.w/zoom/2:vb.x+vb.w*(1-1/zoom)/2} ${wireFocus?wireFocus.y-vb.h/zoom/2:vb.y+vb.h*(1-1/zoom)/2} ${vb.w/zoom} ${vb.h/zoom}`
  const position = (e: PointerEvent<SVGSVGElement>): Point => {
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse())
    return { x: point.x, y: point.y }
  }
  const startDrag = (e: React.PointerEvent, kind: 'height' | 'width' | 'point', index?: number) => {
    if (drawing) return
    e.stopPropagation(); svg.current?.setPointerCapture(e.pointerId)
    drag.current = { kind, index, before: settings }
  }
  const pointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if(settings.shape==='sprite'&&pixelTool!=='inspect'&&!wire){e.currentTarget.setPointerCapture(e.pointerId);paintStroke.current=settings;paintPixel(e);return}
    if (!drawing) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = position(e)
    drag.current = { kind: 'draw', before: settings }
    setSettings(s => ({ ...s, shape: 'custom', points: [{ x: p.x/w, y: p.y/h }] }))
  }
  const pointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if(paintStroke.current){paintPixel(e);return}
    const action = drag.current; if (!action) return
    const p = position(e)
    if (action.kind === 'height') setSettings(s => ({ ...s, height: Math.max(1, Math.min(180, -p.y*preset.size/25.4)) }))
    if (action.kind === 'width') setSettings(s => ({ ...s, width: Math.max(2, Math.min(180, p.x*preset.size/25.4)) }))
    if (action.kind === 'point') setSettings(s => ({ ...s, points: s.points.map((q,i) => i === action.index ? { x: Math.max(-.3, Math.min(1.3,p.x/w)), y: Math.max(-1.5, Math.min(.3,p.y/h)) } : q) }))
    if (action.kind === 'draw') setSettings(s => {
      const previous = s.points.at(-1)!, next = { x: Math.max(-.3,Math.min(1.3,p.x/w)), y: Math.max(-1.5,Math.min(.3,p.y/h)) }
      return Math.hypot((next.x-previous.x)*w,(next.y-previous.y)*h) > .6 && s.points.length < 400 ? { ...s, points: [...s.points,next] } : s
    })
  }
  const paintPixel=(e:PointerEvent<SVGSVGElement>)=>{
    const p=position(e),x=Math.round(p.x),y=Math.round(p.y)
    setSettings(s=>{const grid=s.sprite;if(!grid||x<0||y<0||x>=grid.width||y>=grid.height)return s
      const old=grid.cells.find(c=>c.x===x&&c.y===y)
      if(pixelTool==='erase'&&!old||pixelTool==='paint'&&old?.color===paintColor)return s
      const cells=grid.cells.filter(c=>c.x!==x||c.y!==y);if(pixelTool==='paint')cells.push({x,y,color:paintColor})
      return {...s,sprite:{...grid,cells}}
    })
  }
  const pointerUp = () => {if(paintStroke.current){const before=paintStroke.current;setHistory(h=>[...h.slice(-29),before]);paintStroke.current=null;return} const action = drag.current; if (action) { setHistory(prev => [...prev.slice(-29), action.before]); if (action.kind === 'draw') setDrawing(false); drag.current = null; setSettings(s => ({ ...s })) } }
  const chooseCount = (value: number) => { const n = Math.max(3,Math.min(999,Math.round(value))); setHistory(prev => [...prev.slice(-29),settings]); setSettings(withCount(settings,n)) }
  const numberField = (label: string, key: 'width' | 'height', suffix: string) => <label className="ps-field"><span>{label}</span><div><input aria-label={label} type="number" step=".5" min="1" max="180" value={Number(settings[key].toFixed(2))} onChange={e => update({ [key]: Math.max(1,Math.min(180,Number(e.target.value)||1)) })}/><em>{suffix}</em></div></label>
  const importProject = async (f?: File) => { if (!f) return; try { const next = parseProject(await f.text()); update(next); setMessage('Project loaded'); setZoom(1) } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read this project') } }
  const reset = () => { update(defaults); setZoom(1); setView('design'); setMessage('Starting arch restored') }
  const exportParts = async () => {
    setExporting(true); setExportOpen(false)
    try { await exportStls(settings); setMessage('Protective trays with integral zip-tie slots and merged seam diffusers downloaded. Read WALL_TIES.txt; print a short PETG test first.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not export parts. Please try again.') }
    finally { setExporting(false) }
  }
  const exportBlueprint=async()=>{
    setExporting(true);setExportOpen(false)
    try{const files=buildPropFiles(settings);if(settings.shape==='sprite')files.push({name:'artwork.png',bytes:await spritePng(settings.sprite!)});const bytes=zipFiles(files),url=URL.createObjectURL(new Blob([bytes.slice().buffer],{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download='holomatrix-px-xlights-blueprint.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('xLights blueprint downloaded: model, artwork, node map, separate strings and frame plan. Read XLIGHTS_README.txt.')}
    catch(e){setMessage(e instanceof Error?e.message:'Blueprint export failed.')}
    finally{setExporting(false)}
  }
  const exportFitTests=async()=>{
    setExporting(true);setExportOpen(false);setMessage('Preparing PETG joint / separate-pin coupons and your original PVC clip…')
    try{await exportHardwareTests();setMessage('Joint / pin fit-test ZIP downloaded. These are coupons only; a PETG fit test is needed before arch integration. The PVC clip is unchanged.')}
    catch(error){setMessage(error instanceof Error?error.message:'Could not export hardware fit tests.')}
    finally{setExporting(false)}
  }
  const exportStripSample=async()=>{
    setExporting(true);setExportOpen(false)
    try{await exportStripFitTest(settings);setMessage('Strip fit sample downloaded: print one two-cell backer and two matching caps. Measurements and allowance match your current selection.')}
    catch(error){setMessage(error instanceof Error?error.message:'Could not export the strip fit sample.')}
    finally{setExporting(false)}
  }
  const exportPlateSample=async()=>{
    setExporting(true);setExportOpen(false)
    try{
      const bytes=zipFiles(await (settings.shape==='sprite'?buildPuzzleFitFiles(settings):buildDirectTieFiles(settings,true))),url=URL.createObjectURL(new Blob([bytes.slice().buffer],{type:'application/zip'})),a=document.createElement('a')
      a.href=url;a.download=settings.shape==='sprite'?'holomatrix-px-puzzle-fit-test.zip':'holomatrix-px-wall-tie-fit-test.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
      setMessage(settings.shape==='sprite'?'Two short two-row puzzle trays downloaded. Test floor flatness, joint clearance, cap seats and seam bridges at 100% in PETG.':'Two short trays with reinforced wall tie slots and a merged diffuser downloaded. Test actual PVC and cable clearance at 100% in PETG.')
    }
    catch(error){setMessage(error instanceof Error?error.message:'Could not export the wall-tie fit sample.')}
    finally{setExporting(false)}
  }
  const printSection = layout.sections[selected] ?? []
  const sectionBounds = bounds(printSection)
  const bed = settings.bed
  const cx = (sectionBounds.minX+sectionBounds.maxX)/2, cy = (sectionBounds.minY+sectionBounds.maxY)/2

  return <div className={'ps-app ps-workflow '+(!panelOpen?'ps-panel-collapsed':'')}>
    <header className="ps-header"><a className="ps-brand" href={`${import.meta.env.BASE_URL}${import.meta.env.VITE_PAGES==='true'?'':'designer'}`}><span className="ps-logo"><HoloLogo/></span><span className="ps-brand-name">holomatrix-px<em>Lawnchair Labs</em><small>From pixels to props, automagically.</small></span></a><button className="ps-panel-toggle" aria-label={panelOpen?'Hide setup controls':'Show setup controls'} aria-expanded={panelOpen} onClick={()=>setPanelOpen(v=>!v)}>{panelOpen?'‹ Hide controls':'☰ Setup'}</button><div className="ps-view-tabs" aria-label="Workspace views"><button aria-pressed={view==='design'&&!wire} className={view==='design'&&!wire?'active':''} onClick={()=>chooseView('design')}>Pattern Matrix</button><button aria-pressed={view==='3d'} className={view==='3d'?'active':''} onClick={()=>chooseView('3d')}>Holo Preview</button><button aria-pressed={wire} className={wire?'active':''} onClick={()=>chooseView('wire')}>Wiring</button><button aria-pressed={view==='prints'} className={view==='prints'?'active':''} onClick={()=>chooseView('prints')}>Replicator Output <span>{layout.sections.length}</span></button></div><button className="ps-materialize" title="Generate or replay the 3D assembly · dimensions unchanged" onClick={()=>{chooseView('3d');setMaterializeRequest(n=>n+1)}}>✦ Materialize</button><div className="ps-three-toolbar-slot" ref={setThreeToolbar} hidden={view!=='3d'}/><div className="ps-canvas-tools" hidden={view!=='design'}><button title="Undo" disabled={!history.length} onClick={undo}>↶</button><button hidden={settings.shape!=='sprite'||wire} className={artwork?'active':''} onClick={()=>setArtwork(!artwork)}>Artwork</button><button hidden={wire} className={labels?'active':''} onClick={() => setLabels(!labels)}>Numbers</button></div><input className="ps-header-project" aria-label="Project name" value={settings.name} onChange={e=>update({name:e.target.value})}/><div className="ps-header-actions"><div className="ps-export-wrap"><button aria-expanded={exportOpen} aria-haspopup="menu" onClick={() => setExportOpen(!exportOpen)}>File ▾</button>{exportOpen && <div className="ps-export-menu"><button onClick={() => {file.current?.click();setExportOpen(false)}}>Open project</button><button onClick={() => {download('my-prop.holomatrix-px.json',JSON.stringify(settings,null,2),'application/json');setExportOpen(false)}}>Save project</button><hr/><button disabled={exporting||!layout.nodes.length||!layout.wiringComplete} onClick={()=>{void exportBlueprint()}}>xLights + artwork blueprint<small>.xmodel · PNG / BMP · wiring · frame plan</small></button><button onClick={() => { exportSvg(settings); setExportOpen(false) }}>Dimensioned SVG layout<small>Full size · numbered pixels</small></button><button disabled={exporting || !layout.printable || (!layout.connected&&settings.shape!=='sprite')} onClick={() => { void exportParts() }}>Trays + wall ties + diffuser STLs<small>ZIP · print parts + xLights blueprint</small></button><button disabled={exporting} onClick={()=>{void exportPlateSample()}}>{settings.shape==='sprite'?'Puzzle section fit sample':'Wall-tie fit sample'}<small>2 short trays + seam clips + merged cap</small></button><details className="ps-advanced"><summary>Legacy test coupons</summary><button disabled={exporting} onClick={()=>{void exportFitTests()}}>Legacy joint + pin fit-test ZIP<small>Earlier R2 experiments · not used by direct ties</small></button></details></div>}</div></div><input ref={file} hidden type="file" accept=".json" onChange={e => { void importProject(e.target.files?.[0]); e.target.value='' }}/></header>
    <aside className="ps-sidebar" hidden={!panelOpen} aria-label="Prop setup"><button className="ps-mobile-close" aria-label="Close setup controls" onClick={()=>setPanelOpen(false)}>Close setup ×</button><div className="ps-inspector-heading"><b>{view==='3d'?'Inspect & support':view==='prints'?'Fabrication Settings':wire?'Wiring & power':'Pattern configuration'}</b></div><div className="ps-step-body">
      <section hidden={view!=='design'||wire}><h2>What are you building?</h2><div className="ps-shapes">{(['arch','line','custom','sprite'] as const).map(shape => <button key={shape} className={settings.shape === shape ? 'active':''} onClick={() => { update(shape==='sprite'?{shape,lighting:'bullet',sprite:settings.sprite??pumpkinSprite()}:{ shape }); setDrawing(false); setZoom(1) }}><i>{shape==='arch'?'⌒':shape==='line'?'━':shape==='sprite'?'▦':'〰'}</i>{shape==='custom'?'Draw':shape==='arch'?'Arch':shape==='sprite'?'Props':'Line'}</button>)}</div>{settings.shape==='custom' && <button className={'ps-draw-button '+(drawing?'active':'')} onClick={() => { setDrawing(!drawing); setView('design'); setZoom(1) }}>{drawing?'Cancel drawing':'✎ Draw a new path'}</button>}{settings.shape==='sprite'?<SpritePanel settings={settings} layout={layout} onChange={update} onMessage={setMessage} tool={pixelTool} setTool={setPixelTool} color={paintColor} setColor={setPaintColor}/>:<></>}</section>
      <section hidden={view!=='design'}>
        <h2>{wire?'Follow the wire':settings.shape==='sprite'?'Lights & physical size':settings.shape==='arch'?'Arch dimensions & lights':settings.shape==='line'?'Line dimensions & lights':'Path dimensions & lights'}</h2>{wire&&settings.shape==='sprite'&&<label className="ps-field"><span>Wiring style</span><select aria-label="Wiring style" value={settings.spriteWiring??'rows'} onChange={e=>update({spriteWiring:e.target.value as 'rows'|'compact'})}><option value="rows">Row by row · easy to follow</option><option value="compact">Compact · fewer feeds, more turns</option></select><p className="ps-help">Rows stay horizontal. Each orange Feed needs its own data connection; no wires are drawn across empty gaps.</p></label>}<div hidden={wire}>
        {settings.shape!=='sprite'?<><div className="ps-two-fields">{numberField(settings.shape==='line'?'Length':'Span','width','in')}{settings.shape!=='line' && numberField('Rise','height','in')}</div><p className="ps-help">Drag the orange handles, or enter dimensions. The grid finds the closest touching layout.</p></>:<p className="ps-task-note">{settings.sprite?.width} × {settings.sprite?.height} artwork grid · {(layout.widthMm/25.4).toFixed(1)} × {(layout.heightMm/25.4).toFixed(1)} in. Size follows the diffuser pitch. Use Generate or resize artwork above to change the grid.</p>}
        <label className="ps-field" hidden={settings.shape==='sprite'}><span>Lighting</span><select disabled={settings.shape==='sprite'} aria-label="Lighting" value={settings.lighting??'bullet'} onChange={e=>update(e.target.value==='strip'?{lighting:'strip',diffuser:'house'}:{lighting:'bullet'})}><option value="bullet">12 mm bullet pixels</option><option value="strip">LED strip · 30 LEDs/m</option></select></label>
        {settings.lighting==='strip'&&<>
          <label className="ps-field"><span>Strip covering</span><select aria-label="Strip covering" value={settings.stripType??'ip30'} onChange={e=>{const type=e.target.value as keyof typeof stripPresets;update({stripType:type,stripWidth:stripPresets[type].width,stripThickness:stripPresets[type].thickness})}}>{Object.entries(stripPresets).map(([key,p])=><option key={key} value={key}>{p.label}</option>)}</select></label>
          <p className="ps-help">Channel: {strip.channelWidth.toFixed(2)} mm wide · {strip.clearance.toFixed(2)} mm total fit allowance. Product-image sizes are starting points; measure your strip.</p>
          <p className="ps-help">This choice updates the backer channel and the cap’s strip passages together. Outside cap size stays 33 × 33 mm. The preview and STL export use the same fit measurements.</p>
          <button disabled={exporting||strip.channelWidth>14} onClick={()=>{void exportStripSample()}}>Download strip fit sample</button>
          {strip.channelWidth>14&&<p role="alert" className="ps-help">Channel exceeds 14 mm and would leave thin diffuser feet. Export will stop; reduce width/allowance or redesign the cap.</p>}
          <details><summary>Strip fit measurements</summary>{([['Strip width','stripWidth',strip.width,5,16],['Strip thickness','stripThickness',strip.thickness,.5,6],['Fit allowance (total)','stripClearance',strip.clearance,.05,1],['LED center pitch','stripPitch',strip.pitch,25,40]] as const).map(([label,key,value,min,max])=><label className="ps-field" key={key}><span>{label}</span><div><input aria-label={label} type="number" step=".05" min={min} max={max} value={Number(value.toFixed(3))} onChange={e=>update({[key]:Math.max(min,Math.min(max,Number(e.target.value)||min))})}/><em>mm</em></div></label>)}</details>
          <p className="ps-help">33 mm diffusers stay touching. Your {strip.pitch.toFixed(2)} mm LED pitch may drift from their centers. Channels are horizontal runs; stair corners need cut-and-wire joins at the strip’s marked cut points. LEDs may share one address.</p>
        </>}
        {settings.shape==='sprite'&&<><label className="ps-long-teeth"><input type="checkbox" checked={settings.solidDarkBorder??false} onChange={e=>update({solidDarkBorder:e.target.checked})}/> Solid dark outer border · no LEDs</label><p className="ps-help">Optional: near-black cells connected to the outside keep their plastic but lose the pixel hole and node. Enclosed dark face cells keep LEDs for animation. Print border caps in opaque black. Turn off to light every occupied cell.</p></>}<label className="ps-field"><span>Your diffuser</span><select disabled={settings.lighting==='strip'} value={settings.diffuser} onChange={e => update({ diffuser: e.target.value as Settings['diffuser'] })}><option value="house">House lights · 33 mm</option><option value="mario">Mario · 25.08 mm</option></select></label>
        <div className="ps-diffuser-note"><span>▧</span><div><b>{preset.size} × {preset.size} mm</b><small>22 mm deep · original cap size</small></div></div>
        <details className="ps-advanced"><summary>Advanced diffuser fit</summary><label className="ps-long-teeth"><input type="checkbox" checked={settings.capFit==='extended'} onChange={e=>update({capFit:e.target.checked?'extended':'original'})}/> Longer seating teeth</label>
        {settings.capFit==='extended'&&<label className="ps-field"><span>Tooth fit clearance <small>total, not per side</small></span><div><input aria-label="Tooth fit clearance" type="number" min=".1" max="1" step=".05" value={toothClearanceTotal(settings)} onChange={e=>update({toothClearance:Math.max(.1,Math.min(1,Number(e.target.value)||.3))})}/><em>mm</em></div><p className="ps-help">{(toothClearanceTotal(settings)/2).toFixed(2)} mm on each side. Slots enlarged; tooth length and thickness stay unchanged. Test before printing the whole prop.</p></label>}
        <p className="ps-help">{settings.capFit==='extended'?'3.5 mm teeth pass through the flat 2.1 mm floor; about 1.4 mm projects into the cable cavity. Merged seam diffusers align joints; zip ties transfer each section’s weight to PVC. Test PETG fit.':'Flat 2.1 mm floor · original cap feet with shallow 0.9 mm seating. Use this for caps you already printed.'}</p>
</details>
{settings.shape!=='sprite'&&<div className="ps-row-control"><label htmlFor="row-count">Rows</label><div><button aria-label="Remove row" disabled={settings.rows===1} onClick={() => update({ rows: settings.rows-1 })}>−</button><output id="row-count">{settings.rows}</output><button aria-label="Add row" disabled={settings.rows===8} onClick={() => update({ rows: settings.rows+1 })}>+</button></div></div>}
        {settings.rows>1&&settings.shape!=='sprite'&&<p className="ps-help">Rows stay distinct grid lanes: two stays two, three stays three. Stair corners can have narrower full-edge connections; PVC provides the continuous support.</p>}
        </div>{wire&&<p className="ps-help">Follow the solid arrows from numbered point to numbered point. Each light is visited once. {settings.shape==='sprite'&&(settings.spriteWiring??'rows')==='rows'?'Finish each horizontal row, then follow the turn behind the cells to the next row.':'Diagonal links stay inside filled 2 × 2 blocks.'} The orange shape guide is hidden while wiring.</p>}
        {wire&&<div aria-label="Wiring connection navigator"><div className="ps-row-control"><button aria-label="Previous wire connection" disabled={wiringStep===0} onClick={()=>setWiringStep(n=>n-1)}>←</button><label className="ps-field"><span>Connection</span><input aria-label="Wire connection" type="number" min="1" max={Math.max(1,layout.wirePaths.length)} value={wiringStep+1} onChange={e=>setWiringStep(Math.max(0,Math.min(layout.wirePaths.length-1,Number(e.target.value)-1||0)))}/></label><button aria-label="Next wire connection" disabled={wiringStep>=layout.wirePaths.length-1} onClick={()=>setWiringStep(n=>n+1)}>→</button></div><p className="ps-help">{layout.wirePaths.length?`Highlighted: #${activeNodeIds[0]} → #${activeNodeIds[1]}. Click any line to select it. Zoom in to read the numbered points.`:'No solved connections.'}</p></div>}
        {wire&&!layout.wiringComplete&&<p className="ps-warning" role="alert">No complete non-crossing wiring path found. Only the solved portion is shown; remaining points are not connected. Change the shape or use separate strings. Wired assembly export is blocked.</p>}
        {wire&&settings.shape==='sprite'&&<p className="ps-help">{layout.wireStrings.length} separate data strings. Each orange Feed starts a new string / controller port. No connecting line across empty gaps. This conservative route is not a minimum-port guarantee.</p>}
{!wire&&settings.shape!=='sprite'&&<label className="ps-field"><span>Target pixels <small>resizes the shape</small></span><input type="number" min="3" max="999" value={countDraft} onChange={e => setCountDraft(e.target.value)} onBlur={() => chooseCount(Number(countDraft)||3)} onKeyDown={e => { if(e.key==='Enter')e.currentTarget.blur() }} aria-label="Target pixels"/></label>}
        <p className="ps-help">Actual: <b>{layout.nodes.length} lights</b>. {settings.shape==='sprite'?(settings.solidDarkBorder?`${layout.pixels.length-layout.nodes.length} solid outer-border cells · interior dark cells keep LEDs.`:'Every occupied cell keeps an LED. Solid dark outer border is optional.'):'Press Enter to apply a target count. Diffusers share full edges; shared row cells use one light.'}</p>
      </section>
      {view==='design'&&wire&&<section aria-label="Power injection planning"><h2>Power injection · estimate</h2><label className="ps-field"><span>Pixel / strip voltage</span><select aria-label="Pixel voltage" value={settings.pixelVoltage??5} onChange={e=>update({pixelVoltage:Number(e.target.value) as 5|12,injectionEvery:undefined})}><option value="5">5 V</option><option value="12">12 V</option></select></label><label className="ps-field"><span>Inject every</span><div><input aria-label="Injection interval" type="number" min="1" max="1000" value={injectionInterval(settings)} onChange={e=>update({injectionEvery:Math.max(1,Math.min(1000,Math.round(Number(e.target.value)||1)))})}/><em>LEDs</em></div></label><details className="ps-advanced"><summary>Power planning guidance</summary><p className="ps-help">Orange: initial feed · red: injection after the labeled LED count, in wiring order. Starting estimates: 5 V / 50 LEDs; 12 V / 100 LEDs. Not a voltage-drop or fuse calculation. Strip groups may contain multiple LEDs per address. Verify actual load, brightness, wire length/gauge, connectors and far-end voltage. Fuse power branches appropriately; never parallel separate supply positive outputs.</p><p className="ps-help">{injectionPoints.map(p=>`${p.kind==='feed'?'Feed':'Inject'} at #${p.pixel.id}`).join(' · ')}. <a href="https://kno.wled.ge/advanced/wiring/" target="_blank" rel="noreferrer">WLED wiring guidance</a></p></details></section>}
      <section hidden={view!=='prints'}><h2>Review & print</h2><label className="ps-field"><span>Print bed</span><select aria-label="Printer bed preset" value={bed.shape==='circle'&&bed.width===290?'v400':bed.shape} onChange={e => update({ bed: { ...bed, shape: e.target.value==='rectangle'?'rectangle':'circle', width:e.target.value==='v400'?290:bed.width, depth:e.target.value==='v400'?290:bed.depth } })}><option value="v400">V400 · 290 mm circle</option><option value="circle">Custom circle</option><option value="rectangle">Custom rectangle</option></select></label><details className="ps-advanced"><summary>Custom bed & clearance</summary><div className="ps-two-fields"><label className="ps-field"><span>{bed.shape==='circle'?'Diameter':'Width'}</span><div><input type="number" min="50" max="1000" aria-label="Bed width" value={bed.width} onChange={e => update({ bed:{ ...bed,width:Math.max(50,Math.min(1000,Number(e.target.value)||50)) } })}/><em>mm</em></div></label>{bed.shape==='rectangle' && <label className="ps-field"><span>Depth</span><div><input type="number" min="50" max="1000" value={bed.depth} aria-label="Bed depth" onChange={e => update({ bed:{ ...bed,depth:Math.max(50,Math.min(1000,Number(e.target.value)||50)) } })}/><em>mm</em></div></label>}</div><label className="ps-field"><span>Edge clearance</span><div><input type="number" min="0" max="100" value={bed.margin} aria-label="Edge clearance" onChange={e => update({ bed:{ ...bed,margin:Math.max(0,Math.min(100,Number(e.target.value)||0)) } })}/><em>mm</em></div></label><p className="ps-help">Sections split automatically. An extra 6 mm per side is reserved for connections. Merged seam diffusers are checked against the bed separately.</p></details><p className="ps-task-note">{layout.sections.length} print sections · {layout.printable?'Fits your bed':'Some parts do not fit'}. Print a small fit sample before the full build.</p><button className="ps-wide-button" disabled={exporting} onClick={()=>void exportPlateSample()}>Download fit sample</button>{settings.shape==='sprite'&&<details className="ps-advanced"><summary>Advanced section joints</summary><SpritePanel panel="joints" settings={settings} layout={layout} onChange={update} onMessage={setMessage} tool={pixelTool} setTool={setPixelTool} color={paintColor} setColor={setPaintColor}/></details>}<details className="ps-advanced"><summary>Project tools</summary><button className="ps-reset" onClick={reset}>Reset to starting arch</button><a className="ps-planner-link" href="/">Open holiday-light planner ↗</a></details></section>
      <section hidden={view!=='3d'}><h2>Mount & support</h2>{settings.shape==='sprite'?<ConduitClipPanel settings={settings} layout={layout} onChange={update} showGuides={showFrameGuides} onShowGuides={setShowFrameGuides}/>:<p className="ps-task-note">Tie each section directly to the PVC backbone using the reinforced wall slots. Seam bridges and merged diffusers align the pieces; PVC carries their weight.</p>}</section>
      </div>
    </aside>
    <main className="ps-main">
      <div className="ps-layout-summary" hidden={view==='3d'} style={view==='prints'?{bottom:88}:undefined} role="group" aria-label="Layout summary"><span><b>{layout.nodes.length}</b> lights</span><span><b>{(layout.widthMm/25.4).toFixed(1)} × {(layout.heightMm/25.4).toFixed(1)}</b> in</span><span><b>{layout.sections.length}</b> sections</span><span className={layout.printable&&(layout.connected||settings.shape==='sprite')?'ps-good':'ps-warning'}>{layout.printable&&(layout.connected||settings.shape==='sprite')?'✓ Fits bed':!layout.connected?'⚠ Disconnected drawing':'⚠ Increase bed size'}</span>{wire&&<span>Longest wire hop: {layout.maxWireSpan.toFixed(0)} mm</span>}</div>

      <div className="ps-canvas">
      {view==='3d'?<Suspense fallback={<p>Materializing Holo Preview…</p>}><Preview3D settings={settings} layout={layout} selected={selected} onSelect={setSelected} toolbarTarget={threeToolbar} showFrameGuides={showFrameGuides} materializeRequest={materializeRequest}/></Suspense>:view==='design' ? <svg ref={svg} className={'ps-design-svg '+(drawing||settings.shape==='sprite'&&pixelTool!=='inspect'?'drawing':'')} viewBox={viewBox} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-label="Interactive pixel prop canvas" role="img"><defs><pattern id="ps-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dca74e" strokeOpacity=".22" strokeWidth=".018"/></pattern></defs><rect x={vb.x-100} y={vb.y-100} width={vb.w+200} height={vb.h+200} fill="url(#ps-grid)"/>
        {settings.shape==='sprite'&&settings.sprite&&<rect x={-.5} y={-.5} width={settings.sprite.width} height={settings.sprite.height} fill="none" stroke="#9aab95" strokeWidth=".05" strokeDasharray=".2 .15" pointerEvents="none"/>}
        {layout.pixels.map(p => <g key={`${p.x},${p.y}`} onClick={() => { setSelected(p.section); setMessage(`Section ${p.section+1} · pixel ${p.id} · row ${p.row+1}`) }}><rect x={p.x-.5} y={p.y-.5} width="1" height="1" rx=".025" fill={p.led===false&&wire?'#292533':settings.shape==='sprite'&&artwork&&!wire?spriteColors.get(cellKey(p))??'#ffffff':colors[p.section%colors.length]} stroke="#ffffff" strokeWidth=".045"/><rect x={p.x-.37} y={p.y-.37} width=".74" height=".74" rx=".02" fill="none" stroke="#ffffff" strokeOpacity=".25" strokeWidth=".025"/>{labels&&!wire&&p.led!==false && <text x={p.x} y={p.y+.1} textAnchor="middle" fill="#20382e" fontSize=".3">{p.id}</text>}</g>)}
        {settings.shape==='sprite'&&showFrameGuides&&!wire&&frame.map(r=><g key={r.id} pointerEvents="none"><line x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y} stroke="#577d93" strokeWidth=".1" strokeDasharray=".2 .1"/><text x={r.a.x+.2} y={r.a.y-.2} fontSize=".3" fill="#395d74">Rail {r.id} · rear</text></g>)}
        {showFrameGuides&&!wire&&mountZones.map(z=><g key={z.id} pointerEvents="none"><rect x={z.x-z.width/preset.size/2} y={z.y-z.height/preset.size/2} width={z.width/preset.size} height={z.height/preset.size} fill="#e79b26" fillOpacity=".15" stroke="#9b5712" strokeWidth=".07" strokeDasharray=".15 .08"/><text x={z.x} y={z.y+.1} textAnchor="middle" fontSize=".3" fill="#593509">EMT {z.id} · reserved</text></g>)}
        {wire&&<WiringOverlay paths={layout.wirePaths} pixels={layout.nodes} strings={layout.wireStrings} settings={settings} active={wiringStep} onPick={setWiringStep}/>}
        {settings.shape!=='sprite' && guideVisible && !drawing && !wire && <polyline points={layout.center.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#ec793c" strokeWidth=".04" strokeDasharray=".2 .18" pointerEvents="none"/>}
        {settings.shape!=='sprite' && !drawing && !wire && (settings.shape==='custom' ? settings.points.map((p,i)=><circle key={i} cx={p.x*w} cy={p.y*h} r=".2" className="ps-handle" onPointerDown={e=>startDrag(e,'point',i)}/>) : <><circle cx={w} cy="0" r=".3" className="ps-handle" onPointerDown={e=>startDrag(e,'width')}/>{settings.shape==='arch' && <circle cx={w/2} cy={-h} r=".3" className="ps-handle" onPointerDown={e=>startDrag(e,'height')}/>}</>)}
      </svg> : <svg className="ps-bed-svg" viewBox={`${-bed.width/2-20} ${-(bed.shape==='circle'?bed.width:bed.depth)/2-20} ${bed.width+40} ${(bed.shape==='circle'?bed.width:bed.depth)+40}`} role="img" aria-label="Printer bed fit preview"><defs><pattern id="bed-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="#d6ddd4" strokeWidth=".4"/></pattern></defs>{bed.shape==='circle'?<><circle r={bed.width/2} fill="#e4e9e0" stroke="#a3afa0" strokeWidth="1"/><circle r={Math.max(0,bed.width/2-bed.margin)} fill="url(#bed-grid)" stroke="#a3afa0" strokeDasharray="3 3"/></>:<><rect x={-bed.width/2} y={-bed.depth/2} width={bed.width} height={bed.depth} fill="url(#bed-grid)" stroke="#a3afa0"/><rect x={-bed.width/2+bed.margin} y={-bed.depth/2+bed.margin} width={Math.max(0,bed.width-bed.margin*2)} height={Math.max(0,bed.depth-bed.margin*2)} fill="none" stroke="#a3afa0" strokeDasharray="3 3"/></>}{printSection.map(p=><g key={p.id}><rect x={(p.x-cx-.5)*preset.size} y={(p.y-cy-.5)*preset.size} width={preset.size} height={preset.size} fill={colors[selected%colors.length]} stroke="white"/><circle cx={(p.x-cx)*preset.size} cy={(p.y-cy)*preset.size} r={p.led===false?0:6.2} fill="#f2f4ef" stroke="#64785d" strokeWidth=".7"/><text x={(p.x-cx)*preset.size} y={(p.y-cy)*preset.size+preset.size*.36} fontSize="4" textAnchor="middle" fill="#304032">{p.led===false?'Solid':p.id}</text></g>)}</svg>}
      <div className="ps-canvas-bottom" style={view==='3d'?{display:'none'}:undefined}><span className="ps-key"><i/> {view==='design'&&!wire&&settings.shape==='sprite'&&artwork?'Artwork colors':'Section colors'} · {preset.size} mm grid</span>{view==='design' && <div className="ps-zoom"><button onClick={()=>setZoom(z=>Math.max(.5,z-.25))} aria-label="Zoom out">−</button><button onClick={()=>setZoom(1)}>Fit</button><button onClick={()=>setZoom(z=>Math.min(4,z+.25))} aria-label="Zoom in">+</button><button hidden={settings.shape==='sprite'} className={guideVisible?'active':''} onClick={()=>setGuideVisible(!guideVisible)}>Guide</button></div>}</div>{drawing && <div className="ps-drawing-hint">Draw your path across the canvas. Release to snap it to the grid.</div>}
      </div>
      {view==='prints' && <div className="ps-section-strip">{layout.sections.map((section,i)=><button key={i} className={selected===i?'active':''} onClick={()=>setSelected(i)}><i style={{background:colors[i%colors.length]}}/>{String(i+1).padStart(2,'0')}<small>{section.length} px</small></button>)}</div>}
      {message && <div className="ps-toast" role="status">{message}<button onClick={()=>setMessage('')} aria-label="Dismiss">×</button></div>}
    </main>
  </div>
}
