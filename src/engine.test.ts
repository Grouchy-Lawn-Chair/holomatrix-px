import { describe, expect, it } from 'vitest'
import { chooseCableCombination, routeDistance } from './engine'

describe('cable engine', () => {
  it('chooses the fewest available cables that cover the route', () => {
    expect(chooseCableCombination(27, [5, 10, 20, 30])).toEqual([{ lengthFt: 30, quantity: 1 }])
    expect(chooseCableCombination(34, [10, 20])).toEqual([{ lengthFt: 20, quantity: 2 }])
  })
  it('measures routed polyline geometry at the calibrated scale', () => {
    expect(routeDistance([{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 60, y: 40 }], .1)).toBe(8)
  })
})
