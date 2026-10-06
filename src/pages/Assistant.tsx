import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Mic, MicOff, Send, Sparkles, Trash2, Undo2, Volume2, VolumeX, Sunrise } from 'lucide-react'
import { db, getSetting, setSetting, type ChatMessage } from '../db'
import { todayISO } from '../lib/date'
import { PERSONAS, resolvePersona, type CustomPersona } from '../lib/personas'
import { askAssistant, getBriefing, undoAction } from '../lib/assistant'
import { canListen, canSpeak, listen, speak, stopSpeaking, unlockSpeech } from '../lib/voice'
import { useSetting } from '../lib/hooks'
import { KiSetupCard, useKi } from '../components/KiGate'
import { Button, IconButton, PageHeader, cx, useConfirm } from '../components/ui'

const SUGGESTIONS = ['Was ist morgen fällig?', 'Wann ist die nächste Schularbeit?', 'Wie stehe ich in AM?', 'Trag DIC-Hausübung für Freitag ein']

export default function Assistant() {
  const ki = useKi()
  const messages = useLiveQuery(() => db.chat.orderBy('ts').toArray(), [], [] as ChatMessage[])
  const voiceOut = useSetting('voiceOut', true)
  const personaId = useSetting<string>('persona', 'friday')
  const customPersona = useSetting<CustomPersona | null>('customPersona', null)
  const persona = resolvePersona(personaId, customPersona)
  const personaOptions = [
    ...Object.entries(PERSONAS).map(([id, p]) => ({ id, name: p.name })),
    ...(customPersona?.prompt ? [{ id: 'eigene', name: customPersona.name || 'Eigene Figur' }] : []),
  ]
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [speakingId, setSpeakingId] = useState<number | string | null>(null)
  const [briefing, setBriefing] = useState<string | null>(null)
  const stopRef = useRef<() => void>(() => {})
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const confirm = useConfirm()

  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [messages.length, busy, briefing])
  useEffect(() => () => { stopSpeaking(); stopRef.current() }, [])
  // Show today's briefing again if it was already made.
  useEffect(() => {
    getSetting<{ date: string; text: string } | null>('briefing', null).then((b) => b?.date === todayISO() && setBriefing(b.text))
  }, [])

  const say = (text: string, id: number | string) => {
    setSpeakingId(id)
    speak(text, () => setSpeakingId(null))
  }

  const send = async (text: string, spoken = false) => {
    const q = text.trim()
    if (!q || busy) return
    unlockSpeech()
    setInput('')
    setError('')
    setBusy(true)
    try {
      const reply = await askAssistant(q)
      if (voiceOut || spoken) say(reply.text, reply.id!)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Etwas ist schiefgelaufen.')
    }
    setBusy(false)
  }

  const mic = () => {
    if (listening) return stopRef.current()
    unlockSpeech()
    stopSpeaking()
    setError('')
    setListening(true)
    let last = ''
    stopRef.current = listen({
      onText: (t, final) => {
        last = t
        setInput(t)
        if (final) {
          stopRef.current()
        }
      },
      onEnd: () => {
        setListening(false)
        if (last.trim()) send(last, true)
      },
      onError: (msg) => {
        setListening(false)
        setError(msg)
      },
    })
  }

  const doBriefing = async (force = false) => {
    unlockSpeech()
    setError('')
    setBusy(true)
    try {
      const text = await getBriefing(force)
      setBriefing(text)
      say(text, 'briefing')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Etwas ist schiefgelaufen.')
    }
    setBusy(false)
  }

  const clear = async () => {
    if (await confirm.ask('Der ganze Verlauf wird gelöscht. Eingetragenes bleibt.', 'Verlauf löschen')) {
      await db.chat.clear()
      setBriefing(null)
    }
  }

  if (ki && !ki.hasKey) {
    return (
      <div>
        <PageHeader title="Assistent" />
        <KiSetupCard what="Der Assistent" />
      </div>
    )
  }

  const name = persona.name === 'Sachlich' ? 'Assistent' : persona.name

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col">
      <PageHeader
        title={name}
        subtitle="Frag nach Stundenplan, Aufgaben, Noten und Prüfungen, oder lass dir etwas eintragen."
        action={
          <div className="flex items-center gap-1">
            <Button onClick={() => (briefing && speakingId !== 'briefing' ? say(briefing, 'briefing') : doBriefing())} disabled={busy}><Sunrise size={18} /> Briefing</Button>
            {canSpeak && (
              <IconButton label={voiceOut ? 'Antworten nicht vorlesen' : 'Antworten vorlesen'} onClick={() => { if (voiceOut) stopSpeaking(); setSetting('voiceOut', !voiceOut) }}>
                {voiceOut ? <Volume2 size={20} /> : <VolumeX size={20} />}
              </IconButton>
            )}
            {messages.length > 0 && <IconButton label="Verlauf löschen" onClick={clear}><Trash2 size={19} /></IconButton>}
          </div>
        }
      />

      <div className="-mt-3 mb-5 flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Charakter">
        {personaOptions.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={personaId === o.id}
            onClick={() => { stopSpeaking(); setBriefing(null); setSetting('persona', o.id) }}
            className={cx('min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap', personaId === o.id ? 'border-brass bg-brass-soft text-brass' : 'border-line bg-surface text-ink-2 hover:text-ink')}
          >
            {o.name}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3">
        {briefing && (
          <div className="rounded-xl border-2 border-brass bg-brass-soft px-4 py-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-brass"><Sunrise size={16} /> Briefing</span>
              <button type="button" className="min-h-9 text-sm font-medium text-brass" onClick={() => doBriefing(true)} disabled={busy}>Neu erstellen</button>
            </div>
            <p>{briefing}</p>
          </div>
        )}

        {!messages.length && !briefing && (
          <div className="py-6">
            <p className="mb-3 text-ink-2">Zum Beispiel:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="min-h-11 rounded-full border border-line bg-surface px-4 text-left hover:bg-sunken">{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[85%] rounded-2xl px-4 py-2.5', m.role === 'user' ? 'rounded-br-md bg-ink text-paper' : 'rounded-bl-md border border-line bg-surface')}>
              <p className="whitespace-pre-line">{m.text}</p>
              {m.role === 'assistant' && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {m.actions?.map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-sunken py-1 pr-1 pl-3 text-sm text-ink-2">
                      {a.label}
                      <button type="button" onClick={() => undoAction(m.id!, i)} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 font-medium text-brass hover:bg-surface" aria-label={`Rückgängig: ${a.label}`}>
                        <Undo2 size={14} /> Rückgängig
                      </button>
                    </span>
                  ))}
                  {canSpeak && (
                    <button type="button" onClick={() => (speakingId === m.id ? (stopSpeaking(), setSpeakingId(null)) : say(m.text, m.id!))} className="inline-flex min-h-8 items-center text-ink-3 hover:text-ink" aria-label={speakingId === m.id ? 'Vorlesen stoppen' : 'Vorlesen'}>
                      {speakingId === m.id ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 text-ink-2">
              <Sparkles size={16} className="animate-pulse text-brass" /> {name} denkt nach …
            </div>
          </div>
        )}
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger" role="alert">{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-24 mt-4 flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-lg lg:bottom-4"
        onSubmit={(e) => { e.preventDefault(); send(input) }}
      >
        {canListen && (
          <button
            type="button"
            onClick={mic}
            aria-label={listening ? 'Zuhören beenden' : 'Sprechen'}
            className={cx('flex size-12 shrink-0 items-center justify-center rounded-xl transition-colors', listening ? 'animate-pulse bg-danger text-white' : 'bg-brass-soft text-brass hover:opacity-90')}
          >
            {listening ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
        )}
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
          placeholder={listening ? 'Ich höre zu …' : canListen ? 'Frag was oder tipp aufs Mikrofon' : 'Frag was (Mikrofon auf der Tastatur geht auch)'}
          className="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-2 py-3 placeholder:text-ink-3 focus:outline-none"
          aria-label="Nachricht"
        />
        <button type="submit" disabled={!input.trim() || busy} aria-label="Senden" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-ink text-paper disabled:opacity-30">
          <Send size={20} />
        </button>
      </form>
      {confirm.element}
    </div>
  )
}
