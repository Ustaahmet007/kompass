import Dexie, { type EntityTable } from 'dexie'

export interface Category {
  name: string
  weight: number // percent
}

export interface Subject {
  id?: number
  name: string
  short: string
  color: string
  teacher?: string
  room?: string
  categories: Category[]
  demo?: boolean
}

export interface Period {
  id?: number
  nr: number
  start: string // HH:MM
  end: string // HH:MM
}

export type WeekKind = 'alle' | 'A' | 'B'

export interface Lesson {
  id?: number
  day: number // 0 = Montag … 4 = Freitag
  period: number // first Stunde (Period.nr)
  length: number // number of consecutive Stunden (Doppel-/Blockstunde)
  subjectId: number
  room?: string
  week: WeekKind
  note?: string
  demo?: boolean
}

export type TaskStatus = 'offen' | 'inArbeit' | 'erledigt'
export type Priority = 1 | 2 | 3 // 1 = hoch, 2 = mittel, 3 = niedrig

export interface Task {
  id?: number
  title: string
  subjectId?: number | null
  due?: string | null // YYYY-MM-DD
  priority: Priority
  status: TaskStatus
  notes?: string
  createdAt: number
  doneAt?: number | null
  demo?: boolean
}

export interface Grade {
  id?: number
  subjectId: number
  category: string
  value: number // 1–5
  date: string // YYYY-MM-DD
  title?: string
  demo?: boolean
}

export type ExamKind = 'Schularbeit' | 'Test' | 'Prüfung' | 'Abgabe'

export interface Exam {
  id?: number
  subjectId: number
  date: string // YYYY-MM-DD
  kind: ExamKind
  topic: string
  demo?: boolean
}

export interface Setting {
  key: string
  value: unknown
}

export const db = new Dexie('kompass') as Dexie & {
  subjects: EntityTable<Subject, 'id'>
  periods: EntityTable<Period, 'id'>
  lessons: EntityTable<Lesson, 'id'>
  tasks: EntityTable<Task, 'id'>
  grades: EntityTable<Grade, 'id'>
  exams: EntityTable<Exam, 'id'>
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  subjects: '++id, short',
  periods: '++id, nr',
  lessons: '++id, day, subjectId',
  tasks: '++id, subjectId, due, status',
  grades: '++id, subjectId, date',
  exams: '++id, subjectId, date',
  settings: 'key',
})

export const DEFAULT_CATEGORIES: Category[] = [
  { name: 'Schularbeit', weight: 60 },
  { name: 'Test', weight: 30 },
  { name: 'Mitarbeit', weight: 10 },
]

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export function setSetting(key: string, value: unknown) {
  return db.settings.put({ key, value })
}

/** Ask the browser not to evict our data (Safari can clear storage of unused sites). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* not supported */
  }
}
