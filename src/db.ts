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
  coverId?: number | null
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

export interface Note {
  id?: number
  subjectId?: number | null
  title: string
  body: string
  createdAt: number
  updatedAt: number
}

/** A finished Lerntimer focus block. */
export interface StudySession {
  id?: number
  subjectId?: number | null
  date: string // YYYY-MM-DD
  minutes: number
  endedAt: number
}

export interface PlanItem {
  date: string // YYYY-MM-DD
  minutes: number
  topic: string
  details?: string
  kind: 'lernen' | 'wiederholen' | 'probe'
  done: boolean
}

export interface StudyPlan {
  id?: number
  title: string
  subjectId?: number | null
  examId?: number | null
  deadline: string // YYYY-MM-DD
  minutesPerDay: number
  availability: string
  material: string
  materialFileName?: string
  tips?: string
  items: PlanItem[]
  createdAt: number
  updatedAt: number
}

export interface ChatMessage {
  id?: number
  role: 'user' | 'assistant'
  text: string
  ts: number
  /** Changes the assistant made in this turn, so they can be undone. */
  actions?: { label: string; undo: { table: 'tasks' | 'exams' | 'grades'; id: number; op: 'delete' | 'restore'; before?: unknown } }[]
}

export interface StoredImage {
  id?: number
  blob: Blob
  width: number
  height: number
  createdAt: number
  /** Framing: focus point in % and zoom factor (1 = fit). */
  focusX?: number
  focusY?: number
  zoom?: number
}

export interface Usage {
  month: string // YYYY-MM
  costUsd: number
  calls: number
  inputTokens: number
  outputTokens: number
}

export const db = new Dexie('kompass') as Dexie & {
  subjects: EntityTable<Subject, 'id'>
  periods: EntityTable<Period, 'id'>
  lessons: EntityTable<Lesson, 'id'>
  tasks: EntityTable<Task, 'id'>
  grades: EntityTable<Grade, 'id'>
  exams: EntityTable<Exam, 'id'>
  settings: EntityTable<Setting, 'key'>
  notes: EntityTable<Note, 'id'>
  sessions: EntityTable<StudySession, 'id'>
  plans: EntityTable<StudyPlan, 'id'>
  chat: EntityTable<ChatMessage, 'id'>
  usage: EntityTable<Usage, 'month'>
  images: EntityTable<StoredImage, 'id'>
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

db.version(2).stores({
  notes: '++id, subjectId, updatedAt',
  sessions: '++id, subjectId, date',
  plans: '++id, subjectId, deadline',
  chat: '++id, ts',
  usage: 'month',
})

db.version(3).stores({
  images: '++id',
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
