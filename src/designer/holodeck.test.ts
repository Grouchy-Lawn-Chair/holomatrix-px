import {expect,it} from 'vitest'
import * as THREE from 'three'
import {createHolodeck} from './holodeck'
import {LineSegments2} from 'three/addons/lines/LineSegments2.js'
it('builds six inward-facing room surfaces outside the printable model',()=>{
 const room=createHolodeck(500)
 expect(room.group.children.map(c=>c.name)).toEqual(['Rear wall','Front wall','Left wall','Right wall','Floor','Ceiling'])
 for(const panel of room.group.children){
  const normal=new THREE.Vector3(0,0,1).applyEuler(panel.rotation)
  expect(normal.dot(panel.position.clone().sub(new THREE.Vector3(0,1400,0)))).toBeLessThan(0)
  expect(panel.children).toHaveLength(2)
 }
 const camera=new THREE.PerspectiveCamera();camera.position.z=10000;room.follow(camera)
 expect(room.group.scale.x*1400).toBeGreaterThan(camera.position.length())
 room.dispose()
})
it('keeps the deck touching the lowest model point at every zoom distance',()=>{
 const room=createHolodeck(500)
 room.ground(-250)
 const floor=room.group.getObjectByName('Floor')!
 const camera=new THREE.PerspectiveCamera()
 for(const distance of [100,2000,10000]){
  camera.position.set(distance,distance,distance);room.follow(camera)
  room.group.updateMatrixWorld(true)
  expect(floor.getWorldPosition(new THREE.Vector3()).y).toBe(-250)
 }
 room.dispose()
})
it('renders every room surface behind the prop without depth occlusion',()=>{
 const room=createHolodeck(500)
 for(const panel of room.group.children){
  const [wall,grid]=panel.children as [THREE.Mesh,LineSegments2]
  for(const surface of [wall,grid]){
   const material=surface.material as THREE.Material
   expect(material.depthWrite).toBe(false)
   expect(material.depthTest).toBe(false)
   expect(material.transparent).toBe(false)
   expect(surface.renderOrder).toBeLessThan(0)
  }
  expect(wall.renderOrder).toBeLessThan(grid.renderOrder)
 }
 room.dispose()
})
it('uses thicker yellow screen-space grid lines on every room face',()=>{
 const room=createHolodeck(500)
 for(const panel of room.group.children){
  const wire=panel.children[1] as LineSegments2
  expect(wire).toBeInstanceOf(LineSegments2)
  expect(wire.material.linewidth).toBe(1.8)
  expect(wire.material.worldUnits).toBe(false)
  expect(wire.material.color.getHex()).toBe(0xbfa12e)
  expect(wire.material.toneMapped).toBe(false)
 }
 room.dispose()
})
