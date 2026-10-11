import type {Pixel,Settings} from './geometry'
export function injectionInterval(s:Settings){return s.injectionEvery??(s.pixelVoltage===12?100:50)}
export function powerInjectionPlan(pixels:Pixel[],s:Settings,strings:Pixel[][]=[pixels]){
  const every=injectionInterval(s)
  return strings.flatMap(chain=>chain.filter((_,i)=>i%every===0).map((pixel,i)=>({pixel,kind:i===0?'feed':'injection',after:i*every})))
}
