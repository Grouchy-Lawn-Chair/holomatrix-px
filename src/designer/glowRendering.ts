import type {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js'
import type {OutputPass} from 'three/addons/postprocessing/OutputPass.js'

/** A non-finite HDR sample must not poison all five bloom blur levels. */
export function configureGlowPasses(bloom:UnrealBloomPass,output:OutputPass){
 for(const material of [output.material,bloom.materialHighPassFilter,bloom.compositeMaterial,...bloom.separableBlurMaterials]){
  material.depthTest=false;material.depthWrite=false
 }
 const source=bloom.materialHighPassFilter.fragmentShader
 const marker='float v = luminance( texel.xyz );'
 if(!source.includes(marker))throw new Error('Glow shader changed: review the finite brightness safeguard.')
 bloom.materialHighPassFilter.fragmentShader=source.replace(marker,`
  // Comparisons reject NaN and negative infinity; min bounds positive infinity.
  texel.rgb = vec3(texel.r >= 0.0 ? min(texel.r, 64.0) : 0.0,
                   texel.g >= 0.0 ? min(texel.g, 64.0) : 0.0,
                   texel.b >= 0.0 ? min(texel.b, 64.0) : 0.0);
  texel.a = 1.0;
  ${marker}`)
 bloom.materialHighPassFilter.needsUpdate=true
}
