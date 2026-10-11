import {describe,it,expect} from 'vitest'
import {Box3,Vector3} from 'three'
import {frameBounds} from './viewFraming'
describe('focus framing',()=>{
  it('focuses the selected bounds rather than the full arch',()=>{
    const box=new Box3(new Vector3(100,200,-10),new Vector3(133,233,12))
    const result=frameBounds(box,new Vector3(0,0,-1),38,1)
    expect(result.target.toArray()).toEqual([116.5,216.5,1])
    expect(result.distance).toBeLessThan(100)
    expect(result.direction.toArray()).toEqual([0,0,-1])
  })
  it('allows extra distance for narrow viewports and handles overhead views',()=>{
    const box=new Box3(new Vector3(-100,-20,-10),new Vector3(100,20,10))
    expect(frameBounds(box,new Vector3(0,0,-1),38,.5).distance).toBeGreaterThan(frameBounds(box,new Vector3(0,0,-1),38,2).distance)
    expect(Number.isFinite(frameBounds(box,new Vector3(0,1,0),38,1).distance)).toBe(true)
  })
})
