// Decorative preview only. Deterministic shuffled phases, smoothly varying
// colors: no flashing, WLED network commands, or exported geometry changes.
export function lightSimulationSample(index:number,seconds:number){
  const phase=((index+1)*.61803398875)%1
  return {hue:((phase+seconds*.11)%1+1)%1,intensity:.85+.15*Math.sin(seconds*.8+phase*Math.PI*2)}
}
