/**
 * Cloud sync between devices (iPad, PC, Mac) through Supabase.
 *
 * Model: the local Dexie database stays the source the UI reads from (works offline).
 * Every local write is recorded as "dirty" and pushed as a row into one Postgres table
 * `records` (user_id, tbl, id, data, deleted, updated_at). Other devices pull rows changed
 * since their last pull, and get pushes live through Supabase Realtime.
 * Conflicts: last write wins per record; a record with unsent local changes is not overwritten.
 */
import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { Table } from 'dexie'
import { db } from '../db'
import { blobToDataUrl, dataUrlToBlob } from './images'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const syncConfigured = !!(URL_ && ANON)

export const supabase: SupabaseClient | null = syncConfigured ? createClient(URL_!, ANON!, { auth: { persistSession: true, autoRefreshToken: true } }) : null

/** Tables that travel between devices. */
export const SYNCED = ['subjects', 'periods', 'lessons', 'tasks', 'grades', 'exams', 'settings', 'notes', 'sessions', 'plans', 'chat', 'usage', 'images'] as const
type SyncedTable = (typeof SYNCED)[number]
/** Device-specific settings that stay on each device. */
const LOCAL_SETTINGS = new Set(['apiKey', 'voice', 'timer', 'lastExport', 'seeded', 'elevenKey', 'elevenVoice', 'elevenModel', 'voiceEngine'])
const STRING_KEYS = new Set<SyncedTable>(['settings', 'usage'])

// ---- unique ids -------------------------------------------------------------------------
/** Ids that don't collide between devices (fits in a JS safe integer). */
let lastId = 0
export function newId() {
  // Time-based with a random tail; strictly increasing on this device so bulk inserts never collide.
  const id = Math.max(Date.now() * 1000 + Math.floor(Math.random() * 1000), lastId + 1)
  lastId = id
  return id
}

// ---- dirty tracking ---------------------------------------------------------------------
type DirtyMap = Record<string, { op: 'put' | 'del'; seq: number }>
const DIRTY_KEY = 'kompass-sync-dirty'
const CURSOR_KEY = 'kompass-sync-cursor'
let dirty: DirtyMap = (() => {
  try {
    return JSON.parse(localStorage.getItem(DIRTY_KEY) || '{}')
  } catch {
    return {}
  }
})()
let seq = Date.now()
const saveDirty = () => {
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify(dirty))
  } catch {
    /* storage full / private mode */
  }
}
const k = (tbl: string, id: unknown) => `${tbl}\u0001${id}`

function mark(tbl: SyncedTable, id: unknown, op: 'put' | 'del') {
  if (tbl === 'settings' && LOCAL_SETTINGS.has(String(id))) return
  dirty[k(tbl, id)] = { op, seq: ++seq }
  saveDirty()
  scheduleSync()
}

export function pendingCount() {
  return Object.keys(dirty).length
}

/** Install Dexie hooks once: give new rows unique ids and record every change. */
let hooked = false
export function installSyncHooks() {
  if (hooked) return
  hooked = true
  for (const name of SYNCED) {
    const table = db.table(name) as Table
    const autoInc = !STRING_KEYS.has(name)
    table.hook('creating', function (primKey, _obj, tx) {
      const remote = (tx as unknown as { __remote?: boolean }).__remote
      let key = primKey
      if (autoInc && (primKey === undefined || primKey === null)) key = newId()
      if (!remote) this.onsuccess = (k2) => mark(name, k2 ?? key, 'put')
      return autoInc && (primKey === undefined || primKey === null) ? key : undefined
    })
    table.hook('updating', function (_mods, primKey, _obj, tx) {
      if ((tx as unknown as { __remote?: boolean }).__remote) return
      this.onsuccess = () => mark(name, primKey, 'put')
    })
    table.hook('deleting', function (primKey, _obj, tx) {
      if ((tx as unknown as { __remote?: boolean }).__remote) return
      this.onsuccess = () => mark(name, primKey, 'del')
    })
  }
}

