import {expect,it} from 'vitest'
import {zipFiles} from './mesh'
import {readPropZip} from './propLibrary'
import {readFileSync,existsSync} from 'node:fs'
it('reads stored image entries while ignoring unrelated archive contents',async()=>{
 const zip=zipFiles([{name:'sprites/pumpkin.png',bytes:new Uint8Array([1,2,3])},{name:'readme.txt',bytes:new Uint8Array([9])},{name:'../escape.png',bytes:new Uint8Array([4])}])
 expect(await readPropZip(zip)).toEqual([{name:'sprites/pumpkin.png',bytes:new Uint8Array([1,2,3])}])
})
it('rejects corrupt archives and oversized image entries before decoding',async()=>{
 await expect(readPropZip(new Uint8Array([1,2,3]))).rejects.toThrow('ZIP')
 const zip=zipFiles([{name:'too-big.png',bytes:new Uint8Array(2*1024*1024+1)}])
 await expect(readPropZip(zip)).rejects.toThrow('large')
})
const supplied=process.env.HOLOPROP_PACK_TEST??'public/prop-library/original-pack.zip'
it.skipIf(!existsSync(supplied))('reads all 23 images in the original supplied compressed prop pack',async()=>{
 const entries=await readPropZip(new Uint8Array(readFileSync(supplied)))
 expect(entries).toHaveLength(23)
 expect(entries.every(e=>e.bytes.length>0)).toBe(true)
})
