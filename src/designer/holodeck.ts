import * as THREE from 'three'

/** Six real room planes. Decorative only: excluded from picking, fit and exports. */
export function createHolodeck(span:number){
 const group=new THREE.Group();group.name='Holodeck environment · not printable'
 const extent=Math.max(100,span)*2.8,divisions=32
 const points:number[]=[]
 for(let i=0;i<=divisions;i++){
  const p=-extent+2*extent*i/divisions
  points.push(-extent,p,0,extent,p,0,p,-extent,0,p,extent,0)
 }
 const grid=new THREE.BufferGeometry();grid.setAttribute('position',new THREE.Float32BufferAttribute(points,3))
 // Pre-blended amber keeps grid lines in the opaque background queue too.
 const lines=new THREE.LineBasicMaterial({color:0x332b1f,depthWrite:false,depthTest:false})
 const wallGeometry=new THREE.PlaneGeometry(extent*2,extent*2)
 const wallMaterial=new THREE.MeshBasicMaterial({color:0x080d15,side:THREE.FrontSide,depthWrite:false,depthTest:false})
 const faces=[
  {name:'Rear wall',p:[0,extent,-extent],r:[0,0,0]},
  {name:'Front wall',p:[0,extent,extent],r:[0,Math.PI,0]},
  {name:'Left wall',p:[-extent,extent,0],r:[0,Math.PI/2,0]},
  {name:'Right wall',p:[extent,extent,0],r:[0,-Math.PI/2,0]},
  {name:'Floor',p:[0,0,0],r:[-Math.PI/2,0,0]},
  {name:'Ceiling',p:[0,2*extent,0],r:[Math.PI/2,0,0]},
 ]
 for(const face of faces){
  const panel=new THREE.Group();panel.name=face.name;panel.position.set(...face.p as [number,number,number]);panel.rotation.set(...face.r as [number,number,number])
  const wall=new THREE.Mesh(wallGeometry,wallMaterial),wire=new THREE.LineSegments(grid,lines)
  // Render the entire room as a background pass, before printable geometry.
  // Opaque walls must never write depth in front of the prop during an orbit.
  wall.renderOrder=-1000;wire.renderOrder=-999
  wire.position.z=.1;wire.raycast=()=>{};wall.raycast=()=>{};panel.add(wall,wire);group.add(panel)
 }
 return {group,ground:(lowestPoint:number)=>{group.position.y=lowestPoint},follow:(camera:THREE.Camera)=>{
  // Scale about the floor, so zooming out never lifts the prop off the deck.
  group.scale.setScalar(Math.max(1,Math.abs(camera.position.x)/(extent*.8),Math.abs(camera.position.z)/(extent*.8),(camera.position.y-group.position.y)/(2*extent*.8)))
 },dispose:()=>{grid.dispose();lines.dispose();wallGeometry.dispose();wallMaterial.dispose()}}
}
