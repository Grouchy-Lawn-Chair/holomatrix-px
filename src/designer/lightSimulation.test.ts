import {describe,it,expect} from 'vitest'
import {lightSimulationSample} from './lightSimulation'
describe('decorative diffuser lights',()=>{
  it('gives neighboring caps different stable phases',()=>{
    expect(lightSimulationSample(1,0)).toEqual(lightSimulationSample(1,0))
    expect(lightSimulationSample(1,0).hue).not.toBe(lightSimulationSample(2,0).hue)
  })
  it('makes a visible color change in one second',()=>{
    const start=lightSimulationSample(0,0),later=lightSimulationSample(0,1)
    expect(later.hue-start.hue).toBeCloseTo(.11)
  })
  it('varies gently and keeps color/brightness in range',()=>{
    for(let i=0;i<150;i++)for(const seconds of [0,1,10,1000]){
      const a=lightSimulationSample(i,seconds),b=lightSimulationSample(i,seconds+.016)
      expect(a.hue).toBeGreaterThanOrEqual(0);expect(a.hue).toBeLessThan(1)
      expect(a.intensity).toBeGreaterThanOrEqual(.7);expect(a.intensity).toBeLessThanOrEqual(1)
      expect(Math.abs(b.intensity-a.intensity)).toBeLessThan(.003)
    }
  })
})
