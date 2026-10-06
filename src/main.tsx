import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/nunito/index.css'
import './index.css'
import App from './App'
import { ensureDefaults } from './lib/seed'
import { requestPersistence } from './db'

ensureDefaults()
  .catch((e) => console.error('Kompass: Startdaten konnten nicht angelegt werden', e))
  .finally(() => {
    requestPersistence()
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
