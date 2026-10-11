import { describe, expect, it } from 'vitest'
import { defaults, fitsBed, generate, parseProject, rasterize, ribbon, withCount } from './geometry'

describe('touching pixel geometry', () => {
  for(const rows of [2,3,4]) it(`keeps a diagonal band ${rows} grid cells thick without auto-thickening`,()=>{
    const pixels=ribbon([{x:0,y:0},{x:20,y:-20}],rows)
    for(let x=2;x<16;x++)expect(pixels.filter(p=>p.x===x)).toHaveLength(rows)
  })
  it('keeps two grid rows distinct on shallow diagonals',()=>{
    const pixels=ribbon([{x:0,y:0},{x:20,y:-10}],2)
    for(let x=2;x<18;x++)expect(pixels.filter(p=>p.x===x)).toHaveLength(2)
  })
  it('does not inflate the two-row arch into three rows',()=>{
    const pixels=generate({...defaults,rows:2}).pixels
    const span=Math.round(defaults.width*25.4/33)
    for(let x=Math.ceil(span*.25);x<=Math.floor(span*.75);x++)expect(pixels.filter(p=>p.x===x)).toHaveLength(2)
    expect(pixels.length).toBeLessThan(generate({...defaults,rows:3}).pixels.length)
  })
  it('crosses a full cell edge on every raster step, including diagonals and reversals', () => {
    const points = rasterize([{x:0,y:0},{x:8,y:-4},{x:-3,y:6},{x:-3,y:-9}])
    points.slice(1).forEach((p,i) => expect(Math.abs(p.x-points[i].x)+Math.abs(p.y-points[i].y)).toBe(1))
  })
  for (const diffuser of ['mario','house'] as const) for (const rows of [1,2,3,8]) {
    it(`keeps ${diffuser} ${rows}-row arch connected and assigns every pixel once`, () => {
      const result = generate({...defaults,diffuser,rows})
      expect(result.connected).toBe(true)
      expect(new Set(result.pixels.map(p=>`${p.x},${p.y}`)).size).toBe(result.pixels.length)
      expect(result.sections.flat().length).toBe(result.pixels.length)
      expect(result.printable).toBe(true)
      expect(result.sections.every(s=>fitsBed(s,diffuser==='mario'?25.08:33,defaults.bed))).toBe(true)
    })
  }
  it('resizes a touching arch toward 33 pixels instead of leaving gaps', () => {
    const changed = withCount(defaults,33), result = generate(changed)
    expect(result.pixels.length).toBe(33)
    expect(changed.width).toBeLessThan(defaults.width)
    expect(result.connected).toBe(true)
  })
  it('respects rectangular bed width and depth independently', () => {
    expect(fitsBed([{x:0,y:0},{x:1,y:0}],33,{shape:'rectangle',width:100,depth:50,margin:2})).toBe(true)
    expect(fitsBed([{x:0,y:0},{x:1,y:0}],33,{shape:'rectangle',width:50,depth:50,margin:2})).toBe(false)
  })
  it('resizes a custom drawn line toward a requested pixel count', () => {
    const source={...defaults,shape:'custom' as const,points:[{x:0,y:0},{x:1,y:-1}]}
    const result=generate(withCount(source,33))
    expect(Math.abs(result.pixels.length-33)).toBeLessThanOrEqual(1)
    expect(result.connected).toBe(true)
  })
  it('treats line targets as total lights across all rows',()=>{
    expect(generate(withCount({...defaults,shape:'line',rows:3},33)).pixels.length).toBe(33)
  })
  it('flags a bed too small for even one diffuser', () => {
    expect(generate({...defaults,bed:{shape:'circle',width:50,depth:50,margin:8}}).printable).toBe(false)
  })
  it('round-trips a saved project and rejects corrupt dimensions', () => {
    expect(parseProject(JSON.stringify(defaults))).toEqual(defaults)
    expect(()=>parseProject(JSON.stringify({...defaults,width:-3}))).toThrow()
    expect(()=>parseProject(JSON.stringify({...defaults,rows:100000}))).toThrow()
  })
})
