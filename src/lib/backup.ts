import { db } from '../db'
import { todayISO } from './date'

const TABLES = ['subjects', 'periods', 'lessons', 'tasks', 'grades', 'exams', 'settings'] as const

export async function exportData() {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) data[t] = await db.table(t).toArray()
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
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      const rows = data[t]
      if (Array.isArray(rows) && rows.length) await db.table(t).bulkAdd(rows)
    }
  })
}