// ---- status -------------------------------------------------------------------------------
export type SyncState = { status: 'off' | 'idle' | 'syncing' | 'offline' | 'error'; lastSync: number | null; error?: string; email?: string | null }
let state: SyncState = { status: 'off', lastSync: Number(localStorage.getItem('kompass-sync-last')) || null }
const listeners = new Set<(s: SyncState) => void>()
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l(state))
}
export function getSyncState() {
  return state
}
export function onSyncState(l: (s: SyncState) => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

// ---- serialisation ------------------------------------------------------------------------
async function toRemote(tbl: SyncedTable, row: Record<string, unknown>) {
  if (tbl === 'images' && row.blob instanceof Blob) return { ...row, blob: await blobToDataUrl(row.blob) }
  return row
}
async function fromRemote(tbl: SyncedTable, data: Record<string, unknown>) {
  if (tbl === 'images' && typeof data.blob === 'string') return { ...data, blob: await dataUrlToBlob(data.blob) }
  return data
}
const parseId = (tbl: SyncedTable, id: string) => (STRING_KEYS.has(tbl) ? id : Number(id))

// ---- push / pull --------------------------------------------------------------------------
async function push(userId: string) {
  const entries = Object.entries(dirty)
  if (!entries.length) return
  // Small batches: pictures can be a few hundred KB each.
  for (let i = 0; i < entries.length; i += 25) {
    const batch = entries.slice(i, i + 25)
    const rows = []
    for (const [key, { op }] of batch) {
      const [tbl, id] = key.split('\u0001') as [SyncedTable, string]
      if (!SYNCED.includes(tbl)) continue
      const local = op === 'put' ? await db.table(tbl).get(parseId(tbl, id)) : undefined
      rows.push(local ? { user_id: userId, tbl, id, data: await toRemote(tbl, local), deleted: false } : { user_id: userId, tbl, id, data: null, deleted: true })
    }
    const { error } = await supabase!.from('records').upsert(rows, { onConflict: 'user_id,tbl,id' })
    if (error) throw new Error(error.message)
    // Only clear entries that didn't change again while we were sending.
    for (const [key, v] of batch) if (dirty[key]?.seq === v.seq) delete dirty[key]
    saveDirty()
  }
}

type RemoteRow = { tbl: SyncedTable; id: string; data: Record<string, unknown> | null; deleted: boolean; updated_at: string }

async function applyRemote(rows: RemoteRow[]) {
  const usable = rows.filter((r) => SYNCED.includes(r.tbl) && !dirty[k(r.tbl, r.id)] && !(r.tbl === 'settings' && LOCAL_SETTINGS.has(r.id)))
  if (!usable.length) return
  const prepared = await Promise.all(usable.map(async (r) => ({ r, data: r.data && !r.deleted ? await fromRemote(r.tbl, r.data) : null })))
  await db.transaction('rw', SYNCED.map((t) => db.table(t)), async (tx) => {
    ;(tx as unknown as { __remote: boolean }).__remote = true
    for (const { r, data } of prepared) {
      const table = db.table(r.tbl)
      if (r.deleted || !data) await table.delete(parseId(r.tbl, r.id))
      else await table.put(data)
    }
  })
}

async function pull() {
  let cursor = localStorage.getItem(CURSOR_KEY) || '1970-01-01T00:00:00Z'
  // Small overlap so rows committed slightly out of order are not missed (applying is idempotent).
  let from = new Date(new Date(cursor).getTime() - 5000).toISOString()
  for (;;) {
    const { data, error } = await supabase!.from('records').select('tbl,id,data,deleted,updated_at').gt('updated_at', from).order('updated_at').limit(500)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as RemoteRow[]
    if (!rows.length) break
    await applyRemote(rows)
    const last = rows[rows.length - 1].updated_at
    if (last > cursor) {
      cursor = last
      localStorage.setItem(CURSOR_KEY, cursor)
    }
    if (rows.length < 500) break
    from = last
  }
}

let running = false
let again = false
export async function syncNow() {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) return setState({ status: 'off', email: null })
  if (!navigator.onLine) return setState({ status: 'offline' })
  if (running) {
    again = true
    return
  }
  running = true
  setState({ status: 'syncing', email: session.user.email })
  try {
    await push(session.user.id)
    await pull()
    const now = Date.now()
    localStorage.setItem('kompass-sync-last', String(now))
    setState({ status: 'idle', lastSync: now, error: undefined })
  } catch (e) {
    setState({ status: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e) })
  } finally {
    running = false
    if (again) {
      again = false
      scheduleSync(300)
    }
  }
}

