import {it,expect} from 'vitest'
import {defaults,parseProject} from './geometry'
import {powerInjectionPlan} from './powerInjection'
it('uses feed first, then every 50/100 physical LEDs in wiring order',()=>{
  const p=Array.from({length:146},(_,i)=>({id:i+1,x:i,y:0,row:0,section:0}))
  expect(powerInjectionPlan(p,defaults).map(p=>p.pixel.id)).toEqual([1,51,101])
  expect(powerInjectionPlan(p,{...defaults,pixelVoltage:12}).map(p=>p.pixel.id)).toEqual([1,101])
  expect(powerInjectionPlan(p,{...defaults,injectionEvery:40}).map(p=>p.pixel.id)).toEqual([1,41,81,121])
  expect(powerInjectionPlan([],defaults)).toEqual([])
})
it('preserves valid saved settings and rejects invalid intervals/voltages',()=>{
  expect(parseProject(JSON.stringify({...defaults,pixelVoltage:12,injectionEvery:75})).injectionEvery).toBe(75)
  for(const injectionEvery of [0,-1,2.5,1001])expect(()=>parseProject(JSON.stringify({...defaults,injectionEvery}))).toThrow()
  expect(()=>parseProject(JSON.stringify({...defaults,pixelVoltage:24}))).toThrow()
})
