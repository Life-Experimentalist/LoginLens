import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const container = document.getElementById('root')!

const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// Every route ships as prerendered HTML, so the normal path is to hydrate what
// is already on screen rather than throw it away and render from scratch.
// `createRoot` remains the fallback for `vite dev`, which serves the bare
// template.
if (container.hasChildNodes()) {
  hydrateRoot(container, app)
} else {
  createRoot(container).render(app)
}
