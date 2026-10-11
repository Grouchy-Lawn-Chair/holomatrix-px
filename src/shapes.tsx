import {
  Geometry2d, HTMLContainer, Rectangle2d, ShapeUtil, T, type Editor, type RecordProps,
  type TLResizeInfo, type TLShape, type TLShapeId, Vec, createShapeId, resizeBox, useEditor,
  toRichText,
} from 'tldraw'
import type { EquipmentKind } from './types'

export const HOLIDAY_SHAPE_TYPE = 'holiday-item' as const

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [HOLIDAY_SHAPE_TYPE]: {
      w: number; h: number; objectId: string; kind: EquipmentKind; label: string; subtitle: string;
      pixelCount: number; ports: string; warningCount: number; displayType: string; viewMode: 'yard' | 'blueprint'; geometryData: string
    }
  }
}

export type HolidayShape = TLShape<typeof HOLIDAY_SHAPE_TYPE>

function HolidayShapeComponent({ shape }: { shape: HolidayShape }) {
  const editor = useEditor()
  const ports = shape.props.ports.split(',').filter(Boolean)
  const bottomPorts = shape.props.kind === 'controller' ? ports.filter(port => /^P\d+/.test(port)) : []
  const edgePorts = shape.props.kind === 'receiver' ? ports : ports.filter(port => /^[DX]/.test(port))
  const startConnect = (event: React.PointerEvent, port: string) => {
    event.stopPropagation()
    const start = editor.screenToPage({ x: event.clientX, y: event.clientY })
    const previewId = createShapeId()
    editor.createShape({ id: previewId, type: 'arrow', x: start.x, y: start.y, props: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, color: 'orange', arrowheadEnd: 'arrow' } })
    const move = (moveEvent: PointerEvent) => {
      const point = editor.screenToPage({ x: moveEvent.clientX, y: moveEvent.clientY })
      editor.updateShape({ id: previewId, type: 'arrow', props: { end: { x: point.x - start.x, y: point.y - start.y } } })
    }
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      editor.deleteShape(previewId)
      const point = editor.screenToPage({ x: upEvent.clientX, y: upEvent.clientY })
      const target = editor.getShapesAtPoint(point).reverse().find(candidate => candidate.type === HOLIDAY_SHAPE_TYPE && candidate.id !== shape.id) as HolidayShape | undefined
      if (target && target.props.kind === 'prop') {
        window.dispatchEvent(new CustomEvent('glowplan:connect', { detail: {
          fromId: shape.props.objectId, fromShapeId: shape.id, port,
          toId: target.props.objectId, toShapeId: target.id,
        } }))
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }
  const icon = shape.props.kind === 'controller' ? '⌁' : shape.props.kind === 'psu' ? '⚡' : shape.props.kind === 'receiver' ? '⌁' : '✦'
  return <HTMLContainer className={`holiday-shape holiday-${shape.props.kind} view-${shape.props.viewMode}`}>
    <div className="shape-title"><span className="shape-icon">{icon}</span><span>{shape.props.label}</span>{shape.props.warningCount > 0 && <b className="warning-pill">{shape.props.warningCount}</b>}</div>
    <div className="shape-subtitle">{shape.props.subtitle}</div>
    {shape.props.kind === 'controller' && <div className="enclosure-board">
      <div className="board-name">KULP<br/><b>K8-PB</b></div><div className="board-chips"><i/><i/><i/><i/></div>
    </div>}
    {shape.props.kind === 'psu' && <div className="psu-vents">▥ ▥ ▥ ▥ ▥</div>}
    {shape.props.kind === 'receiver' && <div className="receiver-board"><b>SMART RECEIVER</b><span>4 pixel outputs · daisy-chain</span><div><i/><i/><i/><i/></div></div>}
    {shape.props.kind === 'prop' && <PropVisual displayType={shape.props.displayType} pixels={shape.props.pixelCount} viewMode={shape.props.viewMode} geometryData={shape.props.geometryData} width={shape.props.w} height={shape.props.h}/>}
    {bottomPorts.length > 0 && <div className="port-row">
      {bottomPorts.map(port => <button key={port} className="port-nub" title={`Drag ${port} to a prop`} onPointerDown={event => startConnect(event, port)}>{port}</button>)}
    </div>}
    {edgePorts.length > 0 && <div className="port-column">
      {edgePorts.map(port => <button key={port} className="port-nub differential-port" title={`Drag ${port} to a prop`} onPointerDown={event => startConnect(event, port)}>{port}</button>)}
    </div>}
  </HTMLContainer>
}

export class HolidayShapeUtil extends ShapeUtil<HolidayShape> {
  static override type = HOLIDAY_SHAPE_TYPE
  static override props: RecordProps<HolidayShape> = {
    w: T.number, h: T.number, objectId: T.string, kind: T.literalEnum('controller', 'prop', 'psu', 'receiver'),
    label: T.string, subtitle: T.string, pixelCount: T.number, ports: T.string, warningCount: T.number, displayType: T.string,
    viewMode: T.literalEnum('yard', 'blueprint'),
    geometryData: T.string,
  }
  getDefaultProps(): HolidayShape['props'] {
    return { w: 200, h: 100, objectId: '', kind: 'prop', label: 'Prop', subtitle: '', pixelCount: 0, ports: '', warningCount: 0, displayType: 'Model', viewMode: 'yard', geometryData: '' }
  }
  getGeometry(shape: HolidayShape): Geometry2d { return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true }) }
  override onResize(shape: HolidayShape, info: TLResizeInfo<HolidayShape>) { return resizeBox(shape, info) }
  component(shape: HolidayShape) { return <HolidayShapeComponent shape={shape}/> }
  getIndicatorPath(shape: HolidayShape) { const path = new Path2D(); path.roundRect(0, 0, shape.props.w, shape.props.h, 12); return path }
  override canBind() { return true }
}

