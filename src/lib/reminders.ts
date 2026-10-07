/**
 * Push reminders. The app works out what to remind about for the next two weeks and stores it in
 * Supabase (`reminders`); a server job sends due ones as Web Push to every device that turned
 * reminders on (`push_subscriptions`). So they arrive even when Kompass is closed.
 */
import { liveQuery } from 'dexie'
import { db, getSetting, type Exam, type Shift, type Subject, type Task } from '../db'
import { addDays, todayISO } from './date'
import { supabase } from './sync'

export const VAPID_PUBLIC = 'BKyjP-SGK44OMyIuLuHJeDLW0K9SU1q7SkdmkOcEnLODmypRHkwikNoCD4frc4xNKKoEB25ueKkPwj3VqfsyuIE'

export interface ReminderSettings {
  enabled: boolean
  digestTime: string // HH:MM, evening overview of tomorrow
  examDays: number[] // extra heads-up this many days before a Schularbeit/Test
  shifts: boolean
}
export const DEFAULT_REMINDERS: ReminderSettings = { enabled: false, digestTime: '18:00', examDays: [3], shifts: true }

interface Reminder {
  key: string
  fire_at: string
  title: string
  body: string
  url: string
}

const at = (iso: string, hhmm: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  return new Date(y, m - 1, d, h, mi)
}
const EXAM_SHORT: Record<string, string> = { Schularbeit: 'SA', Test: 'Test', Prüfung: 'Prüfung', Abgabe: 'Abgabe' }

export function buildReminders(cfg: ReminderSettings, data: { tasks: Task[]; exams: Exam[]; shifts: Shift[]; subjects: Subject[] }, now = new Date()): Reminder[] {
  const out: Reminder[] = []
  const today = todayISO()
  const short = (id?: number | null) => data.subjects.find((s) => s.id === id)?.short
  const open = data.tasks.filter((t) => t.status !== 'erledigt')

  // Evening overview of tomorrow.
  for (let i = 0; i < 14; i++) {
    const day = addDays(today, i)
    const when = at(day, cfg.digestTime)
    if (when <= now) continue
    const tomorrow = addDays(day, 1)
    const lines: string[] = []
    for (const e of data.exams.filter((x) => x.date === tomorrow)) lines.push(`${EXAM_SHORT[e.kind] ?? e.kind} ${short(e.subjectId) ?? ''}${e.topic ? `: ${e.topic}` : ''}`.trim())
    for (const t of open.filter((x) => x.due === tomorrow)) lines.push(`${short(t.subjectId) ? `${short(t.subjectId)}: ` : ''}${t.title}`)
    if (cfg.shifts) for (const s of data.shifts.filter((x) => x.date === tomorrow)) lines.push(`${s.label} ${s.start}–${s.end}`)
    if (!lines.length) continue
    const late = open.filter((t) => t.due && t.due < day).length
    out.push({
      key: `digest:${tomorrow}`,
      fire_at: when.toISOString(),
      title: 'Morgen',
      body: lines.join('\n') + (late ? `\n+ ${late} überfällig` : ''),
      url: '#/',
    })
  }

  // Heads-up some days before tests.
  for (const e of data.exams) {
    for (const n of cfg.examDays.filter((x) => x >= 2)) {
      const when = at(addDays(e.date, -n), cfg.digestTime)
      if (when <= now || when.getTime() - now.getTime() > 15 * 86400_000) continue
      out.push({
        key: `exam:${e.id}:${e.date}:${n}`,
        fire_at: when.toISOString(),
        title: `${e.kind} ${short(e.subjectId) ?? ''} in ${n} Tagen`.replace('  ', ' '),
        body: e.topic ? `Stoff: ${e.topic}` : 'Zeit, mit dem Lernen anzufangen.',
        url: '#/pruefungen',
      })
    }
  }

  // Reminders set on single tasks.
  for (const t of open) {
    if (!t.remindAt) continue
    const when = new Date(t.remindAt)
    if (isNaN(when.getTime()) || when <= now) continue
    out.push({ key: `task:${t.id}:${t.remindAt}`, fire_at: when.toISOString(), title: t.title, body: [short(t.subjectId), t.due ? `fällig ${t.due.split('-').reverse().slice(0, 2).join('.')}.` : ''].filter(Boolean).join(' · '), url: '#/aufgaben' })
  }
  return out
}

