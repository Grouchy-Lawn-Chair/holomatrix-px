import { calculateConnection, pointFor } from './engine'
import { K8_PORTS } from './hardware'
import { DEFAULT_SETTINGS, type Connection, type Equipment, type HolidayProject, type ImportSummary } from './types'

function attr(element: Element | null | undefined, name: string, fallback = '') {
  return element?.getAttribute(name) ?? fallback
}

function numberAttr(element: Element, name: string, fallback = 0) {
  const value = Number(attr(element, name))
  return Number.isFinite(value) ? value : fallback
}

function safeId(prefix: string, value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 58)
  return `${prefix}-${slug || crypto.randomUUID()}`
}

function inferPixelCount(model: Element) {
  const custom = attr(model, 'CustomModelCompressed') || attr(model, 'CustomModel')
  if (custom) {
    const values = custom.match(/\d+/g)?.map(Number) ?? []
    if (values.length) return Math.max(...values)
  }
  const display = attr(model, 'DisplayAs').toLowerCase()
  const p1 = numberAttr(model, 'parm1', 1)
  const p2 = numberAttr(model, 'parm2', 1)
  const p3 = numberAttr(model, 'parm3', 1)
  if (display.includes('matrix')) return Math.max(p1, p2, p3)
  if (display.includes('tree')) return Math.max(p1 * p2, p2)
  if (display.includes('arch') || display.includes('line')) return Math.max(p1, p2)
  return Math.max(p1 * p2, p1, p2, p3, 1)
}

