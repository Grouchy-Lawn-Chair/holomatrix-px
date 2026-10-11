import { describe, expect, it } from 'vitest'
import { buildJointFitParts, fitSpec, puzzleKey, tieHoleCenters } from './hardware'
import { binaryStl } from './mesh'

describe('hardware fit-test coupons',()=>{
  it('uses the user-confirmed clearance convention and pipe diameter',()=>{
    expect(fitSpec.clearanceTotal).toBe(.1)
    expect(fitSpec.pipeOD).toBeCloseTo(21.336,3)
  })
  it('creates connected, closed male and female parts with proper printable STL bytes',async()=>{
    const parts=await buildJointFitParts()
    expect(parts).toHaveLength(2)
    for(const part of parts){
      const edges=new Map<string,number>(),direction=new Map<string,number>()
      for(const t of part.triangles)for(let i=0;i<3;i++){
        const a=t[i].map(v=>Math.round(v*1e5)/1e5).join(','),b=t[(i+1)%3].map(v=>Math.round(v*1e5)/1e5).join(',')
        const key=[a,b].sort().join('|');edges.set(key,(edges.get(key)||0)+1);direction.set(key,(direction.get(key)||0)+(a<b?1:-1))
      }
      expect([...edges.values()].every(n=>n===2)).toBe(true)
      expect([...direction.values()].every(n=>n===0)).toBe(true)
      expect(part.volume).toBeGreaterThan(0)
      expect(part.dimensions[2]).toBeCloseTo(6,4)
      expect(part.name).toContain('puzzle_')
      expect(part.triangles.flat().every(v=>v[2]===0||Math.abs(v[2]-6)<1e-5)).toBe(true)
      const centers=part.name.includes('_male_')?tieHoleCenters.male:tieHoleCenters.female
      for(const [x,y] of centers){
        const vertices=part.triangles.flat().filter(v=>Math.abs(Math.hypot(v[0]-x,v[1]-y)-2)<1e-4)
        expect(vertices.some(v=>Math.abs(v[2])<1e-5)).toBe(true)
        expect(vertices.some(v=>Math.abs(v[2]-6)<1e-5)).toBe(true)
      }
      const data=binaryStl(part.triangles)
      expect(data.length).toBe(84+part.triangles.length*50)
    }
  })
  it('has a wider puzzle head than neck and chamfered head corners',()=>{
    expect(puzzleKey.filter(p=>p[0]<0).map(p=>p[1])).toEqual([-6,6])
    expect(Math.max(...puzzleKey.map(p=>p[1]))-Math.min(...puzzleKey.map(p=>p[1]))).toBe(20)
    expect(puzzleKey).toContainEqual([19.4,10])
    expect(puzzleKey).toContainEqual([20,9.4])
    expect(tieHoleCenters.male.map(p=>p[1])).toEqual(tieHoleCenters.female.map(p=>p[1]))
  })
  it('does not accept invalid fit allowances',async()=>{
    await expect(buildJointFitParts(-.1)).rejects.toThrow('clearance')
  })
})
