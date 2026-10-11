import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js'
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js'
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js'
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js'
import { bounds, presets, type Settings, type generate } from './geometry'
import { carrierMesh } from './mesh'
import {stripCapMesh} from './stripCap'
import {bulletCapMesh} from './bulletCap'
import {extendedCapMesh} from './extendedCap'
import {joinedDiffuserMesh,joinedDiffuserFits,joinedDiffuserConflicts} from './joinedDiffuser'
import {stripSpec} from './strip'
import { sectionOffsets, triangleGeometry } from './previewGeometry'
import {frameBounds} from './viewFraming'
import {assemblyLayerDelay,assemblyMotionDuration,assemblyMotionProgress} from './assemblyMotion'
import {lightSimulationSample} from './lightSimulation'
import {buildPinJointParts} from './pinJoint'
import {diffuserJoinPlan,framePlan,defaultFrame} from './propPlan'
import {cellKey} from './sprite'
import {wallTiePlan,wallTieSpec} from './wallTies'
import {seamClipPlan,seamClipMesh,seamClipZ} from './seamClips'
import {conduitClipPlan} from './conduitClips'
import {emtCompatible,emtMountParts} from './emtHardware'
import marioUrl from '../../diffuser_references/mario_25_08mm.stl?url'
import houseUrl from '../../diffuser_references/house_33mm.stl?url'
import './previewNavigation.css'
import {createHolodeck} from './holodeck'

const colors=['#9cbd9b','#e5b27c','#8cb6b8','#b7a6cc','#d9948d','#c4bd7f']
type Props={settings:Settings;layout:ReturnType<typeof generate>;selected:number;onSelect:(n:number)=>void;toolbarTarget:HTMLDivElement|null;showFrameGuides?:boolean;materializeRequest?:number}
type ViewAngle='angle'|'front'|'back'|'floor'|'ceiling'
type Viewer={fit:(angle?:ViewAngle)=>void;focus:()=>void;clearSelection:()=>void;caps:THREE.Group;render:()=>void;resetMoves:()=>void;explodeJoint:(enabled:boolean,separate?:boolean,animate?:boolean)=>void;setLights:(enabled:boolean)=>void}

