import {describe,it,expect} from 'vitest'
import {buildPinJointParts,pinJointSpec,pinPrintCalibration} from './pinJoint'
import {hardwareRuntime} from './hardware'
describe('broad overlap and separate pin coupons',()=>{
  it('keeps receiving corners square and inserting corners chamfered',async()=>{
    const [male,female,pin]=await buildPinJointParts()
    const has=(part:typeof male,x:number,y:number,z:number)=>part.triangles.flat().some(v=>Math.abs(v[0]-x)<.0001&&Math.abs(v[1]-y)<.0001&&Math.abs(v[2]-z)<.0001)
    // Pocket floor after flipping the female for printing.
    for(const y of [-10.05,10.05])expect(has(female,16.05,y,3)).toBe(true)
    for(const x of [3.95,12.05])for(const y of [-3.05,3.05]){
      expect(has(male,x,y,0)).toBe(true)
      expect(has(female,x,y,0)).toBe(true)
    }
    expect(has(male,16,10,0)).toBe(false)
    expect(has(male,16,9.4,0)).toBe(true)
    expect(has(pin,3.4,2.65,8.1)).toBe(false)
    expect(has(pin,3.4,2.15,8.1)).toBe(true)
  })
  it('locally compensates the pin, preserves holes and recesses the female meeting face',async()=>{
    const parts=await buildPinJointParts()
    const shaft=parts[2].triangles.flat().filter(v=>v[2]>2.001)
    for(const [axis,size] of [[0,6.8],[1,5.3]])expect(Math.max(...shaft.map(v=>v[axis]))-Math.min(...shaft.map(v=>v[axis]))).toBeCloseTo(size)
    for(const axis of [0,1])expect([pinJointSpec.pinWidth,pinJointSpec.pinDepth][axis]+pinPrintCalibration.estimatedGrowth[axis]).toBeCloseTo(pinPrintCalibration.measuredHole[axis]-.1)
    expect(Math.min(...parts[1].triangles.flat().map(v=>v[0]))).toBeCloseTo(.5)
    expect(parts[0].dimensions[0]).toBeCloseTo(36.1)
    expect(parts[1].dimensions[0]).toBeCloseTo(24.5)
    expect(parts[0].dimensions[1]).toBeCloseTo(30)
  })
  it('makes three closed connected solids in their flat print orientations',async()=>{
    const parts=await buildPinJointParts();expect(parts).toHaveLength(3)
    for(const p of parts){
      const edges=new Map<string,number>()
      for(const t of p.triangles)for(let i=0;i<3;i++){
        const key=[t[i].join(','),t[(i+1)%3].join(',')].sort().join('|');edges.set(key,(edges.get(key)||0)+1)
      }
      expect([...edges.values()].every(n=>n===2)).toBe(true)
      expect(p.volume).toBeGreaterThan(0)
      expect(Math.min(...p.triangles.flat().map(v=>v[2]))).toBeCloseTo(0,5)
    }
    expect(parts[0].dimensions[2]).toBeCloseTo(6.1)
    expect(parts[1].dimensions[2]).toBeCloseTo(6.1)
    expect(parts[2].dimensions[2]).toBeCloseTo(8.1)
    expect(pinJointSpec.tongueWidth).toBe(20)
    expect(pinJointSpec.clearanceTotal).toBe(.1)
  })
  it('assembles the printed male, flipped female and flipped pin without collisions',async()=>{
    const parts=await buildPinJointParts(),m=await hardwareRuntime(),objects:InstanceType<typeof m.Manifold>[]=[]
    const keep=(o:InstanceType<typeof m.Manifold>)=>{objects.push(o);return o}
    const from=(p:typeof parts[number])=>{
      const mesh=new m.Mesh({numProp:3,vertProperties:new Float32Array(p.triangles.flat(2)),triVerts:Uint32Array.from({length:p.triangles.length*3},(_,i)=>i)});mesh.merge();return keep(new m.Manifold(mesh))
    }
    try{
      const male=from(parts[0]),female=keep(keep(from(parts[1]).rotate([180,0,0])).translate([0,0,6.1])),pin=keep(keep(from(parts[2]).rotate([180,0,0])).translate([8,0,8.1]))
      for(const [a,b] of [[male,female],[male,pin],[female,pin]])expect(keep(a.intersect(b)).volume()).toBeLessThan(.001)
    }finally{objects.reverse().forEach(o=>o.delete())}
  })
})
