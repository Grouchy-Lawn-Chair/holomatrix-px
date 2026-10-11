import type { CablePart, Connection, Equipment, HolidayProject, Point, ProjectSettings, ViewMode } from './types'

export function routeDistance(points: Point[], feetPerCanvasUnit: number) {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }
  return total * feetPerCanvasUnit
}

export function chooseCableCombination(requiredFt: number, lengths: number[]): CablePart[] {
  const sizes = [...lengths].filter(n => n > 0).sort((a, b) => a - b)
  if (!sizes.length || requiredFt <= 0) return []
  const step = sizes.reduce(gcd)
  const limit = Math.ceil((requiredFt + Math.max(...sizes) * 2) / step)
  const dp: Array<number[] | undefined> = Array(limit + 1)
  dp[0] = []
  for (let i = 1; i <= limit; i++) {
    for (const size of sizes) {
      const previous = i - size / step
      if (Number.isInteger(previous) && previous >= 0 && dp[previous]) {
        const candidate = [...dp[previous]!, size]
        if (!dp[i] || candidate.length < dp[i]!.length) dp[i] = candidate
      }
    }
  }
  const first = dp.findIndex((parts, i) => Boolean(parts) && i * step >= requiredFt)
  const picked = first >= 0 ? dp[first]! : [Math.max(...sizes)]
  const counts = new Map<number, number>()
  picked.forEach(n => counts.set(n, (counts.get(n) ?? 0) + 1))
  return [...counts].sort((a, b) => b[0] - a[0]).map(([lengthFt, quantity]) => ({ lengthFt, quantity }))
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}

export function pixelCurrent(pixelCount: number, settings: ProjectSettings) {
  const factor = settings.powerMode === 'conservative' ? 1 : settings.brightness / 100
  return pixelCount * (settings.pixelMilliAmps / 1000) * factor
}

export function calculateConnection(
  base: Omit<Connection, 'distanceFt' | 'cableParts' | 'installedFt' | 'slackFt' | 'amps' | 'voltageDrop' | 'endVoltage' | 'warnings'>,
  target: Equipment,
  settings: ProjectSettings,
) : Connection {
  const distanceFt = settings.isScaleCalibrated ? routeDistance(base.route, settings.feetPerCanvasUnit) : 0
  const cableParts = chooseCableCombination(distanceFt, settings.cableLengthsFt)
  const installedFt = cableParts.reduce((sum, part) => sum + part.lengthFt * part.quantity, 0)
  const amps = pixelCurrent(target.pixelCount ?? 0, settings)
  const sourceVoltage = target.voltage ?? 12
  const voltageDrop = 2 * distanceFt * (settings.cableOhmsPer1000Ft / 1000) * amps
  const endVoltage = sourceVoltage - voltageDrop
  const warnings: string[] = []
  if (settings.isScaleCalibrated && endVoltage < settings.minVoltage) warnings.push(`PI recommended before ${target.name}: estimated ${endVoltage.toFixed(1)}V`)
  if (amps > 5) warnings.push(`Port load is ${amps.toFixed(1)}A; verify controller fuse and output rating`)
  return { ...base, distanceFt, cableParts, installedFt, slackFt: installedFt - distanceFt, amps, voltageDrop, endVoltage, warnings }
}

export function pointFor(equipment: Equipment, view: ViewMode): Point {
  const p = equipment.layout[view]
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 }
}

export function recalculateProject(project: HolidayProject): HolidayProject {
  const byId = new Map(project.equipment.map(item => [item.id, item]))
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    connections: project.connections.flatMap(connection => {
      const target = byId.get(connection.toId)
      const source = byId.get(connection.fromId)
      if (!target || !source) return []
      const route = connection.route.length >= 2 ? connection.route : [pointFor(source, 'yard'), pointFor(target, 'yard')]
      return [calculateConnection({
        id: connection.id,
        fromId: connection.fromId,
        fromPort: connection.fromPort,
        toId: connection.toId,
        kind: connection.kind,
        segment: connection.segment,
        route,
      }, target, project.settings)]
    }),
  }
}

export function formatCableParts(parts: CablePart[]) {
  return parts.map(part => `${part.quantity > 1 ? `${part.quantity}× ` : ''}${part.lengthFt} ft`).join(' + ') || 'Not measured'
}
