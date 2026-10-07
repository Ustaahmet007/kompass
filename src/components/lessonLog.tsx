import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, NotebookPen, Plus } from 'lucide-react'
import { db, getSetting, type Lesson, type LessonLog, type Task } from '../db'
import { addDays, formatDate, mondayOf, todayISO } from '../lib/date'
import { lessonSpan, lessonsForDate, usePeriods, useSubjects } from '../lib/hooks'
import { ExamSheet } from './forms'
import { Button, Input, Sheet, Textarea, cx } from './ui'

/** Next school day (after `date`) on which this subject is taught. */
export async function nextLessonDate(subjectId: number, date: string) {
  const lessons = await db.lessons.toArray()
  const abRef = await getSetting('abReference', mondayOf(date))
  for (let i = 1; i <= 21; i++) {
    const d = addDays(date, i)
    if (lessonsForDate(lessons, d, abRef).some((l) => l.subjectId === subjectId)) return d
  }
  return null
}

export function useLessonLogs(date: string) {
  return useLiveQuery(() => db.lessonLogs.where('date').equals(date).toArray(), [date], [] as LessonLog[])
}

/** Tap a lesson: note what was done, add homework, announce a test. */
export function LessonLogSheet({ lesson, date, onClose }: { lesson: Lesson; date: string; onClose: () => void }) {
  const { byId } = useSubjects()
  const periods = usePeriods()
  const subject = byId.get(lesson.subjectId)
  const { start, end } = lessonSpan(lesson, periods)
  const log = useLiveQuery(() => db.lessonLogs.where('date').equals(date).filter((l) => l.subjectId === lesson.subjectId).first(), [date, lesson.subjectId])
  const tasks = useLiveQuery(() => db.tasks.where('subjectId').equals(lesson.subjectId).filter((t) => t.status !== 'erledigt' || t.createdAt > Date.now() - 86400_000).toArray(), [lesson.subjectId], [] as Task[])

  const [text, setText] = useState<string | null>(null)
  const logId = useRef<number | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (log !== undefined && text === null) {
      setText(log?.text ?? '')
      logId.current = log?.id ?? null
    }
  }, [log, text])

  const persist = async (value: string) => {
    if (logId.current) await db.lessonLogs.update(logId.current, { text: value, updatedAt: Date.now() })
    else if (value.trim()) logId.current = (await db.lessonLogs.add({ date, subjectId: lesson.subjectId, lessonId: lesson.id ?? null, text: value, updatedAt: Date.now() })) as number
  }
  const change = (v: string) => {
    setText(v)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void persist(v), 400)
  }
  const close = async () => {
    window.clearTimeout(timer.current)
    if (text !== null) await persist(text)
    onClose()
  }

  // Quick homework
  const [hw, setHw] = useState('')
  const [nextDate, setNextDate] = useState<string | null>(null)
  const [due, setDue] = useState<string>('')
  const [dueKind, setDueKind] = useState<'next' | 'tomorrow' | 'week' | 'date'>('next')
  useEffect(() => {
    void nextLessonDate(lesson.subjectId, date).then((d) => {
      setNextDate(d)
      setDue(d ?? addDays(date, 1))
    })
  }, [lesson.subjectId, date])
  const pickDue = (k: typeof dueKind) => {
    setDueKind(k)
    if (k === 'next') setDue(nextDate ?? addDays(date, 1))
    if (k === 'tomorrow') setDue(addDays(todayISO(), 1))
    if (k === 'week') setDue(addDays(date, 7))
  }
  const addHw = async () => {
    if (!hw.trim()) return
    await db.tasks.add({ title: hw.trim(), subjectId: lesson.subjectId, due: due || null, priority: 2, status: 'offen', createdAt: Date.now() })
    setHw('')
  }
  const toggle = (t: Task) => db.tasks.update(t.id!, { status: t.status === 'erledigt' ? 'offen' : 'erledigt', doneAt: t.status === 'erledigt' ? null : Date.now() })
  const [examOpen, setExamOpen] = useState(false)

  const chip = (k: typeof dueKind, label: string) => (
    <button
      type="button"
      onClick={() => pickDue(k)}
      aria-pressed={dueKind === k}
      className={cx('min-h-10 rounded-full border px-3 text-sm font-semibold', dueKind === k ? 'border-brass bg-brass-soft text-brass' : 'border-line text-ink-2')}
    >
      {label}
    </button>
  )

  return (
    <Sheet
      open
      onClose={close}
      title={
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ background: subject?.color }} />
          {subject?.name ?? 'Stunde'}
          <span className="text-sm font-normal text-ink-3">{formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })} · {start}–{end}</span>
        </span>
      }
      footer={<Button variant="primary" onClick={close}>Fertig</Button>}
    >
      <div className="space-y-5">
        <div>
          <label htmlFor="lesson-log" className="mb-1.5 block text-sm font-medium text-ink-2">Was haben wir gemacht?</label>
          <Textarea
            id="lesson-log"
            rows={4}
            value={text ?? ''}
            onChange={(e) => change(e.target.value)}
            placeholder="z. B. Timer0 CTC-Modus, Beispiel 3 an der Tafel, Seite 42–44"
            autoFocus={!log?.text}
          />
          <p className="mt-1 text-xs text-ink-3">Wird automatisch gespeichert. Friday und der Lernplaner sehen das später beim Lernen.</p>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-2">Hausübung / Aufgabe</span>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void addHw()
            }}
          >
            <Input value={hw} onChange={(e) => setHw(e.target.value)} placeholder="z. B. Buch S. 45 Nr. 3–7" aria-label="Neue Hausübung" enterKeyHint="done" />
            <Button type="submit" variant="primary" disabled={!hw.trim()} aria-label="Hausübung hinzufügen"><Plus size={18} /></Button>
          </form>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {chip('next', nextDate ? `Nächste ${subject?.short ?? 'Stunde'} · ${formatDate(nextDate, { weekday: 'short' })}` : 'Nächste Stunde')}
            {chip('tomorrow', 'Morgen')}
            {chip('week', 'In 1 Woche')}
            <Input type="date" className="w-auto" value={due} onChange={(e) => { setDueKind('date'); setDue(e.target.value) }} aria-label="Fällig am" />
          </div>
          {tasks.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
              {tasks
                .sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'))
                .map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-2 py-1">
                    <button type="button" onClick={() => toggle(t)} aria-label={t.status === 'erledigt' ? 'Wieder offen' : 'Erledigt'} className="flex size-10 shrink-0 items-center justify-center">
                      <span className={cx('flex size-6 items-center justify-center rounded-md border-2', t.status === 'erledigt' ? 'border-ok bg-ok text-white' : 'border-ink-3')}>{t.status === 'erledigt' && <Check size={14} />}</span>
                    </button>
                    <span className={cx('min-w-0 flex-1 truncate', t.status === 'erledigt' && 'text-ink-3 line-through')}>{t.title}</span>
                    {t.due && <span className={cx('shrink-0 text-sm', t.due < todayISO() && t.status !== 'erledigt' ? 'text-danger' : 'text-ink-3')}>{formatDate(t.due, { weekday: 'short', day: 'numeric', month: 'numeric' })}</span>}
                  </li>
                ))}
            </ul>
          )}
        </div>

        <Button variant="ghost" onClick={() => setExamOpen(true)}><NotebookPen size={18} /> Test oder Schularbeit angekündigt?</Button>
      </div>
      <ExamSheet open={examOpen} defaultSubjectId={lesson.subjectId} onClose={() => setExamOpen(false)} />
    </Sheet>
  )
}
