import { db, DEFAULT_CATEGORIES, getSetting, setSetting, type Category, type Period, type Subject } from '../db'
import { addDays, mondayOf, todayISO, weekdayIndex } from './date'

/** Stundenraster HTL Rankweil (from WebUntis, 3AHEL). Edit under Einstellungen. */
export const DEFAULT_PERIODS: Omit<Period, 'id'>[] = [
  { nr: 1, start: '08:05', end: '08:55' },
  { nr: 2, start: '09:00', end: '09:50' },
  { nr: 3, start: '10:00', end: '10:50' },
  { nr: 4, start: '10:55', end: '11:45' },
  { nr: 5, start: '11:45', end: '12:35' },
  { nr: 6, start: '12:35', end: '13:25' },
  { nr: 7, start: '13:25', end: '14:15' },
  { nr: 8, start: '14:20', end: '15:10' },
  { nr: 9, start: '15:20', end: '16:10' },
  { nr: 10, start: '16:15', end: '17:05' },
  { nr: 11, start: '17:10', end: '18:00' },
]

const cats = (list?: [string, number][]): Category[] =>
  list ? list.map(([name, weight]) => ({ name, weight })) : DEFAULT_CATEGORIES.map((c) => ({ ...c }))

/** 3AHEL subjects, short codes as WebUntis shows them. */
const SUBJECTS: Omit<Subject, 'id'>[] = [
  { short: 'D', name: 'Deutsch', teacher: 'FI', room: 'R115', color: '#c2410c', categories: cats() },
  { short: 'E', name: 'Englisch', teacher: 'MAJ', color: '#7c3aed', categories: cats() },
  { short: 'AM', name: 'Angewandte Mathematik', teacher: 'PRI', room: 'R115', color: '#2563eb', categories: cats() },
  { short: 'DIC1', name: 'DIC – Mikrocontroller', teacher: 'PAT', room: 'R115', color: '#0d9488', categories: cats() },
  { short: 'MTRS', name: 'MTRS', teacher: 'STU', room: 'R115', color: '#be185d', categories: cats() },
  { short: 'HWE', name: 'Hardwareentwicklung', teacher: 'SOT', room: 'R115', color: '#ca8a04', categories: cats() },
  { short: 'HWL', name: 'HW-Labor', teacher: 'LAP', room: 'C208', color: '#a16207', categories: cats([['Protokoll', 60], ['Mitarbeit', 40]]) },
  { short: 'FSST', name: 'Fachspezifische Softwaretechnik', teacher: 'LAP', room: 'C208', color: '#4f46e5', categories: cats() },
  { short: 'KSN', name: 'KSN', teacher: 'FAH', room: 'R115', color: '#0284c7', categories: cats() },
  { short: 'NW2p', name: 'Physik', teacher: 'SCE', room: 'Ph108', color: '#0891b2', categories: cats([['Test', 70], ['Mitarbeit', 30]]) },
  { short: 'LA', name: 'Laboratorium', teacher: 'PAT', room: 'WL32', color: '#0f766e', categories: cats([['Protokoll', 60], ['Mitarbeit', 40]]) },
  { short: 'PBE', name: 'Werkstätte (PBE)', teacher: 'KRF', room: 'WE13', color: '#57534e', categories: cats([['Werkstück', 70], ['Mitarbeit', 30]]) },
  { short: 'GGPg', name: 'Geografie', teacher: 'MAM', room: 'R115', color: '#65a30d', categories: cats([['Test', 60], ['Mitarbeit', 40]]) },
  { short: 'GGPh', name: 'Geschichte', teacher: 'RJ', room: 'R115', color: '#4d7c0f', categories: cats([['Test', 60], ['Mitarbeit', 40]]) },
  { short: 'BSPK', name: 'Bewegung & Sport', teacher: 'ROE', room: 'BewR1', color: '#dc2626', categories: cats([['Mitarbeit', 100]]) },
  { short: 'RISL', name: 'Religion', teacher: 'BL', color: '#9333ea', categories: cats([['Mitarbeit', 100]]) },
  { short: 'ETH', name: 'Ethik', teacher: 'HUO', room: 'R116', color: '#db2777', categories: cats([['Mitarbeit', 100]]) },
]

// [day (0 = Mo), first Stunde, length, subject short]
const TIMETABLE: [number, number, number, string][] = [
  [0, 1, 1, 'HWE'], [0, 2, 1, 'E'], [0, 3, 2, 'AM'], [0, 5, 2, 'BSPK'],
  [1, 1, 1, 'RISL'], [1, 2, 1, 'KSN'], [1, 3, 3, 'PBE'], [1, 7, 1, 'PBE'], [1, 8, 4, 'PBE'],
  [2, 1, 1, 'KSN'], [2, 2, 2, 'HWL'], [2, 4, 2, 'FSST'], [2, 7, 1, 'DIC1'], [2, 8, 3, 'LA'],
  [3, 1, 1, 'GGPg'], [3, 2, 2, 'MTRS'], [3, 4, 1, 'E'], [3, 5, 1, 'AM'], [3, 7, 1, 'D'], [3, 8, 1, 'GGPh'], [3, 9, 2, 'ETH'],
  [4, 1, 2, 'DIC1'], [4, 3, 2, 'NW2p'], [4, 5, 1, 'D'],
]