let timer: number | undefined
export function scheduleSync(ms = 1200) {
  if (!supabase || state.status === 'off') return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void syncNow(), ms)
}

// ---- live updates -------------------------------------------------------------------------
let channel: RealtimeChannel | null = null
function subscribe(userId: string) {
  channel?.unsubscribe()
  channel = supabase!
    .channel(`records-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` }, (payload) => {
      const row = payload.new as RemoteRow
      if (row?.tbl) {
        void applyRemote([row]).then(() => {
          const c = localStorage.getItem(CURSOR_KEY)
          if (!c || row.updated_at > c) localStorage.setItem(CURSOR_KEY, row.updated_at)
        })
      }
    })
    .subscribe()
}

// ---- account ------------------------------------------------------------------------------
function started(session: Session) {
  setState({ status: 'idle', email: session.user.email })
  subscribe(session.user.id)
  void syncNow()
}

/** Call once at startup. */
export async function startSync() {
  installSyncHooks()
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (data.session && localStorage.getItem('kompass-sync-ready') === '1') started(data.session)
  window.addEventListener('online', () => scheduleSync(200))
  window.addEventListener('offline', () => state.status !== 'off' && setState({ status: 'offline' }))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleSync(200))
  window.setInterval(() => scheduleSync(0), 60_000)
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}${location.pathname}` } })
  if (error) throw new Error(translateAuthError(error.message))
  return { needsConfirmation: !data.session }
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase!.auth.signInWithPassword({ email, password })
  if (error) throw new Error(translateAuthError(error.message))
}

/** How much is already in the cloud and on this device — for the first-sync choice. */
export async function firstSyncInfo() {
  const { count, error } = await supabase!.from('records').select('id', { count: 'exact', head: true }).eq('deleted', false)
  if (error) throw new Error(error.message)
  const local = (await Promise.all(['subjects', 'tasks', 'grades', 'notes'].map((t) => db.table(t).count()))).reduce((a, b) => a + b, 0)
  return { remote: count ?? 0, local }
}

/** First sync on this device. 'upload' = this device wins, 'download' = cloud wins. */
export async function completeFirstSync(mode: 'upload' | 'download') {
  const { data } = await supabase!.auth.getSession()
  const session = data.session
  if (!session) throw new Error('Nicht angemeldet.')
  localStorage.removeItem(CURSOR_KEY)
  if (mode === 'download') {
    dirty = {}
    saveDirty()
    const keep = await db.settings.bulkGet([...LOCAL_SETTINGS])
    await db.transaction('rw', SYNCED.map((t) => db.table(t)), async (tx) => {
      ;(tx as unknown as { __remote: boolean }).__remote = true
      for (const t of SYNCED) await db.table(t).clear()
      for (const row of keep) if (row) await db.settings.put(row)
    })
  } else {
    const { error } = await supabase!.from('records').delete().eq('user_id', session.user.id)
    if (error) throw new Error(error.message)
    dirty = {}
    for (const t of SYNCED) {
      const keys = await db.table(t).toCollection().primaryKeys()
      for (const key of keys) if (!(t === 'settings' && LOCAL_SETTINGS.has(String(key)))) dirty[k(t, key)] = { op: 'put', seq: ++seq }
    }
    saveDirty()
  }
  localStorage.setItem('kompass-sync-ready', '1')
  started(session)
  await syncNow()
}

export async function signOut() {
  channel?.unsubscribe()
  channel = null
  await supabase?.auth.signOut()
  localStorage.removeItem('kompass-sync-ready')
  localStorage.removeItem(CURSOR_KEY)
  setState({ status: 'off', email: null })
}

export async function currentSession() {
  if (!supabase) return null
  return (await supabase.auth.getSession()).data.session
}

function translateAuthError(msg: string) {
  if (/invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort stimmt nicht.'
  if (/email not confirmed/i.test(msg)) return 'Bitte bestätige zuerst deine E-Mail (Link im Postfach).'
  if (/already registered|already exists/i.test(msg)) return 'Für diese E-Mail gibt es schon ein Konto. Melde dich an.'
  if (/password should be at least/i.test(msg)) return 'Das Passwort muss mindestens 6 Zeichen haben.'
  if (/rate limit/i.test(msg)) return 'Zu viele Versuche. Warte kurz.'
  return msg
}

