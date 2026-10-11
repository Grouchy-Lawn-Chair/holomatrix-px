import {describe,it,expect} from 'vitest'
import {assemblyLayerDelay,assemblyMotionDuration,assemblyMotionProgress} from './assemblyMotion'

describe('assembly display motion',()=>{
  it('starts and ends exactly, including delayed layers',()=>{
    expect(assemblyMotionProgress(-10)).toBe(0)
    expect(assemblyMotionProgress(45,45)).toBe(0)
    expect(assemblyMotionProgress(assemblyMotionDuration+45,45)).toBe(1)
    expect(assemblyMotionProgress(9999)).toBe(1)
  })
  it('eases smoothly and monotonically without overshoot',()=>{
    const values=Array.from({length:77},(_,i)=>assemblyMotionProgress(i*10))
    expect(values.every((v,i)=>v>=0&&v<=1&&(!i||v>=values[i-1]))).toBe(true)
    expect(assemblyMotionProgress(assemblyMotionDuration/2)).toBeCloseTo(.5)
    expect(assemblyMotionProgress(10)).toBeLessThan(.001)
  })
  it('reverses the layer order for reassembly',()=>{
    expect(assemblyLayerDelay(0,true,true)).toBeLessThan(assemblyLayerDelay(75,false,true))
    expect(assemblyLayerDelay(0,true,false)).toBeGreaterThan(assemblyLayerDelay(75,false,false))
  })
})
