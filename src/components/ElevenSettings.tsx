import { useEffect, useState } from 'react'
import { Check, KeyRound, Play, RefreshCw, Trash2 } from 'lucide-react'
import { setSetting } from '../db'
import { ELEVEN_MODELS, elevenSpeak, elevenUsage, listElevenVoices, playPreview, unlockElevenAudio, type ElevenModel, type ElevenVoice } from '../lib/eleven'
import { useSetting } from '../lib/hooks'
import { Button, Field, Input, Segmented, cx } from './ui'

const SAMPLE = 'Servus boss. Morgen ist das Laborprotokoll fällig, und die Englisch-Schularbeit ist in fünf Tagen.'

export function ElevenSettings() {
  const key = useSetting<string>('elevenKey', '')
  const voiceId = useSetting<string>('elevenVoice', '')
  const model = useSetting<ElevenModel>('elevenModel', 'eleven_flash_v2_5')
  const [draft, setDraft] = useState('')
  const [voices, setVoices] = useState<ElevenVoice[] | null>(null)
  const [usage, setUsage] = useState<{ used: number; limit: number; resetsAt: Date | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [filter, setFilter] = useState('')

  const load = async (k = key) => {
    if (!k) return
    setBusy(true)
    setMsg(null)
    try {
      const [v, u] = await Promise.all([listElevenVoices(k), elevenUsage(k).catch(() => null)])
      setVoices(v)
      setUsage(u)
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
    setBusy(false)
  }
  useEffect(() => {
    if (key) void load(key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const saveKey = async () => {
    const k = draft.trim()
    if (k.length < 20) return setMsg({ ok: false, text: 'Das sieht nicht wie ein ElevenLabs-Schlüssel aus.' })
    await setSetting('elevenKey', k)
    setDraft('')
  }

  const test = async () => {
    unlockElevenAudio()
    setMsg(null)
    try {
      await elevenSpeak(SAMPLE, { key, voiceId, model })
      elevenUsage(key).then(setUsage).catch(() => {})
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
  }

  if (!key) {
    return (
      <Field label="ElevenLabs-Schlüssel" hint="elevenlabs.io → Developers → API Keys. Rechte: Text to Speech und Voices (Read). Bleibt nur auf diesem Gerät.">
        <div className="flex gap-2">
          <Input type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="sk_…" />
          <Button variant="primary" onClick={saveKey} disabled={!draft.trim()}>Speichern</Button>
        </div>
        {msg && <p className="mt-1 text-sm text-danger">{msg.text}</p>}
      </Field>
    )
  }

  const shown = (voices ?? []).filter((v) => !filter || v.name.toLowerCase().includes(filter.toLowerCase()) || Object.values(v.labels ?? {}).join(' ').toLowerCase().includes(filter.toLowerCase()))
  const pct = usage && usage.limit ? Math.min(1, usage.used / usage.limit) : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg bg-sunken px-3 py-2">
        <KeyRound size={18} className="text-ok" />
        <span className="flex-1 text-sm">ElevenLabs verbunden</span>
        <Button variant="ghost" onClick={() => { setSetting('elevenKey', ''); setVoices(null) }}><Trash2 size={16} /> Entfernen</Button>
      </div>

      {usage && usage.limit > 0 && (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-ink-2">Kontingent</span>
            <span className="tabular">{usage.used.toLocaleString('de-AT')} von {usage.limit.toLocaleString('de-AT')} Zeichen</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-sunken"><div className={pct > 0.9 ? 'h-full bg-danger' : 'h-full bg-ok'} style={{ width: `${pct * 100}%` }} /></div>
          {usage.resetsAt && <p className="mt-1 text-xs text-ink-3">Wird am {usage.resetsAt.toLocaleDateString('de-AT')} zurückgesetzt. Ist es leer, liest bis dahin die Gerätestimme.</p>}
        </div>
      )}

      <Field label="Modell">
        <Segmented<ElevenModel> className="w-full" value={model} onChange={(v) => setSetting('elevenModel', v)} options={(Object.keys(ELEVEN_MODELS) as ElevenModel[]).map((m) => ({ value: m, label: ELEVEN_MODELS[m].label }))} />
      </Field>
      <p className="-mt-2 text-sm text-ink-3">{ELEVEN_MODELS[model].note}.</p>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-ink-2">Stimme</span>
          <Button variant="ghost" onClick={() => load()} disabled={busy}><RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> Neu laden</Button>
        </div>
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Suchen (Name, z. B. „male“, „calm“)" className="mb-2" />
        <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {shown.map((v) => (
            <li key={v.voice_id} className={cx('flex items-center gap-2 rounded-xl border-2 px-2 py-1.5', voiceId === v.voice_id ? 'border-brass bg-brass-soft/50' : 'border-line')}>
              {v.preview_url && (
                <button type="button" aria-label={`${v.name} anhören`} onClick={() => playPreview(v.preview_url!)} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-brass hover:bg-sunken">
                  <Play size={17} />
                </button>
              )}
              <button type="button" onClick={() => setSetting('elevenVoice', v.voice_id)} className="min-w-0 flex-1 py-1 text-left">
                <span className="block truncate font-medium">{v.name}</span>
                <span className="block truncate text-xs text-ink-3">{[v.labels?.gender, v.labels?.accent, v.labels?.description ?? v.labels?.descriptive, v.labels?.use_case ?? v.category].filter(Boolean).join(' · ')}</span>
              </button>
              {voiceId === v.voice_id && <Check size={18} className="shrink-0 text-brass" />}
            </li>
          ))}
          {voices && !shown.length && <li className="px-1 text-sm text-ink-3">Keine Stimme gefunden.</li>}
        </ul>
        <p className="mt-1.5 text-xs text-ink-3">▶ spielt die kostenlose Hörprobe. Stimmen aus der Voice Library erscheinen hier, sobald du sie auf elevenlabs.io zu „My Voices“ hinzufügst.</p>
      </div>

      <Button variant="primary" onClick={test} disabled={!voiceId}><Play size={17} /> Auf Deutsch testen</Button>
      {msg && <p className={msg.ok ? 'text-ok' : 'text-danger'} role="status">{msg.text}</p>}
    </div>
  )
}
