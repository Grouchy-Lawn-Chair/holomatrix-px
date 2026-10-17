import {weaveWiring} from './wiring'
import {spriteWiring,validateSprite,exteriorDarkCells,type Sprite} from './sprite'
import {spriteSections} from './sectionLayout'
import {wireConnectionPlan} from './seriesWiring'
export type Point = { x: number; y: number }
export type Bed = { shape: 'circle' | 'rectangle'; width: number; depth: number; margin: number }
export type Settings = {
  version: 1; name: string; shape: 'arch' | 'line' | 'custom' | 'sprite'; diffuser: 'mario' | 'house';
  sprite?:Sprite
  spriteWiring?:'rows'|'compact'
  stockLeadMm?:number
  solidDarkBorder?:boolean
  frame?:{enabled:boolean;axis:'vertical'|'horizontal'|'cross';rails:number;offset:number;diameter:number;standOff:number}
  sectionJoints?:{enabled:boolean;sideGap:number;tipGap:number;cornerChamfer:number;bottomRelief:number;upperRelief:number}
  conduitClips?:{mode:'none'|'existing';length:number;width:number;clearance:number;spacing:number}
  width: number; height: number; rows: number; requestedCount: number; points: Point[]; bed: Bed
  lighting?:'bullet'|'strip';stripType?:'ip30'|'ip65'|'ip67';stripWidth?:number;stripThickness?:number;stripClearance?:number;stripPitch?:number
  capFit?:'original'|'extended'
  toothClearance?:number
  pixelVoltage?:5|12;injectionEvery?:number
}
export type Pixel = Point & { id: number; row: number; section: number; led?:boolean; jointMale?:boolean;jointDx?:number;jointDy?:number }
export const presets = { mario: { label: 'Mario · 25.08 mm', size: 25.08, depth: 21.996, opening: 21.405 }, house: { label: 'House · 33 mm', size: 33, depth: 21.996, opening: 28.165 } }
export const defaults: Settings = { version: 1, name: 'My pixel arch', shape: 'arch', diffuser: 'house', width: 69.5, height: 29.5, rows: 1, requestedCount: 100, points: [{ x: 0, y: 0 }, { x: .25, y: -.7 }, { x: .5, y: -1 }, { x: .75, y: -.7 }, { x: 1, y: 0 }], bed: { shape: 'circle', width: 290, depth: 290, margin: 8 } }
const key = (p: Point) => `${p.x},${p.y}`

export function guide(s: Settings): Point[] {
  if(s.shape==='sprite')return []
  const size = presets[s.diffuser].size
  const w = Math.max(1, Math.round(s.width * 25.4 / size)), h = Math.max(1, Math.round(s.height * 25.4 / size))
  if (s.shape === 'line') return [{ x: 0, y: 0 }, { x: w, y: 0 }]
  if (s.shape === 'custom') return s.points.map(p => ({ x: p.x * w, y: p.y * h }))
  return Array.from({ length: 241 }, (_, i) => { const angle = Math.PI - Math.PI * i / 240; return { x: w / 2 + w / 2 * Math.cos(angle), y: -h * Math.sin(angle) } })
}

// Four-connected rasterization: every step crosses exactly one full cell edge.
export function rasterize(points: Point[]): Point[] {
  if (!points.length) return []
  const result: Point[] = [{ x: Math.round(points[0].x), y: Math.round(points[0].y) }]
  for (const end of points.slice(1)) {
    let a = { ...result[result.length - 1] }
    const b = { x: Math.round(end.x), y: Math.round(end.y) }
    const start = { ...a }, dx = b.x - start.x, dy = b.y - start.y
    while (a.x !== b.x || a.y !== b.y) {
      const xStep = { x: a.x + Math.sign(dx), y: a.y }
      const yStep = { x: a.x, y: a.y + Math.sign(dy) }
      const distance = (p: Point) => Math.abs(dy * (p.x - start.x) - dx * (p.y - start.y))
      a = a.x === b.x ? yStep : a.y === b.y ? xStep : distance(xStep) <= distance(yStep) ? xStep : yStep
      result.push({ ...a })
    }
  }
  return result
}

