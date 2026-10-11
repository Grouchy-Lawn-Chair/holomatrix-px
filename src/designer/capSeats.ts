import feet from './diffuserFeet.json'

// Foot silhouettes projected from the unchanged source STLs, at the portion
// entering the floor. Coordinates match the assembled (front-facing) cap.
export const capSeatSpec={insertion:.9,depth:.95,clearanceTotal:.1}
export const longSeatSpec={engagement:3.5,socketTop:3.6,leadIn:.25}
export const longToothClearanceDefault=.30
export function toothClearanceTotal(s:{capFit?:'original'|'extended';toothClearance?:number}){
  if(s.capFit!=='extended')return capSeatSpec.clearanceTotal
  const value=s.toothClearance??longToothClearanceDefault
  if(!Number.isFinite(value)||value<.1||value>1)throw new Error('Tooth clearance must be 0.1–1 mm total.')
  return value
}
export function capFootContours(diffuser:'house'|'mario'){
  return feet[diffuser] as [number,number][][]
}