export const holidayShapeUtils = [HolidayShapeUtil]

export function createBoundArrow(
  editor: Editor,
  startId: TLShapeId,
  endId: TLShapeId,
  label = '',
  isSharedBranch = false,
  startAnchor = { x: 0.5, y: 1 },
  endAnchor = { x: 0.5, y: 0.5 },
) {
  const start = anchor(editor, startId, startAnchor)
  const end = anchor(editor, endId, endAnchor)
  const origin = Vec.Min(start, end)
  const arrowId = createShapeId()
  editor.run(() => {
    editor.createShape({ id: arrowId, type: 'arrow', x: origin.x, y: origin.y, opacity: isSharedBranch ? .48 : 1, props: {
      start: Vec.Sub(start, origin).toJson(), end: Vec.Sub(end, origin).toJson(), kind: 'elbow',
      color: isSharedBranch ? 'grey' : 'orange', size: 's', arrowheadEnd: 'arrow', font: 'sans', richText: toRichText(label),
    } })
    editor.createBindings([
      { fromId: arrowId, toId: startId, type: 'arrow', props: { terminal: 'start', normalizedAnchor: startAnchor, isExact: true, isPrecise: true } },
      { fromId: arrowId, toId: endId, type: 'arrow', props: { terminal: 'end', normalizedAnchor: endAnchor, isExact: false, isPrecise: true } },
    ])
  })
  return arrowId
}

function PropVisual({ displayType, pixels, viewMode, geometryData, width, height }: { displayType: string; pixels: number; viewMode: 'yard' | 'blueprint'; geometryData: string; width: number; height: number }) {
  if (viewMode === 'yard' && geometryData) {
    try {
      const geometry = JSON.parse(geometryData) as { kind: string; columns?: number; rows?: number; points: Array<[number, number]> }
      const sourcePoints = geometry.points.length ? geometry.points : Array.from({ length: Math.min(256, (geometry.columns ?? 1) * (geometry.rows ?? 1)) }, (_, index) => [index % (geometry.columns ?? 1) / Math.max(1, (geometry.columns ?? 1) - 1), Math.floor(index / (geometry.columns ?? 1)) / Math.max(1, (geometry.rows ?? 1) - 1)] as [number, number])
      const points = geometry.kind === 'line' ? sampleLinePixels(sourcePoints, Math.max(2, pixels), width, height) : sourcePoints
      const radiusInCanvasUnits = 1.55
      const rx = radiusInCanvasUnits * 100 / Math.max(width, 1)
      const ry = radiusInCanvasUnits * 100 / Math.max(height, 1)
      return <svg className={`yard-model-svg kind-${geometry.kind}`} viewBox="0 0 100 100" preserveAspectRatio="none">{points.map(([x, y], index) => <ellipse className={index === 0 ? 'start-node' : undefined} key={index} cx={x * 100} cy={y * 100} rx={rx} ry={ry} fill={index === 0 ? '#25e9f2' : '#e8f2f4'}/>)}</svg>
    } catch { /* fall back to the simple blueprint preview */ }
  }
  const type = displayType.toLowerCase()
  if (type.includes('matrix')) return <div className="model-visual matrix-visual">{Array.from({ length: 24 }, (_, i) => <i key={i}/>)}</div>
  if (type.includes('arch')) return <div className="model-visual arch-visual"><i/><i/><i/><i/><i/><i/><i/></div>
  if (type.includes('tree')) return <div className="model-visual tree-visual">▲</div>
  if (type.includes('line')) return <div className="model-visual line-visual">{Array.from({ length: 12 }, (_, i) => <i key={i}/>)}</div>
  return <div className="pixel-dots">{Array.from({ length: Math.min(12, Math.max(3, Math.round(pixels / 25))) }).map((_, i) => <i key={i}/>)}</div>
}

function sampleLinePixels(points: Array<[number, number]>, count: number, width: number, height: number) {
  if (points.length < 2) return points
  const lengths = points.slice(1).map((point, index) => Math.hypot((point[0] - points[index][0]) * width, (point[1] - points[index][1]) * height))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (total <= 0) return [points[0]]
  return Array.from({ length: count }, (_, index): [number, number] => {
    let distance = count === 1 ? 0 : total * index / (count - 1)
    for (let segment = 0; segment < lengths.length; segment++) {
      if (distance <= lengths[segment] || segment === lengths.length - 1) {
        const ratio = lengths[segment] ? Math.min(1, distance / lengths[segment]) : 0
        return [points[segment][0] + (points[segment + 1][0] - points[segment][0]) * ratio, points[segment][1] + (points[segment + 1][1] - points[segment][1]) * ratio]
      }
      distance -= lengths[segment]
    }
    return points.at(-1)!
  })
}

function anchor(editor: Editor, id: TLShapeId, normalized: { x: number; y: number }) {
  const { point, size } = editor.getShapeGeometry(id).bounds
  return editor.getShapePageTransform(id).applyToPoint(Vec.Add(point, Vec.MulV(normalized, size)))
}
