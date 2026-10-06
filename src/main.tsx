import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/nunito/index.css'
import './index.css'
import App from './App'
import { ensureDefaults } from './lib/seed'
import { requestPersistence } from './db'
import { registerSW } from 'virtual:pwa-register'

// Offline support + updates: a new version is fetched in the background and the page reloads into it.
// Also check whenever the app comes back to the foreground (iPad keeps PWAs alive for days).
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => reg.update().catch(() => {})
    setInterval(check, 30 * 60 * 1000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  },
})

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
