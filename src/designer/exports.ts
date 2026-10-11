import { generate, presets, type Settings } from './geometry'
import { binaryStl, carrierMesh, zipFiles } from './mesh'
import marioCapUrl from '../../diffuser_references/mario_25_08mm.stl?url'
import houseCapUrl from '../../diffuser_references/house_33mm.stl?url'
import pvcClipUrl from '../../diffuser_references/pvc_house_clip.stl?url'
import {stripCapMesh} from './stripCap'
import {bulletCapMesh} from './bulletCap'
import {extendedCapMesh} from './extendedCap'
import {toothClearanceTotal} from './capSeats'
import {joinedDiffuserMesh,joinedDiffuserFits,joinedDiffuserConflicts} from './joinedDiffuser'
import {stripSpec} from './strip'
import {backingPlatePlan,backingPlateMesh,validatePlateAssembly,plateSeatSpec,plateAssemblyZ} from './backingPlate'
import {pvcMountPlan,pvcMountMesh,pvcMountSpec} from './pvcMount'

export async function buildHardwareFiles() {
  const {buildJointFitParts}=await import('./hardware')
  const parts=await buildJointFitParts()
  const {buildPinJointParts}=await import('./pinJoint')
  const pinParts=await buildPinJointParts()
  const response=await fetch(pvcClipUrl)
  if(!response.ok)throw new Error('Could not load your proven PVC clip STL.')
  const clip=new Uint8Array(await response.arrayBuffer())
  if(clip.length<84||clip.length!==84+50*new DataView(clip.buffer).getUint32(80,true))throw new Error('The supplied PVC clip STL is incomplete.')
  return [
    ...parts.map(p=>({name:p.name,bytes:binaryStl(p.triangles)})),
    ...pinParts.map(p=>({name:p.name,bytes:binaryStl(p.triangles)})),
    {name:'PIN_JOINT_README.txt',bytes:new TextEncoder().encode(`R2: broad tongue / overlap / optional separate pin. TEST COUPONS ONLY.
Print the three pin_joint STLs at 100% in PETG, exactly as oriented: male flat, female pocket UP, pin head DOWN. No support roofs in these print orientations.
Turn the female over after printing so its pocket faces down. Lay male and female coplanar, insert the 20 mm-wide, 3 mm-thick tongue into the 16 mm overlap recess.
Turn the pin over and press its 6.8 x 5.3 mm CAD chamfered shaft DOWN through the aligned holes. Pin head stays on top. These are broad rigid parts, not spring latches.
R2 LOCAL PRINT COMPENSATION: previous unscaled 8 x 6 mm pin printed 8.6 x 6.5; 8.1 x 6.1 mm holes printed approximately 7.5 x 5.9. New pin aims for a printed 7.4 x 5.8, assuming the same .6/.5 mm growth. Estimated physical pin clearance .1 mm TOTAL, not guaranteed; remeasure. Holes unchanged; the replacement pin can be tried in your existing test pieces.
Tongue/socket clearance .1 mm TOTAL (.05 per side), vertical lap allowance .1 mm. Female meeting face recessed .5 mm, giving a .6 mm nominal body seam; hole centers and pocket end unchanged. Receiving corners square, inserting corners chamfered. All walls are straight extrusions, with no drafted/tapered sides.
Solid test bodies shortened only (male 20 mm, female 25 mm, width 30 mm), not scaled. Print all files at 100%. Check fit, shear, lift, removal and repeated assembly.
The overlap faces are accessible for your adhesive method if you decide to bond permanently. No adhesive compatibility or outdoor strength has been validated.
Do not integrate across a prop until the physical PETG coupon fits. Strip mode is available; stage 3 tested joints and matching numbers still pending.
`)},
    {name:'pvc_house_clip_ORIGINAL_UNCHANGED.stl',bytes:clip},
    {name:'FIT_TEST_README.txt',bytes:new TextEncoder().encode(`HoloMatrix PX - reinforced PETG puzzle-joint fit test
TEST PIECES ONLY. These features are not added to prop sections yet.
Print puzzle_male_coupon.stl and puzzle_female_coupon.stl once each at 100% scale, millimetres, in PETG.
Both lie flat on Z=0 and are 6 mm thick. No roofs, spring arms or tiny catches.
Solid tab: 12 mm wide root, 20 mm wide head, 20 mm projection. Bodies: 44 x 44 mm.
Press the head into the matching through-cutout from ABOVE, like a puzzle piece, not sideways.
Clearance: 0.1 mm TOTAL across width (0.05 mm each side); body seam gap 0.1 mm.
XY corners are chamfered 0.6 mm. This is not a flexible snap latch.
Two pairs of 4 mm through-holes flank the tab. Each pair has one hole in each piece, aligned across the seam.
Thread a small zip tie down one hole and up the matching hole to bridge the seam. Check your tie fits; do not overtighten.
The puzzle shape resists in-plane separation; optional ties help retain the pieces. Rear PVC mounts must support lift/twist loads.
Increased thickness adds contact area but does not guarantee friction retention with positive clearance.
Physical fit, repeated assembly and outdoor strength remain unvalidated. Test before printing a prop.
These coupons do not have pixel holes. Prop carriers separately use the shaped Koopa-reference pixel opening with a 2.1 mm gripping floor, relieved to 18 mm above it. Check actual tab clearance.

Your PVC House Clip STL is included byte-for-byte unchanged.
Confirmed pipe OD: 0.840 inches = 21.336 mm. Bent pipe for arches, straight pipe for straight runs.
The clip mounting screw size and clip-to-backer adapter still need confirming/designing.
The original clip imports with 7 non-manifold edges in Blender; preserved because you have physically validated it. Check in your slicer.
Do not print a full prop assuming these joints or mounting adapters exist yet.
`)}
  ]
}
export async function exportHardwareTests() {
  const bytes=zipFiles(await buildHardwareFiles()),url=URL.createObjectURL(new Blob([bytes.slice().buffer],{type:'application/zip'})),a=document.createElement('a')
  a.href=url;a.download='holomatrix-px-joint-pin-fit-tests-R2.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export async function buildStlFiles(s:Settings) {
  const {buildDirectTieFiles}=await import('./directTieExports')
  return buildDirectTieFiles(s)
}
// Retained for comparison with earlier printed plate coupons, not the app export.
export async function buildLegacyPlateFiles(s:Settings) {
  const layout=generate(s)
  if(!layout.connected||!layout.printable)throw new Error('Adjust the drawing or printer bed before exporting.')
  const response=await fetch(s.diffuser==='mario'?marioCapUrl:houseCapUrl)
  if(!response.ok)throw new Error('Could not load the diffuser cap. Please try exporting again.')
  let cap:Uint8Array=new Uint8Array(await response.arrayBuffer())
  if(cap.length<84||new DataView(cap.buffer).getUint32(80,true)===0||cap.length!==84+50*new DataView(cap.buffer).getUint32(80,true))throw new Error('The diffuser cap STL is invalid. Export stopped.')
  const capSource=cap.slice().buffer
  {
    const triangles=s.capFit==='extended'?await extendedCapMesh(capSource,s):s.lighting==='strip'?await stripCapMesh(capSource,s):await bulletCapMesh(capSource,s)
    // Closed face DOWN; tooth tips UP. Never export a derived cap balanced on teeth.
    const faceZ=Math.min(...triangles.flat().map(v=>v[2]))
    cap=binaryStl(triangles.map(t=>t.map(v=>[v[0],v[1],v[2]-faceZ]) as typeof t))
  }
  const plates=backingPlatePlan(layout.pixels)
  const conflict=joinedDiffuserConflicts(plates);if(conflict)throw new Error(conflict)
  if(plates.some(p=>!joinedDiffuserFits(p,s)))throw new Error('A joined seam diffuser does not fit the usable bed. Reduce rows or increase the bed; mating parts are not scaled.')
  const mounts=pvcMountPlan(layout.pixels,s),attachments=[...plates,...mounts]
  const plateWarning=await validatePlateAssembly(plates,s);if(plateWarning)throw new Error(plateWarning)
  const files=await Promise.all(layout.sections.map(async(section,i)=>({name:`section_${String(i+1).padStart(2,'0')}.stl`,bytes:binaryStl(await carrierMesh(section,s,attachments))})))
  for(const p of mounts)files.push({name:`PVC_mount_section_${p.id}_FLAT.stl`,bytes:binaryStl(await pvcMountMesh(p,s))})
  if(mounts.length){
    const clipResponse=await fetch(pvcClipUrl)
    if(!clipResponse.ok)throw new Error('Could not load the PVC clip for export.')
    files.push({name:'pvc_house_clip_ORIGINAL_UNCHANGED.stl',bytes:new Uint8Array(await clipResponse.arrayBuffer())})
  }
  files.push({name:'PVC_MOUNTS.txt',bytes:new TextEncoder().encode(`PROTOTYPE PVC clip mounting plates. Hardware is NOT printable plastic.
${mounts.length} supported stations / ${layout.sections.length} sections. Missing stations need a custom mount; no floating plates generated.
Print plates flat, underside nut pocket and locating recess down, PETG, 100% millimetres. Inspect the ${plateSeatSpec.depth} mm high recess roofs/bridges in the slicer before printing. Recess clearance ${plateSeatSpec.clearanceTotal} mm TOTAL (half each side), not a snap lock. Through bolt bore ${pvcMountSpec.holeDiameter} mm; square receiving corners and a hex nut pocket ${pvcMountSpec.nutAcrossFlats} mm across flats, ${pvcMountSpec.nutDepth} mm deep. Clip geometry unchanged; print in its original orientation.
Recess mouth flares another ${plateSeatSpec.entryRelief} mm per side over the first ${plateSeatSpec.entryHeight} mm for first-layer bulging. Carrier convex rear rim corners have ${plateSeatSpec.cornerChamfer} mm XY chamfers over the engagement band; concave receiving corners remain square. These allowances need a PETG coupon, not a guarantee of fit.
Provisional M4 bolt/nut fit, not confirmed by physical print. Measure real screw/head/nut before choosing length. Clip mounting face is source Y=19; bolt aligns with existing hole, not the pipe lips.
Install nut from underside, place clip between solid anti-rotation shoulders, insert bolt from inside the empty clip before snapping PVC in. Hold nut during tightening; pocket prevents rotation, not fall-out before bolt insertion. Plate bridges opposite exposed tray rims. Secure both sides with narrow zip ties through paired plate slots + matching tray wall slots before installing pipe. Do not crush rim or overtighten PETG.
No strength, creep, wire/tool clearance or outdoor lifetime certification. Print one mounting station first. Mount positions use local grid direction, not a guaranteed smooth curved PVC route.
` )})
  for(const p of plates)files.push({name:`backing_plate_${String(p.id).padStart(2,'0')}_sections_${p.a.section+1}_${p.b.section+1}_FLAT.stl`,bytes:binaryStl(await backingPlateMesh(p,s))})
  for(const p of plates){
    const ts=await joinedDiffuserMesh(capSource,s,p),minZ=Math.min(...ts.flat().map(v=>v[2]))
    files.push({name:`joined_diffuser_${String(p.id).padStart(2,'0')}_${p.cells?.length??2}_pixels_sections_${p.a.section+1}_${p.b.section+1}_FACE_DOWN.stl`,bytes:binaryStl(ts.map(t=>t.map(v=>[v[0],v[1],v[2]-minZ]) as typeof t))})
  }
  const joinedPixels=new Set(plates.flatMap(p=>p.cells??[p.a,p.b]).map(c=>c.id)),singleCaps=layout.pixels.length-joinedPixels.size
  files.push({name:'JOINED_DIFFUSERS.txt',bytes:new TextEncoder().encode(`FULL-SEAM JOINED CAPS, not independent touching caps.
Print each joined_diffuser STL ONCE, closed faces on bed and openings/teeth UP. Each mesh fuses all caps touching the section interface, including every row and staircase cells. Internal cavity walls retained; no optical isolation certification.
Print ${singleCaps} single caps for remaining pixels; joined pieces replace ${joinedPixels.size} individual caps, do not install both in the same positions.
${plates.map(p=>`Seam ${p.id}: sections ${p.a.section+1}/${p.b.section+1}, ${(p.cells??[p.a,p.b]).length} pixels: ${(p.cells??[p.a,p.b]).map(c=>c.id).join(', ')}.`).join('\n')}
Both backers must align before inserting a joined cap. Remove joined caps before separating sections. Positive clearance is not a locking latch: rear full-seam plates/ties and PVC still carry retention loads. Prototype: test fit, pull-off, flex and light bleed in PETG.
`)})
  if(plates.length)files.push({name:'BACKING_PLATES.txt',bytes:new TextEncoder().encode(`PROTOTYPE REAR BRIDGES, not pin-joint coupons.
Print each backing plate flat at 100% in PETG, 3 mm thick. Put the flat rear face DOWN and the shallow locating recess UP; rotate the STL in your slicer. Large through-windows preserve cable access. The recess leaves a 1.8 mm roof over rim seats.
Seat the plate over the rear cable-wall tops: ${plateSeatSpec.depth} mm engagement, ${plateSeatSpec.clearanceTotal} mm TOTAL XY clearance (${plateSeatSpec.clearanceTotal/2} mm each side), underside at ${plateAssemblyZ} mm behind the front mounting face. This nest locates the tray; zip ties retain it. The grid-shaped footprint spans every cell touching the section seam across all rows; one window per cell preserves wiring access.
Recess mouth flares another ${plateSeatSpec.entryRelief} mm per side over ${plateSeatSpec.entryHeight} mm height; convex male rear rim corners have ${plateSeatSpec.cornerChamfer} mm XY chamfers in the engagement band. Concave receiving corners stay square. First-layer relief is a provisional design allowance, not measured printer compensation.
Use narrow zip ties (check actual fit; nominal 2.5 mm wide suggested) through the paired plate slots and corresponding horizontal wall slot. Each loop clamps the plate around the wall top: down outside slot, through wall slot, up inside slot, close above plate. Secure BOTH trays; do not overtighten or crush the 2 mm wall.
Wall slots: 4 x 3 mm. Plate slots: 4 x 1.8 mm. The rear rim remains 2 mm above each wall slot. Seam cable passage: 12 x 12 mm starting 7 mm above the front floor; inspect its 12 mm bridge in your slicer.
No thin spring tabs or press-fit pin used by this design. The R2 pin test remains a separate experiment.
${plates.map(p=>`Plate ${p.id}: joins section ${p.a.section+1} to section ${p.b.section+1}; ${p.ties.length} tie locations.`).join('\n')}
PVC mounts are separate green plates, not seam bridges. Read PVC_MOUNTS.txt. Your original clip is preserved; mounting hardware fit and physical retention need a sample test.
`)})
  const capName=s.capFit==='extended'?`diffuser_cap_${s.diffuser}_LONG_TEETH_${s.lighting==='strip'?s.stripType??'ip30':'bullet'}_DERIVED.stl`:s.lighting==='strip'?`diffuser_cap_STRIP_${s.stripType??'ip30'}_DERIVED.stl`:`diffuser_cap_${s.diffuser}_BULLET_CLOSED_DERIVED.stl`
  if(s.capFit==='extended')files.push({name:'LONG_TEETH.txt',bytes:new TextEncoder().encode(`DERIVED prototype cap. Original source preserved. 3.5 mm teeth pass through the flat 2.1 mm floor; approximately 1.4 mm projects into the cable cavity. No raised pixel or foot pads. Through-floor sockets have ${toothClearanceTotal(s)} mm TOTAL XY clearance (${(toothClearanceTotal(s)/2).toFixed(2)} mm per side). Slots enlarged; teeth unchanged. Clearance is a test allowance, not confirmed physical fit. Cable walls above socket roofs remain; inspect short socket bridges in slicer. Bullet grip web stays 2.1 mm. Print cap closed face down, teeth up; backer floor down. Test fit, wire clearance and pull-off retention in PETG. Individual long-foot caps are not section-spanning double caps and do not replace rear bridges.`)})
  files.push({name:capName,bytes:cap})
  if(s.lighting!=='strip')files.push({name:'BULLET_CAPS.txt',bytes:new TextEncoder().encode('DERIVED BULLET DIFFUSERS: source strip-routing notches and small side apertures are filled within the measured wall/foot silhouettes. Outside cap dimensions and foot envelopes are preserved. Applies to single and joined caps, original-length and long teeth. Original reference STL is not overwritten. LED-strip mode retains its passages instead. Print closed face down, openings/feet up; verify pixel, optical and PETG fit on one sample.')})
  files.push({name:'project.holomatrix-px.json',bytes:new TextEncoder().encode(JSON.stringify(s,null,2))})
  if(s.lighting==='strip'){
    const strip=stripSpec(s)
    files.push({name:'STRIP_README.txt',bytes:new TextEncoder().encode(`PROTOTYPE LED STRIP MOUNT, 30 LEDs/m. Profile ${s.stripType??'ip30'}.
Measured/profile width ${strip.width} mm, overall height ${strip.thickness} mm. Total XY fit allowance ${strip.clearance} mm, channel width ${strip.channelWidth} mm.
The channel seats the strip's back face 0.4 mm into the front floor; LEDs face outward into the diffuser. There are NO bullet-pixel holes in these backers.
The supplied cap is a DERIVED version with enlarged strip passages, including the foot clearance. Original reference files are preserved. Print cap closed face on bed, opening up; backer floor down, cable cavity up. Bridge pocket/channel roofs; inspect slicer first.
IP ratings describe the purchased strip, not this printed enclosure. No waterproof enclosure or end seal is supplied.
Nominal LED center pitch ${strip.pitch} mm versus 33 mm touching diffuser centers. Check cumulative alignment on your real roll; no diffuser scaling or guaranteed LED alignment.
Each horizontal row/run requires routing. The strip cannot turn sideways at stair corners. Cut ONLY at marked permitted locations; some WS2811 strips group 3 LEDs into an address/cut segment. Layout light count is not necessarily address count.
Strips, sleeves, adhesive, pad joints and end fittings vary. Check sleeve fit, component clearance, bridge sag, strip/cap fit and cable routing on a sample. No adhesive retention or waterproofing is validated.
Rear backing plates and zip-tie slots are included when the layout has multiple sections. Read BACKING_PLATES.txt and PVC_MOUNTS.txt for separate clip mounts.
`)})
  }
  files.push({name:'START_HERE.txt',bytes:new TextEncoder().encode(`HoloMatrix PX prototype backers + diffuser cap
${layout.pixels.length} lights / ${layout.sections.length} carrier sections.
Units: millimetres. Load at 100% scale. Print each section STL once, flat floor on the bed, open cable cavity up.
Print ${singleCaps} copies of ${capName} for single-cap positions, plus ONE of each joined_diffuser STL. These together cover ${layout.pixels.length} lights. Read JOINED_DIFFUSERS.txt; do not double-install caps on connector cells.
${s.capFit==='extended'?'The cap is DERIVED with longer seating teeth. Read LONG_TEETH.txt; original cap files preserved.':s.lighting==='strip'?'The cap is DERIVED with widened strip passages. Read STRIP_README.txt; this is not the unchanged original cap.':'The cap is DERIVED with strip passages filled for bullet pixels. Read BULLET_CAPS.txt. Shaped bullet openings use your Koopa reference, through a flat 2.1 mm gripping floor without raised pads.'}
Use your established translucent material/settings. Backer mounting floor: 2.1 mm overall before pockets/channels.
Perimeter-only cable wall: 2 mm thick, 25.396 mm overall backer depth. No tall internal dividers.
${s.capFit==='extended'?`Through-floor seating slots accept 3.5 mm teeth through a flat 2.1 mm floor (about 1.4 mm projects beyond); ${toothClearanceTotal(s)} mm TOTAL XY clearance. Print the matching DERIVED cap.`:'The front face has pockets matching your original diffuser feet: 0.9 mm insertion, 0.95 mm pocket depth, 0.1 mm TOTAL XY clearance.'} ${s.lighting==='strip'?'Strip-cap passages are modified; original reference STLs are preserved.':'Bullet-cap strip passages are filled; original reference STLs are preserved.'}
Pocket roofs are short bridges; print flat floor on bed, cable walls up, without supports as the intended test orientation. Adjacent pockets can combine into wider bridges; check slicer preview.
No added spring latches. Friction retention, bridge sag and repeated assembly need a PETG test print before production.
${plates.length?'Rear seam backing plates and matching wall tie slots are included. Read BACKING_PLATES.txt.':'This one-section layout needs no seam backing plate.'} ${mounts.length} PVC mounting plates included; read PVC_MOUNTS.txt. Hardware fit is provisional; do not assume a production-ready assembly.
Print one sample in PETG and check pixel insertion/retention, cap attachment and wiring access before producing a full prop.
Section placement reserves 6 mm per side for future connectors, plus your bed edge clearance.
`)})
  return files
}
export async function exportStls(s:Settings) {
  const files=await buildStlFiles(s)
  const bytes=zipFiles(files),url=URL.createObjectURL(new Blob([bytes.slice().buffer],{type:'application/zip'})),a=document.createElement('a')
  a.href=url;a.download='holomatrix-px-prototype-STLs.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export async function buildBackingPlateFitFiles(s:Settings){
  const cells=[{x:0,y:0,id:1,row:0,section:0},{x:1,y:0,id:2,row:0,section:1}],plates=backingPlatePlan(cells)
  const warning=await validatePlateAssembly(plates,s);if(warning)throw new Error(warning)
  const files=await Promise.all(cells.map(async(p)=>({name:`tray_${p.section+1}_FLOOR_DOWN.stl`,bytes:binaryStl(await carrierMesh([p],s,plates))})))
  files.push({name:'rear_backing_plate_FLAT.stl',bytes:binaryStl(await backingPlateMesh(plates[0],s))})
  files.push({name:'READ_ME.txt',bytes:new TextEncoder().encode(`TWO-TRAY REAR BACKING PLATE PROTOTYPE, ${s.diffuser}, ${s.lighting??'bullet'} lighting.
Print all three parts at 100%, millimetres, PETG. Tray floors on bed, cable cavities up. Plate flat rear face down, locating recess up (rotate in slicer). Inspect 12 mm cable-passage and 4 mm wall-slot bridges; supports are not intended.
Put the trays edge-to-edge, plate across their rear wall tops with ${plateSeatSpec.depth} mm locating engagement and ${plateSeatSpec.clearanceTotal} mm TOTAL XY clearance. Plate underside is at ${plateAssemblyZ} mm. The plate windows sit over the pixel cavities. It is NOT a front diffuser retainer.
Use narrow zip ties through each paired plate slot and matching tray-wall slot: down outside, through wall, up inside, close above plate. Secure BOTH trays, without crushing the rim. Nominal 2.5 mm wide ties are a starting point, not guaranteed fit.
Check diffuser feet, pixel/strip fit, cable clearance, tie access and bending strength before production. Windows and receiving slots have square corners; no tiny spring tabs or pin press fits.
PVC clip attachment is still pending. Do not assume a mount-ready prop. Caps are not included in this three-part joint sample; use your existing matching caps or the regular cap export.
`)})
  return files
}
export async function exportBackingPlateFitTest(s:Settings){
  const bytes=zipFiles(await buildBackingPlateFitFiles(s)),url=URL.createObjectURL(new Blob([bytes.slice().buffer],{type:'application/zip'})),a=document.createElement('a')
  a.href=url;a.download=`holomatrix-px-${s.diffuser}-rear-plate-fit-test.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export async function buildStripFitFiles(s:Settings) {
  if(s.lighting!=='strip')throw new Error('Choose LED strip lighting first.')
  const sample={...s,shape:'line' as const,width:33/25.4,rows:1}
  const files=await buildStlFiles(sample)
  if(generate(sample).pixels.length!==2)throw new Error('The strip sample must contain two cells.')
  files.push({name:'FIT_SAMPLE.txt',bytes:new TextEncoder().encode(`TWO-DIFFUSER STRIP FIT TEST. Profile ${s.stripType??'ip30'}; uses your current strip measurements and fit allowance.
Print the sample backer once and the derived cap twice at 100%, millimetres. Use PETG and your translucent cap material. Read STRIP_README.txt for orientation.
Check strip/sleeve clearance, cap feet seating, bridge sag and light alignment. This is a short straight sample, not a routed arch or waterproof enclosure.
`)})
  return files
}
export async function exportStripFitTest(s:Settings) {
  const bytes=zipFiles(await buildStripFitFiles(s)),url=URL.createObjectURL(new Blob([bytes.slice().buffer],{type:'application/zip'})),a=document.createElement('a')
  a.href=url;a.download=`holomatrix-px-strip-${s.stripType??'ip30'}-fit-test.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export function download(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function exportSvg(s: Settings) {
  const layout = generate(s), b = layout.bounds, size = presets[s.diffuser].size
  const rects = layout.pixels.map(p => `<rect x="${(p.x-.5)*size}" y="${(p.y-.5)*size}" width="${size}" height="${size}" fill="hsl(${p.section*47%360} 50% 80%)" stroke="#24332c" stroke-width="0.4"/><text x="${p.x*size}" y="${p.y*size+2}" text-anchor="middle" font-family="sans-serif" font-size="5">${p.led===false?'Solid':p.id}</text>`).join('')
  download('pixel-prop-layout.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.widthMm}mm" height="${layout.heightMm}mm" viewBox="${b.minX*size} ${b.minY*size} ${b.width*size} ${b.height*size}">${rects}</svg>`, 'image/svg+xml')
}
export async function exportBlender(s: Settings) {
  const l = generate(s)
  const sections = await Promise.all(l.sections.map(section => carrierMesh(section,s)))
  download('build_pixel_prop.py', `# Generated by HoloMatrix PX. Prototype carriers only.
# Caps are separate. PVC clips and section connectors are not included yet.
# Run in Blender 5.2 Scripting workspace. Output goes beside the saved script.
import bpy, bmesh
from pathlib import Path
sections = ${JSON.stringify(sections)}
out = Path(__file__).resolve().parent / 'pixel_studio_parts'
out.mkdir(parents=True, exist_ok=True)
for number,triangles in enumerate(sections,1):
    vertices=[v for triangle in triangles for v in triangle]
    faces=[(i,i+1,i+2) for i in range(0,len(vertices),3)]
    mesh=bpy.data.meshes.new(f'Backer_{number:02d}');mesh.from_pydata(vertices,[],faces)
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=0.00001);bm.to_mesh(mesh);bm.free()
    result=bpy.data.objects.new(f'Pixel_Studio_Section_{number:02d}',mesh);bpy.context.collection.objects.link(result)
    bpy.context.view_layer.objects.active=result
    bpy.ops.object.select_all(action='DESELECT'); result.select_set(True)
    bpy.ops.wm.stl_export(filepath=str(out/f'section_{number:02d}.stl'),export_selected_objects=True)
    result.location.x += number * (${s.bed.width}+30)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'pixel_studio_sections.blend'))
print('Prototype carriers exported. Test cap/pixel fit before production printing.')
`)
}
