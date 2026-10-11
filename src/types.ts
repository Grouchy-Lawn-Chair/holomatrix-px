export type ViewMode = 'yard' | 'blueprint'
export type EquipmentKind = 'controller' | 'prop' | 'psu' | 'receiver'

export interface Point { x: number; y: number }

export interface ViewLayout extends Point {
  w: number
  h: number
}

export interface Equipment {
  id: string
  kind: EquipmentKind
  name: string
  model?: string
  pixelCount?: number
  voltage?: number
  watts?: number
  controller?: string
  startChannel?: string
  protocol?: string
  ports?: string[]
  source?: 'xlights' | 'fpp' | 'manual'
  xlights?: Record<string, string>
  layout: Record<ViewMode, ViewLayout>
}

export interface CablePart { lengthFt: number; quantity: number }

export interface Connection {
  id: string
  fromId: string
  fromPort: string
  toId: string
  kind: 'data' | 'power' | 'pi'
  segment: string
  route: Point[]
  distanceFt: number
  cableParts: CablePart[]
  installedFt: number
  slackFt: number
  amps: number
  voltageDrop: number
  endVoltage: number
  warnings: string[]
}

export interface ProjectSettings {
  connectorFamily: string
  cableGauge: number
  cableOhmsPer1000Ft: number
  cableLengthsFt: number[]
  feetPerCanvasUnit: number
  pixelMilliAmps: number
  brightness: number
  minVoltage: number
  powerMode: 'conservative' | 'realistic' | 'custom'
  isScaleCalibrated: boolean
}

export interface ImportSummary {
  source: string
  importedAt: string
  models: number
  controllers: number
  groups: number
  assumptions: string[]
}

export interface HolidayProject {
  version: 4
  id: string
  name: string
  updatedAt: string
  settings: ProjectSettings
  equipment: Equipment[]
  connections: Connection[]
  imports: ImportSummary[]
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  connectorFamily: 'Ray Wu / xConnect compatible',
  cableGauge: 18,
  cableOhmsPer1000Ft: 6.385,
  cableLengthsFt: [5, 10, 20, 30],
  feetPerCanvasUnit: 0.1,
  pixelMilliAmps: 45,
  brightness: 40,
  minVoltage: 10.5,
  powerMode: 'realistic',
  isScaleCalibrated: false,
}