let lastHash = ''
/** Replaces the not-yet-sent reminders in the cloud with the current ones. */
export async function uploadReminders(force = false) {
  if (!supabase) return
  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session) return
  const cfg = { ...DEFAULT_REMINDERS, ...(await getSetting<Partial<ReminderSettings>>('reminders', {})) }
  const list = cfg.enabled
    ? buildReminders(cfg, {
        tasks: await db.tasks.toArray(),
        exams: await db.exams.where('date').aboveOrEqual(todayISO()).toArray(),
        shifts: await db.shifts.where('date').aboveOrEqual(todayISO()).toArray(),
        subjects: await db.subjects.toArray(),
      })
    : []
  const hash = JSON.stringify(list)
  if (!force && hash === lastHash) return
  const { error: delErr } = await supabase.from('reminders').delete().is('sent_at', null).not('key', 'like', 'test:%').neq('key', 'timer')
  if (delErr) throw new Error(delErr.message)
  if (list.length) {
    const { error } = await supabase.from('reminders').upsert(list, { onConflict: 'user_id,key', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
  lastHash = hash
}

let timer: number | undefined
function schedule(ms = 4000) {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void uploadReminders().catch(() => {}), ms)
}

/** Call once at startup: keeps the cloud reminders in step with the local data. */
export function startReminders() {
  if (!supabase) return
  liveQuery(() => Promise.all([db.tasks.toArray(), db.exams.toArray(), db.shifts.toArray(), db.settings.get('reminders'), db.subjects.toArray()])).subscribe({ next: () => schedule() })
  // Time moves on: refresh the 14-day window now and then.
  window.setInterval(() => schedule(0), 3 * 3600_000)
  supabase.auth.onAuthStateChange((ev) => ev === 'SIGNED_IN' && schedule(1000))
}

// ---- this device ---------------------------------------------------------------------------
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
/** iPhone/iPad only allow web push for apps added to the home screen. */
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function deviceSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Asks for permission (must run from a tap) and registers this device. */
export async function enablePushOnDevice() {
  if (!supabase) throw new Error('Synchronisierung ist nicht eingerichtet.')
  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session) throw new Error('Melde dich zuerst oben bei „Synchronisierung" an.')
  if (!pushSupported()) throw new Error(isIOS() ? 'Auf dem iPad geht das nur, wenn Kompass über „Zum Home-Bildschirm" installiert ist und du es von dort öffnest.' : 'Dieser Browser kann keine Push-Mitteilungen.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Mitteilungen sind blockiert. Erlaube sie in den Einstellungen für Kompass.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }))
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const device = isIOS() ? 'iPad/iPhone' : /Mac/.test(navigator.userAgent) ? 'Mac' : /Windows/.test(navigator.userAgent) ? 'Windows' : 'Gerät'
  const { error } = await supabase.from('push_subscriptions').upsert({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device }, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}

export async function disablePushOnDevice() {
  const sub = await deviceSubscription()
  if (!sub) return
  await supabase?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Local test right away, plus one through the server (arrives within ~5 minutes). */
export async function testReminder() {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('Kompass', { body: 'So sehen Erinnerungen aus.', icon: `${import.meta.env.BASE_URL}icon-192.png`, tag: 'kompass-test' })
  await supabase!.from('reminders').upsert({ key: `test:${Date.now()}`, fire_at: new Date().toISOString(), title: 'Kompass-Test', body: 'Erinnerungen kommen an, auch wenn die App zu ist.', url: '#/' })
}

// ---- Lerntimer ------------------------------------------------------------------------------
const TIMER_KEY = 'kompass-timer-push'
/** Push when the running focus block or break ends, so Kompass doesn't have to stay open. */
export async function syncTimerPush(t: { running: boolean; endsAt: number | null; phase: 'focus' | 'pause'; breakMin: number; focusMin: number }) {
  if (!supabase) return
  const want = t.running && t.endsAt && t.endsAt > Date.now() ? `${t.phase}:${t.endsAt}` : ''
  const had = localStorage.getItem(TIMER_KEY) ?? ''
  if (want === had) return
  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session) return
  try {
    if (want) {
      const focus = t.phase === 'focus'
      await supabase.from('reminders').upsert(
        {
          key: 'timer',
          fire_at: new Date(t.endsAt!).toISOString(),
          title: focus ? 'Fokus vorbei 🎉' : 'Pause vorbei',
          body: focus ? `Gut gemacht. Jetzt ${t.breakMin} min Pause.` : `Weiter geht's: ${t.focusMin} min Fokus. Öffne Kompass zum Starten.`,
          url: '#/lerntimer',
          sent_at: null,
        },
        { onConflict: 'user_id,key' },
      )
    } else {
      await supabase.from('reminders').delete().eq('key', 'timer').is('sent_at', null)
    }
    localStorage.setItem(TIMER_KEY, want)
  } catch {
    /* offline: try again on the next change */
  }
}
