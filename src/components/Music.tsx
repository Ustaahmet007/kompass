/**
 * SoundCloud player for the Lerntimer.
 * The iframe lives once at app level (so music keeps playing when you switch pages) and is laid
 * over a placeholder on the Lerntimer page. Elsewhere a small bar shows what's playing.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Music2, Pause, Play, Plus, X } from 'lucide-react'
import { setSetting } from '../db'
import { useSetting } from '../lib/hooks'
import { Button, Input, cx } from './ui'

export interface MusicSettings {
  lists: { name: string; url: string }[]
  current: string | null
  autoplay: boolean // start with a focus block
  pauseOnBreak: boolean
}
export const DEFAULT_MUSIC: MusicSettings = { lists: [], current: null, autoplay: true, pauseOnBreak: true }

// ---- SoundCloud Widget API ----------------------------------------------------------------
interface SCWidget {
  play(): void
  pause(): void
  toggle(): void
  bind(ev: string, cb: (e?: unknown) => void): void
  getCurrentSound(cb: (s: { title?: string; user?: { username?: string } } | null) => void): void
}
declare global {
  interface Window {
    SC?: { Widget: ((el: HTMLIFrameElement) => SCWidget) & { Events: Record<string, string> } }
  }
}
let apiPromise: Promise<void> | null = null
function loadApi() {
  if (window.SC) return Promise.resolve()
  apiPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://w.soundcloud.com/player/api.js'
    s.onload = () => resolve()
    s.onerror = () => {
      apiPromise = null
      reject(new Error('SoundCloud ist nicht erreichbar.'))
    }
    document.head.appendChild(s)
  })
  return apiPromise
}

// ---- tiny store ---------------------------------------------------------------------------
type PlayerState = { ready: boolean; playing: boolean; title: string }
let ps: PlayerState = { ready: false, playing: false, title: '' }
let widget: SCWidget | null = null
let wantPlay = false
const subs = new Set<() => void>()
const emit = (patch: Partial<PlayerState>) => {
  ps = { ...ps, ...patch }
  subs.forEach((f) => f())
}
const usePlayer = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => ps)

export function musicPlay() {
  if (widget && ps.ready) widget.play()
  else wantPlay = true
}
export function musicPause() {
  wantPlay = false
  widget?.pause()
}

// Placeholder on the Lerntimer page the iframe is laid over.
let anchor: HTMLElement | null = null
const anchorSubs = new Set<() => void>()
function setAnchor(el: HTMLElement | null) {
  anchor = el
  anchorSubs.forEach((f) => f())
}

export function embedUrl(url: string) {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--brass').trim().replace('#', '') || 'b07a3c'
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23${color}&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false`
}

export const isSoundCloudUrl = (u: string) => /^https?:\/\/(www\.|m\.|on\.)?soundcloud\.com\/\S+/i.test(u.trim())

/** Mounted once in the app shell. */
export function MusicHost() {
  const music = useSetting<MusicSettings>('music', DEFAULT_MUSIC)
  const frame = useRef<HTMLIFrameElement>(null)
  const loc = useLocation()
  const nav = useNavigate()
  const player = usePlayer()
  const [rect, setRect] = useState<DOMRect | null>(null)
  const src = music.current ? embedUrl(music.current) : null

  // Hook up the widget API whenever the playlist changes.
  useEffect(() => {
    widget = null
    emit({ ready: false, playing: false, title: '' })
    if (!src || !frame.current) return
    let cancelled = false
    loadApi()
      .then(() => {
        if (cancelled || !frame.current || !window.SC) return
        const w = window.SC.Widget(frame.current)
        const E = window.SC.Widget.Events
        w.bind(E.READY, () => {
          widget = w
          emit({ ready: true })
          if (wantPlay) {
            wantPlay = false
            w.play()
          }
        })
        w.bind(E.PLAY, () => {
          emit({ playing: true })
          w.getCurrentSound((s) => emit({ title: s?.title ?? '' }))
        })
        w.bind(E.PAUSE, () => emit({ playing: false }))
        w.bind(E.FINISH, () => emit({ playing: false }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [src])

  // Follow the placeholder on the Lerntimer page.
  useEffect(() => {
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setRect(anchor && anchor.isConnected ? anchor.getBoundingClientRect() : null))
    }
    measure()
    anchorSubs.add(measure)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    const iv = window.setInterval(measure, 500)
    return () => {
      anchorSubs.delete(measure)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
      window.clearInterval(iv)
      cancelAnimationFrame(raf)
    }
  }, [])

  if (!src) return null
  const onTimer = loc.pathname.startsWith('/lerntimer') && rect
  return (
    <>
      <iframe
        ref={frame}
        key={src}
        title="SoundCloud-Player"
        src={src}
        allow="autoplay; encrypted-media"
        className="rounded-xl border-0"
        style={
          onTimer
            ? { position: 'fixed', top: rect.top, left: rect.left, width: rect.width, height: rect.height, zIndex: 30 }
            : { position: 'fixed', left: -2000, top: 0, width: 320, height: 166, opacity: 0, pointerEvents: 'none' }
        }
      />
      {!onTimer && player.playing && (
        <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-16 z-40 flex justify-center px-4 lg:bottom-4 lg:left-60">
          <div className="pointer-events-auto flex max-w-md items-center gap-2 rounded-full border border-line bg-surface/95 py-1 pr-1 pl-4 shadow-lg backdrop-blur">
            <Music2 size={16} className="shrink-0 text-brass" />
            <button type="button" onClick={() => nav('/lerntimer')} className="min-w-0 truncate text-sm font-medium">{player.title || 'Musik läuft'}</button>
            <button type="button" onClick={musicPause} aria-label="Musik pausieren" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper"><Pause size={16} /></button>
          </div>
        </div>
      )}
    </>
  )
}

/** Player area + playlist picker on the Lerntimer page. */
export function MusicPanel() {
  const music = useSetting<MusicSettings>('music', DEFAULT_MUSIC)
  const player = usePlayer()
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const save = (patch: Partial<MusicSettings>) => setSetting('music', { ...music, ...patch })
  const valid = isSoundCloudUrl(url)

  const add = () => {
    if (!valid) return
    const clean = url.trim().split('?')[0]
    const label = name.trim() || decodeURIComponent(clean.replace(/\/$/, '').split('/').pop() ?? 'Playlist').replace(/-/g, ' ')
    save({ lists: [...music.lists.filter((l) => l.url !== clean), { name: label, url: clean }], current: clean })
    setUrl('')
    setName('')
    setAdding(false)
  }
  const remove = (u: string) => {
    const lists = music.lists.filter((l) => l.url !== u)
    save({ lists, current: music.current === u ? (lists[0]?.url ?? null) : music.current })
  }

  return (
    <div className="space-y-3 px-4 pb-4">
      {music.lists.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {music.lists.map((l) => (
            <span key={l.url} className={cx('flex min-h-11 items-center rounded-full border pl-4', music.current === l.url ? 'border-brass bg-brass-soft text-brass' : 'border-line text-ink-2')}>
              <button type="button" onClick={() => save({ current: l.url })} className="max-w-48 truncate font-semibold capitalize">{l.name}</button>
              <button type="button" onClick={() => remove(l.url)} aria-label={`${l.name} entfernen`} className="flex size-10 items-center justify-center"><X size={15} /></button>
            </span>
          ))}
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className="flex min-h-11 items-center gap-1 rounded-full border border-dashed border-line px-4 text-ink-2"><Plus size={16} /> Playlist</button>
          )}
        </div>
      )}

      {(adding || !music.lists.length) && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-sm text-ink-2">In der SoundCloud-App bei einer Playlist, einem Track oder deinen Likes auf <b>Teilen → Link kopieren</b> und hier einfügen.</p>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://soundcloud.com/…" inputMode="url" aria-label="SoundCloud-Link" />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional), z. B. Lo-Fi" aria-label="Name" />
          {url && !valid && <p className="text-sm text-danger">Das sieht nicht nach einem SoundCloud-Link aus.</p>}
          <div className="flex justify-end gap-2">
            {music.lists.length > 0 && <Button variant="ghost" onClick={() => setAdding(false)}>Abbrechen</Button>}
            <Button variant="primary" onClick={add} disabled={!valid}>Hinzufügen</Button>
          </div>
        </div>
      )}

      {music.current && (
        <>
          <PlayerSlot />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => (player.playing ? musicPause() : musicPlay())} disabled={!player.ready}>
              {player.playing ? <><Pause size={16} /> Musik pausieren</> : <><Play size={16} /> Musik abspielen</>}
            </Button>
          </div>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-5 accent-[var(--brass)]" checked={music.autoplay} onChange={(e) => save({ autoplay: e.target.checked })} />
            <span>Musik startet mit dem Fokus</span>
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-5 accent-[var(--brass)]" checked={music.pauseOnBreak} onChange={(e) => save({ pauseOnBreak: e.target.checked })} />
            <span>In der Pause stoppen</span>
          </label>
        </>
      )}
    </div>
  )
}

function PlayerSlot() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setAnchor(ref.current)
    return () => setAnchor(null)
  }, [])
  return <div ref={ref} className="h-[166px] w-full rounded-xl bg-sunken" aria-hidden />
}
