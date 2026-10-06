import { useEffect, useState } from 'react'
import { Check, Play } from 'lucide-react'
import { setSetting } from '../db'
import { PERSONAS, type CustomPersona } from '../lib/personas'
import { DEFAULT_VOICE, canSpeak, listVoices, speak, type VoicePrefs } from '../lib/voice'
import { useSetting } from '../lib/hooks'
import { Button, Field, Input, Panel, Segmented, Select, Textarea, cx } from './ui'
import { ElevenSettings } from './ElevenSettings'

function useVoices() {
  const [voices, setVoices] = useState(() => listVoices())
  useEffect(() => {
    if (!canSpeak) return
    const on = () => setVoices(listVoices())
    window.speechSynthesis.addEventListener('voiceschanged', on)
    on()
    return () => window.speechSynthesis.removeEventListener('voiceschanged', on)
  }, [])
  return voices
}

const SAMPLE_DE = 'Morgen ist das Laborprotokoll fällig, und die Englisch-Schularbeit ist in fünf Tagen.'
const SAMPLE_EN = 'Tomorrow your lab report is due, and the English test is in five days.'

export function AssistantSettings() {
  const persona = useSetting<string>('persona', 'friday')
  const custom = useSetting<CustomPersona | null>('customPersona', null)
  const voice = { ...DEFAULT_VOICE, ...useSetting<VoicePrefs | null>('voice', null) }
  const voices = useVoices()
  const engine = useSetting<'system' | 'eleven'>('voiceEngine', 'system')
  const [draft, setDraft] = useState<CustomPersona>(custom ?? { name: '', prompt: '' })
  useEffect(() => {
    if (custom) setDraft(custom)
  }, [custom])
  const setVoice = (patch: Partial<VoicePrefs>) => setSetting('voice', { ...voice, ...patch })
  const de = voices.filter((v) => v.lang.toLowerCase().startsWith('de'))
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'))
  const options = [...Object.entries(PERSONAS).map(([id, p]) => ({ id, name: p.name, blurb: p.blurb })), { id: 'eigene', name: 'Eigene Figur', blurb: 'Du beschreibst, wer sie ist' }]

  return (
    <Panel title="Assistent & Stimme">
      <div className="space-y-6 px-4 pt-1 pb-5">
        <div>
          <span className="mb-2 block text-sm font-medium text-ink-2">Charakter</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={persona === o.id}
                onClick={() => setSetting('persona', o.id)}
                className={cx('relative rounded-xl border-2 px-3 py-2.5 text-left', persona === o.id ? 'border-brass bg-brass-soft/50' : 'border-line')}
              >
                <span className="block font-semibold">{o.id === 'eigene' && custom?.name ? custom.name : o.name}</span>
                <span className="text-sm text-ink-2">{o.blurb}</span>
                {persona === o.id && <Check size={16} className="absolute top-2.5 right-2.5 text-brass" />}
              </button>
            ))}
          </div>
          {persona === 'eigene' && (
            <div className="mt-3 space-y-3 rounded-xl bg-sunken p-3">
              <Field label="Name">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="z. B. Jarvis" />
              </Field>
              <Field label="Wer ist sie oder er?" hint="Ton, Art zu reden, wie sie dich nennt. Die Fakten bleiben immer korrekt.">
                <Textarea rows={4} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} placeholder="z. B. Britischer Butler, trocken-höflich, nennt mich Sir, kurze Antworten mit einer Prise Ironie." />
              </Field>
              <Button variant="primary" onClick={() => setSetting('customPersona', draft)} disabled={!draft.prompt.trim()}>Figur speichern</Button>
            </div>
          )}
        </div>

        <Field label="Stimme kommt von">
          <Segmented className="w-full" value={engine} onChange={(v) => setSetting('voiceEngine', v)} options={[{ value: 'system', label: 'Gerät' }, { value: 'eleven', label: 'ElevenLabs (Cloud)' }]} />
        </Field>
        {engine === 'eleven' && <ElevenSettings />}
        {engine === 'eleven' && <p className="text-sm text-ink-3">Falls ElevenLabs mal nicht geht (offline, Kontingent leer), liest die Gerätestimme unten vor.</p>}

        {canSpeak ? (
          <div className="space-y-4">
            <Field label="Stimme für Deutsch">
              <div className="flex gap-2">
                <Select value={voice.de ?? ''} onChange={(e) => setVoice({ de: e.target.value || null })}>
                  <option value="">Automatisch</option>
                  {de.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                </Select>
                <Button aria-label="Deutsche Stimme anhören" onClick={() => speak(SAMPLE_DE, undefined, voice)}><Play size={17} /></Button>
              </div>
            </Field>
            <Field label="Stimme für Englisch">
              <div className="flex gap-2">
                <Select value={voice.en ?? ''} onChange={(e) => setVoice({ en: e.target.value || null })}>
                  <option value="">Automatisch</option>
                  {en.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                </Select>
                <Button aria-label="Englische Stimme anhören" onClick={() => speak(SAMPLE_EN, undefined, voice)}><Play size={17} /></Button>
              </div>
            </Field>
            <Field label={`Tempo: ${voice.rate.toFixed(2).replace('.', ',')}×`}>
              <input type="range" min={0.7} max={1.5} step={0.05} value={voice.rate} onChange={(e) => setVoice({ rate: Number(e.target.value) })} className="w-full accent-[var(--brass)]" />
            </Field>
            <Field label={`Tonhöhe: ${voice.pitch.toFixed(2).replace('.', ',')}`}>
              <input type="range" min={0.5} max={1.6} step={0.05} value={voice.pitch} onChange={(e) => setVoice({ pitch: Number(e.target.value) })} className="w-full accent-[var(--brass)]" />
            </Field>
            <p className="text-sm text-ink-3">
              Die Stimmen kommen vom Gerät. Bessere gibt es am iPad unter Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen (z. B. „Erweitert“ oder „Premium“ laden). Danach Kompass neu öffnen.
            </p>
          </div>
        ) : (
          <p className="text-ink-2">Dieser Browser kann nicht vorlesen.</p>
        )}
      </div>
    </Panel>
  )
}
