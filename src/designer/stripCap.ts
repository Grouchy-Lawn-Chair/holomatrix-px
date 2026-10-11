import {STLLoader} from 'three/addons/loaders/STLLoader.js'
import {orientCap} from './previewGeometry'
import {hardwareRuntime} from './hardware'
import {capSeatSpec} from './capSeats'
import {stripSpec} from './strip'
import type {Settings} from './geometry'
import type {Triangle,Vertex} from './mesh'

// Return a derived cap, in the same assembled coordinate system as the backer.
// Original source STL bytes are never modified. Sleeve clearance includes feet.
export async function stripCapMesh(source:ArrayBuffer,s:Settings):Promise<Triangle[]>{
  if(stripSpec(s).channelWidth>14)throw new Error('Strip channel exceeds 14 mm and would leave thin diffuser feet.')
  const geometry=orientCap(new STLLoader().parse(source));geometry.rotateX(Math.PI);geometry.translate(0,0,capSeatSpec.insertion)
  const m=await hardwareRuntime(),position=geometry.getAttribute('position')
  const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(position.array),triVerts:Uint32Array.from({length:position.count},(_,i)=>i)})
  mesh.merge();const cap=new m.Manifold(mesh),spec=stripSpec(s)
  const low=spec.seatDepth-spec.thickness-spec.clearance/2
  const cube=m.Manifold.cube([35,spec.channelWidth,capSeatSpec.depth-low+.1]),cut=cube.translate([-17.5,-spec.channelWidth/2,low])
  const result=cap.subtract(cut)
  try{
    if(result.status()!=='NoError'||result.volume()<=0)throw new Error('Could not form the strip-clearance diffuser.')
    const pieces=result.decompose(),count=pieces.length;pieces.forEach(p=>p.delete());if(count!==1)throw new Error('Strip notch separates the cap; reduce strip dimensions.')
    const mesh=result.getMesh(),triangles:Triangle[]=[]
    for(let i=0;i<mesh.triVerts.length;i+=3)triangles.push([0,1,2].map(j=>{
      const k=mesh.triVerts[i+j]*mesh.numProp;return [mesh.vertProperties[k],mesh.vertProperties[k+1],mesh.vertProperties[k+2]] as Vertex
    }) as Triangle)
    return triangles
  }finally{result.delete();cut.delete();cube.delete();cap.delete();geometry.dispose()}
}
