import {generate,presets,type Settings} from './geometry'
import {cellKey,type Sprite} from './sprite'
import {defaultFrame,framePlan} from './propPlan'
import {powerInjectionPlan} from './powerInjection'
import {conduitClipPlan,conduitClipSettings} from './conduitClips'
const xml=(s:string)=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!))
const text=(name:string,s:string)=>({name,bytes:new TextEncoder().encode(s)})
export function xmodel(s:Settings){
  const l=generate(s)
  if(!l.nodes.length||!l.wiringComplete)throw new Error('A complete numbered layout is required.')
  const minX=s.shape==='sprite'?0:l.bounds.minX+.5,minY=s.shape==='sprite'?0:l.bounds.minY+.5
  const width=s.shape==='sprite'?s.sprite!.width:l.bounds.width,height=s.shape==='sprite'?s.sprite!.height:l.bounds.height
  const cells=new Map(l.nodes.map(p=>[cellKey(p),p.id]))
  const grid=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>cells.get(`${x+minX},${y+minY}`)??'').join(',')).join(';')
  const starts=l.wireStrings.map((chain,i)=>`String${i+1}="${chain[0].id}" NodeStart${i+1}="${chain[0].id}"`).join(' ')
  const submodels=l.sections.map((cells,i)=>`  <subModel name="Section ${i+1}" layout="horizontal" type="ranges" line0="${cells.filter(p=>p.led!==false).map(p=>p.id).sort((a,b)=>a-b).join(',')}"/>`).join('\n')
  // Legacy dimensions remain readable by older releases; current xLights
  // accepts the named fields and legacy custommodel root (source reviewed).
  return `<?xml version="1.0" encoding="UTF-8"?>\n<custommodel name="${xml(s.name)}" DisplayAs="Custom" StringType="RGB Nodes" parm1="${width}" parm2="${height}" CustomWidth="${width}" CustomHeight="${height}" Depth="1" CustomStrings="${l.wireStrings.length}" ${starts} StartChannel="1" CustomModel="${grid}" PixelSize="2" Transparency="0">\n${submodels}\n</custommodel>\n`
}

// Real 24-bit uncompressed BMP, exactly one image pixel per light grid cell.
// Empty cells are black in BMP; PNG export preserves alpha instead.
export function spriteBmp(sprite:Sprite){
  const stride=Math.ceil(sprite.width*3/4)*4,buffer=new ArrayBuffer(54+stride*sprite.height),v=new DataView(buffer),bytes=new Uint8Array(buffer)
  bytes[0]=66;bytes[1]=77;v.setUint32(2,buffer.byteLength,true);v.setUint32(10,54,true);v.setUint32(14,40,true);v.setInt32(18,sprite.width,true);v.setInt32(22,sprite.height,true);v.setUint16(26,1,true);v.setUint16(28,24,true);v.setUint32(34,stride*sprite.height,true)
  for(const c of sprite.cells){const offset=54+(sprite.height-1-c.y)*stride+c.x*3,rgb=parseInt(c.color.slice(1),16);bytes[offset]=rgb&255;bytes[offset+1]=(rgb>>8)&255;bytes[offset+2]=(rgb>>16)&255}
  return bytes
}
export async function spritePng(sprite:Sprite):Promise<Uint8Array>{
  const c=document.createElement('canvas');c.width=sprite.width;c.height=sprite.height
  const ctx=c.getContext('2d')!;ctx.imageSmoothingEnabled=false
  for(const p of sprite.cells){ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,1,1)}
  const blob=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Could not encode sprite PNG.')),'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}