export function bounds(points: Point[]) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 }
  const minX = Math.min(...points.map(p => p.x)) - .5, maxX = Math.max(...points.map(p => p.x)) + .5
  const minY = Math.min(...points.map(p => p.y)) - .5, maxY = Math.max(...points.map(p => p.y)) + .5
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export function fitsBed(points: Point[], size: number, bed: Bed) {
  const b = bounds(points), w = b.width * size + 12, h = b.height * size + 12 // reserve for future joints
  if (bed.shape === 'rectangle') return w <= bed.width - bed.margin * 2 && h <= bed.depth - bed.margin * 2
  const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
  const limit = bed.width / 2 - bed.margin - 6
  return points.every(p => [-.5, .5].every(dx => [-.5, .5].every(dy => Math.hypot((p.x + dx - center.x) * size, (p.y + dy - center.y) * size) <= limit)))
}

// Scan-convert one ribbon, rather than unioning separately stair-stepped rows.
// Rows are grid lanes, not Euclidean offsets. Do not silently thicken them
// to remove every articulation: that makes two rows look like three.
export function ribbon(center: Point[], rows: number): Point[] {
  if (rows === 1 || center.length < 2) return rasterize(center)
  const normals = center.map((p,i) => {
    const a=center[Math.max(0,i-1)], b=center[Math.min(center.length-1,i+1)]
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1
    const scale=Math.max(Math.abs(dx),Math.abs(dy))/length
    return {x:dy/length*scale,y:-dx/length*scale}
  })
  const edge=(offset:number) => center.map((p,i) => {
    const q={x:p.x+normals[i].x*offset,y:p.y+normals[i].y*offset}
    // Include the endpoint cells without adding an extra full end column.
    if(i===0||i===center.length-1) {
      const a=center[i===0?0:i-1],b=center[i===0?1:i]
      const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,sign=i===0?-1:1
      q.x+=sign*dx/length*.499999;q.y+=sign*dy/length*.499999
    }
    return q
  })
  // Bias both edges equally: shrinking both would drop a row where a cell
  // centre falls exactly on a diagonal boundary.
  const polygon=[...edge(-.499999),...edge(rows-.499999).reverse()]
  const result:Point[]=[],b=bounds(polygon)
  for(let y=Math.ceil(b.minY+.5);y<=Math.floor(b.maxY-.5);y++) {
    const crossings:number[]=[]
    for(let i=0;i<polygon.length;i++) {
      const a=polygon[i],b=polygon[(i+1)%polygon.length]
      if((a.y>y)!==(b.y>y)) crossings.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y))
    }
    crossings.sort((a,b)=>a-b)
    for(let i=0;i+1<crossings.length;i+=2) for(let x=Math.ceil(crossings[i]);x<=Math.floor(crossings[i+1]);x++)result.push({x,y})
  }
  return result
}

function layoutPixels(s:Settings,center=guide(s)):Pixel[] {
  if(s.shape==='sprite'){
    const dark=s.solidDarkBorder&&s.sprite?exteriorDarkCells(s.sprite):new Set<string>()
    return (s.sprite?.cells??[]).map((c,i)=>({x:c.x,y:c.y,id:i+1,row:c.y,section:0,...(dark.has(key(c))?{led:false}:{})}))
  }
  const seen = new Set<string>(), pixels: Pixel[] = []
  const filled=s.rows>1?new Map(ribbon(center,s.rows).map(p=>[key(p),p])):null
  for (let row = 0; row < s.rows; row++) {
    const offset = center.map((p, i) => {
      const a = center[Math.max(0, i - 1)], b = center[Math.min(center.length - 1, i + 1)]
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1
      const scale=Math.max(Math.abs(dx),Math.abs(dy))/length
      return { x: p.x + dy / length * scale * row, y: p.y - dx / length * scale * row }
    })
    const path = rasterize(row % 2 ? [...offset].reverse() : offset)
    for (const p of path) if (!seen.has(key(p)) && (!filled||filled.has(key(p)))) { seen.add(key(p)); filled?.delete(key(p)); pixels.push({ ...p, id: pixels.length + 1, row, section: 0 }) }
  }
  // Rare cells at curve joins not visited by a row raster still belong to the ribbon.
  for(const p of filled?.values()??[])pixels.push({...p,id:pixels.length+1,row:s.rows-1,section:0})
  return pixels
}

