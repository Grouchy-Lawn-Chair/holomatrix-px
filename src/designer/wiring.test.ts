import {describe,it,expect} from 'vitest'
import {generate,defaults} from './geometry'
import {weaveWiring} from './wiring'
import {powerInjectionPlan} from './powerInjection'
describe('footprint-aware wiring',()=>{
  for(const diffuser of ['house','mario'] as const)for(const rows of [1,2,3,4,8])it(`${diffuser}/${rows}: unique addresses and all wire legs hidden behind cells`,()=>{
    const s={...defaults,diffuser,rows},l=generate(s),cells=new Set(l.pixels.map(p=>`${p.x},${p.y}`))
    expect(l.connected).toBe(true);expect(l.printable).toBe(true)
    expect(l.wiringComplete).toBe(true)
    expect(l.pixels.map(p=>p.id)).toEqual(Array.from({length:l.pixels.length},(_,i)=>i+1))
    expect(l.wirePaths).toHaveLength(l.pixels.length-1)
    for(const [i,path] of l.wirePaths.entries()){
      expect(path).toHaveLength(2)
      expect(path[0]).toMatchObject({x:l.pixels[i].x,y:l.pixels[i].y})
      expect(path.at(-1)).toMatchObject({x:l.pixels[i+1].x,y:l.pixels[i+1].y})
      for(const [j,p] of path.entries()){
        expect(cells.has(`${p.x},${p.y}`)).toBe(true)
        if(j){const a=path[j-1],dx=Math.abs(p.x-a.x),dy=Math.abs(p.y-a.y);expect(Math.max(dx,dy)).toBe(1)
          if(dx&&dy){expect(cells.has(`${p.x},${a.y}`)).toBe(true);expect(cells.has(`${a.x},${p.y}`)).toBe(true)}
        }
      }
    }
    // No midpoint may be shared by two links: forbids both reused edges and
    // the two crossing diagonals of a filled 2x2 square.
    const mids=l.wirePaths.map(([a,b])=>`${a.x+b.x},${a.y+b.y}`)
    expect(new Set(mids).size).toBe(mids.length)
    for(const p of powerInjectionPlan(l.pixels,s))expect(p.pixel).toBe(l.pixels[p.after])
  })
  it('weaves across straight runs rather than traversing whole rows',()=>{
    const l=generate({...defaults,shape:'line',rows:3,width:10})
    expect(new Set(l.pixels.slice(0,3).map(p=>p.x)).size).toBe(1)
    expect(new Set(l.pixels.slice(0,3).map(p=>p.y)).size).toBe(3)
    expect(l.wirePaths.every(p=>p.length===2)).toBe(true)
  })
  it('exposes a disconnected custom drawing instead of fabricating hidden cells',()=>{
    const pixels=[{x:0,y:0,id:1,row:0,section:0},{x:3,y:0,id:2,row:0,section:1}]
    const result=weaveWiring(pixels,pixels)
    expect(result.complete).toBe(false);expect(result.paths).toHaveLength(0)
  })
  it('flags a branched layout that cannot be one simple string',()=>{
    const pixels=[[0,0],[1,0],[-1,0],[0,1],[0,-1]].map(([x,y],i)=>({x,y,id:i+1,row:0,section:0}))
    expect(weaveWiring(pixels,[{x:-1,y:0},{x:1,y:0}]).complete).toBe(false)
  })
})
