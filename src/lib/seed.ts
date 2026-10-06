import { db, DEFAULT_CATEGORIES, getSetting, setSetting, type Lesson, type Period, type Subject } from '../db'
import { addDays, mondayOf, todayISO, weekdayIndex } from './date'

/**
 * Placeholder Stundenraster — edit it under Einstellungen.
 * Breaks show up as gaps between the end of one Stunde and the start of the next.
 */
export const DEFAULT_PERIODS: Omit<Period, 'id'>[] = [
  { nr: 1, start: '07:45', end: '08:35' },
  { nr: 2, start: '08:35', end: '09:25' },
  { nr: 3, start: '09:40', end: '10:30' },
  { nr: 4, start: '10:30', end: '11:20' },
  { nr: 5, start: '11:30', end: '12:20' },
  { nr: 6, start: '12:20', end: '13:10' },
  { nr: 7, start: '13:10', end: '14:00' },
  { nr: 8, start: '14:00', end: '14:50' },
  { nr: 9, start: '14:50', end: '15:40' },
  { nr: 10, start: '15:50', end: '16:40' },
  { nr: 11, start: '16:40', end: '17:30' },
]

const cats = () => DEFAULT_CATEGORIES.map((c) => ({ ...c }))

const DEMO_SUBJECTS: Omit<Subject, 'id'>[] = [
  { short: 'D', name: 'Deutsch', color: '#c2410c', categories: cats() },
  { short: 'E', name: 'Englisch', color: '#7c3aed', categories: cats() },
  { short: 'AM', name: 'Angewandte Mathematik', color: '#2563eb', categories: cats() },
  { short: 'DIC', name: 'DIC – Mikrocontroller', color: '#0d9488', categories: cats() },
  { short: 'MTRS', name: 'MTRS', color: '#be185d', categories: cats() },
  { short: 'HWE', name: 'Hardwareentwicklung', color: '#ca8a04', categories: [{ name: 'Projekt', weight: 50 }, { name: 'Test', weight: 40 }, { name: 'Mitarbeit', weight: 10 }] },
  { short: 'FSST', name: 'Fachspezifische Softwaretechnik', color: '#4f46e5', categories: cats() },
  { short: 'PH', name: 'Physik', color: '#0284c7', categories: [{ name: 'Test', weight: 70 }, { name: 'Mitarbeit', weight: 30 }] },
  { short: 'GGP', name: 'Geografie, Geschichte & Politik', color: '#65a30d', categories: [{ name: 'Test', weight: 60 }, { name: 'Mitarbeit', weight: 40 }] },
  { short: 'BESP', name: 'Bewegung & Sport', color: '#dc2626', categories: [{ name: 'Mitarbeit', weight: 100 }] },
  { short: 'WST', name: 'Werkstätte', color: '#57534e', categories: [{ name: 'Werkstück', weight: 70 }, { name: 'Mitarbeit', weight: 30 }] },
  { short: 'LAB', name: 'Laboratorium', color: '#0f766e', categories: [{ name: 'Protokoll', weight: 60 }, { name: 'Mitarbeit', weight: 40 }] },
]

// [day, period, length, short, week]
const DEMO_TIMETABLE: [number, number, number, string, Lesson['week']][] = [
  [0, 1, 2, 'AM', 'alle'], [0, 3, 1, 'E', 'alle'], [0, 4, 1, 'D', 'alle'], [0, 5, 2, 'DIC', 'alle'], [0, 8, 4, 'WST', 'alle'],
  [1, 1, 2, 'FSST', 'alle'], [1, 3, 1, 'MTRS', 'alle'], [1, 4, 1, 'PH', 'alle'], [1, 5, 1, 'GGP', 'alle'], [1, 6, 1, 'D', 'alle'], [1, 8, 2, 'BESP', 'alle'],
  [2, 1, 4, 'LAB', 'A'], [2, 1, 2, 'HWE', 'B'], [2, 3, 2, 'FSST', 'B'], [2, 5, 1, 'E', 'alle'], [2, 6, 1, 'AM', 'alle'],
  [3, 1, 1, 'DIC', 'alle'], [3, 2, 1, 'MTRS', 'alle'], [3, 3, 2, 'HWE', 'alle'], [3, 5, 1, 'PH', 'alle'], [3, 6, 1, 'GGP', 'alle'], [3, 8, 2, 'FSST', 'alle'],
  [4, 1, 1, 'D', 'alle'], [4, 2, 1, 'E', 'alle'], [4, 3, 1, 'AM', 'alle'], [4, 4, 1, 'FSST', 'alle'],
]

export async function ensureDefaults() {
  if ((await db.periods.count()) === 0) await db.periods.bulkAdd(DEFAULT_PERIODS.map((p) => ({ ...p })))
  if ((await getSetting<string | null>('abReference', null)) == null) {
    await setSetting('abReference', mondayOf(todayISO()))
  }
  if (!(await getSetting('seeded', false))) {
    await seedDemo()
    await setSetting('seeded', true)
  }
}

