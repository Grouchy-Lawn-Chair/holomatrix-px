import type { Equipment, HolidayProject } from './types'
import { DEFAULT_SETTINGS } from './types'

export const K8_PORTS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']

export function blankProject(): HolidayProject {
  const now = new Date().toISOString()
  return {
    version: 4,
    id: crypto.randomUUID(),
    name: 'My Holiday Show',
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS },
    imports: [],
    equipment: [
      makeController('controller-1', 'Controller Box 1', 80, 100),
      makePsu('psu-1', '12V PSU 1', 90, 390),
      makeProp('prop-1', 'Garage Arch', 50, 520, 150),
    ],
    connections: [],
  }
}

export function makeController(id: string = crypto.randomUUID(), name = 'Kulp K8-PB', x = 100, y = 100): Equipment {
  return {
    id, kind: 'controller', name, model: 'K8-PB', protocol: 'DDP', ports: K8_PORTS,
    source: 'manual',
    layout: {
      yard: { x, y, w: 270, h: 250 },
      blueprint: { x: 80, y: 100, w: 270, h: 250 },
    },
  }
}

export function makePsu(id: string = crypto.randomUUID(), name = '12V 350W PSU', x = 100, y = 420): Equipment {
  return {
    id, kind: 'psu', name, model: 'Generic 350W', voltage: 12, watts: 350, source: 'manual',
    layout: {
      yard: { x, y, w: 190, h: 105 },
      blueprint: { x: 80, y: 430, w: 190, h: 105 },
    },
  }
}

export function makeProp(id: string = crypto.randomUUID(), name = 'New Prop', pixels = 100, x = 520, y = 150): Equipment {
  return {
    id, kind: 'prop', name, pixelCount: pixels, voltage: 12, source: 'manual',
    layout: {
      yard: { x, y, w: 170, h: 100 },
      blueprint: { x, y, w: 190, h: 100 },
    },
  }
}
