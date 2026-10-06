import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { setSetting } from '../db'
import { useSetting } from '../lib/hooks'
import {
  DEFAULT_REMINDERS,
  deviceSubscription,
  disablePushOnDevice,
  enablePushOnDevice,
  isIOS,
  isStandalone,
  pushSupported,
  testReminder,
  uploadReminders,
  type ReminderSettings as Cfg,
} from '../lib/reminders'
import { useSyncState } from './SyncSettings'
import { Button, Field, Input, Panel, cx } from './ui'

export function ReminderSettings() {
  const stored = useSetting<Partial<Cfg>>('reminders', {})
  const cfg: Cfg = { ...DEFAULT_REMINDERS, ...stored }
  const sync = useSyncState()
  const signedIn = sync.status !== 'off'
  const [onDevice, setOnDevice] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    deviceSubscription().then((s) => setOnDevice(!!s)).catch(() => setOnDevice(false))
  }, [])

  const save = async (patch: Partial<Cfg>) => {
    await setSetting('reminders', { ...cfg, ...patch })
    void uploadReminders(true).catch(() => {})
  }
  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      if (ok) setMsg({ ok: true, text: ok })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  const turnOn = () =>
    run(async () => {
      await enablePushOnDevice()
      setOnDevice(true)
      if (!cfg.enabled) await save({ enabled: true })
    }, 'Erinnerungen sind auf diesem Gerät an.')
  const turnOff = () =>
    run(async () => {
      await disablePushOnDevice()
      setOnDevice(false)
    }, 'Auf diesem Gerät aus.')

  const needsInstall = isIOS() && !isStandalone()
  const toggleDay = (n: number) => save({ examDays: cfg.examDays.includes(n) ? cfg.examDays.filter((x) => x !== n) : [...cfg.examDays, n].sort((a, b) => b - a) })

  return (
    <Panel title="Erinnerungen">
      <div className="space-y-4 px-4 pb-4">
        <p className="text-ink-2">Push-Mitteilungen am Abend: was morgen fällig ist, Prüfungen und deine Schicht. Kommen auch, wenn Kompass zu ist.</p>

        {!signedIn ? (
          <p className="rounded-lg bg-sunken px-3 py-2 text-sm">Dafür brauchst du die Synchronisierung: melde dich oben an.</p>
        ) : needsInstall ? (
          <p className="rounded-lg bg-sunken px-3 py-2 text-sm">Auf dem iPad gehen Mitteilungen nur in der installierten App: in Safari auf <b>Teilen → Zum Home-Bildschirm</b>, dann Kompass vom Home-Bildschirm öffnen und hier einschalten.</p>
        ) : !pushSupported() ? (
          <p className="rounded-lg bg-sunken px-3 py-2 text-sm">Dieser Browser kann keine Push-Mitteilungen.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {onDevice ? (
              <>
                <span className="flex items-center gap-2 font-semibold text-brass"><Bell size={18} /> Auf diesem Gerät an</span>
                <Button onClick={() => run(testReminder, 'Test geschickt. Ein zweiter kommt in ein paar Minuten über den Server.')} disabled={busy}>Test</Button>
                <Button variant="ghost" onClick={turnOff} disabled={busy}><BellOff size={16} /> Aus</Button>
              </>
            ) : (
              <Button variant="primary" onClick={turnOn} disabled={busy}><Bell size={18} /> Auf diesem Gerät einschalten</Button>
            )}
          </div>
        )}
        {msg && <p className={cx('text-sm', msg.ok ? 'text-ink-2' : 'text-danger')}>{msg.text}</p>}

        {signedIn && (
          <>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="size-5 accent-[var(--brass)]" checked={cfg.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
              <span>Erinnerungen schicken (für alle Geräte)</span>
            </label>
            <div className={cx('space-y-4', !cfg.enabled && 'pointer-events-none opacity-50')}>
              <Field label="Tagesvorschau um">
                <Input type="time" className="w-36" value={cfg.digestTime} onChange={(e) => e.target.value && save({ digestTime: e.target.value })} />
              </Field>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink-2">Vorwarnung vor Prüfungen</span>
                <div className="flex flex-wrap gap-2">
                  {[7, 5, 3, 2].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleDay(n)}
                      aria-pressed={cfg.examDays.includes(n)}
                      className={cx('min-h-11 rounded-full border px-4 font-semibold', cfg.examDays.includes(n) ? 'border-brass bg-brass-soft text-brass' : 'border-line text-ink-2')}
                    >
                      {n} Tage vorher
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-sm text-ink-3">Den Tag davor sagt dir sowieso die Tagesvorschau.</p>
              </div>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" className="size-5 accent-[var(--brass)]" checked={cfg.shifts} onChange={(e) => save({ shifts: e.target.checked })} />
                <span>Schichten in der Vorschau</span>
              </label>
              <p className="text-sm text-ink-3">Einzelne Aufgaben: im Aufgaben-Formular bei „Erinnern" eine Uhrzeit wählen, oder Friday sagen „erinnere mich morgen um 16 Uhr an …".</p>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}
