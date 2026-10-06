import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { KeyRound, Trash2 } from 'lucide-react'
import { db, setSetting } from '../db'
import { DEFAULT_BUDGET, DEFAULT_MODEL, MODELS, monthKey, type ModelId } from '../lib/claude'
import { useSetting } from '../lib/hooks'
import { Button, Field, Input, Panel, Segmented } from './ui'

export function KiSettings() {
  const key = useSetting<string>('apiKey', '')
  const model = useSetting<ModelId>('kiModel', DEFAULT_MODEL)
  const budget = useSetting('kiBudget', DEFAULT_BUDGET)
  const usage = useLiveQuery(() => db.usage.get(monthKey()), [])
  const [draft, setDraft] = useState('')
  const [msg, setMsg] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.location.hash.endsWith('#ki')) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const saveKey = async () => {
    const k = draft.trim()
    if (!k.startsWith('sk-ant-')) return setMsg('Das sieht nicht wie ein Anthropic-Schlüssel aus (beginnt mit „sk-ant-").')
    await setSetting('apiKey', k)
    setDraft('')
    setMsg('Gespeichert.')
  }
  const spent = usage?.costUsd ?? 0
  const pct = Math.min(1, spent / budget)

  return (
    <div ref={ref} id="ki">
      <Panel title="KI (Claude)">
        <div className="space-y-4 px-4 pt-1 pb-4">
          {key ? (
            <div className="flex items-center gap-3 rounded-lg bg-sunken px-3 py-2">
              <KeyRound size={18} className="text-ok" />
              <span className="flex-1 tabular">Schlüssel gespeichert ({key.slice(0, 10)}…{key.slice(-4)})</span>
              <Button variant="ghost" onClick={() => setSetting('apiKey', '')}><Trash2 size={16} /> Entfernen</Button>
            </div>
          ) : (
            <Field label="API-Schlüssel" hint="console.anthropic.com → API Keys → Create Key. Bleibt nur auf diesem Gerät und kommt in keine Sicherung.">
              <div className="flex gap-2">
                <Input type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="sk-ant-…" />
                <Button variant="primary" onClick={saveKey} disabled={!draft.trim()}>Speichern</Button>
              </div>
            </Field>
          )}
          {msg && <p className="text-sm text-ink-2" role="status">{msg}</p>}

          <Field label="Modell">
            <Segmented<ModelId> className="w-full" value={model} onChange={(v) => setSetting('kiModel', v)} options={(Object.keys(MODELS) as ModelId[]).map((m) => ({ value: m, label: MODELS[m].label }))} />
          </Field>
          <p className="-mt-2 text-sm text-ink-3">{MODELS[model].label}: {MODELS[model].note}.</p>



          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink-2">Verbrauch diesen Monat</span>
              <span className="text-sm tabular">{spent.toFixed(2)} $ von {budget} $ · {usage?.calls ?? 0} Anfragen</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
              <div className={pct >= 0.9 ? 'h-full bg-danger' : 'h-full bg-ok'} style={{ width: `${pct * 100}%` }} />
            </div>
          </div>
          <Field label="Monatslimit in $" hint="Wird es erreicht, macht die KI bis zum Monatsersten Pause. Geschätzt nach Anthropic-Preisen; maßgeblich ist die Abrechnung in der Console.">
            <Input type="number" inputMode="decimal" min={1} max={100} step={1} value={budget} onChange={(e) => setSetting('kiBudget', Math.max(1, Number(e.target.value) || DEFAULT_BUDGET))} className="w-32 tabular" />
          </Field>
        </div>
      </Panel>
    </div>
  )
}
