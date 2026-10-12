import {expect,it,vi} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import ConduitClipPanel from './ConduitClipPanel'
import SpritePanel from './SpritePanel'
import {defaults,generate,type Settings} from './geometry'
import {pumpkinSprite} from './sprite'
import {defaultFrame} from './propPlan'
import {conduitClipDefaults} from './conduitClips'
import Designer from './Designer'

const settings:Settings={...defaults,shape:'sprite',sprite:pumpkinSprite(),frame:{...defaultFrame,enabled:true},conduitClips:{...conduitClipDefaults,mode:'existing'}}
const noop=()=>{}
it('uses adjacent workspace views rather than a separate Mount wizard step',()=>{
 const html=renderToStaticMarkup(<Designer/>)
 expect(html).toContain('Workspace views')
 expect(html).toContain('What are you building?')
 expect(html).toContain('Arch dimensions &amp; lights')
 expect(html).not.toContain('Build steps')
 expect(html).not.toContain('Next: Mount')
 expect(html).not.toContain('ps-workspace-bar')
 expect(html).not.toContain('ps-step-footer')
 expect(html.slice(html.indexOf('<header'),html.indexOf('</header>'))).toContain('Workspace views')
 expect(html).toContain('File ▾')
 expect(html).toContain('holomatrix-px')
 expect(html).toContain('Lawnchair Labs')
 expect(html).toContain('From pixels to props, automagically.')
 expect(html).toContain('Pattern Matrix')
 expect(html).toContain('Holo Preview')
 expect(html).toContain('Replicator Output')
 expect(html).toContain('Materialize')
 expect(html).not.toContain('Prop library')
})
it('shows length, not rise or artwork options, for straight runs',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({...defaults,shape:'line'})})
 try{
  const html=renderToStaticMarkup(<Designer/>)
  expect(html).toContain('Line dimensions &amp; lights')
  expect(html).toContain('aria-label="Length"')
  expect(html).not.toContain('aria-label="Rise"')
  expect(html).not.toContain('Prop library')
 }finally{vi.unstubAllGlobals()}
})
it('shows actual derived mounting hardware and keeps measurements advanced',()=>{
 const html=renderToStaticMarkup(<ConduitClipPanel settings={settings} layout={generate(settings)} onChange={noop} onShowGuides={noop}/>)
 expect(html).toContain('Actual two-part mounts are shown in 3D and included in STL exports.')
 expect(html).toContain('<details class="ps-advanced"><summary>Advanced mounting</summary>')
 expect(html).toContain('Show rail guides in Design')
 expect(html).not.toContain('checked=""/> Show rail guides')
})
it('provides clear guidance when no rail-aligned footprint can fit',()=>{
 const s={...settings,frame:{...settings.frame!,offset:48},conduitClips:{...settings.conduitClips!,length:100,width:100}}
 const html=renderToStaticMarkup(<ConduitClipPanel settings={s} layout={generate(s)} onChange={noop}/>)
 expect(html).toContain('No clip locations fit this layout')
 expect(html).toContain('Adjust the frame layout or use direct ties')
})
it('keeps artwork and manufacturing controls in separate panels',()=>{
 const props={settings,layout:generate(settings),onChange:noop,onMessage:noop,tool:'inspect' as const,setTool:noop,color:'#ffffff',setColor:noop}
 const art=renderToStaticMarkup(<SpritePanel {...props}/>),joints=renderToStaticMarkup(<SpritePanel {...props} panel="joints"/>)
 expect(art).toContain('Prop library');expect(art).not.toContain('Section joins');expect(art).not.toContain('Mount spacing')
 expect(art).toContain('<details class="ps-advanced"><summary>Generate or resize artwork</summary>')
 expect(joints).toContain('Section joins');expect(joints).not.toContain('Prop library')
})