function startChannel(model: Element) {
  const value = Number(attr(model, 'StartChannel').split(':').at(-1))
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

function receiverAddress(port: number, remote: number) {
  if (port < 9 || remote < 1) return null
  if (port <= 20) {
    const bank = Math.floor((port - 9) / 4) + 1
    return { connector: `D${bank}`, output: 'ABCD'[(port - 9) % 4], bank, remote, expansion: false }
  }
  const bank = Math.floor((port - 21) / 4) + 1
  return { connector: `X${bank}`, output: 'ABCD'[(port - 21) % 4], bank, remote, expansion: true }
}

interface PreviewGeometry {
  x: number
  y: number
  w: number
  h: number
  data: string
}

function previewGeometry(model: Element): PreviewGeometry {
  const display = attr(model, 'DisplayAs').toLowerCase()
  const worldX = numberAttr(model, 'WorldPosX')
  const worldY = numberAttr(model, 'WorldPosY')
  let points: Array<[number, number]> = []

  if (display.includes('poly line')) {
    const values = attr(model, 'PointData').split(',').map(Number).filter(Number.isFinite)
    for (let index = 0; index + 1 < values.length; index += 3) points.push([worldX + values[index], worldY + values[index + 1]])
  } else if (display.includes('line')) {
    points = [[worldX, worldY], [worldX + numberAttr(model, 'X2'), worldY + numberAttr(model, 'Y2')]]
  }

  if (points.length > 1) {
    const minX = Math.min(...points.map(point => point[0])); const maxX = Math.max(...points.map(point => point[0]))
    const minY = Math.min(...points.map(point => point[1])); const maxY = Math.max(...points.map(point => point[1]))
    const w = Math.max(2, maxX - minX); const h = Math.max(2, maxY - minY)
    const normalized = points.map(([x, y]) => [(x - minX) / w, (maxY - y) / h])
    return { x: minX, y: minY, w, h, data: JSON.stringify({ kind: 'line', points: normalized }) }
  }

  const scaleX = Math.abs(numberAttr(model, 'ScaleX', 1))
  const scaleY = Math.abs(numberAttr(model, 'ScaleY', 1))
  const parm1 = Math.max(1, numberAttr(model, 'parm1', 1))
  const parm2 = Math.max(1, numberAttr(model, 'parm2', 1))
  const parm3 = Math.max(1, numberAttr(model, 'parm3', 1))
  const isMatrix = display.includes('matrix')
  const columns = isMatrix ? parm3 : parm1
  const rows = isMatrix ? Math.max(1, Math.ceil(parm2 / parm3)) : parm2
  const w = Math.max(4, columns * scaleX); const h = Math.max(4, rows * scaleY)
  const compressed = attr(model, 'CustomModelCompressed')
  const compressedDots = compressed.split(';').map(entry => entry.split(',').map(Number)).filter(values => values.length >= 3 && values.every(Number.isFinite)).map(values => [values[2], values[1]])
  const legacyDots: number[][] = []
  if (!compressedDots.length) {
    attr(model, 'CustomModel').split(';').forEach((row, rowIndex) => {
      row.split(',').forEach((node, columnIndex) => {
        if (Number(node) > 0) legacyDots.push([columnIndex, rowIndex])
      })
    })
  }
  const dots = compressedDots.length ? compressedDots : legacyDots
  const maxColumn = Math.max(columns - 1, ...dots.map(point => point[0]), 1)
  const maxRow = Math.max(rows - 1, ...dots.map(point => point[1]), 1)
  const normalizedDots = dots.map(([column, row]) => [column / maxColumn, row / maxRow])
  return {
    x: worldX - w / 2, y: worldY - h / 2, w, h,
    data: JSON.stringify({ kind: isMatrix ? 'matrix' : 'custom', columns, rows, points: normalizedDots }),
  }
}

interface ImportedModel {
  node: Element
  prop: Equipment
  port: number
  remote: number
  start: number
}

export function importXlights(rgbText: string, networksText?: string, source = 'xLights folder'): HolidayProject {
  const parser = new DOMParser()
  const rgb = parser.parseFromString(rgbText, 'application/xml')
  if (rgb.querySelector('parsererror')) throw new Error('xlights_rgbeffects.xml could not be parsed')
  const network = networksText ? parser.parseFromString(networksText, 'application/xml') : null
  const modelNodes = [...rgb.querySelectorAll('models > model')]
  const controllerNodes = network ? [...network.querySelectorAll('Controller')] : []
  const groupCount = rgb.querySelectorAll('modelGroups > modelGroup').length
  const controllerNode = controllerNodes[0]
  const controllerName = attr(controllerNode, 'Name', 'Imported controller')
  const controllerModel = attr(controllerNode, 'Model', 'K8-PB')
  const variant = attr(controllerNode, 'Variant', 'Unknown variant')
  const hasExpansion = /expansion/i.test(variant) && !/no expansion/i.test(variant)
  // The enclosure view shows the eight user-facing pixel pigtails. Differential
  // and expansion routing remains represented by the connected receiver nodes.
  const controllerPorts = [...K8_PORTS]
  const controller: Equipment = {
    id: 'controller-imported', kind: 'controller', name: controllerName, model: `${controllerModel} · ${variant}`,
    protocol: attr(controllerNode, 'Protocol'), ports: controllerPorts, source: 'xlights',
    xlights: Object.fromEntries([...controllerNode?.attributes ?? []].map(a => [a.name, a.value])),
    layout: { yard: { x: 50, y: 70, w: 290, h: 250 }, blueprint: { x: 50, y: 70, w: 290, h: 250 } },
  }
  const psu: Equipment = {
    id: 'psu-imported', kind: 'psu', name: 'PSU · model not in xLights', model: 'Needs confirmation', voltage: 12, watts: 350,
    source: 'xlights', layout: { yard: { x: 65, y: 380, w: 200, h: 105 }, blueprint: { x: 70, y: 390, w: 200, h: 105 } },
  }

  const previewGeometries = modelNodes.map(previewGeometry)
  const minX = Math.min(...previewGeometries.map(preview => preview.x), 0)
  const minY = Math.min(...previewGeometries.map(preview => preview.y), 0)
  const maxX = Math.max(...previewGeometries.map(preview => preview.x + preview.w), 1)
  const maxY = Math.max(...previewGeometries.map(preview => preview.y + preview.h), 1)
  // Preserve the xLights yard proportions and keep the first view readable on a laptop.
  // A single scale matters here: separate X/Y scales visibly distort the user's layout.
  const yardScale = Math.min(1450 / Math.max(1, maxX - minX), 760 / Math.max(1, maxY - minY))

  const imported: ImportedModel[] = modelNodes.map((model, index) => {
    const name = attr(model, 'name', `Model ${index + 1}`)
    const display = attr(model, 'DisplayAs', 'Model')
    const controllerConnection = model.querySelector('ControllerConnection')
    const port = Number(attr(controllerConnection, 'Port')) || 0
    const remote = Number(attr(controllerConnection, 'SmartRemote')) || 0
    const address = receiverAddress(port, remote)
    const preview = previewGeometries[index]
    const prop: Equipment = {
      id: safeId('prop', `${index}-${name}`), kind: 'prop', name, model: display,
      pixelCount: inferPixelCount(model), voltage: 12, controller: controllerName,
      startChannel: attr(model, 'StartChannel'), protocol: attr(controllerConnection, 'Protocol'), source: 'xlights',
      xlights: {
        ...Object.fromEntries([...model.attributes].map(a => [a.name, a.value])),
        Port: String(port), SmartRemote: String(remote), SmartRemoteType: attr(controllerConnection, 'SmartRemoteType'),
        ConnectionLabel: address ? `${address.connector} R${address.remote}-${address.output}` : port ? `P${port}` : 'Unassigned',
        PreviewGeometry: preview.data, PreviewRotation: attr(model, 'RotateZ', '0'),
      },
      layout: {
        yard: {
          x: 100 + (preview.x - minX) * yardScale,
          y: 70 + (maxY - preview.y - preview.h) * yardScale,
          w: Math.max(5, preview.w * yardScale), h: Math.max(5, preview.h * yardScale),
        },
        blueprint: { x: 500, y: 70, w: 175, h: 72 },
      },
    }
    return { node: model, prop, port, remote, start: startChannel(model) }
  })

  const receiverKeys = new Map<string, { address: NonNullable<ReturnType<typeof receiverAddress>>; props: Equipment[] }>()
  imported.forEach(item => {
    const address = receiverAddress(item.port, item.remote)
    if (!address) return
    const key = `${address.connector}-r${address.remote}`
    const existing = receiverKeys.get(key)
    if (existing) existing.props.push(item.prop)
    else receiverKeys.set(key, { address, props: [item.prop] })
  })
  const receiverEntries = [...receiverKeys.entries()].sort((a, b) => {
    const aa = a[1].address; const bb = b[1].address
    return Number(aa.expansion) - Number(bb.expansion) || aa.bank - bb.bank || aa.remote - bb.remote
  })
  const receivers = receiverEntries.map(([key, entry], receiverIndex): Equipment => {
    return {
      id: `receiver-${key.toLowerCase()}`, kind: 'receiver', name: `${entry.address.connector} Smart Receiver ${entry.address.remote}`,
      model: 'Falcon-compatible 4-port smart receiver', ports: ['A', 'B', 'C', 'D'], source: 'xlights',
      xlights: { connector: entry.address.connector, remote: String(entry.address.remote), location: 'Inferred from attached props' },
      layout: {
        // xLights identifies the receiver relationship, but not its real yard location.
        // Keep inferred hardware in a tidy dock until the user places it physically.
        yard: { x: 350, y: 70 + receiverIndex * 130, w: 150, h: 108 },
        blueprint: { x: 410, y: 0, w: 190, h: 235 },
      },
    }
  })
  const receiverByKey = new Map(receiverEntries.map(([key], index) => [key, receivers[index]]))

  const localGroups = new Map<string, ImportedModel[]>()
  const remoteGroups = new Map<string, ImportedModel[]>()
  imported.forEach(item => {
    const address = receiverAddress(item.port, item.remote)
    const key = address ? `${address.connector}-r${address.remote}-${address.output}` : `p${item.port}`
    const map = address ? remoteGroups : localGroups
    const group = map.get(key) ?? []
    group.push(item); map.set(key, group)
  })
  ;[...localGroups.values(), ...remoteGroups.values()].forEach(group => group.sort((a, b) => a.start - b.start))

  let localRow = 0
  ;[...localGroups.entries()].sort((a, b) => a[1][0].port - b[1][0].port).forEach(([, group]) => {
    group.forEach((item, index) => {
      item.prop.layout.blueprint = { x: 430 + index * 195, y: 70 + localRow * 90, w: 165, h: 58 }
    })
    localRow++
  })
  const receiverStartY = 110 + localRow * 90
  receiverEntries.forEach(([key], receiverIndex) => {
    const receiver = receiverByKey.get(key)!
    receiver.layout.blueprint.y = receiverStartY + receiverIndex * 285
    const outputGroups = [...remoteGroups.entries()].filter(([groupKey]) => groupKey.startsWith(`${key}-`)).sort((a, b) => a[0].localeCompare(b[0]))
    outputGroups.forEach(([groupKey, group]) => {
      const output = groupKey.at(-1) ?? 'A'
      const outputRow = 'ABCD'.indexOf(output)
      group.forEach((item, index) => {
        item.prop.layout.blueprint = { x: 650 + index * 190, y: receiver.layout.blueprint.y + 10 + outputRow * 54, w: 160, h: 46 }
      })
    })
  })

  const settings = { ...DEFAULT_SETTINGS }
  const equipment = [controller, psu, ...receivers, ...imported.map(item => item.prop)]
  const connections: Connection[] = []
  const addConnection = (sourceItem: Equipment, sourcePort: string, target: Equipment, segment: string, id: string) => {
    connections.push(calculateConnection({
      id, fromId: sourceItem.id, fromPort: sourcePort, toId: target.id, kind: 'data', segment,
      route: [pointFor(sourceItem, 'yard'), pointFor(target, 'yard')],
    }, target, settings))
  }

  ;[...localGroups.entries()].forEach(([key, group]) => {
    group.forEach((item, index) => {
      const sourceItem = index === 0 ? controller : group[index - 1].prop
      addConnection(sourceItem, index === 0 ? `P${item.port}` : 'OUT', item.prop, attr(item.node, 'LayoutGroup', `P${item.port}`), `connection-${key}-${index}`)
    })
  })

  const receiversByConnector = new Map<string, Equipment[]>()
  receiverEntries.forEach(([key, entry]) => {
    const list = receiversByConnector.get(entry.address.connector) ?? []
    list.push(receiverByKey.get(key)!); receiversByConnector.set(entry.address.connector, list)
  })
  receiversByConnector.forEach((list, connector) => {
    list.sort((a, b) => Number(a.xlights?.remote) - Number(b.xlights?.remote)).forEach((receiver, index) => {
      const sourceItem = index === 0 ? controller : list[index - 1]
      addConnection(sourceItem, index === 0 ? connector : 'THRU', receiver, `${connector} receiver chain`, `receiver-link-${connector}-${index}`)
    })
  })
  remoteGroups.forEach((group, key) => {
    const receiverKey = key.slice(0, key.lastIndexOf('-'))
    const receiver = receiverByKey.get(receiverKey)
    if (!receiver) return
    const output = key.at(-1) ?? 'A'
    group.forEach((item, index) => {
      const sourceItem = index === 0 ? receiver : group[index - 1].prop
      addConnection(sourceItem, index === 0 ? output : 'OUT', item.prop, attr(item.node, 'LayoutGroup', receiver.name), `connection-${key}-${index}`)
    })
  })

  const summary: ImportSummary = {
    source, importedAt: new Date().toISOString(), models: imported.length, controllers: controllerNodes.length, groups: groupCount,
    assumptions: [
      'xLights port order is preserved as controller/receiver output chains instead of separate home runs.',
      'K8-PB ports 9–20 are represented as its three differential outputs; expansion ports 21–36 are represented as four expansion differential outputs.',
      'Smart Receiver number and A–D output are derived from xLights Port and SmartRemote fields.',
      '12V pixels and one 350W PSU remain assumptions until project hardware is confirmed.',
      'Electrical distances are disabled until Yard View is calibrated to a known real distance.',
    ],
  }
  return {
    version: 4, id: crypto.randomUUID(), name: source.replace(/\s*folder$/i, ''), updatedAt: new Date().toISOString(),
    settings, equipment, connections, imports: [summary],
  }
}

export function applyFppImport(project: HolidayProject, files: Array<{ name: string; text: string }>): HolidayProject {
  let parsed = 0
  const details: string[] = []
  for (const file of files) {
    try {
      const value = JSON.parse(file.text)
      parsed++
      const ip = findFirst(value, ['ip', 'address', 'hostName', 'hostname'])
      details.push(`${file.name}${ip ? ` (${ip})` : ''}`)
    } catch { /* retain non-JSON FPP files for future mapping without failing the batch */ }
  }
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    imports: [...project.imports, {
      source: `FPP backup: ${parsed}/${files.length} JSON files`, importedAt: new Date().toISOString(),
      models: 0, controllers: 0, groups: 0,
      assumptions: details.length ? [`Read ${details.slice(0, 6).join(', ')}`] : ['No parseable JSON configuration was found; select an extracted FPP backup folder.'],
    }],
  }
}

function findFirst(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (keys.includes(key) && typeof child === 'string') return child
    const nested = findFirst(child, keys)
    if (nested) return nested
  }
  return undefined
}
