import {spriteFromRgba,validateSprite,type Sprite} from './sprite'

export type PropAsset={id:string;label:string;width:number;height:number;pixels:number;url:string;dataUrl?:string;sprite?:Sprite}
const key='holoprop-matrix.private-library.v1'
export function privateLibrary():PropAsset[]{
 try{
  const entries=JSON.parse(localStorage.getItem(key)??'[]') as PropAsset[]
  if(!Array.isArray(entries)||entries.length>100)return []
  return entries.filter(a=>{try{validateSprite(a.sprite);return typeof a.id==='string'&&a.id.startsWith('private:')&&typeof a.label==='string'&&typeof a.url==='string'&&a.url.startsWith('data:image/png;base64,')}catch{return false}})
 }catch{return []}
}
export function savePrivateLibrary(assets:PropAsset[]){
 if(assets.length>100)throw new Error('Keep at most 100 private prop patterns per browser.')
 try{localStorage.setItem(key,JSON.stringify(assets))}catch{throw new Error('Browser storage is full. Your existing library is unchanged; use a smaller prop pack.')}
}

/** Bounded ZIP reader. Bytes stay in this browser; no uploads or executable files. */
export async function readPropZip(bytes:Uint8Array):Promise<{name:string;bytes:Uint8Array}[]>{
 if(bytes.length>30*1024*1024)throw new Error('Choose a prop ZIP smaller than 30 MB.')
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
 let end=-1
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break}
 if(end<0)throw new Error('This is not a supported ZIP archive.')
 const count=view.getUint16(end+10,true),central=view.getUint32(end+16,true),centralSize=view.getUint32(end+12,true)
 if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count>256||central+centralSize>end)throw new Error('Use a single ZIP with at most 256 files, without ZIP64.')
 const entries:{name:string;bytes:Uint8Array}[]=[];let offset=central,total=0
 for(let n=0;n<count;n++){
  if(offset+46>central+centralSize||view.getUint32(offset,true)!==0x02014b50)throw new Error('Damaged ZIP directory.')
  const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),compressed=view.getUint32(offset+20,true),expanded=view.getUint32(offset+24,true),nameLength=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true)
  if(offset+46+nameLength+extra+comment>central+centralSize)throw new Error('Damaged ZIP file name.')
  const name=new TextDecoder().decode(bytes.subarray(offset+46,offset+46+nameLength));offset+=46+nameLength+extra+comment
  if(!/\.(png|bmp|jpe?g|webp)$/i.test(name)||name.includes('__MACOSX')||name.split('/').some(p=>p==='..'||p.startsWith('.')))continue
  if(flags&1||![0,8].includes(method))throw new Error('Use an unencrypted ZIP with standard compression.')
  total+=expanded
  if(expanded>2*1024*1024||total>12*1024*1024||local+30>central||view.getUint32(local,true)!==0x04034b50)throw new Error('Prop pack is too large or damaged.')
  const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true)
  if(start+compressed>central)throw new Error('Damaged ZIP image data.')
  let data=bytes.slice(start,start+compressed)
  if(method===8){
   const stream=new Blob([data.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw')),reader=stream.getReader(),chunks:Uint8Array[]=[];let length=0
   try{for(;;){const item=await reader.read();if(item.done)break;length+=item.value.length;if(length>expanded||length>2*1024*1024)throw new Error('ZIP image exceeds its declared size.');chunks.push(item.value)}}finally{await reader.cancel()}
   data=new Uint8Array(length);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length}
  }
  if(data.length!==expanded)throw new Error('Incomplete ZIP image.')
  entries.push({name,bytes:data})
 }
 return entries
}
export async function importPropPack(file:File):Promise<{assets:PropAsset[];skipped:number}>{
 if(file.size>30*1024*1024)throw new Error('Choose a prop ZIP smaller than 30 MB.')
 const entries=await readPropZip(new Uint8Array(await file.arrayBuffer())),assets:PropAsset[]=[];let skipped=0
 for(const entry of entries){
  const image=await createImageBitmap(new Blob([entry.bytes.slice().buffer]))
  try{
   if(image.width>48||image.height>48||!image.width||!image.height){skipped++;continue}
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height
   const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0)
   const label=entry.name.split('/').at(-1)!.replace(/\.[^.]+$/,'')
   const sprite=spriteFromRgba(image.width,image.height,ctx.getImageData(0,0,image.width,image.height).data,label)
   if(!sprite.cells.length){skipped++;continue}
   assets.push({id:'private:'+entry.name,label,width:image.width,height:image.height,pixels:sprite.cells.length,url:canvas.toDataURL('image/png'),sprite})
  }finally{image.close()}
 }
 if(!assets.length)throw new Error('No small prop images found. Use PNG/BMP/JPEG/WebP sprites up to 48 × 48 pixels; import larger sprite sheets separately.')
 return {assets,skipped}
}
