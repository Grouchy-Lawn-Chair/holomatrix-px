import {Box3,MathUtils,Vector3} from 'three'

// Fits the visible bounds along a viewing direction, including depth.
export function frameBounds(box:Box3,direction:Vector3,fov:number,aspect:number){
  const target=box.getCenter(new Vector3()),size=box.getSize(new Vector3())
  const facing=direction.clone().normalize(),right=new Vector3().crossVectors(new Vector3(0,1,0),facing).normalize()
  if(right.lengthSq()<.001)right.set(1,0,0)
  const up=new Vector3().crossVectors(facing,right).normalize(),tan=Math.tan(MathUtils.degToRad(fov/2))
  let distance=10
  for(const x of [-size.x/2,size.x/2])for(const y of [-size.y/2,size.y/2])for(const z of [-size.z/2,size.z/2]){
    const corner=new Vector3(x,y,z),depth=corner.dot(facing)
    distance=Math.max(distance,Math.abs(corner.dot(right))/(tan*Math.max(.01,aspect))+depth,Math.abs(corner.dot(up))/tan+depth)
  }
  return {target,distance:distance*1.12,direction:facing}
}