export function generate(s: Settings) {
  const center = guide(s), size = presets[s.diffuser].size
  const pixels=layoutPixels(s,center)
  // Check that offset rows belong to a single full-edge-connected prop.
  const connected = new Set<string>()
  if (pixels.length) {
    const pending = [pixels[0]]; connected.add(key(pixels[0]))
    const map = new Map(pixels.map(p => [key(p), p]))
    while (pending.length) { const p = pending.pop()!; for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) { const q = map.get(key({ x: p.x + d.x, y: p.y + d.y })); if (q && !connected.has(key(q))) { connected.add(key(q)); pending.push(q) } } }
  }
  const sections: Pixel[][] = []
  const station=new Map(pixels.map(p=>{let d=Infinity,index=s.shape==='sprite'?p.y:0;center.forEach((c,i)=>{const q=(c.x-p.x)**2+(c.y-p.y)**2;if(q<d){d=q;index=i}});return [key(p),index]}))
  const occupied=new Set(pixels.map(key)),rim=new Set(pixels.filter(p=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!occupied.has(key({x:p.x+dx,y:p.y+dy})))).map(key))
  const remaining = new Map([...pixels].sort((a,b)=>station.get(key(a))!-station.get(key(b))!||a.x-b.x||a.y-b.y).map(p => [key(p),p]))
  const isConnected=(cells:Pixel[])=>{
    if(!cells.length)return true
    const pending=[cells[0]],seen=new Set<string>(),map=new Map(cells.map(p=>[key(p),p]))
    while(pending.length){const p=pending.pop()!,k=key(p);if(seen.has(k))continue;seen.add(k);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const q=map.get(key({x:p.x+dx,y:p.y+dy}));if(q&&!seen.has(key(q)))pending.push(q)}}
    return seen.size===cells.length
  }
  if(s.shape==='sprite'){
    sections.push(...spriteSections(pixels,s,c=>fitsBed(c,size,s.bed)));remaining.clear()
  }
  while (remaining.size) {
    // Prefer complete transverse slices. A bed cut through half a slice can
    // leave tiny rimless islands and unnecessarily jagged mounting interfaces.
    const ordered=[...remaining.values()];let cut=0
    for(let n=1;n<=ordered.length;n++){
      const prefix=ordered.slice(0,n)
      if(!fitsBed(prefix,size,s.bed))break
      if(n<ordered.length&&station.get(key(ordered[n-1]))===station.get(key(ordered[n])))continue
      const suffix=ordered.slice(n),other=new Set(suffix.map(key))
      const seams=prefix.flatMap(a=>[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>key({x:a.x+dx,y:a.y+dy})).filter(k=>other.has(k)).map(b=>({a:key(a),b})))
      const accessible=!suffix.length||(seams.some(p=>rim.has(p.a))&&seams.some(p=>rim.has(p.b)))
      if(accessible&&isConnected(prefix)&&isConnected(suffix))cut=n
    }
    if(cut){const cells=ordered.slice(0,cut);for(const p of cells){p.section=sections.length;remaining.delete(key(p))}sections.push(cells);continue}
    const current: Pixel[] = [], queue = [remaining.values().next().value!], visited = new Set<string>()
    while (queue.length) {
      const p = queue.shift()!, id = key(p)
      if (!remaining.has(id) || visited.has(id)) continue
      visited.add(id)
      if (current.length && !fitsBed([...current,p],size,s.bed)) continue
      current.push(p); remaining.delete(id); p.section = sections.length
      for (const d of [{x:1,y:0},{x:0,y:-1},{x:-1,y:0},{x:0,y:1}]) {
        const q = remaining.get(key({x:p.x+d.x,y:p.y+d.y})); if (q) queue.push(q)
      }
    }
    sections.push(current)
  }
  // Partition spatially, independently of electrical order. Reordering wires
  // must not move print seams or scatter a section over the arch.
  const local=s.shape==='sprite'?spriteWiring(pixels.filter(p=>p.led!==false),s.spriteWiring??'rows',pixels):weaveWiring(pixels,center)
  const wiring=local.complete?local:spriteWiring(pixels.filter(p=>p.led!==false),'rows',pixels),ids=new Map(wiring.pixels.map(p=>[key(p),p.id]))
  let solidId=0
  for(const p of pixels)p.id=p.led===false?--solidId:ids.get(key(p))!
  pixels.sort((a,b)=>a.id-b.id)
  const b = bounds(pixels)
  const wireSpans = wiring.paths.map(path=>path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.y-path[i].y)*size,0))
  const wireStrings='strings' in wiring?wiring.strings as Pixel[][]:pixels.length?[pixels]:[]
  const wireConnections=wireConnectionPlan(wiring.paths,pixels.filter(p=>p.led!==false),size,s.stockLeadMm??100,'exposedPaths' in wiring?wiring.exposedPaths as number[]:[])
  return { pixels, nodes:pixels.filter(p=>p.led!==false), sections, center, wirePaths:wiring.paths, wireStrings, wireConnections, wireJumpers:wireConnections.filter(c=>c.jumper!==undefined), wiringComplete:wiring.complete, bounds: b, widthMm: b.width * size, heightMm: b.height * size, maxWireSpan: Math.max(0, ...wireSpans), connected: connected.size === pixels.length, printable: pixels.length>0&&sections.every(section => fitsBed(section, size, s.bed)) }
}

