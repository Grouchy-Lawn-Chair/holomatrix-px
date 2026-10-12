import {generate,type Settings,type Pixel} from './geometry'
import {binaryStl,carrierMesh,type Triangle} from './mesh'
import {backingPlatePlan} from './backingPlate'
import {wallMountPlan,wallMountMesh,validateWallMounts,wallMountSpec,wallMountZ,swivelSeatZ,swivelSpacerMesh} from './wallMount'
import {joinedDiffuserMesh,joinedDiffuserFits,joinedDiffuserConflicts} from './joinedDiffuser'
import {extendedCapMesh} from './extendedCap'
import {bulletCapMesh} from './bulletCap'
import {stripCapMesh} from './stripCap'
import {stripSpec} from './strip'
import {toothClearanceTotal} from './capSeats'
import house from '../../diffuser_references/house_33mm.stl?url'
import mario from '../../diffuser_references/mario_25_08mm.stl?url'
import clip from '../../diffuser_references/pvc_house_clip.stl?url'

const text=(name:string,value:string)=>({name,bytes:new TextEncoder().encode(value)})
const onBed=(ts:Triangle[])=>{const min=Math.min(...ts.flat().map(v=>v[2]));return ts.map(t=>t.map(v=>[v[0],v[1],v[2]-min]) as Triangle)}
export async function buildWallMountFiles(s:Settings){
  const layout=generate(s)
  if(!layout.printable||!layout.connected)throw new Error('Layout must be connected and fit the printer bed.')
  const response=await fetch(s.diffuser==='house'?house:mario)
  if(!response.ok)throw new Error('Could not load the diffuser cap')
  const source=await response.arrayBuffer()
  const view=new DataView(source)
  if(source.byteLength<84||view.getUint32(80,true)===0||source.byteLength!==84+50*view.getUint32(80,true))throw new Error('STL is invalid')
  return buildAssemblyFiles(s,layout.pixels,layout.sections,source)
}