export async function ensureDefaults() {
  if ((await db.periods.count()) === 0) await db.periods.bulkAdd(DEFAULT_PERIODS.map((p) => ({ ...p })))
  if ((await getSetting<string | null>('abReference', null)) == null) {
    await setSetting('abReference', mondayOf(todayISO()))
  }
  if (!(await getSetting('seeded', false))) {
    await seedTimetable()
    await seedDemo()
    await setSetting('seeded', true)
  }
}

/** Real subjects and Stundenplan — these are not demo data. */
export async function seedTimetable() {
  await db.transaction('rw', [db.subjects, db.lessons], async () => {
    const ids: Record<string, number> = {}
    for (const s of SUBJECTS) ids[s.short] = (await db.subjects.add({ ...s })) as number
    await db.lessons.bulkAdd(TIMETABLE.map(([day, period, length, short]) => ({ day, period, length, week: 'alle' as const, subjectId: ids[short] })))
  })
}

/** Sample tasks, grades and exams so the app isn't empty. Skips anything whose subject no longer exists. */
export async function seedDemo() {
  const t = todayISO()
  // Demo dates land on school days only.
  const wd = (n: number) => { const d = addDays(t, n); const w = weekdayIndex(d); return w === 5 ? addDays(d, 2) : w === 6 ? addDays(d, 1) : d }
  await db.transaction('rw', [db.subjects, db.tasks, db.grades, db.exams], async () => {
    const ids: Record<string, number> = {}
    for (const s of await db.subjects.toArray()) ids[s.short] = s.id!
    const has = (short: string) => ids[short] != null

    const now = Date.now()
    const task = (short: string, title: string, due: string | null, priority: 1 | 2 | 3, status: 'offen' | 'inArbeit' | 'erledigt' = 'offen') =>
      has(short) ? [{ title, subjectId: ids[short], due, priority, status, createdAt: now, doneAt: status === 'erledigt' ? now : null, demo: true }] : []
    await db.tasks.bulkAdd([
      ...task('LA', 'Laborprotokoll Operationsverstärker', wd(1), 1, 'inArbeit'),
      ...task('DIC1', 'Hausübung Timer0 CTC-Modus', t, 1),
      ...task('E', 'Vokabeln Unit 3', wd(3), 3),
      ...task('D', 'Kommentar überarbeiten', addDays(t, -1), 2),
      ...task('HWE', 'Schaltplan Audioverstärker in KiCad', wd(6), 2),
      ...task('FSST', 'WPF-Übung: Datenbindung', wd(4), 2),
      ...task('BSPK', 'Turnsackerl mitnehmen', wd(1), 3),
      ...task('GGPh', 'Referat Thema auswählen', addDays(t, -6), 3, 'erledigt'),
    ])

    const g = (short: string, category: string, value: number, daysAgo: number, title?: string) =>
      has(short) ? [{ subjectId: ids[short], category, value, date: addDays(t, -daysAgo), title, demo: true }] : []
    await db.grades.bulkAdd([
      ...g('AM', 'Test', 3, 24, 'Vektoren'), ...g('AM', 'Mitarbeit', 2, 15), ...g('AM', 'Schularbeit', 3, 9, '1. Schularbeit'), ...g('AM', 'Test', 2, 3, 'Matrizen'),
      ...g('DIC1', 'Test', 2, 20, 'Ports & Interrupts'), ...g('DIC1', 'Mitarbeit', 1, 12), ...g('DIC1', 'Test', 1, 4, 'Timer'),
      ...g('D', 'Mitarbeit', 2, 18), ...g('D', 'Schularbeit', 4, 7, '1. Schularbeit – Kommentar'),
      ...g('E', 'Test', 2, 21, 'Reading'), ...g('E', 'Mitarbeit', 2, 10),
      ...g('NW2p', 'Test', 3, 14, 'Kinematik'), ...g('NW2p', 'Mitarbeit', 2, 5),
      ...g('FSST', 'Test', 1, 16, 'C# Grundlagen'),
    ])

    const exam = (short: string, date: string, kind: 'Schularbeit' | 'Test' | 'Abgabe', topic: string) =>
      has(short) ? [{ subjectId: ids[short], date, kind, topic, demo: true }] : []
    await db.exams.bulkAdd([
      ...exam('E', wd(5), 'Schularbeit', 'Unit 1–3, Writing: Opinion essay'),
      ...exam('DIC1', wd(9), 'Test', 'ADC und Analogkomparator'),
      ...exam('AM', wd(16), 'Schularbeit', 'Matrizen, Gleichungssysteme'),
      ...exam('MTRS', wd(12), 'Test', 'Messbrücken'),
      ...exam('HWE', wd(25), 'Abgabe', 'Layout-Projekt Audioverstärker'),
    ])
  })
}

export async function deleteDemo() {
  await db.transaction('rw', [db.tasks, db.grades, db.exams], async () => {
    await db.tasks.filter((r) => !!r.demo).delete()
    await db.grades.filter((r) => !!r.demo).delete()
    await db.exams.filter((r) => !!r.demo).delete()
  })
}

export async function hasDemo(): Promise<boolean> {
  return (
    (await db.tasks.filter((r) => !!r.demo).count()) +
      (await db.grades.filter((r) => !!r.demo).count()) +
      (await db.exams.filter((r) => !!r.demo).count()) >
    0
  )
}
