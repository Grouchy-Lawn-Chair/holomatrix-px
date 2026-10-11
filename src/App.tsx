import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tldraw, createShapeId, type Editor, type TLShapeId } from 'tldraw'
import 'tldraw/tldraw.css'
import { blankProject, makeController, makeProp, makePsu } from './hardware'
import { applyFppImport, importXlights } from './importers'
import { calculateConnection, formatCableParts, pointFor, recalculateProject } from './engine'
import { HOLIDAY_SHAPE_TYPE, createBoundArrow, holidayShapeUtils, type HolidayShape } from './shapes'
import { DEFAULT_SETTINGS, type Connection, type Equipment, type HolidayProject, type ViewMode } from './types'
import './styles.css'

const STORAGE_KEY = 'glowplan.project.v4'
const LEGACY_STORAGE_KEYS = ['glowplan.project.v3', 'glowplan.project.v2', 'glowplan.project.v1']
type AppView = ViewMode | 'wires' | 'setup'

function loadSaved(): HolidayProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as HolidayProject
      return recalculateProject({ ...saved, settings: { ...DEFAULT_SETTINGS, ...saved.settings } })
    }
  } catch { /* start clean if a previous development schema is stale */ }
  return blankProject()
}

export default function App() {
  const [project, setProject] = useState<HolidayProject>(loadSaved)
  const [view, setView] = useState<AppView>('yard')
  const [panel, setPanel] = useState<'project' | 'hardware' | 'validation'>('project')
  const [status, setStatus] = useState('Saved locally')
  const editorRef = useRef<Editor | null>(null)
  const projectRef = useRef(project)
  projectRef.current = project

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return
    const raw = LEGACY_STORAGE_KEYS.map(key => localStorage.getItem(key)).find(Boolean)
    if (!raw) return
    try {
      const legacy = JSON.parse(raw) as Omit<HolidayProject, 'version'> & { version?: number }
      const identity = `${legacy.name} ${legacy.imports?.map(item => item.source).join(' ')}`.toLowerCase()
      const season = identity.includes('christmas') ? 'Christmas' : identity.includes('halloween') ? 'Halloween' : null
      if (season) {
        void loadBundledProject(season).then(imported => {
          setProject(imported)
          setView('yard')
          setStatus(`Updated ${season} import to the corrected port topology`)
        })
      } else {
        setProject(recalculateProject({ ...legacy, version: 4 } as HolidayProject))
        setStatus('Updated saved project data')
      }
    } catch { /* an unreadable development cache should not block the app */ }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
      setStatus(`Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [project])

  useEffect(() => {
    const connect = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<{ fromId: string; toId: string; port: string; fromShapeId: TLShapeId; toShapeId: TLShapeId }>
      const { fromId, toId, port, fromShapeId, toShapeId } = event.detail
      const current = projectRef.current
      const source = current.equipment.find(item => item.id === fromId)
      const target = current.equipment.find(item => item.id === toId)
      if (!source || !target) return
      const route = [pointFor(source, 'yard'), pointFor(target, 'yard')]
      const connection = calculateConnection({
        id: crypto.randomUUID(), fromId, fromPort: port, toId, kind: 'data', segment: target.xlights?.LayoutGroup || target.name, route,
      }, target, current.settings)
      setProject(value => recalculateProject({ ...value, connections: [...value.connections.filter(c => !(c.fromId === fromId && c.fromPort === port)), connection] }))
      const label = current.settings.isScaleCalibrated ? `${port} · ${connection.distanceFt.toFixed(0)} ft` : port
      if (editorRef.current) createBoundArrow(editorRef.current, fromShapeId, toShapeId, label, false, connectorAnchor(source, port), connectorAnchor(target, '', false))
      setStatus(`${port} connected to ${target.name}`)
    }
    window.addEventListener('glowplan:connect', connect)
    return () => window.removeEventListener('glowplan:connect', connect)
  }, [])

  const onCanvasMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    if (editor.getCurrentPageShapeIds().size > 0) return
    const current = projectRef.current
    const mode = (view === 'blueprint' ? 'blueprint' : 'yard') as ViewMode
    const shapeIds = new Map<string, TLShapeId>()
    const visibleEquipment = mode === 'yard' ? current.equipment.filter(item => item.kind === 'prop') : current.equipment
    editor.createShapes(visibleEquipment.map(item => {
      const layout = item.layout[mode]
      const id = createShapeId()
      shapeIds.set(item.id, id)
      const warnings = current.connections.filter(c => c.toId === item.id).reduce((count, c) => count + c.warnings.length, 0)
      return {
        id, type: HOLIDAY_SHAPE_TYPE, x: layout.x, y: layout.y,
        props: {
          w: layout.w, h: layout.h, objectId: item.id, kind: item.kind, label: item.name,
          subtitle: subtitle(item), pixelCount: item.pixelCount ?? 0, ports: item.ports?.join(',') ?? '', warningCount: warnings,
          displayType: item.model ?? 'Model', viewMode: mode, geometryData: item.xlights?.PreviewGeometry ?? '',
        },
      }
    }))
    const equipmentById = new Map(current.equipment.map(item => [item.id, item]))
    if (mode === 'blueprint') current.connections.forEach(connection => {
      const from = shapeIds.get(connection.fromId)
      const to = shapeIds.get(connection.toId)
      const sourceItem = equipmentById.get(connection.fromId)
      const targetItem = equipmentById.get(connection.toId)
      const emphasized = sourceItem?.kind === 'controller' || (mode === 'blueprint' && sourceItem?.kind === 'receiver')
      if (from && to && sourceItem && targetItem) createBoundArrow(
        editor, from, to, '', !emphasized,
        connectorAnchor(sourceItem, connection.fromPort), connectorAnchor(targetItem, '', false),
      )
    })
    if (current.equipment.length) window.setTimeout(() => {
      if (mode === 'blueprint') {
        // Open on the readable controller/local-output section. The remaining
        // receiver lanes continue below and are reached by normal canvas panning.
        editor.zoomToBounds({ x: 0, y: 0, w: 1500, h: 900 }, { animation: { duration: 250 }, targetZoom: 0.8, inset: 64 })
        return
      }
      const bounds = editor.getCurrentPageBounds()
      if (bounds) editor.zoomToBounds(bounds, { animation: { duration: 250 }, inset: 130 })
    }, 30)
    const unlisten = editor.store.listen(() => {
      const updates = editor.getCurrentPageShapes().filter(shape => shape.type === HOLIDAY_SHAPE_TYPE) as HolidayShape[]
      if (!updates.length) return
      setProject(previous => {
        let changed = false
        const equipment = previous.equipment.map(item => {
          const shape = updates.find(candidate => candidate.props.objectId === item.id)
          if (!shape) return item
          const before = item.layout[mode]
          if (before.x === shape.x && before.y === shape.y && before.w === shape.props.w && before.h === shape.props.h) return item
          changed = true
          return { ...item, layout: { ...item.layout, [mode]: { x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h } } }
        })
        return changed ? recalculateProject({ ...previous, equipment }) : previous
      })
    }, { scope: 'document', source: 'user' })
    return () => { unlisten(); editorRef.current = null }
  }, [view, project.id])

  const importFolder = async (files: FileList | null) => {
    if (!files) return
    const list = [...files]
    const rgb = list.find(file => file.name.toLowerCase() === 'xlights_rgbeffects.xml')
    const networks = list.find(file => file.name.toLowerCase() === 'xlights_networks.xml')
    if (!rgb) { setStatus('No xlights_rgbeffects.xml found in that folder'); return }
    try {
      const imported = importXlights(await rgb.text(), networks ? await networks.text() : undefined, folderName(rgb))
      setProject(imported); setView('yard'); setStatus(`Imported ${imported.equipment.filter(e => e.kind === 'prop').length} xLights models`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Import failed') }
  }

  const importFpp = async (files: FileList | null) => {
    if (!files) return
    const rows = await Promise.all([...files].filter(file => file.size < 5_000_000).map(async file => ({ name: file.name, text: await file.text() })))
    setProject(current => applyFppImport(current, rows)); setStatus('FPP backup reviewed')
  }

  const loadSample = async (season: 'Halloween' | 'Christmas') => {
    try {
      const imported = await loadBundledProject(season)
      setProject(imported); setView('yard'); setStatus(`Loaded your ${season} show: ${imported.equipment.length - 2} models`)
    } catch { setStatus(`The bundled ${season} sample is unavailable`) }
  }

  const addEquipment = (kind: Equipment['kind']) => {
    const item = kind === 'controller' ? makeController() : kind === 'psu' ? makePsu() : makeProp()
    setProject(current => ({ ...current, equipment: [...current.equipment, item], updatedAt: new Date().toISOString() }))
    setStatus(`${item.name} added; switch views to refresh the canvas`)
  }

  const downloadProject = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${project.name.replace(/[^a-z0-9]+/gi, '-')}.glowplan.json`; link.click(); URL.revokeObjectURL(link.href)
  }

  const updateScale = (feetPer100: number) => setProject(current => recalculateProject({ ...current, settings: { ...current.settings, feetPerCanvasUnit: feetPer100 / 100, isScaleCalibrated: true } }))
  const warningCount = project.connections.reduce((sum, c) => sum + c.warnings.length, 0)

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✦</span><div><b>GlowPlan</b><small>Holiday light planner</small></div></div>
      <nav className="view-tabs">
        {(['yard', 'blueprint', 'wires', 'setup'] as AppView[]).map(tab => <button key={tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>{tab === 'yard' ? 'Yard' : tab === 'blueprint' ? 'Blueprint' : tab === 'wires' ? 'Wire list' : 'Setup guide'}</button>)}
      </nav>
      <div className="top-actions"><span className="save-state">● {status}</span><button className="ghost" onClick={downloadProject}>Export</button></div>
    </header>
    <aside className="rail">
      <button className={panel === 'project' ? 'active' : ''} onClick={() => setPanel('project')} title="Project">⌂</button>
      <button className={panel === 'hardware' ? 'active' : ''} onClick={() => setPanel('hardware')} title="Hardware">▦</button>
      <button className={panel === 'validation' ? 'active' : ''} onClick={() => setPanel('validation')} title="Validation">⚠<em>{warningCount}</em></button>
    </aside>
    <aside className="side-panel">
      {panel === 'project' && <ProjectPanel project={project} setProject={setProject} loadSample={loadSample} importFolder={importFolder} importFpp={importFpp} newProject={() => { setProject(blankProject()); setView('yard'); setStatus('New local project created') }}/>}
      {panel === 'hardware' && <HardwarePanel project={project} setProject={setProject} addEquipment={addEquipment} updateScale={updateScale}/>}
      {panel === 'validation' && <ValidationPanel project={project}/>}
    </aside>
    <main className="workspace">
      {(view === 'yard' || view === 'blueprint') && <div className={`canvas-wrap ${view}-canvas`}>
        <div className="canvas-caption"><b>{view === 'yard' ? 'xLights Layout' : 'Global Wiring'}</b><span>{view === 'yard' ? `${project.equipment.filter(item => item.kind === 'prop').length} imported models` : `${project.equipment.length} objects · ${project.connections.length} connections`}</span><span className="hint">{view === 'yard' ? 'Positions and geometry imported from xLights' : 'Orange = hardware output · grey = prop chain'}</span></div>
        <Tldraw key={`${project.id}-${view}`} shapeUtils={holidayShapeUtils} onMount={onCanvasMount}/>
      </div>}
      {view === 'wires' && <WireList project={project}/>}
      {view === 'setup' && <SetupGuide project={project}/>}
    </main>
  </div>
}

async function loadBundledProject(season: 'Halloween' | 'Christmas') {
  const base = `${import.meta.env.BASE_URL}samples/${season.toLowerCase()}`
  const [rgbResponse, networkResponse] = await Promise.all([fetch(`${base}/xlights_rgbeffects.xml`), fetch(`${base}/xlights_networks.xml`)])
  if (!rgbResponse.ok || !networkResponse.ok) throw new Error(`${season} sample files are unavailable`)
  return importXlights(await rgbResponse.text(), await networkResponse.text(), `${season} — attached show`)
}

function subtitle(item: Equipment) {
  if (item.kind === 'prop') return `${item.xlights?.ConnectionLabel ? `${item.xlights.ConnectionLabel} · ` : ''}${item.model ?? 'Prop'} · ${(item.pixelCount ?? 0).toLocaleString()} px`
  if (item.kind === 'controller') return `${item.model ?? 'Controller'}${item.protocol ? ` · ${item.protocol}` : ''}`
  if (item.kind === 'psu') return `${item.voltage ?? 12}V · ${item.watts ?? 0}W`
  return item.model ?? 'Receiver'
}

function connectorAnchor(item: Equipment, port: string, isStart = true) {
  if (!isStart) return { x: 0, y: 0.5 }
  if (item.kind === 'prop') return { x: 1, y: 0.5 }
  if (item.kind === 'receiver') {
    if (port === 'THRU') return { x: 1, y: 0.92 }
    const index = Math.max(0, 'ABCD'.indexOf(port))
    return { x: 1, y: 0.18 + index * 0.2 }
  }
  if (item.kind === 'controller') {
    const local = /^P(\d+)$/.exec(port)
    if (local) return { x: (Number(local[1]) - 0.5) / 8, y: 1 }
    const edgePorts = item.ports?.filter(value => /^[DX]/.test(value)) ?? []
    const index = Math.max(0, edgePorts.indexOf(port))
    return { x: 1, y: 0.2 + index * (0.65 / Math.max(1, edgePorts.length - 1)) }
  }
  return { x: 1, y: 0.5 }
}

function folderName(file: File) {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  return relative?.split('/')[0] || 'Imported xLights show'
}

function ProjectPanel({ project, setProject, loadSample, importFolder, importFpp, newProject }: {
  project: HolidayProject; setProject: React.Dispatch<React.SetStateAction<HolidayProject>>;
  loadSample: (season: 'Halloween' | 'Christmas') => void; importFolder: (files: FileList | null) => void; importFpp: (files: FileList | null) => void; newProject: () => void
}) {
  return <div className="panel-content"><div className="eyebrow">PROJECT</div>
    <input className="project-name" value={project.name} onChange={e => setProject(p => ({ ...p, name: e.target.value }))}/>
    <p className="muted">Local-first project. Changes save automatically in this browser.</p><button className="tiny-link" onClick={newProject}>Start a blank project</button>
    <section><h3>Your attached shows</h3><button className="sample halloween" onClick={() => loadSample('Halloween')}><span>☾</span><div><b>Halloween — Current</b><small>59 xLights models</small></div></button><button className="sample christmas" onClick={() => loadSample('Christmas')}><span>✦</span><div><b>Christmas — SM3</b><small>60 xLights models</small></div></button></section>
    <section><h3>Import</h3><label className="action-button">Import xLights folder<input type="file" multiple {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={e => importFolder(e.target.files)}/></label><label className="action-button secondary">Import FPP backup folder<input type="file" multiple {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={e => importFpp(e.target.files)}/></label></section>
    {project.imports[0] && <section className="import-card"><h3>Latest import</h3><strong>{project.imports.at(-1)?.source}</strong><div className="stats"><span><b>{project.imports[0].models}</b> models</span><span><b>{project.imports[0].controllers}</b> controller</span><span><b>{project.imports[0].groups}</b> groups</span></div><details><summary>Import assumptions</summary><ul>{project.imports.flatMap(i => i.assumptions).map((a, i) => <li key={i}>{a}</li>)}</ul></details></section>}
  </div>
}

function HardwarePanel({ project, setProject, addEquipment, updateScale }: { project: HolidayProject; setProject: React.Dispatch<React.SetStateAction<HolidayProject>>; addEquipment: (kind: Equipment['kind']) => void; updateScale: (n: number) => void }) {
  const settings = project.settings
  const update = (patch: Partial<typeof settings>) => setProject(p => recalculateProject({ ...p, settings: { ...p.settings, ...patch } }))
  return <div className="panel-content"><div className="eyebrow">HARDWARE & DEFAULTS</div><h2>Build once, infer everywhere</h2>
    <div className="add-grid"><button onClick={() => addEquipment('controller')}>＋ Controller</button><button onClick={() => addEquipment('prop')}>＋ Prop</button><button onClick={() => addEquipment('psu')}>＋ PSU</button></div>
    <section className="form-stack"><label>Connector family<input value={settings.connectorFamily} onChange={e => update({ connectorFamily: e.target.value })}/></label><label>Available cable lengths<input value={settings.cableLengthsFt.join(', ')} onChange={e => update({ cableLengthsFt: e.target.value.split(',').map(Number).filter(Boolean) })}/></label><label>Wire gauge<select value={settings.cableGauge} onChange={e => update({ cableGauge: Number(e.target.value), cableOhmsPer1000Ft: Number(e.target.value) === 18 ? 6.385 : 4.016 })}><option value="18">18 AWG</option><option value="16">16 AWG</option></select></label><label>Power mode<select value={settings.powerMode} onChange={e => update({ powerMode: e.target.value as typeof settings.powerMode })}><option value="realistic">Realistic</option><option value="conservative">Conservative</option><option value="custom">Custom</option></select></label><label>Brightness assumption<div className="input-suffix"><input type="number" value={settings.brightness} onChange={e => update({ brightness: Number(e.target.value) })}/><span>%</span></div></label></section>
    <section><h3>Yard scale calibration</h3><p className="muted">{settings.isScaleCalibrated ? 'Scale is active. Cable and voltage calculations update immediately.' : 'Not calibrated. Distances and voltage-drop warnings are intentionally paused.'}</p><label>100 canvas units equals<div className="input-suffix"><input type="number" step="0.5" value={settings.feetPerCanvasUnit * 100} onChange={e => updateScale(Number(e.target.value))}/><span>ft</span></div></label></section>
  </div>
}

function ValidationPanel({ project }: { project: HolidayProject }) {
  const rows = project.connections.flatMap(c => c.warnings.map(warning => ({ c, warning })))
  return <div className="panel-content"><div className="eyebrow">VALIDATION</div><h2>{rows.length ? `${rows.length} items need review` : 'Everything looks calm'}</h2>{!project.settings.isScaleCalibrated && <div className="notice-card"><b>Distance calculations paused</b><small>Calibrate Yard View before trusting cable lengths, voltage drop, or PI recommendations.</small></div>}{rows.length === 0 ? <div className="empty-good">✓ No active hardware or mapping warnings.</div> : rows.map(({ c, warning }, i) => <div className="warning-card" key={`${c.id}-${i}`}><b>⚠ {warning}</b><small>{c.fromPort} · {c.segment}</small></div>)}</div>
}

function WireList({ project }: { project: HolidayProject }) {
  const byId = useMemo(() => new Map(project.equipment.map(e => [e.id, e])), [project.equipment])
  return <div className="report"><div className="report-head"><div><div className="eyebrow">INSTALLATION</div><h1>Wire list</h1><p>{project.settings.connectorFamily} · {project.settings.cableGauge} AWG defaults</p></div><div className="report-total"><b>{project.settings.isScaleCalibrated ? `${project.connections.reduce((s, c) => s + c.installedFt, 0).toFixed(0)} ft` : 'Scale needed'}</b><span>{project.settings.isScaleCalibrated ? 'cable planned' : 'yard uncalibrated'}</span></div></div>
    <table><thead><tr><th>ID</th><th>Segment</th><th>Start</th><th>Destination</th><th>Physical cable chain</th><th>Route / slack</th><th>Load</th><th>Status</th></tr></thead><tbody>{project.connections.map((c, i) => <tr key={c.id}><td>C-{String(i + 1).padStart(3, '0')}</td><td><b>{c.segment}</b></td><td>{byId.get(c.fromId)?.name}<small>{c.fromPort}</small></td><td>{byId.get(c.toId)?.name}</td><td>{formatCableParts(c.cableParts)}<small>{project.settings.isScaleCalibrated ? `${project.settings.cableGauge} AWG · ${project.settings.connectorFamily}` : 'Calibrate Yard View first'}</small></td><td>{project.settings.isScaleCalibrated ? <>{c.distanceFt.toFixed(1)} ft<small>{c.slackFt.toFixed(1)} ft slack</small></> : <span className="status-warn">Uncalibrated</span>}</td><td>{c.amps.toFixed(1)} A<small>{project.settings.isScaleCalibrated ? `${c.endVoltage.toFixed(1)}V at prop` : 'Voltage pending scale'}</small></td><td><span className={c.warnings.length ? 'status-warn' : 'status-ok'}>{c.warnings.length ? 'Review' : 'Mapped'}</span></td></tr>)}</tbody></table>
    {project.connections.length === 0 && <div className="report-empty">Drag a controller port onto a prop in Yard View to build the wire list.</div>}
  </div>
}

function SetupGuide({ project }: { project: HolidayProject }) {
  const byId = new Map(project.equipment.map(e => [e.id, e]))
  const groups = project.connections.reduce<Record<string, Connection[]>>((result, connection) => {
    const key = connection.segment || 'Unassigned'
    ;(result[key] ??= []).push(connection)
    return result
  }, {})
  return <div className="report setup-guide"><div className="report-head"><div><div className="eyebrow">FIELD GUIDE</div><h1>{project.name}</h1><p>Generated from the same connections used by both canvases.</p></div><button className="action-button" onClick={() => window.print()}>Print guide</button></div>
    {Object.entries(groups).map(([segment, connections]) => <section className="guide-section" key={segment}><h2>{segment}</h2>{connections.map((c: Connection) => <div className="guide-chain" key={c.id}><div className="guide-source"><b>{byId.get(c.fromId)?.name}</b><span>{c.fromPort}</span></div><div className="guide-arrow">→</div><div><b>{formatCableParts(c.cableParts)}</b><span>{project.settings.isScaleCalibrated ? `${project.settings.connectorFamily} · ${c.distanceFt.toFixed(1)} ft route · ${c.slackFt.toFixed(1)} ft slack` : 'Distance pending Yard View calibration'}</span></div><div className="guide-arrow">→</div><div><b>{byId.get(c.toId)?.name}</b><span>{byId.get(c.toId)?.pixelCount ?? 0} pixels · {project.settings.isScaleCalibrated ? `${c.endVoltage.toFixed(1)}V estimated` : 'voltage pending'}</span></div>{c.warnings.map(w => <div className="guide-warning" key={w}>⚠ {w}</div>)}</div>)}</section>)}
    {project.connections.length === 0 && <div className="report-empty">Your field-ready setup instructions will appear here after the first connection.</div>}
  </div>
}
