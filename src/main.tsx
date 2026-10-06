import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/nunito/index.css'
import './index.css'
import App from './App'
import { ensureDefaults } from './lib/seed'
import { requestPersistence } from './db'
import { installSyncHooks, startSync } from './lib/sync'
import { registerSW } from 'virtual:pwa-register'

// Offline support + updates: a new version is fetched in the background and the page reloads into it.
// Also check whenever the app comes back to the foreground (iPad keeps PWAs alive for days).
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    // Safety net for older service workers that wait for a message before switching.
    const nudge = () => reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
    nudge()
    reg.addEventListener('updatefound', () => {
      reg.installing?.addEventListener('statechange', nudge)
    })
    const check = () => reg.update().then(nudge).catch(() => {})
    setInterval(check, 30 * 60 * 1000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  },
})

// Hooks must be in place before the first write so every change is tracked.
installSyncHooks()

ensureDefaults()
  .catch((e) => console.error('Kompass: Startdaten konnten nicht angelegt werden', e))
  .finally(() => {
    requestPersistence()
    void startSync()
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
