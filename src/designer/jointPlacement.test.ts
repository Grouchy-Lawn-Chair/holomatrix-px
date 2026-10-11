import {describe,it,expect} from 'vitest'
import {jointAnchors} from './jointPlacement'
import {defaults,generate,type Pixel} from './geometry'
const pixel=(x:number,y:number,section:number):Pixel=>({x,y,section,id:x*10+y+1,row:0})
describe('whole-prop joint placement guides',()=>{
  it('places joints at full-edge seams, never corner-only contacts',()=>{
    const cells=[pixel(0,0,0),pixel(1,0,1),pixel(2,0,2),pixel(3,1,3)]
    const anchors=jointAnchors(cells)
    expect(anchors.map(a=>[a.id,a.x,a.y,a.angle])).toEqual([[1,.5,0,0],[2,1.5,0,0]])
  })
  it('deduplicates multi-row interfaces and orders by sections, without mutating pixels',()=>{
    const cells=[pixel(0,0,0),pixel(0,1,0),pixel(1,0,1),pixel(1,1,1)],before=JSON.stringify(cells)
    expect(jointAnchors(cells)).toHaveLength(1)
    expect(jointAnchors([...cells].reverse())).toEqual(jointAnchors(cells))
    expect(JSON.stringify(cells)).toBe(before)
  })
  it('has one guide per actual touching section pair on the default arch',()=>{
    const layout=generate(defaults),anchors=jointAnchors(layout.pixels)
    expect(anchors.length).toBeGreaterThan(0)
    for(const a of anchors){
      expect(a.a.section).not.toBe(a.b.section)
      expect(Math.abs(a.a.x-a.b.x)+Math.abs(a.a.y-a.b.y)).toBe(1)
    }
    expect(jointAnchors(layout.sections[0])).toEqual([])
  })
})
