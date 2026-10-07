import { db } from '../db'
import { todayISO } from './date'
import { blobToDataUrl, dataUrlToBlob } from './images'

const TABLES = ['subjects', 'periods', 'lessons', 'tasks', 'grades', 'exams', 'settings', 'notes', 'sessions', 'plans', 'chat', 'usage', 'images', 'shifts', 'files', 'lessonLogs'] as const

/** Never leaves the device: not exported, and kept when a backup is restored. */
const PRIVATE_SETTINGS = ['apiKey', 'elevenKey']

export async function exportData() {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) data[t] = await db.table(t).toArray()
  data.settings = (data.settings as { key: string }[]).filter((r) => !PRIVATE_SETTINGS.includes(r.key))
  // Pictures travel as data URLs inside the JSON.
  data.images = await Promise.all((data.images as { blob: Blob }[]).map(async (img) => ({ ...img, blob: await blobToDataUrl(img.blob) })))
  data.files = await Promise.all((data.files as { blob?: Blob | null }[]).map(async (f) => ({ ...f, blob: f.blob ? await blobToDataUrl(f.blob) : null })))
  const payload = { app: 'kompass', version: 1, exportedAt: new Date().toISOString(), data }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const fileName = `kompass-backup-${todayISO()}.json`
  const file = new File([blob], fileName, { type: 'application/json' })

  // On iPad the share sheet lets you save straight to Dateien/iCloud.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Kompass-Sicherung' })
      await db.settings.put({ key: 'lastExport', value: Date.now() })
      return
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  await db.settings.put({ key: 'lastExport', value: Date.now() })
}

/** Replaces everything in the app with the backup. Throws a readable message if the file is not a Kompass backup. */
export async function importData(file: File) {
  let parsed: { app?: string; data?: Record<string, unknown[]> }
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error('Die Datei ist keine gültige JSON-Datei.')
  }
  if (parsed.app !== 'kompass' || !parsed.data) throw new Error('Das ist keine Kompass-Sicherung.')
  const data = parsed.data
  if (Array.isArray(data.images)) {
    data.images = await Promise.all(
      (data.images as { blob: unknown }[]).map(async (img) => ({ ...img, blob: typeof img.blob === 'string' ? await dataUrlToBlob(img.blob) : img.blob })),
    )
  }
  if (Array.isArray(data.files)) {
    data.files = await Promise.all(
      (data.files as { blob: unknown }[]).map(async (f) => ({ ...f, blob: typeof f.blob === 'string' ? await dataUrlToBlob(f.blob) : null })),
    )
  }
  const keep = await db.settings.bulkGet(PRIVATE_SETTINGS)
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      let rows = data[t]
      if (t === 'settings' && Array.isArray(rows)) rows = (rows as { key: string }[]).filter((r) => !PRIVATE_SETTINGS.includes(r.key))
      if (Array.isArray(rows) && rows.length) await db.table(t).bulkAdd(rows)
    }
    for (const row of keep) if (row) await db.settings.put(row)
  })
}