export function buildPropFiles(s:Settings):{name:string;bytes:Uint8Array}[]{
  const l=generate(s),size=presets[s.diffuser].size
  if(!l.nodes.length)throw new Error('Add at least one pixel before exporting.')
  const colors=new Map(s.sprite?.cells.map(c=>[cellKey(c),c.color])??[]),strings=new Map(l.wireStrings.flatMap((chain,i)=>chain.map((p,j)=>[p.id,{string:i+1,index:j+1}] as const)))
  const links=l.wirePaths.map(path=>{const a=path[0],b=path.at(-1)!;const from=l.pixels.find(p=>p.x===a.x&&p.y===a.y)!,to=l.pixels.find(p=>p.x===b.x&&p.y===b.y)!;return `${strings.get(from.id)!.string},${from.id},${to.id},${(path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.y-path[i].y)*size,0 )).toFixed(2)},"${path.map(p=>`${p.x}:${p.y}`).join(' > ')}"`})
  const frame=framePlan(s,l.pixels),f=s.frame??defaultFrame
  const files=[text('prop.xmodel',xmodel(s)),text('NODE_MAP.csv','node,string,index_in_string,x_grid,y_grid,section,color\n'+l.nodes.map(p=>`${p.id},${strings.get(p.id)!.string},${strings.get(p.id)!.index},${p.x},${p.y},${p.section+1},${colors.get(cellKey(p))??'#ffffff'}`).join('\n')),
    text('SOLID_BORDER.csv','x_grid,y_grid,section\n'+l.pixels.filter(p=>p.led===false).map(p=>`${p.x},${p.y},${p.section+1}`).join('\n')),
    text('WIRING_ROUTE.csv','string,from_pixel,to_pixel,routed_center_distance_mm,rear_path_grid_xy\n'+links.join('\n')),
    text('STRINGS.csv','string,first_node,last_node,node_count\n'+l.wireStrings.map((c,i)=>`${i+1},${c[0].id},${c.at(-1)!.id},${c.length}`).join('\n')),
    text('POWER_INJECTION.csv','kind,node,after_nodes_in_string,voltage_estimate\n'+powerInjectionPlan(l.nodes,s,l.wireStrings).map(p=>`${p.kind},${p.pixel.id},${p.after},${s.pixelVoltage??5}`).join('\n')),
    text('FRAME_PLAN.csv','rail,axis,x1_grid,y1_grid,x2_grid,y2_grid,centerline_length_mm,pipe_od_mm,rear_center_mm,intersected_sections\n'+frame.map(r=>`${r.id},${r.axis},${r.a.x},${r.a.y},${r.b.x},${r.b.y},${r.lengthMm.toFixed(2)},${f.diameter},${r.rearCenter},"${r.sections.map(n=>n+1).join(' ')}"`).join('\n')),
    text('project.holomatrix-px.json',JSON.stringify(s,null,2)),
    text('XLIGHTS_README.txt',`HoloMatrix PX prop blueprint\n${l.nodes.length} nodes; ${l.sections.length} print sections; ${l.wireStrings.length} separate data strings.\nImport prop.xmodel as a custom model. It uses the same node IDs and top-to-bottom grid as NODE_MAP.csv and artwork. Section submodels are included. Check orientation and node count with a numbered test effect before wiring. Assign actual controller ports, start channels, RGB order and brightness in xLights. No controller or real lights are changed by this app.\nEach STRINGS.csv row is an independent string requiring a data feed; there is deliberately NO connection drawn or exported across gaps between strings. The route is conservative, not guaranteed minimum strings. Never connect the end of one listed string to the next without replanning.\nArtwork BMP is RGB24 (8-bit-style artwork, not an indexed 8-bit format); one cell = one pixel. PNG retains transparent empty cells. Use Pictures effect, native grid size, no movement or smoothing; verify alignment in your installed xLights version. Interior dark face pixels remain physical nodes. Optional exterior dark borders retain plastic but have no LED hole or node; use opaque black caps. Transparent empty cells are not nodes.\nPower-injection locations are per-string starting estimates, not fuse, current or voltage-drop calculations. Centerline wire lengths are not cut lengths; add slack and check over-wall routing, pixel bodies and tie access.\nFrame rails are planning guides, NOT printable parts or certified structure. Lengths omit fitting allowances; measure Maker Pipe fittings, conduit OD, anchors and actual stand-off. Rail intersections do not prove mounting access. Support every section independently; do not rely on glued seams or merged caps to carry the prop. Derived two-wall base/head STLs are included in the full print export when conduit clips are selected; Maker Pipe fittings are not generated. Disconnected islands require independent support.\nPrint PETG fit samples at 100% before production. Keep the 2.1 mm bullet retention web, protective walls and current fit allowances. Printed fit, strength, wind loading, weather exposure, wire clearance and storage protection require physical tests.\n`)]
  if(conduitClipSettings(s).mode==='existing'&&s.shape==='sprite'){
    const zones=conduitClipPlan(l.pixels,s),c=conduitClipSettings(s),covered=new Set(zones.flatMap(z=>z.sections))
    files.push(text('CONDUIT_CLIP_PLAN.csv','zone,rail,axis,x_grid,y_grid,reserved_width_mm,reserved_height_mm,adjacent_sections\n'+zones.map(z=>`${z.id},${z.rail},${z.axis},${z.x},${z.y},${z.width},${z.height},"${z.sections.map(n=>n+1).join(' ')}"`).join('\n')))
    files.push(text('CONDUIT_CLIPS.txt',`Two-part conduit mounts derived from Mitchell's supplied medium head/base. Full print export includes the actual base/head STLs and CONDUIT_PRINT_QUANTITIES.csv. The blueprint ZIP includes the placement plan only. Original source meshes are preserved. Bore variants: 23.5 mm pipe OD or 21.336 mm straight PVC, with 0.6 mm diametral allowance. Other diameters require a new matching head. Fixed heads are not curved-arch swivels.\nFootprint ${c.length} x ${c.width} mm, plus ${c.clearance} mm installation clearance per side; target spacing ${c.spacing} mm. ${zones.length} mounts; ${covered.size}/${l.sections.length} sections adjacent. Support remaining sections with direct ties / added structure.\nOrdinary seam bridges, keeper holes and tie pads avoid mounting locations. Mesh validation does not certify assembly access, glue adhesion, zip-tie retention, strength, weather resistance or actual pipe fit. Print a single PETG mount first.\n`))
  }
  if(s.shape==='sprite')files.push({name:'artwork.bmp',bytes:spriteBmp(s.sprite!)})
  return files
}