export function withCount(s: Settings, requested: number): Settings {
  if(s.shape==='sprite')return s // never silently resample an imported image
  const size = presets[s.diffuser].size
  if (s.shape === 'line') return { ...s, requestedCount: requested, width: Math.max(1, Math.round(requested/s.rows) - 1) * size / 25.4 }
  // A symmetric single-row arch has an odd count. Keep its aspect ratio and
  // search integer dimensions; exact counts are not forced by deforming caps.
  let best = s, score = Infinity
  const ratio = s.height / s.width
  for (let w = 2; w <= Math.min(300, requested * 2); w += 2) {
    for (let delta=-2;delta<=2;delta++) {
      const h = Math.max(1, Math.round(w * ratio)+delta)
      const candidate = { ...s, width: w * size / 25.4, height: h * size / 25.4, requestedCount: requested }
      const cost = Math.abs(layoutPixels(candidate).length - requested) * 100 + Math.abs(h / w - ratio)
      if (cost < score) { score = cost; best = candidate }
    }
  }
  return best
}

export function parseProject(raw: string): Settings {
  const value = JSON.parse(raw)
  if(value.spriteWiring!==undefined&&!['rows','compact'].includes(value.spriteWiring))throw new Error('Invalid sprite wiring style.')
  if(value.stockLeadMm!==undefined&&(!Number.isFinite(value.stockLeadMm)||value.stockLeadMm<0||value.stockLeadMm>2000))throw new Error('Invalid stock wire length.')
  if(value.solidDarkBorder!==undefined&&typeof value.solidDarkBorder!=='boolean')throw new Error('Invalid dark border setting.')
  if(value.pixelVoltage!==undefined&&value.pixelVoltage!==5&&value.pixelVoltage!==12)throw new Error('Invalid pixel voltage.')
  if(value.injectionEvery!==undefined&&(!Number.isInteger(value.injectionEvery)||value.injectionEvery<1||value.injectionEvery>1000))throw new Error('Invalid injection interval.')
  if(value.capFit!==undefined&&!['original','extended'].includes(value.capFit))throw new Error('Invalid diffuser seating type.')
  if(value.toothClearance!==undefined&&(!Number.isFinite(value.toothClearance)||value.toothClearance<.1||value.toothClearance>1))throw new Error('Invalid tooth clearance.')
  if(value.lighting!==undefined&&!['bullet','strip'].includes(value.lighting))throw new Error('Invalid lighting type.')
  if(value.stripType!==undefined&&!['ip30','ip65','ip67'].includes(value.stripType))throw new Error('Invalid strip profile.')
  for(const [field,min,max] of [['stripWidth',5,16],['stripThickness',.5,6],['stripClearance',.05,1],['stripPitch',25,40]] as const){
    if(value[field]!==undefined&&(!Number.isFinite(value[field])||value[field]<min||value[field]>max))throw new Error('Invalid strip dimensions.')
  }
  if(value.lighting==='strip'&&value.diffuser!=='house')throw new Error('Strip mode uses the 33 mm House diffuser.')
  if (value?.version !== 1 || !['arch','line','custom','sprite'].includes(value.shape) || !['house','mario'].includes(value.diffuser)) throw new Error('Choose a holomatrix-px project file.')
  if(value.shape==='sprite'){validateSprite(value.sprite);if(value.lighting==='strip')throw new Error('Sprite props currently require individually addressed bullet pixels.')}
  if(value.sprite!==undefined)validateSprite(value.sprite)
  if(value.frame!==undefined){const f=value.frame;if(!f||typeof f.enabled!=='boolean'||!['vertical','horizontal','cross'].includes(f.axis)||!Number.isInteger(f.rails)||f.rails<1||f.rails>8||!Number.isFinite(f.offset)||Math.abs(f.offset)>48||!Number.isFinite(f.diameter)||f.diameter<10||f.diameter>60||!Number.isFinite(f.standOff)||f.standOff<30||f.standOff>200)throw new Error('Invalid support-frame settings.')}
  if(value.sectionJoints!==undefined){const j=value.sectionJoints;if(!j||typeof j.enabled!=='boolean')throw new Error('Invalid section joints.');for(const [k,min,max] of [['sideGap',.05,.5],['tipGap',.1,1],['cornerChamfer',.5,3],['bottomRelief',0,1.4],['upperRelief',0,.4]] as const)if(!Number.isFinite(j[k])||j[k]<min||j[k]>max)throw new Error('Invalid joint dimensions.')}
  if(value.conduitClips!==undefined){const c=value.conduitClips;if(!c||!['none','existing'].includes(c.mode))throw new Error('Invalid conduit clip option.');for(const [k,min,max] of [['length',20,100],['width',10,100],['clearance',1,15],['spacing',60,500]] as const)if(!Number.isFinite(c[k])||c[k]<min||c[k]>max)throw new Error('Invalid conduit clip reservation dimensions.')}
  for (const field of ['width','height','rows','requestedCount']) if (!Number.isFinite(value[field]) || value[field] <= 0) throw new Error('Invalid project dimensions.')
  if (value.width > 240 || value.height > 240 || value.rows > 8 || !Number.isInteger(value.rows)) throw new Error('Project exceeds the supported canvas size.')
  if (!Array.isArray(value.points) || value.points.length > 500 || value.points.some((p: Point) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 2 || Math.abs(p.y) > 2)) throw new Error('Invalid drawing points.')
  if (!value.bed || !['circle','rectangle'].includes(value.bed.shape) || ![value.bed.width,value.bed.depth,value.bed.margin].every(Number.isFinite) || value.bed.width < 50 || value.bed.depth < 50 || value.bed.width > 1000 || value.bed.depth > 1000 || value.bed.margin < 0 || value.bed.margin > 100) throw new Error('Invalid printer bed.')
  return { ...value, name: typeof value.name === 'string' ? value.name.slice(0,100) : 'My pixel prop' }
}
