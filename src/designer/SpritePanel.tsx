import {useEffect,useRef,useState} from 'react'
import type {Settings} from './geometry'
import {pumpkinSprite,resizeSprite,spriteFromRgba,validateSprite,type PumpkinFace} from './sprite'
import {jointSettings} from './sectionLayout'
import type {generate} from './geometry'
import {publicAsset} from '../publicAsset'
import {privateLibrary,savePrivateLibrary,importPropPack,type PropAsset} from './propLibrary'

export default function SpritePanel({settings,layout,onChange,onMessage,tool,setTool,color,setColor,panel='prop'}:{panel?:'prop'|'joints';settings:Settings;layout:ReturnType<typeof generate>;onChange:(s:Partial<Settings>)=>void;onMessage:(m:string)=>void;tool:'inspect'|'paint'|'erase';setTool:(t:'inspect'|'paint'|'erase')=>void;color:string;setColor:(c:string)=>void}){
  const sprite=settings.sprite!,[face,setFace]=useState<PumpkinFace>('happy'),[cutouts,setCutouts]=useState(false)
  const [width,setWidth]=useState(sprite.width),[height,setHeight]=useState(sprite.height)
  const image=useRef<ImageBitmap|null>(null),file=useRef<HTMLInputElement>(null)
  const [imageSize,setImageSize]=useState({width:0,height:0}),[crop,setCrop]=useState({x:0,y:0,width:1,height:1})
  const [removeBackground,setRemoveBackground]=useState(false),[background,setBackground]=useState('#ffffff'),[preview,setPreview]=useState('')
  const packFile=useRef<HTMLInputElement>(null)
  const [assets,setAssets]=useState<PropAsset[]>(privateLibrary),[libraryChoice,setLibraryChoice]=useState('current'),[loadingAsset,setLoadingAsset]=useState(false)
  const assetRequest=useRef(0)
  useEffect(()=>{const controller=new AbortController();fetch(publicAsset('/prop-library/jack-o-lantern/manifest.json'),{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('Could not load supplied prop library.');return r.json()}).then(m=>setAssets([...privateLibrary(),...m.assets])).catch(e=>{if(e.name!=='AbortError')onMessage(e.message)});return()=>{controller.abort();assetRequest.current++}},[])
  const loadPack=async(f?:File)=>{
    if(!f)return
    assetRequest.current++;setLoadingAsset(true)
    try{
      const pack=await importPropPack(f),merged=new Map(privateLibrary().map(a=>[a.id,a]))
      pack.assets.forEach(a=>merged.set(a.id,a));const saved=[...merged.values()]
      savePrivateLibrary(saved);setAssets([...saved,...assets.filter(a=>!a.sprite)])
      onMessage(`${pack.assets.length} prop patterns imported privately${pack.skipped?`; ${pack.skipped} larger/empty images skipped`:''}. Saved only in this browser; no images uploaded.`)
    }catch(e){onMessage(e instanceof Error?e.message:'Could not import prop pack.')}finally{setLoadingAsset(false)}
  }
  const chooseAsset=async(id:string)=>{
    const asset=assets.find(a=>a.id===id);if(!asset)return
    const request=++assetRequest.current;setLoadingAsset(true);setLibraryChoice(id)
    try{const next=asset.sprite??await (async()=>{if(!asset.dataUrl)throw new Error('Missing prop artwork.');const response=await fetch(publicAsset(asset.dataUrl));if(!response.ok)throw new Error('Could not load prop artwork.');return response.json()})();validateSprite(next);if(request!==assetRequest.current)return
      onChange({sprite:next});setTool('inspect');onMessage(`${asset.label} · ${asset.width} × ${asset.height} · ${asset.pixels} lights`)
    }catch(e){if(request===assetRequest.current)onMessage(e instanceof Error?e.message:'Could not load prop.')}finally{if(request===assetRequest.current)setLoadingAsset(false)}
  }
  useEffect(()=>{setWidth(sprite.width);setHeight(sprite.height)},[sprite.width,sprite.height])
  useEffect(()=>()=>image.current?.close(),[])
  const loadImage=async(f?:File)=>{
    if(!f)return
    try{
      if(f.size>20*1024*1024)throw new Error('Choose an image smaller than 20 MB.')
      const next=await createImageBitmap(f)
      if(next.width>8192||next.height>8192){next.close();throw new Error('Image is too large. Crop it to 8192 pixels or less first.')}
      image.current?.close();image.current=next;setImageSize({width:next.width,height:next.height});setCrop({x:0,y:0,width:next.width,height:next.height})
      const c=document.createElement('canvas');c.width=Math.min(512,next.width);c.height=Math.max(1,Math.round(c.width*next.height/next.width));c.getContext('2d')!.drawImage(next,0,0,c.width,c.height);setPreview(c.toDataURL())
      if(next.width<=48&&next.height<=48){setWidth(next.width);setHeight(next.height)}
      onMessage('Image loaded locally. Select one sprite with the crop fields, then apply. No artwork is uploaded.')
    }catch(e){onMessage(e instanceof Error?e.message:'Could not decode image.')}
  }
  const applyImage=()=>{
    assetRequest.current++;setLoadingAsset(false);setLibraryChoice('current')
    const source=image.current;if(!source)return
    if(crop.x<0||crop.y<0||crop.width<1||crop.height<1||crop.x+crop.width>source.width||crop.y+crop.height>source.height){onMessage('Crop must stay inside the source image.');return}
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
    const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;ctx.drawImage(source,crop.x,crop.y,crop.width,crop.height,0,0,width,height)
    const next=spriteFromRgba(width,height,ctx.getImageData(0,0,width,height).data,'Imported sprite',removeBackground?background:undefined)
    if(!next.cells.length){onMessage('This crop has no visible pixels. Check transparency and background removal.');return}
    onChange({sprite:next});setTool('inspect');onMessage('Sprite applied. One image pixel = one light; original colors retained, with nearest-neighbor resizing only.')
  }
  return <div className="ps-sprite-panel">
    {panel==='prop'&&<><label className="ps-field"><span>Prop library</span><select aria-label="Prop library" value={libraryChoice} onChange={e=>{
      const id=e.target.value;setLibraryChoice(id)
      if(assets.some(a=>a.id===id)){void chooseAsset(id);return}
      assetRequest.current++;setLoadingAsset(false)
      if(id==='current')return
      if(e.target.value==='import'){file.current?.click();return}
      onChange({sprite:e.target.value==='blank'?{width,height,cells:[],source:'Hand-drawn pixel prop'}:pumpkinSprite(width,height,face,cutouts)})
    }}><option value="current">Current artwork</option><option value="pumpkin">Generated pumpkin / jack-o’-lantern</option><optgroup label="Your supplied Halloween bitmaps">{assets.map(a=><option key={a.id} value={a.id}>{a.label} · {a.width} × {a.height}</option>)}</optgroup><option value="import">Import image / game sprite…</option><option value="blank">Blank pixel canvas</option></select></label>
    {loadingAsset&&<p role="status">Loading original artwork…</p>}
    {assets.length>0&&<details className="ps-library-gallery"><summary>Browse {assets.length} patterns</summary><div>{assets.map(a=><button key={a.id} title={`${a.label} · ${a.pixels} lights`} aria-label={`Use ${a.label}`} onClick={()=>void chooseAsset(a.id)}><img src={a.sprite?a.url:publicAsset(a.url)} alt=""/><span>{a.label.replace('Halloween Prop ','H ').replace('Jack o lantern ','J ')}</span></button>)}</div></details>}
    {!assets.length&&<p className="ps-help">Import your prop ZIP to restore private patterns in this browser.</p>}
    <button className="ps-import-button" disabled={loadingAsset} onClick={()=>packFile.current?.click()}>Import prop pack (ZIP)</button><input ref={packFile} hidden type="file" accept=".zip,application/zip" onChange={e=>{void loadPack(e.target.files?.[0]);e.target.value=''}}/>
    <details className="ps-advanced"><summary>Generate or resize artwork</summary><label className="ps-field"><span>Pumpkin face</span><select aria-label="Pumpkin face" value={face} onChange={e=>setFace(e.target.value as PumpkinFace)}><option value="plain">No carved face</option><option value="happy">Happy</option><option value="scary">Scary</option><option value="goofy">Goofy</option></select></label>
    <label className="ps-long-teeth"><input type="checkbox" checked={cutouts} onChange={e=>setCutouts(e.target.checked)}/> Physical face cutouts</label>
    <p className="ps-help">Default: the face is dark-colored LEDs, not missing plastic. Cutouts remove lights and material and may need separate strings.</p>
    <div className="ps-two-fields">{(['width','height'] as const).map(k=><label className="ps-field" key={k}><span>Grid {k}</span><input aria-label={`Sprite ${k}`} type="number" min="8" max="48" value={k==='width'?width:height} onChange={e=>(k==='width'?setWidth:setHeight)(Math.max(1,Math.min(48,Math.round(Number(e.target.value)||1))))}/></label>)}</div>
    <div className="ps-sprite-actions"><button onClick={()=>{assetRequest.current++;setLoadingAsset(false);setLibraryChoice('pumpkin');onChange({sprite:pumpkinSprite(width,height,face,cutouts)});setTool('inspect')}}>Build pumpkin</button><button onClick={()=>{assetRequest.current++;setLoadingAsset(false);setLibraryChoice('current');onChange({sprite:resizeSprite(sprite,width,height)})}}>Resize artwork</button></div>
    <p className="ps-help">Resizing changes your light count. Physical size is grid × diffuser pitch; caps are never scaled to fit the bed.</p>
    </details><button className="ps-import-button" onClick={()=>file.current?.click()}>Import image / sprite sheet</button><input ref={file} hidden type="file" accept="image/png,image/bmp,image/jpeg,image/webp,image/gif" onChange={e=>{void loadImage(e.target.files?.[0]);e.target.value=''}}/>
    {imageSize.width>0&&<details open className="ps-sprite-import"><summary>Crop source · {imageSize.width} × {imageSize.height}</summary><img src={preview} alt="Imported sprite sheet preview"/>
      <div className="ps-two-fields">{(['x','y','width','height'] as const).map(k=><label className="ps-field" key={k}><span>Crop {k}</span><input aria-label={`Crop ${k}`} type="number" min={k==='x'||k==='y'?0:1} max={k==='x'||k==='width'?imageSize.width:imageSize.height} value={crop[k]} onChange={e=>setCrop(c=>({...c,[k]:Math.max(0,Math.round(Number(e.target.value)||0))}))}/></label>)}</div>
      <label className="ps-long-teeth"><input type="checkbox" checked={removeBackground} onChange={e=>setRemoveBackground(e.target.checked)}/> Remove exact background color</label><input aria-label="Image background color" type="color" value={background} onChange={e=>setBackground(e.target.value)}/><button onClick={applyImage}>Apply crop to grid</button><p className="ps-help">Use source pixel dimensions for exact sprites. Transparent pixels are empty; black is a real light unless removed. GIF imports its first frame only.</p>
    </details>}
    <details className="ps-advanced"><summary>Edit pixels & colors</summary><div className="ps-sprite-actions">{(['inspect','paint','erase'] as const).map(t=><button key={t} aria-pressed={tool===t} className={tool===t?'active':''} onClick={()=>setTool(t)}>{t==='inspect'?'Inspect':t==='paint'?'Paint / add':'Erase'}</button>)}</div>
    <label className="ps-field"><span>LED color</span><input aria-label="Paint color" type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><div className="ps-palette">{[...new Set(['#ff8b19','#ffd12b','#10151c','#52833a','#ac35de','#ffffff',...sprite.cells.map(c=>c.color)])].slice(0,24).map(c=><button key={c} title={c} aria-label={`Paint ${c}`} style={{background:c}} onClick={()=>{setColor(c);setTool('paint')}}/>)}</div>
    <p className="ps-help">Paint directly on the main grid. Erase removes the physical cell too. Use Undo to restore a stroke. {sprite.source}</p>
    </details></>}{panel==='joints'&&<><h3>Section joins</h3><label className="ps-long-teeth"><input type="checkbox" checked={jointSettings(settings).enabled} onChange={e=>onChange({sectionJoints:{...jointSettings(settings),enabled:e.target.checked}})}/> Broad puzzle section joins</label>
    <p className="ps-help">Whole-cell tongues and recesses, like your flag and snowman. Mounting axes split the layout first; clips favor rail-aligned wall locations. The floors set glue-up flatness—not squeezed wall tops. Section changes can renumber the wiring: export a fresh blueprint before building.</p>
    {jointSettings(settings).enabled&&<details><summary>Joint fit · millimetres</summary>{([['Side gap per mating face','sideGap',.05,.5,.05],['Tongue tip gap','tipGap',.1,1,.05],['Male corner chamfer','cornerChamfer',.5,3,.1],['Bed-edge relief','bottomRelief',0,1.4,.1],['Extra upper-wall gap','upperRelief',0,.4,.05]] as const).map(([label,k,min,max,step])=><label className="ps-field" key={k}><span>{label}</span><input aria-label={label} type="number" value={jointSettings(settings)[k]} min={min} max={max} step={step} onChange={e=>onChange({sectionJoints:{...jointSettings(settings),[k]:Math.max(min,Math.min(max,Number(e.target.value)||0))}})}/></label>)}<p className="ps-help">Default side gap: 0.10 mm on each tongue flank, about 0.20 mm total width allowance. Tip gap is separate. PETG coupon required; no printer wall-angle compensation is assumed.</p></details>}
    </>}
  </div>
}
