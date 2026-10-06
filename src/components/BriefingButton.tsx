import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, RefreshCw, Sparkles, Square, X } from 'lucide-react'
import { getBriefing } from '../lib/assistant'
import { resolvePersona, type CustomPersona } from '../lib/personas'
import { speak, stopSpeaking, unlockSpeech } from '../lib/voice'
import { useSetting } from '../lib/hooks'
import { useKi } from './KiGate'
import { cx } from './ui'

type State = 'idle' | 'loading' | 'speaking'

/** One tap: the assistant greets you and talks you through the day (school) or the evening (at home). */
export function useBriefing() {
  const persona = resolvePersona(useSetting<string>('persona', 'friday'), useSetting<CustomPersona | null>('customPersona', null))
  const ki = useKi()
  const [state, setState] = useState<State>('idle')
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => () => stopSpeaking(), [])

  const play = async (force = false) => {
    if (state === 'speaking' || state === 'loading') {
      stopSpeaking()
      setState('idle')
      return
    }
    unlockSpeech() // must happen inside the tap, before anything async
    setError('')
    setState('loading')
    try {
      const b = await getBriefing(force)
      setText(b.text)
      setState('speaking')
      speak(b.text, () => setState('idle'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('idle')
    }
  }
  return { persona, ki, state, text, error, play, dismiss: () => { stopSpeaking(); setText(null); setState('idle') } }
}

export function BriefingButton({ b, onImage = false }: { b: ReturnType<typeof useBriefing>; onImage?: boolean }) {
  if (b.ki && !b.ki.hasKey) return null
  const name = b.persona.name === 'Sachlich' ? 'Assistent' : b.persona.name
  const label = b.state === 'loading' ? `${name} denkt nach …` : b.state === 'speaking' ? 'Stopp' : `Hallo ${name}`
  return (
    <button
      type="button"
      onClick={() => b.play()}
      aria-label={b.state === 'idle' ? `${name}: Begrüßung und Überblick vorlesen` : label}
      className={cx(
        'inline-flex min-h-12 shrink-0 items-center gap-2.5 rounded-full py-1.5 pr-5 pl-1.5 font-semibold shadow-lg transition-transform active:scale-95',
        onImage ? 'bg-white/90 text-neutral-900 backdrop-blur' : 'bg-ink text-paper',
      )}
    >
      <span className={cx('flex size-9 items-center justify-center rounded-full', onImage ? 'bg-neutral-900 text-white' : 'bg-brass text-white')}>
        {b.state === 'loading' ? <Loader2 size={18} className="animate-spin" /> : b.state === 'speaking' ? <Square size={14} fill="currentColor" /> : <Sparkles size={18} />}
      </span>
      {b.state === 'speaking' ? <SpeakingBars /> : null}
      {label}
    </button>
  )
}

function SpeakingBars() {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="w-1 animate-pulse rounded-full bg-current" style={{ height: `${[60, 100, 40, 80][i]}%`, animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  )
}

/** The spoken text, shown under the header so it can be read too. */
export function BriefingCard({ b }: { b: ReturnType<typeof useBriefing> }) {
  if (b.error) {
    return (
      <div className="mb-5 flex items-start gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-danger" role="alert">
        <p className="flex-1">{b.error}</p>
        <Link to="/einstellungen" className="shrink-0 font-semibold underline">Einstellungen</Link>
      </div>
    )
  }
  if (!b.text) return null
  return (
    <div className="panel mb-5 rounded-2xl border-2 border-brass bg-surface px-4 py-3">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles size={16} className="text-brass" />
        <span className="flex-1 text-sm font-semibold text-brass">{b.persona.name}</span>
        <button type="button" onClick={() => b.play(true)} className="flex size-9 items-center justify-center rounded-lg text-ink-3 hover:text-ink" aria-label="Neu erstellen">
          <RefreshCw size={16} />
        </button>
        <button type="button" onClick={b.dismiss} className="flex size-9 items-center justify-center rounded-lg text-ink-3 hover:text-ink" aria-label="Schließen">
          <X size={18} />
        </button>
      </div>
      <p className="leading-relaxed">{b.text}</p>
    </div>
  )
}
