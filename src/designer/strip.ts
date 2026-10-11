import type {Settings} from './geometry'
export const stripPresets={ip30:{label:'IP30 · bare',width:10,thickness:2.13},ip65:{label:'IP65 · coated',width:10,thickness:3},ip67:{label:'IP67 · sleeve',width:12.3,thickness:3.85}}
export function stripSpec(s:Settings){
  const preset=stripPresets[s.stripType??'ip30']
  const width=s.stripWidth??preset.width,thickness=s.stripThickness??preset.thickness,clearance=s.stripClearance??.4
  return {width,thickness,clearance,channelWidth:width+clearance,seatDepth:.4,pitch:s.stripPitch??1000/30}
}