async function buildAssemblyFiles(s:Settings,pixels:Pixel[],sections:Pixel[][],source:ArrayBuffer){
  const seams=backingPlatePlan(pixels),mounts=wallMountPlan(pixels,s)
  const conflict=joinedDiffuserConflicts(seams);if(conflict)throw new Error(conflict)
  if(seams.some(p=>!joinedDiffuserFits(p,s)))throw new Error('A merged seam diffuser exceeds the usable bed. Parts are never scaled.')
  const warning=await validateWallMounts(mounts,pixels,s);if(warning)throw new Error(warning)
  const files=await Promise.all(sections.map(async(section,i)=>({name:`section_${String(i+1).padStart(2,'0')}.stl`,bytes:binaryStl(await carrierMesh(section,s,mounts))})))
  for(const p of mounts)files.push({name:`wall_mount_${p.purpose}_${String(p.id).padStart(2,'0')}_${p.head}_SLOTS_UP.stl`,bytes:binaryStl(await wallMountMesh(p,s))})
  // Files are flipped for printing: flat rail roofs on the bed, wall slots up.
  for(const f of files.filter(f=>f.name.startsWith('wall_mount_'))){
    const p=mounts.find(p=>f.name.includes(`_${String(p.id).padStart(2,'0')}_`))!
    const ts=await wallMountMesh(p,s)
    // Swivel bases sit on their full flat rear face. Fixed heads print on
    // their longitudinal side so the saddle and tie groove are open profiles.
    const oriented=p.head==='swivel'?ts.map(t=>t.map(v=>[v[0],-v[1],-v[2]]) as Triangle):ts.map(t=>t.map(v=>[v[2],v[1],-v[0]]) as Triangle)
    f.bytes=binaryStl(onBed(oriented))
  }
  if(mounts.some(p=>p.head==='swivel')){
    files.push({name:'swivel_spacer_PRINT_FLAT.stl',bytes:binaryStl(await swivelSpacerMesh())})
    const response=await fetch(clip);if(!response.ok)throw new Error('Could not load the proven PVC clip')
    const bytes=new Uint8Array(await response.arrayBuffer())
    if(bytes.length<84||bytes.length!==84+50*new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(80,true))throw new Error('PVC clip STL is incomplete')
    files.push({name:'pvc_house_clip_ORIGINAL_UNCHANGED.stl',bytes})
  }
  for(const seam of seams){
    const ts=await joinedDiffuserMesh(source,s,seam)
    files.push({name:`joined_diffuser_${String(seam.id).padStart(2,'0')}_${seam.cells?.length??2}_pixels_sections_${seam.a.section+1}_${seam.b.section+1}_FACE_DOWN.stl`,bytes:binaryStl(onBed(ts))})
  }
  const ts=s.capFit==='extended'?await extendedCapMesh(source,s):s.lighting==='strip'?await stripCapMesh(source,s):await bulletCapMesh(source,s)
  const capName=s.capFit==='extended'?`diffuser_cap_${s.diffuser}_LONG_TEETH_${s.lighting==='strip'?s.stripType??'ip30':'bullet'}_DERIVED.stl`:s.lighting==='strip'?`diffuser_cap_STRIP_${s.stripType??'ip30'}_DERIVED.stl`:`diffuser_cap_${s.diffuser}_BULLET_CLOSED_DERIVED.stl`
  files.push({name:capName,bytes:binaryStl(onBed(ts))})
  const covered=new Set(seams.flatMap(p=>p.cells??[p.a,p.b]).map(c=>c.id)),singles=pixels.length-covered.size
  files.push(text('START_HERE.txt',`holomatrix-px - wall-slotted mounting system, PROTOTYPE.
${pixels.length} lights / ${sections.length} carrier sections.
Print each tray once: floor down, protective cable walls up. Flat bullet-retaining floor 2.1 mm; perimeter wall thickness 2 mm, total depth 25.396 mm. No raised retention pads. Bullet-mode diffuser strip passages are closed; strip-mode passages remain open.
Print ${singles} single caps from ${capName}, plus each merged seam diffuser once. These together cover ${pixels.length} lights. Caps print closed face down, feet up. Never install a single cap underneath a merged cap.
Mounts replace the old rear plates. ${mounts.filter(p=>p.purpose==='joint').length} glued bridges engage walls on BOTH sides of section seams; ${mounts.filter(p=>p.purpose==='support').length} additional support stations. Read WALL_MOUNTS.txt and JOINED_DIFFUSERS.txt.
All STL coordinates millimetres, 100% scale. Do not scale any mating part. Print one short sample first and inspect slicer bridges and PETG fit. No verified adhesive strength, load capacity, outdoor lifespan or waterproof rating.
`))
  files.push(text('WALL_MOUNTS.txt',`Adaptation of Mitchell's slotted wall-bridge concept, not uniformly scaled EMT hardware.
Fixed head for straight runs: open half-saddle for ${wallMountSpec.pipeOD} mm OD PVC with ${wallMountSpec.pipeClearance} mm total diametral allowance. Saddle wall ${wallMountSpec.saddleWall} mm; length along pipe ${wallMountSpec.saddleLength} mm. External zip-tie locating channel ${wallMountSpec.tieWidth} mm wide x ${wallMountSpec.tieDepth} mm deep. Zip tie secures pipe; no snap-fit assumed. Fixed head is integrated with its base, avoiding a second glue joint. Print on the supplied side orientation; inspect shoe bridges in slicer.
Curved/custom runs: original proven PVC clip, unchanged, on a SEPARATE flat-printed circular spacer WITHOUT anti-rotation shoulders. Print ${mounts.filter(p=>p.head==='swivel').length} spacers from swivel_spacer_PRINT_FLAT.stl. Bolt passes through clip, spacer and base; no glue needed for spacer. Orient clip along local guide tangent, tighten bolt to lock orientation. Provisional M4 hardware: ${wallMountSpec.hole} mm bore, ${wallMountSpec.nutFlats} mm across-flats nut pocket, ${wallMountSpec.nutDepth} mm depth. Real screw length/head/nut fit must be measured. Hardware is reference-only, never a printable plastic bolt. Swivel bases print FULL FLAT REAR FACE down, wall slots and nut recess up in supplied STL. No raised boss under frame, no floating first layers.
Wall slots: ${wallMountSpec.slotDepth} mm deep, ${2+wallMountSpec.slotClearance} mm wide for 2 mm walls (${wallMountSpec.slotClearance} mm TOTAL clearance). Square receiving corners. Apply suitable adhesive at broad slot contacts and install over wall tops. Confirm adhesive compatibility and cure on your actual PETG before loading. This is NOT an interference/snap lock. Seat roofs stop on wall tops; mount underside assembly Z=${wallMountZ}, swivel seating face Z=${wallMountZ+swivelSeatZ}.
Install captive nut and clip bolt before gluing where access would be obstructed. Align neighboring trays and merged diffuser, then glue joint bridge onto walls of BOTH sections. Cure without disturbing alignment. Keep wiring away from shoe edges and hardware. Removable section seams require removing the glued bridge: this design favors a bonded subassembly, not tool-free disassembly.
Strategic support spacing target ${wallMountSpec.maxUnsupported} mm is provisional, NOT a load rating; seam mounts are mandatory and never silently skipped. Wider multirow pieces, wind and storage handling require a physical test. Additional mounts only generated where supported outer walls exist. Display positions approximate PVC tangent, not a verified pipe routing model.
${mounts.map(p=>`${p.purpose} ${p.id}: sections ${p.a.section+1}/${p.b.section+1}, cells ${(p.cells??[p.a,p.b]).map(c=>c.id).join(',')}, ${p.ties.length} wall shoes, ${p.head} head.`).join('\n')}
`))
  files.push(text('JOINED_DIFFUSERS.txt',`Merged seam diffusers reinforce and align neighboring carrier sections from the FRONT. Each is one connected printable body, spanning all seam rows. PVC and glued wall mounts provide rear support. Positive-clearance feet are not guaranteed locking latches. Test cap pull-off, seam flex and light bleed.
Print ${singles} single caps plus one of every joined_diffuser STL; merged pieces replace ${covered.size} single caps.
${seams.map(p=>`Seam ${p.id}: sections ${p.a.section+1}/${p.b.section+1}, ${(p.cells??[p.a,p.b]).length} cells.`).join('\n')}
`))
  if(s.lighting!=='strip')files.push(text('BULLET_CAPS.txt','Bullet mode uses filled strip-routing notches and side apertures, without changing foot envelopes. Source STLs are preserved. Inspect actual pixel-body and cable clearance under every mount.'))
  if(s.capFit==='extended')files.push(text('LONG_TEETH.txt',`3.5 mm seating teeth pass through the flat 2.1 mm floor; about 1.4 mm projects into the cable cavity. No raised floor pads. ${toothClearanceTotal(s)} mm TOTAL socket clearance. Print matching caps closed face down. Test retention in PETG.`))
  if(s.lighting==='strip'){
    const sp=stripSpec(s)
    files.push(text('STRIP_README.txt',`30 LEDs/m prototype, ${s.stripType??'ip30'}. ${sp.width} mm profile width, channel width ${sp.channelWidth} mm, height ${sp.thickness} mm. NO bullet-pixel holes. Strip's purchased IP rating is not this printed enclosure. 33.333 mm nominal LED pitch versus 33 mm touching diffuser centers; check accumulated alignment. Cut only at permitted pads; staircase turns require separate routing. Mounts and wiring must not obstruct the strip. Test a short sample.`))
  }
  files.push(text('project.holomatrix-px.json',JSON.stringify(s,null,2)))
  return files
}

export async function buildWallMountFitFiles(s:Settings){
  const sample={...s,shape:'arch' as const},cells=[{x:0,y:0,id:1,row:0,section:0},{x:1,y:0,id:2,row:0,section:1}]
  const response=await fetch(s.diffuser==='house'?house:mario);if(!response.ok)throw new Error('Could not load sample cap')
  const files=await buildAssemblyFiles(sample,cells,[[cells[0]],[cells[1]]],await response.arrayBuffer())
  files.push(text('FIT_SAMPLE.txt','Two unscaled short trays, one wall-slotted seam mount, proven swivel clip and one merged diffuser. Interfaces preserved, extra body length omitted. Test glue, fit, hardware access, wire clearance and seam rigidity before printing a full arch.'))
  return files
}
