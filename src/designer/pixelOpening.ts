// Traced from the user's Koopa (2) STL at the 2.1 mm gripping plane.
// Four-fold symmetry removes sub-micron STL/export coordinate noise. Never scale
// this opening with diffuser pitch, pixel count or printer-bed dimensions.
const quadrant:[number,number][]=[[6.327,1.001],[5.708,2.907],[5.619,3.029],[5.235,2.646],[5.230,2.664],[4.150,4.150],[2.664,5.230],[2.646,5.235],[3.029,5.619],[2.907,5.708],[1.001,6.327]]
export const pixelOpening:[number,number][]=Array.from({length:4},(_,i)=>quadrant.map(([x,y]):[number,number]=>i===0?[x,y]:i===1?[-y,x]:i===2?[-x,-y]:[y,-x])).flat()
export const backerSpec={floor:2.1,wallThickness:2,wallTop:25.396}
