import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Download, Palette, Plus, Share, Trash2, Upload } from 'lucide-react'
import { db, setSetting } from '../db'
import { addDays, minutesOf, mondayOf, weekKindFor } from '../lib/date'
import { exportData, importData } from '../lib/backup'
import { deleteDemo, hasDemo, seedDemo } from '../lib/seed'
import { usePeriods, useSetting, useToday } from '../lib/hooks'
import { Button, IconButton, Input, PageHeader, Panel, Segmented, useConfirm } from '../components/ui'
import { KiSettings } from '../components/KiSettings'
import { SyncSettings } from '../components/SyncSettings'
import { AssistantSettings } from '../components/AssistantSettings'
import { Link } from 'react-router-dom'

export default function SettingsPage() {
  const today = useToday()
  const abRef = useSetting('abReference', mondayOf(today))
  const lastExport = useSetting<number | null>('lastExport', null)
  const periods = usePeriods()
  const demo = useLiveQuery(() => hasDemo(), [], false)
  const counts = useLiveQuery(async () => ({ tasks: await db.tasks.count(), grades: await db.grades.count(), subjects: await db.subjects.count() }), [], { tasks: 0, grades: 0, subjects: 0 })
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const confirm = useConfirm()
  const thisWeek = weekKindFor(today, abRef)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone

  const setThisWeek = (k: 'A' | 'B') => {
    const monday = mondayOf(today)
    setSetting('abReference', k === 'A' ? monday : addDays(monday, -7))
  }

  const onImport = async (file?: File) => {
    if (!file) return
    if (!(await confirm.ask('Alles in der App wird durch die Sicherung ersetzt.', 'Wiederherstellen'))) return
    try {
      await importData(file)
      setMessage({ ok: true, text: 'Sicherung wiederhergestellt.' })
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const updatePeriod = (id: number, patch: { start?: string; end?: string }) => db.periods.update(id, patch)
  const addPeriod = () => {
    const last = periods[periods.length - 1]
    const start = last?.end ?? '08:00'
    const m = minutesOf(start) + 50
    const end = `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    db.periods.add({ nr: (last?.nr ?? 0) + 1, start, end })
  }
  const removeLast = async () => {
    const last = periods[periods.length - 1]
    if (!last) return
    const used = await db.lessons.filter((l) => l.period + l.length - 1 >= last.nr).count()
    if (used && !(await confirm.ask(`In der ${last.nr}. Stunde ist noch Unterricht eingetragen. Diese Einträge werden gelöscht.`))) return
    await db.lessons.filter((l) => l.period + l.length - 1 >= last.nr).delete()
    await db.periods.delete(last.id!)
  }

  return (
    <div>
      <PageHeader title="Einstellungen" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <SyncSettings />
          <KiSettings />
          <AssistantSettings />
          <Link to="/design" className="panel flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 hover:bg-sunken">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brass-soft text-brass"><Palette size={24} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Design</span>
              <span className="block text-sm text-ink-2">Farben, Schrift, Fachfarben, Hintergrund und Bilder, mit Live-Vorschau</span>
            </span>
            <ChevronRight size={20} className="text-ink-3" />
          </Link>

          <Panel title="A/B-Wochen">
            <div className="space-y-2 px-4 pt-1 pb-4">
              <p className="text-ink-2">Diese Woche ist eine</p>
              <Segmented className="w-full" value={thisWeek} onChange={setThisWeek} options={[{ value: 'A', label: 'A-Woche' }, { value: 'B', label: 'B-Woche' }]} />
              <p className="text-sm text-ink-3">Danach wechselt es jede Woche automatisch. Ferien zählen mit — nach den Ferien hier kurz prüfen.</p>
            </div>
          </Panel>

          <Panel title="Daten sichern">
            <div className="space-y-3 px-4 pt-1 pb-4">
              <p className="text-ink-2">
                Zusätzlich zum Sync: eine Sicherung als Datei. Auf diesem Gerät ({counts.subjects} Fächer, {counts.tasks} Aufgaben, {counts.grades} Noten). Sichere sie regelmäßig in „Dateien" oder iCloud.
              </p>
              <p className="text-sm text-ink-3">{lastExport ? `Letzte Sicherung: ${new Date(lastExport).toLocaleDateString('de-AT')}` : 'Noch nie gesichert.'}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => exportData()}><Download size={18} /> Sicherung erstellen</Button>
                <Button onClick={() => fileRef.current?.click()}><Upload size={18} /> Wiederherstellen</Button>
                <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
              </div>
              {message && <p className={message.ok ? 'text-ok' : 'text-danger'} role="status">{message.text}</p>}
            </div>
          </Panel>

          <Panel title="Demodaten">
            <div className="space-y-3 px-4 pt-1 pb-4">
              {demo ? (
                <>
                  <p className="text-ink-2">Die Beispiel-Noten, -Aufgaben und -Prüfungen sind noch da. Deine Fächer und dein Stundenplan bleiben erhalten.</p>
                  <Button variant="danger" onClick={async () => { if (await confirm.ask('Alle Demodaten werden gelöscht.', 'Demodaten löschen')) await deleteDemo() }}>
                    <Trash2 size={18} /> Demodaten löschen
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-ink-2">Keine Demodaten vorhanden.</p>
                  <Button onClick={() => seedDemo()}>Demodaten wieder laden</Button>
                </>
              )}
            </div>
          </Panel>

          {!standalone && (
            <Panel title="Als App installieren">
              <p className="flex flex-wrap items-center gap-1.5 px-4 pt-1 pb-4 text-ink-2">
                In Safari auf <Share size={16} className="inline text-ink" /> „Teilen" tippen, dann „Zum Home-Bildschirm". Danach öffnet Kompass ohne Browserleiste und funktioniert offline.
              </p>
            </Panel>
          )}
        </div>

        <Panel title="Stundenraster" className="self-start">
          <p className="px-4 pb-2 text-sm text-ink-3">Beginn und Ende jeder Stunde. Pausen ergeben sich aus den Lücken.</p>
          <ul className="px-4 pb-2">
            {periods.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-1">
                <span className="w-10 shrink-0 font-semibold text-ink-2 tabular">{p.nr}.</span>
                <Input type="time" value={p.start} onChange={(e) => updatePeriod(p.id!, { start: e.target.value })} aria-label={`${p.nr}. Stunde Beginn`} className="tabular" />
                <span className="text-ink-3">–</span>
                <Input type="time" value={p.end} onChange={(e) => updatePeriod(p.id!, { end: e.target.value })} aria-label={`${p.nr}. Stunde Ende`} className="tabular" />
                {minutesOf(p.end) <= minutesOf(p.start) && <span className="text-sm text-danger">!</span>}
              </li>
            ))}
          </ul>
          <div className="flex gap-2 border-t border-line px-4 py-3">
            <Button variant="ghost" onClick={addPeriod}><Plus size={18} /> Stunde</Button>
            <IconButton label="Letzte Stunde entfernen" onClick={removeLast} disabled={periods.length <= 1}><Trash2 size={18} /></IconButton>
          </div>
        </Panel>
      </div>
      <p className="mt-8 text-sm text-ink-3">Kompass · Version vom {__APP_VERSION__}</p>
      {confirm.element}
    </div>
  )
}
