import {STLLoader} from 'three/addons/loaders/STLLoader.js'
import {orientCap} from './previewGeometry'
import {hardwareRuntime} from './hardware'
import {capFootContours,capSeatSpec} from './capSeats'
import type {Settings} from './geometry'
import type {Triangle,Vertex} from './mesh'

// Derived bullet cap: fill the source strip passages and small side apertures
// within the measured wall/foot silhouettes. Outside dimensions and mounting
// foot envelopes stay unchanged; never overwrite the user's original STL.
export async function bulletCapMesh(source:ArrayBuffer,s:Settings):Promise<Triangle[]>{
  if(s.lighting==='strip')throw new Error('Closed bullet caps cannot be used for LED strips.')
  const g=orientCap(new STLLoader().parse(source));g.rotateX(Math.PI);g.translate(0,0,capSeatSpec.insertion);g.computeBoundingBox()
  const m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
  const keep=(o:InstanceType<typeof m.Manifold>)=>{objects.push(o);return o}
  const v=g.getAttribute('position'),mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(v.array),triVerts:Uint32Array.from({length:v.count},(_,i)=>i)});mesh.merge()
  try{
    const base=keep(new m.Manifold(mesh)),low=g.boundingBox!.min.z+.9,high=capSeatSpec.insertion
    const adds=[base]
    for(const contour of capFootContours(s.diffuser)){
      const profile=new m.CrossSection([contour])
      try{adds.push(keep(keep(m.Manifold.extrude(profile,high-low)).translate([0,0,low])))}finally{profile.delete()}
    }
    const solid=keep(m.Manifold.union(adds))
    if(solid.status()!=='NoError')throw new Error('Could not close the bullet diffuser strip passages.')
    const parts=solid.decompose(),count=parts.filter(p=>p.volume()>.001).length;parts.forEach(p=>p.delete())
    if(count!==1)throw new Error('Closed bullet diffuser must remain one connected part.')
    const out=solid.getMesh(),ts:Triangle[]=[]
    for(let i=0;i<out.triVerts.length;i+=3)ts.push([0,1,2].map(j=>{const k=out.triVerts[i+j]*out.numProp;return [out.vertProperties[k],out.vertProperties[k+1],out.vertProperties[k+2]] as Vertex}) as Triangle)
    return ts
  }finally{objects.reverse().forEach(o=>o.delete());g.dispose()}
}
