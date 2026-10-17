import {generate,presets,fitsBed,type Settings,type Pixel} from './geometry'
import {jointSettings} from './sectionLayout'
import {framePlan} from './propPlan'
import {conduitClipSettings,conduitClipPlan} from './conduitClips'
import {binaryStl,carrierMesh,type Triangle} from './mesh'
import {backingPlatePlan} from './backingPlate'
import {diffuserJoinPlan} from './propPlan'
import {buildPropFiles,spritePng} from './propExports'
import {wallTiePlan,wallTieSpec} from './wallTies'
import {joinedDiffuserMesh,joinedDiffuserFits,joinedDiffuserConflicts} from './joinedDiffuser'
import {extendedCapMesh} from './extendedCap'
import {bulletCapMesh} from './bulletCap'
import {stripCapMesh} from './stripCap'
import {stripSpec} from './strip'
import {seamClipMesh,seamClipPlan,seamClipSpec} from './seamClips'
import {emtMountParts,emtPrintPose} from './emtHardware'
import house from '../../diffuser_references/house_33mm.stl?url'
import mario from '../../diffuser_references/mario_25_08mm.stl?url'
const text=(name:string,value:string)=>({name,bytes:new TextEncoder().encode(value)})
const onBed=(ts:Triangle[])=>{const min=Math.min(...ts.flat().map(v=>v[2]));return ts.map(t=>t.map(v=>[v[0],v[1],v[2]-min]) as Triangle)}
export async function buildDirectTieFiles(s:Settings,sample=false){
  const l=generate(s)
  if(!sample&&(!l.printable||(!l.connected&&s.shape!=='sprite')))throw new Error('Layout must be connected and fit the printer bed.')
  if(!sample&&!l.wiringComplete)throw new Error('No complete series data path found. Review the layout before exporting.')
  const pixels:Pixel[]=sample?[{x:0,y:0,id:1,row:0,section:0},{x:1,y:0,id:2,row:0,section:1}]:l.pixels
  const sections=sample?[[pixels[0]],[pixels[1]]]:l.sections,seams=sample?backingPlatePlan(pixels):diffuserJoinPlan(pixels,s),ties=wallTiePlan(pixels,s)
  if(sections.some(c=>!ties.some(t=>t.pixel.section===c[0].section)))throw new Error('A section has no accessible outer-wall tie points. Change the layout before export.')
  const conflict=joinedDiffuserConflicts(seams);if(conflict)throw new Error(conflict)
  if(seams.some(p=>!joinedDiffuserFits(p,s)))throw new Error('A merged seam diffuser exceeds the usable print bed.')
  const response=await fetch(s.diffuser==='house'?house:mario);if(!response.ok)throw new Error('Could not load the diffuser cap')
  const source=await response.arrayBuffer(),v=new DataView(source)
  if(source.byteLength<84||v.getUint32(80,true)===0||source.byteLength!==84+50*v.getUint32(80,true))throw new Error('STL is invalid')
  const files=await Promise.all(sections.map(async(c,i)=>({name:`section_${String(i+1).padStart(2,'0')}.stl`,bytes:binaryStl(await carrierMesh(c,s,[],pixels))})))
  if(s.shape==='sprite'&&!sample)files.push(text('ASSEMBLY_TRAYS.json',JSON.stringify(sections.map((cells,i)=>({file:`section_${String(i+1).padStart(2,'0')}.stl`,translation_mm:[(Math.min(...cells.map(p=>p.x))+Math.max(...cells.map(p=>p.x)))/2*presets[s.diffuser].size,-(Math.min(...cells.map(p=>p.y))+Math.max(...cells.map(p=>p.y)))/2*presets[s.diffuser].size,0]})),null,2)))
  if(!sample)files.push(text('WIRING_ROUTE.csv','from_pixel,to_pixel,routed_center_length_mm,rear_path_grid_xy\n'+l.wirePaths.map((path,i)=>`${i+1},${i+2},${path.slice(1).reduce((sum,p,j)=>sum+Math.hypot(p.x-path[j].x,p.y-path[j].y)*presets[s.diffuser].size,0).toFixed(2)},"${path.map(p=>`${p.x}:${p.y}`).join(' > ')}"`).join('\n')))
  if(!sample)files.push(text('WIRING_README.txt','Follow the single numbered data chain. Each LED is visited once. Solid arrows are local links; dashed violet routes are rear jumpers. Rear returns may pass behind earlier nodes without connecting to them. See JUMPERS.csv for extension estimates and supported frame bridges. WIRING_ROUTE.csv lists every point-to-point connection. Lengths are grid centerline estimates, NOT cut lengths: add slack for rear pixel bodies, connectors, bends, clips and over-wall section crossings. No cable-bundle clearance is certified. Row count stays grid-based; narrow full-edge stair corners remain and the PVC is the continuous structural support. Existing projects regenerate with revised counts and numbering; check an already-wired prop before applying them. Strip mode still requires legal cut points and address-group mapping.'))
  const clips=seamClipPlan(pixels,s)
  if(s.shape==='sprite'&&!sample){
    const joint=jointSettings(s),rails=framePlan(s,pixels)
    files.push(text('SECTION_JOINTS.txt',`Broad whole-cell puzzle joins: ${joint.enabled?'enabled':'disabled'}. Original grid pitch and pixel coordinates are unchanged. Each transferred cell belongs to exactly one tray; it is not an extra added light.\nNominal tongue flank gap ${joint.sideGap} mm PER SIDE; width allowance about ${2*joint.sideGap} mm. Tip gap ${joint.tipGap} mm. Male convex-corner chamfer ${joint.cornerChamfer} mm; square receiver corners. Bed-edge relief ${joint.bottomRelief} mm at 45 degrees; extra upper-wall gap ${joint.upperRelief} mm total. Flat wall interfaces split the side gap across both faces.\nUse the floors as the flat glue-up datum. Do not squeeze potentially angled wall tops flush. No measured wall-lean correction is built in. Print the unscaled puzzle fit sample first and check cap feet, clip fit and glue clearance. Interference/topology checks do not prove retention or strength.\nMounting axes are snapped to cell edges before packing. Two-cell-wide poles remain together; their section end joins can step. Clip stations favor proximity to rail axes, but are ordinary seam bridges, NOT post/conduit mounting heads. Use measured, compatible mounting hardware and support every section independently. Crossmember preview rails are staggered in depth; actual fittings and mounting access remain to be designed/checked.\n`))
    files.push(text('PUZZLE_TONGUES.csv','node,x_grid,y_grid,section,direction_x,direction_y\n'+pixels.filter(p=>p.jointMale).map(p=>`${p.id},${p.x},${p.y},${p.section+1},${p.jointDx},${p.jointDy}`).join('\n')))
    files.push(text('SEAM_CLIP_PLAN.csv','clip,section_a,section_b,x_grid,y_grid,angle_degrees,nearest_rail_mm\n'+clips.map(p=>`${p.id},${p.a.section+1},${p.b.section+1},${p.x},${p.y},${p.angle*180/Math.PI},${rails.length?Math.min(...rails.map(r=>(r.axis==='vertical'?Math.abs(p.x-r.a.x):Math.abs(p.y-r.a.y))*presets[s.diffuser].size)).toFixed(2):''}`).join('\n')))
  }
  for(const p of clips){const clip=await seamClipMesh(p,s,pixels);files.push({name:`seam_wall_bridge_${String(p.id).padStart(2,'0')}_SLOTS_UP.stl`,bytes:binaryStl(onBed(clip.map(t=>t.map(v=>[v[0],-v[1],-v[2]]) as Triangle)))})}
  files.push(text('SEAM_CLIPS.txt',`Print each of the ${clips.length} numbered seam_wall_bridge_*_SLOTS_UP.stl files once. Full flat roof DOWN, slot mouths UP, as supplied. No PVC head or bolt. Broad U-shaped bridge captures the TWO opposed 2 mm seam walls together; receiving gap ${4+seamClipSpec.clearance} mm, ${seamClipSpec.clearance} mm total allowance. Engagement ${seamClipSpec.depth} mm; roof ${seamClipSpec.roof} mm. Square inside corners. Each bridge is ${seamClipSpec.length} mm long along the seam, centered on a suitable cell edge. Conduit mounting zones take priority; other stations remain clear for over-wall wiring. Crowded staircase-corner stations are omitted while retaining a connector for each section interface.\nAlign trays with merged front diffuser; lower clips over both seam walls. Optional compatible adhesive on broad contacts. Thread keeper tie through the aligned small holes in both walls and clip legs, then loop OVER the clip roof and close. Keeper prevents lift-off; PVC ties independently carry section weight. Large seam cable windows are CLOSED. Route wires OVER exposed wall tops between clips; avoid pinching, allow slack and protect insulation. Check actual connector/cable size; no cable clearance or load rating is certified.\nPrint one short sample at 100% in PETG before full assembly. Test fit, insertion, keeper threading, wall flex and glue.\n${clips.map(c=>`Clip ${c.id}: sections ${c.a.section+1}/${c.b.section+1}, pixels ${c.a.id}/${c.b.id}`).join('\n')}`))
  for(const seam of seams)files.push({name:`joined_diffuser_${String(seam.id).padStart(2,'0')}_${seam.cells?.length??2}_pixels_FACE_DOWN.stl`,bytes:binaryStl(onBed(await joinedDiffuserMesh(source,s,seam)))})
  const cap=s.capFit==='extended'?await extendedCapMesh(source,s):s.lighting==='strip'?await stripCapMesh(source,s):await bulletCapMesh(source,s)
  const name=s.capFit==='extended'?`diffuser_cap_${s.diffuser}_LONG_TEETH_${s.lighting==='strip'?s.stripType??'ip30':'bullet'}_DERIVED.stl`:s.lighting==='strip'?`diffuser_cap_STRIP_${s.stripType??'ip30'}_DERIVED.stl`:`diffuser_cap_${s.diffuser}_BULLET_CLOSED_DERIVED.stl`
  files.push({name,bytes:binaryStl(onBed(cap))})
  const covered=new Set(seams.flatMap(p=>p.cells??[p.a,p.b]).map(c=>c.id)),solids=pixels.filter(p=>p.led===false).length,singles=pixels.length-covered.size-solids
  files.push(text('PRINT_QUANTITIES.csv','part,quantity\ncarrier_section_files,1 each\nseam_wall_bridge_files,1 each\njoined_diffuser_files,1 each\nsingle_diffuser_cap,'+singles+'\nopaque_black_border_cap,'+solids+'\n'))
  files.push(text('START_HERE.txt',`PVC-backbone / direct wall ties - PROTOTYPE.\n${pixels.filter(p=>p.led!==false).length} lights / ${sections.length} carrier sections.\nPrint each section once, flat 2.1 mm floor DOWN, protective walls UP. Integral wall pads and tie slots are already in the tray STL; separate numbered seam bridge clips join neighboring walls; no large mounting plates or bolts. Optional conduit mounts are included separately when selected. Read SEAM_CLIPS.txt. Print ${singles} single caps plus each joined diffuser once; together cover ${pixels.filter(p=>p.led!==false).length} lights. Also print ${solids} opaque black border caps from the same single-cap STL; these cover solid-floor cells without LEDs. See SOLID_BORDER.csv. Caps print closed face down. Never install singles underneath joined diffusers. Millimetres, 100% scale. Read WALL_TIES.txt; print a short PETG sample first. Mesh validation is not a physical strength or fit test.`))
  files.push(text('WALL_TIES.txt',`Straight and curved PVC are the continuous backbone. Tie EVERY section to the pipe independently; glue and merged front diffusers align seams, not the primary weight-bearing structure.\nSlots ${wallTieSpec.width} x ${wallTieSpec.height} mm, beginning ${wallTieSpec.z} mm above the floor. Each has a ${wallTieSpec.padWidth} x ${wallTieSpec.padHeight} mm integral inward pad adding ${wallTieSpec.padThickness} mm to the 2 mm wall. Pads have a 45-degree bottom ramp (1.5 mm rise for 1.5 mm inward projection). Slot roofs bridge ${wallTieSpec.width} mm between supported ends in floor-down orientation. Confirm in slicer; bridge quality not physically verified.\nPaired slots cross exposed outer walls, with extra stations targeting gaps over ${wallTieSpec.spacing} mm. Small sections may have only one opposed pair: use an additional tie/station if they twist.\nPass tie through opposed wall slots and around PVC, keeping its head accessible. Do not trap wiring or bear the PVC on pixel bodies. Actual pipe position, tie routing and clearance depend on the installed pixels and must be checked before tightening. Use a local spacer only where needed. Do not overtighten or distort walls. UV-suitable ties, retention, creep, wind load and existing top/foot anchorage require physical testing; no load rating.\n${sections.map(c=>`Section ${c[0].section+1}: ${ties.filter(t=>t.pixel.section===c[0].section).length} reinforced wall slots.`).join('\n')}`))
  if(s.capFit==='extended')files.push(text('LONG_TEETH.txt','3.5 mm seating teeth through a flat 2.1 mm floor. Unchanged configurable socket clearance; no raised pixel-retention pads.'))
  if(s.lighting==='strip'){const sp=stripSpec(s);files.push(text('STRIP_README.txt',`30 LEDs/m ${s.stripType??'ip30'} prototype: channel width ${sp.channelWidth} mm. NO bullet-pixel holes. Purchased strip rating is not this printed enclosure. 33.333 mm nominal LED pitch versus 33 mm touching diffuser centers; test accumulated alignment, legal cut points, and wiring at staircase turns.`))}
  files.push(text('project.holomatrix-px.json',JSON.stringify(s,null,2)))
  if(sample)files.push(text('FIT_SAMPLE.txt','Two unscaled short trays, integral wall zip-tie slots, one merged diffuser. Seam bridge clips included. Large seam windows closed; cables route over walls. Test the actual PVC, pixels, ties and cable routing before a full print.'))
  if(!sample){
    files.push(...buildPropFiles(s))
    if(s.shape==='sprite'){
      // Keep the shared construction notes, but do not imply PVC-only mounting
      // or the dense arch clip distribution applies to arbitrary sprite props.
      for(const file of files){
        if(!['START_HERE.txt','WALL_TIES.txt','SEAM_CLIPS.txt'].includes(file.name))continue
        let notes=new TextDecoder().decode(file.bytes).replaceAll('PVC','support pipe / conduit')
        notes=notes.replace('House pitch starts with two spaced clips per touching cell edge; smaller Mario pitch uses one per edge.','Sprite props use up to two spaced clips per section interface.')
        file.bytes=new TextEncoder().encode(notes)
      }
    }
    if(s.shape==='sprite'&&typeof document!=='undefined')files.push({name:'artwork.png',bytes:await spritePng(s.sprite!)})
    if(s.shape==='sprite')files.push(text('WIRING_README.txt','Read XLIGHTS_README.txt, STRINGS.csv and JUMPERS.csv. Use one data input and one output. Follow actual from_pixel/to_pixel values, not CSV row numbers. Rear jumpers bypass choke points without revisiting LEDs; exposed frame bridges require cable support. Added-wire estimates include 20 mm service allowance, not a verified cut length. Power injection is independent of data continuity. Support disconnected islands and every section on the frame independently. Wall tie points on sprite props may lie on section seam walls; check threading and clip/cable clearance before assembly. Frame rails are planning references only.'))
    files.push(text('OPEN_IN_BLENDER.py',`# holomatrix-px: reviewed Blender 5.x import workflow. No scene reset.
# Extract the complete ZIP first. Run this file in Blender's Scripting workspace.
# Editable mesh parts are arranged in PRINT orientation, not assembled poses.
# Regenerate dimensions from project.holomatrix-px.json in holomatrix-px.
import bpy, json
from pathlib import Path
folder = Path(__file__).resolve().parent
target = folder / 'pixel_prop_parts.blend'
if target.exists():
    raise RuntimeError('pixel_prop_parts.blend exists. Rename it before running; no file overwritten.')
if not hasattr(bpy.ops.wm, 'stl_import'):
    raise RuntimeError('Blender 4.1+ STL import is required.')
project = json.loads((folder / 'project.holomatrix-px.json').read_text(encoding='utf-8'))
collection = bpy.data.collections.new('holomatrix-px imported print parts')
bpy.context.scene.collection.children.link(collection)
collection['blueprint_json'] = json.dumps(project)
collection['units'] = '1 Blender coordinate = 1 mm; do not rescale mesh coordinates'
for index, path in enumerate(sorted(folder.glob('*.stl'))):
    before = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=str(path), global_scale=1.0, use_scene_unit=False)
    for obj in set(bpy.data.objects) - before:
        for parent in list(obj.users_collection): parent.objects.unlink(obj)
        collection.objects.link(obj)
        obj['source_stl'] = path.name
        obj['prototype'] = 'Physical fit, retention, strength and weather testing required'
        obj.location.x += (index % 5) * ${s.bed.width+30}
        obj.location.y += (index // 5) * ${s.bed.depth+30}
bpy.ops.wm.save_as_mainfile(filepath=str(target), check_existing=True)
print('Saved editable print-part meshes. Original scene objects preserved. No physical validation claimed.')
`))
  }
  if(s.shape==='sprite'&&conduitClipSettings(s).mode==='existing'){
    const zones=conduitClipPlan(pixels,s)
    if(zones.length){
      const rails=framePlan(s,pixels),quantities:string[]=[]
      for(const rail of rails){
        const count=zones.filter(z=>z.rail===rail.id).length;if(!count)continue
        for(const zone of zones.filter(z=>z.rail===rail.id)){
          const parts=await emtMountParts(s,pixels,zone,rail.rearCenter)
          const name=`conduit_base_mount_${zone.id}_SIDE_DOWN.stl`
          files.push({name,bytes:binaryStl(emtPrintPose(parts.base))});quantities.push(`${name},1`)
          if(zone===zones.find(z=>z.rail===rail.id)){
            const headName=`conduit_head_rail_${rail.id}_SIDE_DOWN.stl`
            files.push({name:headName,bytes:binaryStl(emtPrintPose(parts.head))});quantities.push(`${headName},${count}`)
          }
        }
      }
      files.push(text('CONDUIT_PRINT_QUANTITIES.csv','part,quantity\n'+quantities.join('\n')))
      files.push(text('CONDUIT_FIT_TEST.txt','Derived from Mitchell’s original EMT base and medium head, not uniformly scaled. Original files preserved. Quarter-turned head; relieved receiving stem (0.05 mm normal allowance), 0.6 mm diametral pipe-bore allowance, trimmed base mouths above the 2.1 mm floor. Print SIDE_DOWN as provided. Verify in slicer, then test one PETG base/head, glue contact, insertion, keeper/zip-tie access and actual pipe before production. Mesh checks are not physical strength or weather tests. Read CONDUIT_PRINT_QUANTITIES.csv; do not print every hardware file only once.'))
    }
    for(const file of files.filter(f=>['START_HERE.txt','WALL_TIES.txt','SEAM_CLIPS.txt','SECTION_JOINTS.txt'].includes(f.name))){
      let notes=new TextDecoder().decode(file.bytes)
      notes=notes.replace('while retaining a connector for each section interface.','without placing a bridge inside a reserved conduit mounting zone. Inspect the remaining joins; a zone is not installed hardware.')
      notes+='\nCONDUIT CLIP OPTION: '+zones.length+' derived two-part mounts. Read CONDUIT_FIT_TEST.txt and CONDUIT_PRINT_QUANTITIES.csv. Ordinary seam bridges and tie pads avoid these mounts. Sections without a mount still require independent direct ties or additional framing. Physical fit and retention require testing.\n'
      file.bytes=new TextEncoder().encode(notes)
    }
  }
  return [...new Map(files.map(f=>[f.name,f])).values()]
}

