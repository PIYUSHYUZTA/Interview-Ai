import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Design system first: self-hosted Geist, then tokens and utilities, then the existing styles.
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './design-system/tokens.css'
import './design-system/base.css'
import './design-system/icons.css'
import './design-system/sound.css'
import './index.css'
import './product-design.css'
import './candidate-product.css'
import './design-system/components.css'
import './design-system/motion.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
