import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'

// Pages opens holomatrix-px at the repository root; local planner remains at /.
const base = import.meta.env.BASE_URL
const route = window.location.pathname.slice(base.length).replace(/^\//, '')
const isDesigner = route.startsWith('designer') || (import.meta.env.VITE_PAGES === 'true' && !route.startsWith('planner'))
// Separate import boundaries keep each page's CSS in its own preload graph.
const DesignerPage = lazy(() => import('./designer/Designer'))
const PlannerPage = lazy(() => import('./App'))
const Page = isDesigner ? DesignerPage : PlannerPage
if (isDesigner) {
  document.body.classList.add('pixel-studio-page')
  document.title = 'holomatrix-px · Lawnchair Labs'
}
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<div style={{padding:32,fontFamily:'system-ui'}}>Opening your workspace…</div>}><Page /></Suspense></StrictMode>)
