import {expect,it} from 'vitest'
import {Vector2} from 'three'
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js'
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js'
import {configureGlowPasses} from './glowRendering'

it('bounds each HDR channel before brightness extraction and blur propagation',()=>{
 const bloom=new UnrealBloomPass(new Vector2(800,600),.25,.1,.9),output=new OutputPass()
 configureGlowPasses(bloom,output)
 const shader=bloom.materialHighPassFilter.fragmentShader
 for(const channel of ['r','g','b'])expect(shader).toContain(`texel.${channel} >= 0.0 ? min(texel.${channel}, 64.0) : 0.0`)
 expect(shader.indexOf('texel.rgb =')).toBeLessThan(shader.indexOf('float v = luminance'))
 expect(bloom.enabled).toBe(true)
 for(const material of [output.material,bloom.materialHighPassFilter,bloom.compositeMaterial,...bloom.separableBlurMaterials]){
  expect(material.depthTest).toBe(false);expect(material.depthWrite).toBe(false)
 }
 bloom.dispose();output.dispose()
})