export default function Preview3D({settings,layout,selected,onSelect,toolbarTarget,showFrameGuides=false,materializeRequest=0}:Props) {
  const host=useRef<HTMLDivElement>(null), viewer=useRef<Viewer|null>(null)
  const [part,setPart]=useState(false),[caps,setCaps]=useState(true),[exploded,setExploded]=useState(false)
  const [separateSections,setSeparateSections]=useState(false)
  const [jointMode,setJointMode]=useState(false)
  const [lights,setLights]=useState(false)
  const [activePiece,setActivePiece]=useState('')
  const [assemblyWarning,setAssemblyWarning]=useState('')
  const separated=exploded&&separateSections&&!part&&!jointMode
  const [status,setStatus]=useState('Loading your diffuser…'),[error,setError]=useState('')
  const options=useRef({caps,exploded,separated,lights});options.current={caps,exploded,separated,lights}
  useEffect(()=>{if(materializeRequest){setExploded(false);setSeparateSections(false);setJointMode(false);setPart(false)}},[materializeRequest])
  useEffect(()=>{
    const element=host.current!
    let renderer:THREE.WebGLRenderer
    try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})}
    catch {setError('3D needs WebGL. Try enabling hardware acceleration in your browser.');return}
    setError('');setStatus(jointMode?'Loading R2 joint test…':'Loading your diffuser…')
    setAssemblyWarning('')
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
    renderer.setClearColor(0x080d15,1)
    renderer.outputColorSpace=THREE.SRGBColorSpace
    renderer.toneMapping=THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure=1
    renderer.domElement.setAttribute('aria-label','Interactive 3D prop preview. Click to select, middle mouse to pan, right mouse to orbit, F to focus.')
    renderer.domElement.setAttribute('role','img')
    renderer.domElement.tabIndex=0
    element.appendChild(renderer.domElement)
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,50000)
    const controls=new OrbitControls(camera,renderer.domElement)
    controls.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE}
    const transform=new TransformControls(camera,renderer.domElement)
    transform.setMode('translate');transform.setSpace('world');transform.setSize(.85)
    scene.add(transform.getHelper())
    controls.enableDamping=false;controls.minDistance=10;controls.maxDistance=30000
    const ambient=new THREE.HemisphereLight(0xffffff,0x63735b,1.7)
    scene.add(ambient)
    const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-200,350,500);scene.add(light)
    const fill=new THREE.DirectionalLight(0xffe8c6,1.2);fill.position.set(300,-150,-400);scene.add(fill)
    const model=new THREE.Group(),capGroup=new THREE.Group();model.add(capGroup);scene.add(model)
    const visible=jointMode?[]:part?[layout.sections[selected]??[]]:layout.sections
    const cells=visible.flat(),b=bounds(cells),size=presets[settings.diffuser].size
    const centerX=(b.minX+b.maxX)/2,centerY=(b.minY+b.maxY)/2
    const offsets=sectionOffsets(visible,size,false)
    const spreadOffsets=sectionOffsets(visible,size,true)
    const sectionShift=(a:number,b=a)=>{
      const first=spreadOffsets.get(a),second=spreadOffsets.get(b)
      const o=first&&second?{x:(first.x+second.x)/2,y:(first.y+second.y)/2}:first??second
      return new THREE.Vector3(o?.x??0,o?.y??0,0)
    }
    const plates=diffuserJoinPlan(layout.pixels,settings)
    const spriteColors=new Map(settings.sprite?.cells.map(p=>[cellKey(p),p.color])??[])
    const ties=wallTiePlan(layout.pixels,settings)
    const display=bounds(cells.map(p=>{const offset=offsets.get(p.section)!;return{x:p.x+offset.x/size,y:p.y-offset.y/size}}))
    const fitX=((display.minX+display.maxX)/2-centerX)*size,fitY=-((display.minY+display.maxY)/2-centerY)*size
    const span=Math.max(b.width*size,b.height*size,50),explode=Math.max(100,span*.09)
    const holodeck=createHolodeck(span);scene.add(holodeck.group)
    const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[]
    const composer=new EffectComposer(renderer),scenePass=new RenderPass(scene,camera)
    const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.25,.1,.9),output=new OutputPass()
    composer.addPass(scenePass);composer.addPass(bloom);composer.addPass(output)
    const render=()=>{holodeck.follow(camera);outline?.update();if(lightsEnabled)composer.render();else renderer.render(scene,camera)}
    const glowing:{material:THREE.MeshStandardMaterial;base:THREE.Color;index:number;art?:THREE.Color}[]=[]
    let lightFrame:number|undefined,lightsEnabled=false,lastLightFrame=0
    const stopLights=()=>{if(lightFrame!==undefined)cancelAnimationFrame(lightFrame);lightFrame=undefined}
    const updateLights=(now:number)=>{
      glowing.forEach(({material,base,index,art})=>{
        if(lightsEnabled){
          const sample=lightSimulationSample(index,now/1000)
          if(art)material.emissive.copy(art);else material.emissive.setHSL(sample.hue,1,.4);material.emissiveIntensity=art?1.3:sample.intensity*1.8
          material.color.copy(material.emissive).multiplyScalar(.18)
        }else{material.color.copy(base);material.emissive.set(0x000000);material.emissiveIntensity=0}
      })
    }
    const runLights=(now:number)=>{
      if(!lightsEnabled||document.hidden){lightFrame=undefined;return}
      if(now-lastLightFrame>=1000/30){lastLightFrame=now;updateLights(now);render()}
      lightFrame=requestAnimationFrame(runLights)
    }
    const setLights=(enabled:boolean)=>{
      stopLights();lightsEnabled=enabled
      scene.background=new THREE.Color(0x080d15)
      ambient.intensity=enabled?.2:1.7;light.intensity=enabled?.35:2;fill.intensity=enabled?.15:1.2
      updateLights(performance.now());render()
      if(enabled&&!document.hidden)lightFrame=requestAnimationFrame(runLights)
    }
    const onVisibility=()=>{stopLights();if(lightsEnabled&&!document.hidden)lightFrame=requestAnimationFrame(runLights)}
    document.addEventListener('visibilitychange',onVisibility)
    const movable:THREE.Mesh[]=[],raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2()
    let outline:THREE.BoxHelper|null=null,press:{x:number;y:number;gizmo:boolean}|null=null
    const selectPiece=(mesh?:THREE.Mesh)=>{
      transform.detach()
      if(outline){scene.remove(outline);outline.geometry.dispose();(outline.material as THREE.Material).dispose();outline=null}
      setActivePiece(mesh?String(mesh.userData.label):'')
      if(mesh){transform.attach(mesh);outline=new THREE.BoxHelper(mesh,0xf08a37);scene.add(outline)}
      render()
    }
    setActivePiece('')
    let animationFrame:number|undefined
    const stopMotion=()=>{if(animationFrame!==undefined)cancelAnimationFrame(animationFrame);animationFrame=undefined}
    const explodeJoint=(enabled:boolean,separate=false,animate=false)=>{
      stopMotion()
      const tracks=movable.map(mesh=>{
        const lift=mesh.userData.explodeOffset as THREE.Vector3|undefined
        const target=(mesh.userData.home as THREE.Vector3).clone()
        if(enabled&&lift)target.add(lift)
        if(enabled&&separate&&mesh.userData.sectionShift)target.add(mesh.userData.sectionShift as THREE.Vector3)
        return {object:mesh as THREE.Object3D,start:mesh.position.clone(),target,delay:assemblyLayerDelay(lift?.length()??0,mesh.parent===capGroup,enabled)}
      })
      tracks.push({object:capGroup,start:capGroup.position.clone(),target:new THREE.Vector3(0,0,enabled?-explode:0),delay:assemblyLayerDelay(0,true,enabled)})
      // Explicit user-controlled assembly inspection, not automatic decorative
      // motion. Mitchell requested this even with his device's Reduce Motion on.
      if(!animate){
        tracks.forEach(t=>t.object.position.copy(t.target));render();return
      }
      const start=performance.now()
      const tick=(now:number)=>{
        const elapsed=now-start
        tracks.forEach(t=>t.object.position.lerpVectors(t.start,t.target,assemblyMotionProgress(elapsed,t.delay)))
        render()
        if(elapsed<assemblyMotionDuration+135)animationFrame=requestAnimationFrame(tick)
        else animationFrame=undefined
      }
      animationFrame=requestAnimationFrame(tick)
    }
    const syncAssembly=()=>explodeJoint(options.current.exploded,options.current.separated)
    const resetMoves=()=>{selectPiece();explodeJoint(false,false,true)}
    const onTransformDrag=(event:{value:unknown})=>{controls.enabled=!event.value;if(event.value)stopMotion()}
    const onTransformChange=()=>{outline?.update();render()}
    transform.addEventListener('dragging-changed',onTransformDrag)
    transform.addEventListener('change',onTransformChange)
    const onPointerDown=(event:PointerEvent)=>{
      renderer.domElement.focus({preventScroll:true})
      if(event.button!==0)return
      press={x:event.clientX,y:event.clientY,gizmo:transform.axis!==null}
    }
    const onPointerUp=(event:PointerEvent)=>{
      const start=press;press=null
      if(!start||start.gizmo||Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)return
      const rect=renderer.domElement.getBoundingClientRect()
      pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1)
      scene.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera)
      const hit=raycaster.intersectObjects(movable.filter(mesh=>mesh.parent!==capGroup||capGroup.visible),false)[0]
      selectPiece(hit?.object as THREE.Mesh|undefined)
    }
    const onPointerCancel=()=>{press=null;controls.enabled=true}
    renderer.domElement.addEventListener('pointerdown',onPointerDown)
    renderer.domElement.addEventListener('pointerup',onPointerUp)
    renderer.domElement.addEventListener('pointercancel',onPointerCancel)
    let angle:ViewAngle='angle'
    const frame=(box:THREE.Box3,direction:THREE.Vector3)=>{
      const pose=frameBounds(box,direction,camera.fov,Math.max(1,element.clientWidth)/Math.max(1,element.clientHeight))
      controls.target.copy(pose.target);camera.position.copy(pose.direction.multiplyScalar(pose.distance)).add(controls.target)
      camera.near=Math.max(.1,pose.distance/1000);camera.far=Math.max(50000,pose.distance*5)
      camera.updateProjectionMatrix();controls.update();render()
    }
    const fit=(next:ViewAngle=angle)=>{
      angle=next
      const direction=next==='front'?new THREE.Vector3(0,0,-1):next==='back'?new THREE.Vector3(0,0,1):next==='floor'?new THREE.Vector3(.65,.25,1).normalize():next==='ceiling'?new THREE.Vector3(.65,1.2,1).normalize():new THREE.Vector3(.6,.55,1).normalize()
      model.updateMatrixWorld(true)
      const fitBox=new THREE.Box3()
      model.children.filter(child=>child.visible).forEach(child=>fitBox.expandByObject(child))
      if(fitBox.isEmpty())fitBox.setFromCenterAndSize(new THREE.Vector3(fitX,fitY,12),new THREE.Vector3(display.width*size,display.height*size,explode+50))
      const propBox=new THREE.Box3()
      model.children.filter(child=>child.visible&&!child.userData.planningRail).forEach(child=>propBox.expandByObject(child))
      holodeck.ground(propBox.isEmpty()?fitBox.min.y:propBox.min.y)
      frame(fitBox,direction)
    }
    const focus=()=>{
      if(!transform.object){fit();return}
      model.updateMatrixWorld(true)
      frame(new THREE.Box3().setFromObject(transform.object),camera.position.clone().sub(controls.target))
    }
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key.toLowerCase()==='f'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();focus()}
      if(event.key==='Escape')selectPiece()
    }
    renderer.domElement.addEventListener('keydown',onKeyDown)
    const resize=()=>{
      const width=Math.max(1,element.clientWidth),height=Math.max(1,element.clientHeight)
      renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix()
      composer.setSize(width,height);render()
    }
    controls.addEventListener('change',render)
    const observer=new ResizeObserver(resize);observer.observe(element)
    resize();fit()
    capGroup.visible=options.current.caps;capGroup.position.z=options.current.exploded?-explode:0
    viewer.current={fit,focus,clearSelection:()=>selectPiece(),caps:capGroup,render,resetMoves,explodeJoint,setLights}
    setLights(options.current.lights&&options.current.caps&&!jointMode)
    let disposed=false
    const abort=new AbortController()
    void (async()=>{
      try {
        if(jointMode){
          const parts=await buildPinJointParts();if(disposed)return
          const labels=['Tongue · R2 male','Receiver · R2 female','Pin · R2 compensated'],palette=[0xe5b27c,0x9cbd9b,0x8cb6b8]
          parts.forEach((part,i)=>{
            const geometry=triangleGeometry(part.triangles)
            // The files are in print orientation; display them assembled.
            if(i===1){geometry.rotateX(Math.PI);geometry.translate(0,0,6.1)}
            if(i===2){geometry.rotateX(Math.PI);geometry.translate(8,0,8.1)}
            geometry.computeBoundingBox()
            const center=geometry.boundingBox!.getCenter(new THREE.Vector3());geometry.translate(-center.x,-center.y,-center.z)
            const material=new THREE.MeshStandardMaterial({color:palette[i],roughness:.68}),mesh=new THREE.Mesh(geometry,material)
            mesh.position.copy(center)
            mesh.userData={label:labels[i],home:center.clone(),explodeOffset:i===0?new THREE.Vector3(-12,0,0):i===1?new THREE.Vector3(24,0,0):new THREE.Vector3(0,0,18)}
            model.add(mesh);movable.push(mesh);geometries.push(geometry);materials.push(material)
          })
          syncAssembly();setStatus('R2 joint fit test · 3 separate pieces');fit('angle');return
        }
        for(const section of visible){
          if(!section.length)continue
          const triangles=await carrierMesh(section,settings,[],layout.pixels);if(disposed)return
          const sb=bounds(section),geometry=triangleGeometry(triangles)
          const material=new THREE.MeshStandardMaterial({color:colors[section[0].section%colors.length],roughness:.68,metalness:0})
          const mesh=new THREE.Mesh(geometry,material),offset=offsets.get(section[0].section)!
          mesh.position.set(((sb.minX+sb.maxX)/2-centerX)*size+offset.x,-((sb.minY+sb.maxY)/2-centerY)*size+offset.y,0)
          mesh.userData={label:`Backer ${String(section[0].section+1).padStart(2,'0')}`,home:mesh.position.clone(),sectionShift:sectionShift(section[0].section)};movable.push(mesh)
          model.add(mesh);geometries.push(geometry);materials.push(material)
        }
        if(settings.shape==='sprite'&&!part&&(showFrameGuides||settings.conduitClips?.mode==='existing')){
          const f=settings.frame??defaultFrame
          for(const rail of framePlan(settings,layout.pixels)){
            const a=new THREE.Vector3((rail.a.x-centerX)*size,-(rail.a.y-centerY)*size,rail.rearCenter),b=new THREE.Vector3((rail.b.x-centerX)*size,-(rail.b.y-centerY)*size,rail.rearCenter)
            const g=new THREE.CylinderGeometry(f.diameter/2,f.diameter/2,a.distanceTo(b),16),m=new THREE.MeshStandardMaterial({color:0x647b89,roughness:.42,metalness:.5}),pipe=new THREE.Mesh(g,m)
            pipe.position.copy(a.clone().add(b).multiplyScalar(.5));pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize())
            pipe.userData={label:`Conduit planning rail ${rail.id} · not printable`,planningRail:true};model.add(pipe);geometries.push(g);materials.push(m)
          }
        }
        const zones=conduitClipPlan(layout.pixels,settings).filter(z=>z.sections.some(n=>offsets.has(n)))
        if(zones.length&&emtCompatible(settings)){
          const rails=framePlan(settings,layout.pixels)
          for(const z of zones){
            const rail=rails.find(r=>r.id===z.rail)!,parts=await emtMountParts(settings,layout.pixels,z,rail.rearCenter);if(disposed)return
            for(const [name,triangles] of Object.entries(parts)){
              const g=triangleGeometry(triangles),m=new THREE.MeshStandardMaterial({color:name==='base'?0x3ebfae:0x8854de,roughness:.65}),mount=new THREE.Mesh(g,m)
              mount.rotation.z=z.axis==='vertical'?0:Math.PI/2
              mount.position.set((z.x-centerX)*size,-(z.y-centerY)*size,0)
              mount.userData={label:`Conduit ${name} ${z.id} · derived fit-test hardware`,home:mount.position.clone(),sectionShift:sectionShift(z.sections[0],z.sections[1]),explodeOffset:new THREE.Vector3(0,0,35)}
              model.add(mount);movable.push(mount);geometries.push(g);materials.push(m)
            }
          }
        }else if(zones.length)setAssemblyWarning('This measured pipe OD has no modeled head. Choose the 23.5 mm EMT or 21.336 mm straight-PVC fit-test variant.')
        render()
        const seamClips=seamClipPlan(layout.pixels,settings)
        for(const p of seamClips.filter(p=>offsets.has(p.a.section)||offsets.has(p.b.section))){
          const clipGeometry=triangleGeometry(await seamClipMesh(p,settings,layout.pixels));if(disposed){clipGeometry.dispose();return}geometries.push(clipGeometry)
          const a=offsets.get(p.a.section),b=offsets.get(p.b.section),o=a&&b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:a??b!
          const material=new THREE.MeshStandardMaterial({color:0x589b78,roughness:.7}),mesh=new THREE.Mesh(clipGeometry,material);materials.push(material)
          mesh.rotation.z=p.angle
          mesh.position.set((p.x-centerX)*size+o.x,-(p.y-centerY)*size+o.y,seamClipZ)
          mesh.userData={label:`Wall bridge ${p.id} · sections ${p.a.section+1}/${p.b.section+1}`,home:mesh.position.clone(),explodeOffset:new THREE.Vector3(0,0,45),sectionShift:sectionShift(p.a.section,p.b.section)}
          model.add(mesh);movable.push(mesh)
        }
        const response=await fetch(settings.diffuser==='mario'?marioUrl:houseUrl,{signal:abort.signal})
        if(!response.ok)throw new Error('Could not load your diffuser STL. Switch views to retry.')
        const data=await response.arrayBuffer();if(disposed)return
        const isStrip=settings.lighting==='strip'
        const extended=settings.capFit==='extended'
        const geometry=triangleGeometry(extended?await extendedCapMesh(data,settings):isStrip?await stripCapMesh(data,settings):await bulletCapMesh(data,settings))
        if(disposed){geometry.dispose();return}
        geometries.push(geometry)
        const material=new THREE.MeshStandardMaterial({color:0xe8e2cc,roughness:.5,metalness:0,side:THREE.DoubleSide});materials.push(material)
        const visibleJoins=plates.filter(p=>p.cells?.some(c=>offsets.has(c.section)))
        const covered=new Set(visibleJoins.flatMap(p=>p.cells??[p.a,p.b]).map(c=>c.id))
        cells.filter(p=>!covered.has(p.id)).forEach(p=>{
          const offset=offsets.get(p.section)!,mat=material.clone(),mesh=new THREE.Mesh(geometry,mat)
          if(settings.shape==='sprite')mat.color.set(spriteColors.get(cellKey(p))??'#ffffff')
          materials.push(mat);if(p.led!==false)glowing.push({material:mat,base:mat.color.clone(),index:p.id,art:settings.shape==='sprite'?mat.color.clone():undefined})
          mesh.position.set((p.x-centerX)*size+offset.x,-(p.y-centerY)*size+offset.y,0)
          mesh.userData={label:`Cap ${p.id} · section ${String(p.section+1).padStart(2,'0')}`,home:mesh.position.clone(),sectionShift:sectionShift(p.section)}
          capGroup.add(mesh);movable.push(mesh)
        })
        for(const p of visibleJoins){
          const g=triangleGeometry(await joinedDiffuserMesh(data,settings,p));if(disposed){g.dispose();return}geometries.push(g)
          const mat=new THREE.MeshStandardMaterial({color:0xf1ce8c,roughness:.6})
          let capMaterials:THREE.MeshStandardMaterial|THREE.MeshStandardMaterial[]=mat
          if(settings.shape==='sprite'){
            const joinedCells=p.cells??[p.a,p.b]
            capMaterials=joinedCells.map(c=>{const m=mat.clone();m.color.set(spriteColors.get(cellKey(c))??'#ffffff');materials.push(m);glowing.push({material:m,base:m.color.clone(),index:c.id,art:m.color.clone()});return m})
            const pos=g.getAttribute('position'),index=g.getIndex(),count=index?.count??pos.count
            g.clearGroups()
            for(let i=0;i<count;i+=3){let x=0,y=0;for(let j=0;j<3;j++){const n=index?index.getX(i+j):i+j;x+=pos.getX(n)/3;y+=pos.getY(n)/3}
              let nearest=0,d=Infinity;joinedCells.forEach((c,n)=>{const distance=(x-(c.x-p.x)*size)**2+(y+(c.y-p.y)*size)**2;if(distance<d){d=distance;nearest=n}});g.addGroup(i,3,nearest)
            }
            mat.dispose()
          }else{materials.push(mat);glowing.push({material:mat,base:mat.color.clone(),index:p.a.id})}
          const mesh=new THREE.Mesh(g,capMaterials)
          const a=offsets.get(p.a.section),b=offsets.get(p.b.section),o=a&&b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:a??b!
          mesh.position.set((p.x-centerX)*size+o.x,-(p.y-centerY)*size+o.y,0)
          mesh.userData={label:`Joined seam diffuser ${p.id} · ${p.cells?.length??2} pixels · sections ${p.a.section+1} + ${p.b.section+1}`,home:mesh.position.clone(),sectionShift:sectionShift(p.a.section,p.b.section)}
          capGroup.add(mesh);movable.push(mesh)
        }
        if(isStrip){
          const spec=stripSpec(settings),g=new THREE.BoxGeometry(size,spec.width,spec.thickness),mat=new THREE.MeshStandardMaterial({color:0x343a36,roughness:.8})
          cells.forEach(p=>{
            const strip=new THREE.Mesh(g,mat)
            strip.position.set((p.x-centerX)*size,-(p.y-centerY)*size,spec.seatDepth-spec.thickness/2)
            strip.userData={label:`LED strip · pixel ${p.id}`,home:strip.position.clone(),sectionShift:sectionShift(p.section)}
            model.add(strip);movable.push(strip)
          })
          geometries.push(g);materials.push(mat)
        }
        syncAssembly()
        updateLights(performance.now())
        // Crease/boundary lines, not triangle wireframes. Cache for repeated
        // caps and parent lines to each mesh so exploded motion stays aligned.
        const edgeMaterial=new THREE.LineBasicMaterial({color:0x344944,transparent:true,opacity:.48,depthWrite:false})
        materials.push(edgeMaterial)
        const edgeCache=new Map<THREE.BufferGeometry,THREE.EdgesGeometry>()
        const edgeTargets:THREE.Mesh[]=[]
        model.traverse(o=>{if(o instanceof THREE.Mesh)edgeTargets.push(o)})
        for(const mesh of edgeTargets){
          let g=edgeCache.get(mesh.geometry)
          if(!g){g=new THREE.EdgesGeometry(mesh.geometry,25);edgeCache.set(mesh.geometry,g);geometries.push(g)}
          const lines=new THREE.LineSegments(g,edgeMaterial)
          lines.raycast=()=>{} // outlines must not intercept piece selection
          mesh.add(lines)
        }
        if(visible.some(c=>c.length&&!ties.some(t=>t.pixel.section===c[0].section)))setAssemblyWarning('A section has no accessible outer-wall tie points. Change the layout before export.')
        const conflict=joinedDiffuserConflicts(plates);if(conflict)setAssemblyWarning(conflict)
        if(plates.some(p=>!joinedDiffuserFits(p,settings)))setAssemblyWarning('A joined seam diffuser exceeds the usable print bed. Reduce rows or increase the bed; parts are not scaled.')
        setStatus(`${cells.filter(p=>p.led!==false).length} lights · ${visibleJoins.length} merged seam diffusers · ${visible.length} trays · ${seamClips.filter(p=>offsets.has(p.a.section)||offsets.has(p.b.section)).length} seam clips · ${ties.filter(t=>offsets.has(t.pixel.section)).length} frame tie slots${conduitClipPlan(layout.pixels,settings).length?' · '+conduitClipPlan(layout.pixels,settings).length+' conduit mounts':''}`)
        fit()
        if(materializeRequest>0&&!options.current.exploded&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
          // Display-only assembly; home poses and exported triangles stay untouched.
          explodeJoint(true,false,false);explodeJoint(false,false,true)
        }
        render()
      } catch(cause) {if(!disposed)setError(cause instanceof Error?cause.message:'Could not load 3D preview.')}
    })()
    const contextLost=(event:Event)=>{event.preventDefault();setError('The 3D graphics session was interrupted. Switch to Design and back to retry.')}
    renderer.domElement.addEventListener('webglcontextlost',contextLost)
    return ()=>{
      disposed=true;stopMotion();stopLights();holodeck.dispose();document.removeEventListener('visibilitychange',onVisibility);abort.abort();observer.disconnect();controls.dispose();transform.dispose();viewer.current=null
      if(outline){outline.geometry.dispose();(outline.material as THREE.Material).dispose()}
      renderer.domElement.removeEventListener('pointerdown',onPointerDown)
      renderer.domElement.removeEventListener('pointerup',onPointerUp)
      renderer.domElement.removeEventListener('pointercancel',onPointerCancel)
      renderer.domElement.removeEventListener('keydown',onKeyDown)
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())
      renderer.domElement.removeEventListener('webglcontextlost',contextLost)
      bloom.dispose();output.dispose();scenePass.dispose();composer.dispose()
      renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove()
    }
  },[settings,layout,part,part?selected:-1,jointMode,showFrameGuides,materializeRequest])
  useEffect(()=>{const v=viewer.current;if(v){v.caps.visible=caps;if(!caps&&!jointMode)v.clearSelection();v.render()}},[caps,jointMode])
  useEffect(()=>{viewer.current?.explodeJoint(exploded,separated,true)},[exploded,separated])
  useEffect(()=>{viewer.current?.setLights(lights&&!jointMode&&caps)},[lights,jointMode,caps])
  const resetAssembly=()=>{setExploded(false);setSeparateSections(false);viewer.current?.resetMoves()}
  return <div className="ps-three">
    {toolbarTarget && createPortal(<div className="ps-three-toolbar">
      <label><span>Inspect</span><select aria-label="3D scope" value={jointMode?'joint':part?String(selected):'all'} onChange={e=>{const value=e.target.value;setJointMode(value==='joint');setPart(value!=='all'&&value!=='joint');if(value!=='all'&&value!=='joint')onSelect(Number(value))}}><option value="all">Whole prop</option><option value="joint">Joint fit test · R2</option>{layout.sections.map((_,i)=><option key={i} value={i}>Section {String(i+1).padStart(2,'0')}</option>)}</select></label>
      <button aria-pressed={exploded} className={exploded?'active':''} onClick={()=>setExploded(!exploded)}>{exploded?'Exploded':'Assembled'}</button>
      {exploded&&!jointMode&&<button aria-pressed={separateSections} disabled={part||layout.sections.length<2} title={part?'Choose Whole prop to separate sections':'Display-only spacing; exported parts are unchanged'} className={separateSections?'active':''} onClick={()=>setSeparateSections(!separateSections)}>Separate sections</button>}
      {!jointMode&&<button aria-pressed={!caps} className={!caps?'active':''} onClick={()=>setCaps(!caps)}>{caps?'Reveal backers':'Show caps'}</button>}
      {!jointMode&&<button aria-pressed={lights} className={lights?'active':''} title="Decorative color simulation only · no connection to real lights" onClick={()=>{setLights(!lights);if(!lights)setCaps(true)}}>{lights?'Lights on':'Lights'}</button>}
    </div>,toolbarTarget)}
    <div ref={host} className="ps-three-stage"/>
    {error?<div role="alert" className="ps-three-error">{error}</div>:<div className="ps-three-info"><span role="status">{activePiece||status} · prototype</span><small>{assemblyWarning|| (jointMode?'Standalone legacy R2 coupon · not used by direct ties':settings.shape==='sprite'?'Support every section independently on the frame · derived conduit mounts need a physical PETG fit test · check tie access and wiring clearance':'PVC supports every section · reinforced wall slots for zip ties · green seam bridges + keeper ties · cables over walls · check pixel/wire clearance before tightening')}</small></div>}
    <div className="ps-three-bottom"><span>Wall tie slots: {wallTieSpec.width} × {wallTieSpec.height} mm · Click: select · middle: pan · right: orbit · F: focus</span><div><button disabled={!activePiece} onClick={()=>viewer.current?.focus()}>Focus</button><button onClick={()=>viewer.current?.fit('front')}>Front</button><button onClick={()=>viewer.current?.fit('back')}>Back</button><button onClick={()=>viewer.current?.fit('angle')}>Angle</button><button onClick={()=>viewer.current?.fit('floor')}>Deck view</button><button onClick={()=>viewer.current?.fit('ceiling')}>Ceiling view</button><button onClick={()=>viewer.current?.fit()}>Fit</button><button onClick={resetAssembly}>Reset assembly</button></div></div>
  </div>
}
