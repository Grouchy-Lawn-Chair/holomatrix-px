// Display-only choreography; no mesh dimensions or export positions change.
export const assemblyMotionDuration=1100
export function assemblyMotionProgress(elapsed:number,delay=0,duration=assemblyMotionDuration){
  const t=Math.max(0,Math.min(1,(elapsed-delay)/duration))
  return t*t*t*(t*(t*6-15)+10)
}
export function assemblyLayerDelay(lift:number,isCap:boolean,exploding:boolean){
  const layer=isCap?0:lift>=70?2:lift>0?1:3
  return (exploding?layer:3-layer)*45
}
