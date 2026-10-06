import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Cloud, CloudOff, Download, LogOut, RefreshCw, Upload } from 'lucide-react'
import {
  completeFirstSync, firstSyncInfo, getSyncState, onSyncState, pendingCount, signIn, signOut, signUp, supabase, syncConfigured, syncNow, type SyncState,
} from '../lib/sync'
import { Button, Field, Input, Panel, Segmented, cx } from './ui'

export function useSyncState() {
  const [s, setS] = useState<SyncState>(getSyncState())
  useEffect(() => {
    const off = onSyncState(setS)
    return () => {
      off()
    }
  }, [])
  return s
}

function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    if (!supabase) return setSession(null)
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}

function ago(ts: number | null) {
  if (!ts) return 'noch nie'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'gerade eben'
  if (s < 3600) return `vor ${Math.round(s / 60)} min`
  return new Date(ts).toLocaleString('de-AT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function SyncSettings() {
  const session = useSession()
  const sync = useSyncState()
  const [ready, setReady] = useState(() => localStorage.getItem('kompass-sync-ready') === '1')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [info, setInfo] = useState<{ remote: number; local: number } | null>(null)

  useEffect(() => {
    if (session && !ready) firstSyncInfo().then(setInfo).catch((e) => setMsg({ ok: false, text: e.message }))
  }, [session, ready])

  if (!syncConfigured) {
    return (
      <Panel title="Sync zwischen Geräten">
        <p className="px-4 pb-4 text-ink-2">Wird gerade eingerichtet.</p>
      </Panel>
    )
  }
  if (session === undefined) return null

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
    setBusy(false)
  }

  // 1) Not signed in
  if (!session) {
    return (
      <Panel title="Sync zwischen Geräten">
        <form
          className="space-y-3 px-4 pt-1 pb-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              if (mode === 'signup') {
                const r = await signUp(email.trim(), password)
                if (r.needsConfirmation) setMsg({ ok: true, text: 'Fast fertig: Bestätige deine E-Mail über den Link im Postfach, dann hier anmelden.' })
              } else {
                await signIn(email.trim(), password)
              }
            })
          }}
        >
          <p className="text-ink-2">Melde dich auf jedem Gerät mit demselben Konto an, dann sind Stundenplan, Aufgaben, Noten, Notizen, Lernpläne und Bilder überall gleich.</p>
          <Segmented className="w-full" value={mode} onChange={setMode} options={[{ value: 'login', label: 'Anmelden' }, { value: 'signup', label: 'Konto erstellen' }]} />
          <Field label="E-Mail">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Passwort" hint={mode === 'signup' ? 'Mindestens 6 Zeichen.' : undefined}>
            <Input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </Field>
          {msg && <p className={msg.ok ? 'text-ok' : 'text-danger'} role="status">{msg.text}</p>}
          <Button variant="primary" type="submit" disabled={busy || !email || password.length < 6}>
            {busy ? 'Einen Moment …' : mode === 'signup' ? 'Konto erstellen' : 'Anmelden'}
          </Button>
        </form>
      </Panel>
    )
  }

  // 2) Signed in, first sync on this device
  if (!ready) {
    const cloudHasData = (info?.remote ?? 0) > 0
    return (
      <Panel title="Sync zwischen Geräten">
        <div className="space-y-3 px-4 pt-1 pb-4">
          <p>Angemeldet als <strong>{session.user.email}</strong>.</p>
          {!info ? (
            <p className="text-ink-2">Prüfe, was schon in der Cloud ist …</p>
          ) : cloudHasData ? (
            <>
              <p className="text-ink-2">In der Cloud sind schon Daten ({info.remote} Einträge). Welche sollen gelten?</p>
              <Button variant="primary" className="w-full" disabled={busy} onClick={() => run(async () => { await completeFirstSync('download'); setReady(true) })}>
                <Download size={18} /> Cloud-Daten auf dieses Gerät holen
              </Button>
              <p className="-mt-1 text-sm text-ink-3">Für ein neues Gerät (z. B. den PC). Was hier gerade drin ist, wird ersetzt.</p>
              <Button className="w-full" disabled={busy} onClick={() => run(async () => { await completeFirstSync('upload'); setReady(true) })}>
                <Upload size={18} /> Dieses Gerät hochladen
              </Button>
              <p className="-mt-1 text-sm text-ink-3">Die Daten von diesem Gerät ersetzen die Cloud und alle anderen Geräte.</p>
            </>
          ) : (
            <>
              <p className="text-ink-2">Die Cloud ist noch leer. Die Daten von diesem Gerät ({info.local} Einträge) werden hochgeladen.</p>
              <Button variant="primary" className="w-full" disabled={busy} onClick={() => run(async () => { await completeFirstSync('upload'); setReady(true) })}>
                <Upload size={18} /> Hochladen und Sync starten
              </Button>
            </>
          )}
          {busy && <p className="text-ink-2">Läuft … bei vielen Bildern kann das kurz dauern.</p>}
          {msg && <p className="text-danger" role="alert">{msg.text}</p>}
          <Button variant="ghost" onClick={() => signOut()}><LogOut size={17} /> Abmelden</Button>
        </div>
      </Panel>
    )
  }

  // 3) Syncing
  const pending = pendingCount()
  const label =
    sync.status === 'syncing' ? 'Synchronisiert …' :
    sync.status === 'offline' ? `Offline – ${pending} Änderung${pending === 1 ? '' : 'en'} warten` :
    sync.status === 'error' ? 'Sync-Fehler' :
    `Synchronisiert ${ago(sync.lastSync)}`
  return (
    <Panel title="Sync zwischen Geräten">
      <div className="space-y-3 px-4 pt-1 pb-4">
        <div className={cx('flex items-center gap-3 rounded-lg px-3 py-2', sync.status === 'error' ? 'bg-danger-soft text-danger' : 'bg-sunken')}>
          {sync.status === 'offline' ? <CloudOff size={20} /> : sync.status === 'syncing' ? <RefreshCw size={20} className="animate-spin text-brass" /> : <Cloud size={20} className={sync.status === 'error' ? '' : 'text-ok'} />}
          <span className="flex-1">{label}</span>
        </div>
        {sync.status === 'error' && sync.error && <p className="text-sm text-danger">{sync.error}</p>}
        <p className="text-sm text-ink-2">Angemeldet als <strong>{session.user.email}</strong>. API-Schlüssel, Stimme und Timer bleiben pro Gerät.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => syncNow()} disabled={sync.status === 'syncing'}><RefreshCw size={17} /> Jetzt synchronisieren</Button>
          <Button variant="ghost" onClick={() => signOut().then(() => setReady(false))}><LogOut size={17} /> Abmelden</Button>
        </div>
      </div>
    </Panel>
  )
}
