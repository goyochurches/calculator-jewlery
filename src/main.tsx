import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { syncWizardPreviewFromUrl } from '@/lib/wizardPreview'

// Persist the personal Quote Wizard preview from ?wizard=1/0 before first paint.
syncWizardPreviewFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
