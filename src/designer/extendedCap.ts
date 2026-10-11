import {hardwareRuntime} from './hardware'
import {capFootContours,capSeatSpec,longSeatSpec} from './capSeats'
import {stripCapMesh} from './stripCap'
import {bulletCapMesh} from './bulletCap'
import type {Settings} from './geometry'
import type {Triangle,Vertex} from './mesh'

// Derived assembled cap: preserve source and keep original wall mouth at the same Z.
export async function extendedCapMesh(source:ArrayBuffer,s:Settings):Promise<Triangle[]>{
  const m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
  const keep=(v:InstanceType<typeof m.Manifold>)=>{objects.push(v);return v}
  const from=(ts:Triangle[])=>{const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(ts.flat(2)),triVerts:Uint32Array.from({length:ts.length*3},(_,i)=>i)});mesh.merge();return keep(new m.Manifold(mesh))}
  try{
    const sourceCap=from(s.lighting==='strip'?await stripCapMesh(source,s):await bulletCapMesh(source,s)),adds=[sourceCap]
    for(const contour of capFootContours(s.diffuser)){
      const profile=new m.CrossSection([contour])
      const minX=Math.min(...contour.map(p=>p[0])),maxX=Math.max(...contour.map(p=>p[0])),minY=Math.min(...contour.map(p=>p[1])),maxY=Math.max(...contour.map(p=>p[1])),cx=(minX+maxX)/2,cy=(minY+maxY)/2
      const tip=new m.CrossSection([contour.map(([x,y])=>[x-cx,y-cy] as [number,number])])
      try{
        // Only taper the inserting tip. Receiving slot corners stay square.
        adds.push(keep(keep(m.Manifold.extrude(profile,longSeatSpec.engagement-capSeatSpec.insertion-longSeatSpec.leadIn+.02)).translate([0,0,capSeatSpec.insertion-.02])))
        adds.push(keep(keep(m.Manifold.extrude(tip,longSeatSpec.leadIn+.01,0,0,[(maxX-minX-2*longSeatSpec.leadIn)/(maxX-minX),(maxY-minY-2*longSeatSpec.leadIn)/(maxY-minY)])).translate([cx,cy,longSeatSpec.engagement-longSeatSpec.leadIn-.01])))
      }finally{profile.delete();tip.delete()}
    }
    let solid=keep(m.Manifold.union(adds))
    if(s.lighting==='strip'){
      const {stripSpec}=await import('./strip'),sp=stripSpec(s)
      const cut=keep(keep(m.Manifold.cube([35,sp.channelWidth,longSeatSpec.engagement+1])).translate([-17.5,-sp.channelWidth/2,sp.seatDepth-sp.thickness-sp.clearance/2]))
      solid=keep(solid.subtract(cut))
    }
    if(solid.status()!=='NoError')throw new Error('Invalid extended diffuser')
    const pieces=solid.decompose(),count=pieces.length;pieces.forEach(p=>p.delete());if(count!==1)throw new Error('Extended feet are disconnected')
    const out=solid.getMesh(),ts:Triangle[]=[]
    for(let i=0;i<out.triVerts.length;i+=3)ts.push([0,1,2].map(j=>{const k=out.triVerts[i+j]*out.numProp;return [out.vertProperties[k],out.vertProperties[k+1],out.vertProperties[k+2]] as Vertex}) as Triangle)
    return ts
  }finally{objects.reverse().forEach(o=>o.delete())}
}
