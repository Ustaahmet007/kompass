import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pause, Play, RotateCcw, SkipForward, Square } from 'lucide-react'
import { db, setSetting, type StudySession } from '../db'
import { DAY_SHORT, addDays, mondayOf, todayISO } from '../lib/date'
import { useNow, useSetting, useSubjects, useToday } from '../lib/hooks'
import { DEFAULT_MUSIC, MusicPanel, TimerBackdrop, musicPause, musicPlay, type MusicSettings } from '../components/Music'
import { Button, Field, PageHeader, Panel, Segmented, SubjectSelect, SubjectTag, cx } from '../components/ui'

interface TimerState {
  phase: 'focus' | 'pause'
  running: boolean
  endsAt: number | null // when running
  remainingMs: number // when paused
  focusMin: number
  breakMin: number
  subjectId: number | null
  focusStartedAt: number | null
}

const DEFAULT: TimerState = { phase: 'focus', running: false, endsAt: null, remainingMs: 25 * 60_000, focusMin: 25, breakMin: 5, subjectId: null, focusStartedAt: null }

function chime() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = [660, 880, 990][i]
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.4)
    })
  } catch {
    /* no audio */
  }
  navigator.vibrate?.([200, 100, 200])
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function Timer() {
  const now = useNow(1000).getTime()
  const today = useToday()
  const { subjects, byId } = useSubjects()
  const state = useSetting<TimerState>('timer', DEFAULT)
  const music = useSetting<MusicSettings>('music', DEFAULT_MUSIC)
  const hasMusic = !!music.current
  const sessions = useLiveQuery(() => db.sessions.where('date').aboveOrEqual(addDays(today, -30)).toArray(), [today], [] as StudySession[])
  // endsAt of the phase already handled — the stored state can lag a tick behind.
  const handled = useRef<number | null>(null)

  const set = (patch: Partial<TimerState>) => setSetting('timer', { ...state, ...patch })
  const remaining = state.running && state.endsAt ? state.endsAt - now : state.remainingMs
  const total = (state.phase === 'focus' ? state.focusMin : state.breakMin) * 60_000

  // Phase finished (also catches the case where the app was closed meanwhile).
  useEffect(() => {
    if (!state.running || !state.endsAt || now < state.endsAt || handled.current === state.endsAt) return
    handled.current = state.endsAt
    ;(async () => {
      if (state.phase === 'focus') {
        if (hasMusic && music.pauseOnBreak) musicPause()
        await db.sessions.add({ subjectId: state.subjectId, date: todayISO(), minutes: state.focusMin, endedAt: state.endsAt! })
        await setSetting('timer', { ...state, phase: 'pause', running: false, endsAt: null, remainingMs: state.breakMin * 60_000, focusStartedAt: null })
      } else {
        await setSetting('timer', { ...state, phase: 'focus', running: false, endsAt: null, remainingMs: state.focusMin * 60_000 })
      }
      if (document.visibilityState === 'visible') chime()
    })()
  }, [now, state, hasMusic, music.pauseOnBreak])

  useEffect(() => {
    document.title = state.running ? `${fmt(remaining)} · ${state.phase === 'focus' ? 'Fokus' : 'Pause'}` : 'Kompass'
    return () => {
      document.title = 'Kompass'
    }
  }, [remaining, state.running, state.phase])

  const start = () => {
    // Started from the tap, so the browser lets the player begin.
    if (hasMusic && music.autoplay && (state.phase === 'focus' || !music.pauseOnBreak)) musicPlay()
    return startTimer()
  }
  const startTimer = () => set({ running: true, endsAt: Date.now() + remaining, focusStartedAt: state.phase === 'focus' ? state.focusStartedAt ?? Date.now() : null })
  const pause = () => {
    if (hasMusic && music.autoplay) musicPause()
    return set({ running: false, endsAt: null, remainingMs: remaining })
  }
  const reset = () => set({ running: false, endsAt: null, remainingMs: total, focusStartedAt: null })
  /** Stop a focus block early and keep the minutes already done. */
  const stopEarly = async () => {
    if (hasMusic && music.pauseOnBreak) musicPause()
    const doneMin = Math.round((total - remaining) / 60_000)
    if (state.phase === 'focus' && doneMin >= 1) {
      await db.sessions.add({ subjectId: state.subjectId, date: todayISO(), minutes: doneMin, endedAt: Date.now() })
    }
    await setSetting('timer', { ...state, phase: 'pause', running: false, endsAt: null, remainingMs: state.breakMin * 60_000, focusStartedAt: null })
  }
  const skip = () => set({ phase: 'focus', running: false, endsAt: null, remainingMs: state.focusMin * 60_000 })
  const setLength = (focusMin: number, breakMin: number) =>
    set({ focusMin, breakMin, ...(state.running ? {} : { remainingMs: (state.phase === 'focus' ? focusMin : breakMin) * 60_000 }) })

  // Stats
  const todayMin = sessions.filter((s) => s.date === today).reduce((a, s) => a + s.minutes, 0)
  const monday = mondayOf(today)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i)
    return { d, min: sessions.filter((s) => s.date === d).reduce((a, s) => a + s.minutes, 0) }
  })
  const weekMin = week.reduce((a, w) => a + w.min, 0)
  const maxDay = Math.max(60, ...week.map((w) => w.min))
  const bySubject = new Map<number | null, number>()
  sessions.forEach((s) => bySubject.set(s.subjectId ?? null, (bySubject.get(s.subjectId ?? null) ?? 0) + s.minutes))
  const subjectRows = [...bySubject.entries()].sort((a, b) => b[1] - a[1])
  const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`)

  // Under a second in counts as not started (a quick tap on Start/Pause).
  const started = remaining < total - 1000
  const progress = started || state.running ? 1 - Math.max(0, remaining) / total : 0
  const R = 120
  const C = 2 * Math.PI * R
  const focus = state.phase === 'focus'

  return (
    <div>
      <PageHeader title="Lerntimer" subtitle={`Heute ${hm(todayMin)} gelernt`} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel className="relative flex flex-col items-center overflow-hidden px-4 py-6">
          <TimerBackdrop />
          <div className="relative flex w-full flex-col items-center">
          <Segmented
            value={`${state.focusMin}/${state.breakMin}`}
            onChange={(v) => { const [f, b] = v.split('/').map(Number); setLength(f, b) }}
            options={[{ value: '25/5', label: '25 / 5' }, { value: '45/10', label: '45 / 10' }, { value: '50/10', label: '50 / 10' }]}
          />
          <div className="relative my-6 size-64 sm:size-72">
            <svg viewBox="0 0 280 280" className="size-full -rotate-90" aria-hidden>
              <circle cx="140" cy="140" r={R} fill="none" stroke="var(--line)" strokeWidth="10" />
              <circle cx="140" cy="140" r={R} fill="none" stroke={focus ? 'var(--ink)' : 'var(--brass)'} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center" aria-live="off">
              <span className={cx('text-sm font-semibold', focus ? 'text-ink-2' : 'text-brass')}>{focus ? 'Fokus' : 'Pause'}</span>
              <span className="display text-6xl tabular sm:text-7xl" role="timer">{fmt(remaining)}</span>
              {state.subjectId && <SubjectTag subject={byId.get(state.subjectId)} className="mt-2" />}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {state.running ? (
              <Button variant="primary" className="min-w-36" onClick={pause}><Pause size={18} /> Pause</Button>
            ) : (
              <Button variant="primary" className="min-w-36" onClick={start}><Play size={18} /> {started ? 'Weiter' : 'Start'}</Button>
            )}
            {focus && started && <Button onClick={stopEarly}><Square size={16} /> Beenden</Button>}
            {!focus && <Button onClick={skip}><SkipForward size={18} /> Pause überspringen</Button>}
            {!state.running && started && <Button variant="ghost" onClick={reset} aria-label="Zurücksetzen"><RotateCcw size={18} /></Button>}
          </div>
          <div className="mt-6 w-full max-w-sm">
            <Field label="Wofür lernst du?">
              <SubjectSelect subjects={subjects} value={state.subjectId} onChange={(v) => set({ subjectId: v })} allowNone />
            </Field>
          </div>
          <p className="mt-4 max-w-sm text-center text-sm text-ink-3">Der Timer läuft weiter, auch wenn du die App schließt. Ton kommt nur, wenn Kompass offen ist.</p>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel title="Musik">
            <MusicPanel />
          </Panel>
          <Panel title={<>Diese Woche <span className="font-normal text-ink-3">· {hm(weekMin)}</span></>}>
            <div className="flex h-44 items-end gap-2 px-4 pt-2 pb-3">
              {week.map((w, i) => (
                <div key={w.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-xs text-ink-3 tabular">{w.min ? w.min : ''}</span>
                  <div className={cx('w-full rounded-t-md', w.d === today ? 'bg-brass' : 'bg-ink/70')} style={{ height: `${(w.min / maxDay) * 100}%`, minHeight: w.min ? 4 : 0 }} />
                  <span className={cx('text-xs font-semibold', w.d === today ? 'text-brass' : 'text-ink-3')}>{DAY_SHORT[i]}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Letzte 30 Tage nach Fach">
            {subjectRows.length ? (
              <ul className="space-y-2 px-4 pb-4">
                {subjectRows.map(([sid, min]) => {
                  const s = sid != null ? byId.get(sid) : undefined
                  return (
                    <li key={sid ?? 'none'} className="flex items-center gap-3">
                      <span className="w-14 shrink-0">{s ? <SubjectTag subject={s} /> : <span className="text-sm text-ink-3">ohne</span>}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
                        <div className="h-full rounded-full" style={{ width: `${(min / subjectRows[0][1]) * 100}%`, background: s?.color ?? 'var(--ink-3)' }} />
                      </div>
                      <span className="w-20 shrink-0 text-right text-sm text-ink-2 tabular">{hm(min)}</span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-ink-3">Noch keine Lernzeit. Starte den Timer.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