export async function buildPuzzleFitFiles(s:Settings){
  const size=presets[s.diffuser].size
  const test:Settings={...s,name:'Unscaled two-row puzzle fit coupon',shape:'sprite',lighting:'bullet',frame:undefined,sectionJoints:{...jointSettings(s),enabled:true},bed:{shape:'circle',width:size*5.7,depth:size*5.7,margin:8},sprite:{width:2,height:6,source:'Short test bodies; interfaces are full scale',cells:Array.from({length:12},(_,i)=>({x:i%2,y:Math.floor(i/2),color:'#ffffff'}))}}
  const layout=generate(test)
  if(layout.sections.length!==2||!layout.pixels.some(p=>p.jointMale))throw new Error('Could not produce the two-piece puzzle fit coupon.')
  if(layout.sections.some(c=>!fitsBed(c,size,s.bed)))throw new Error('Puzzle coupon does not fit the selected printer bed.')
  const files=await buildDirectTieFiles(test)
  files.push(text('FIT_SAMPLE.txt','Two short two-row trays with a full-scale whole-cell puzzle tongue/recess, current fit settings, seam bridges and diffuser samples. Test floor coplanarity, flank/tip clearances, male chamfers, bed-edge relief, cap seating and keeper ties. The reduced virtual bed in the project only forces short test sections; print on your normal printer at 100%. Clip files are seam bridges, not post/conduit heads. The single cap STL is a repeatable part; read PRINT_QUANTITIES.csv.'))
  return files
}