export async function seedDemo() {
  const t = todayISO()
  // Demo dates land on school days only.
  const wd = (n: number) => { const d = addDays(t, n); const w = weekdayIndex(d); return w === 5 ? addDays(d, 2) : w === 6 ? addDays(d, 1) : d }
  await db.transaction('rw', [db.subjects, db.lessons, db.tasks, db.grades, db.exams], async () => {
    const ids: Record<string, number> = {}
    for (const s of DEMO_SUBJECTS) ids[s.short] = (await db.subjects.add({ ...s, demo: true })) as number

    await db.lessons.bulkAdd(
      DEMO_TIMETABLE.map(([day, period, length, short, week]) => ({
        day, period, length, week, subjectId: ids[short], demo: true,
      })),
    )

    const now = Date.now()
    await db.tasks.bulkAdd([
      { title: 'Laborprotokoll Operationsverstärker', subjectId: ids.LAB, due: addDays(t, 1), priority: 1, status: 'inArbeit', createdAt: now, demo: true },
      { title: 'Hausübung Timer0 CTC-Modus', subjectId: ids.DIC, due: t, priority: 1, status: 'offen', createdAt: now, demo: true },
      { title: 'Vokabeln Unit 3', subjectId: ids.E, due: wd(3), priority: 3, status: 'offen', createdAt: now, demo: true },
      { title: 'Kommentar überarbeiten', subjectId: ids.D, due: addDays(t, -1), priority: 2, status: 'offen', createdAt: now, demo: true },
      { title: 'Schaltplan Audioverstärker in KiCad', subjectId: ids.HWE, due: wd(6), priority: 2, status: 'offen', createdAt: now, demo: true },
      { title: 'WPF-Übung: Datenbindung', subjectId: ids.FSST, due: wd(4), priority: 2, status: 'offen', createdAt: now, demo: true },
      { title: 'Turnsackerl mitnehmen', subjectId: ids.BESP, due: addDays(t, 1), priority: 3, status: 'offen', createdAt: now, demo: true },
      { title: 'Referat Thema auswählen', subjectId: ids.GGP, due: addDays(t, -6), priority: 3, status: 'erledigt', createdAt: now, doneAt: now, demo: true },
    ])

    const g = (short: string, category: string, value: number, daysAgo: number, title?: string) => ({
      subjectId: ids[short], category, value, date: addDays(t, -daysAgo), title, demo: true,
    })
    await db.grades.bulkAdd([
      g('AM', 'Test', 3, 24, 'Vektoren'), g('AM', 'Mitarbeit', 2, 15), g('AM', 'Schularbeit', 3, 9, '1. Schularbeit'), g('AM', 'Test', 2, 3, 'Matrizen'),
      g('DIC', 'Test', 2, 20, 'Ports & Interrupts'), g('DIC', 'Mitarbeit', 1, 12), g('DIC', 'Test', 1, 4, 'Timer'),
      g('D', 'Mitarbeit', 2, 18), g('D', 'Schularbeit', 4, 7, '1. Schularbeit – Kommentar'),
      g('E', 'Test', 2, 21, 'Reading'), g('E', 'Mitarbeit', 2, 10),
      g('PH', 'Test', 3, 14, 'Kinematik'), g('PH', 'Mitarbeit', 2, 5),
      g('FSST', 'Test', 1, 16, 'C# Grundlagen'),
    ])

    await db.exams.bulkAdd([
      { subjectId: ids.E, date: wd(5), kind: 'Schularbeit', topic: 'Unit 1–3, Writing: Opinion essay', demo: true },
      { subjectId: ids.DIC, date: wd(9), kind: 'Test', topic: 'ADC und Analogkomparator', demo: true },
      { subjectId: ids.AM, date: wd(16), kind: 'Schularbeit', topic: 'Matrizen, Gleichungssysteme', demo: true },
      { subjectId: ids.MTRS, date: wd(12), kind: 'Test', topic: 'Messbrücken', demo: true },
      { subjectId: ids.HWE, date: wd(25), kind: 'Abgabe', topic: 'Layout-Projekt Audioverstärker', demo: true },
    ])
  })
}

export async function deleteDemo() {
  await db.transaction('rw', [db.subjects, db.lessons, db.tasks, db.grades, db.exams], async () => {
    await db.lessons.filter((r) => !!r.demo).delete()
    await db.tasks.filter((r) => !!r.demo).delete()
    await db.grades.filter((r) => !!r.demo).delete()
    await db.exams.filter((r) => !!r.demo).delete()
    // Keep a demo subject if your own entries already use it — it just stops counting as demo.
    for (const s of await db.subjects.filter((r) => !!r.demo).toArray()) {
      const id = s.id!
      const used =
        (await db.lessons.where('subjectId').equals(id).count()) +
        (await db.tasks.where('subjectId').equals(id).count()) +
        (await db.grades.where('subjectId').equals(id).count()) +
        (await db.exams.where('subjectId').equals(id).count())
      if (used) await db.subjects.update(id, { demo: false })
      else await db.subjects.delete(id)
    }
  })
}

export async function hasDemo(): Promise<boolean> {
  return (await db.subjects.filter((s) => !!s.demo).count()) > 0
}
