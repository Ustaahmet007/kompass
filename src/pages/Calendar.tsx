import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { db, type Exam, type Lesson, type Task } from '../db'
import { DAY_SHORT, MONTH_NAMES, addDays, formatLong, mondayOf, toISO } from '../lib/date'
import { lessonSpan, lessonsForDate, usePeriods, useSetting, useSubjects, useToday } from '../lib/hooks'
import { ExamSheet } from '../components/forms'
import { TaskRow, TaskSheet } from '../components/tasks'
import { Button, IconButton, PageHeader, Panel, SubjectTag, cx, useConfirm } from '../components/ui'
import { ExamRow } from './Exams'

export default function CalendarPage() {
  const today = useToday()
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [selected, setSelected] = useState(today)
  const { byId } = useSubjects()
  const periods = usePeriods()
  const abRef = useSetting('abReference', mondayOf(today))
  const lessons = useLiveQuery(() => db.lessons.toArray(), [], [] as Lesson[])
  const exams = useLiveQuery(() => db.exams.toArray(), [], [] as Exam[])
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], [] as Task[])
  const [editTask, setEditTask] = useState<Task | null | undefined>(undefined)
  const [editExam, setEditExam] = useState<Exam | null | undefined>(undefined)
  const confirm = useConfirm()

  const first = toISO(new Date(cursor.y, cursor.m, 1))
  const gridStart = mondayOf(first)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  // Drop a trailing week that belongs entirely to the next month.
  const visibleDays = days.slice(0, days[35].slice(5, 7) === first.slice(5, 7) ? 42 : 35)
  const move = (delta: number) => setCursor((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const goToday = () => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); setSelected(today) }

  const examsOn = (iso: string) => exams.filter((e) => e.date === iso)
  const tasksOn = (iso: string) => tasks.filter((t) => t.due === iso && t.status !== 'erledigt')
  const selLessons = lessonsForDate(lessons, selected, abRef)
  const del = async (t: Task) => { if (await confirm.ask(`„${t.title}" wird gelöscht.`)) await db.tasks.delete(t.id!) }

  return (
    <div>
      <PageHeader
        title={`${MONTH_NAMES[cursor.m]} ${cursor.y}`}
        action={
          <div className="flex items-center gap-1">
            <IconButton label="Voriger Monat" onClick={() => move(-1)}><ChevronLeft size={22} /></IconButton>
            <Button variant="secondary" onClick={goToday}>Heute</Button>
            <IconButton label="Nächster Monat" onClick={() => move(1)}><ChevronRight size={22} /></IconButton>
          </div>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel className="p-2">
          <div className="grid grid-cols-7 gap-1">
            {DAY_SHORT.map((d) => <div key={d} className="py-1.5 text-center text-sm font-semibold text-ink-3">{d}</div>)}
            {visibleDays.map((iso) => {
              const inMonth = Number(iso.slice(5, 7)) - 1 === cursor.m
              const ex = examsOn(iso)
              const ts = tasksOn(iso)
              const ls = lessonsForDate(lessons, iso, abRef)
              const isSel = iso === selected
              const isToday = iso === today
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelected(iso)}
                  aria-label={formatLong(iso)}
                  aria-pressed={isSel}
                  className={cx(
                    'flex min-h-16 flex-col items-stretch gap-0.5 rounded-lg p-1 text-left sm:min-h-24 sm:p-1.5',
                    isSel ? 'bg-ink text-paper' : 'hover:bg-sunken',
                    !inMonth && !isSel && 'opacity-35',
                  )}
                >
                  <span className={cx('flex size-7 items-center justify-center self-start rounded-full text-sm font-semibold tabular', isToday && !isSel && 'bg-brass text-white')}>
                    {Number(iso.slice(8))}
                  </span>
                  {ex.slice(0, 2).map((e) => (
                    <span key={e.id} className="truncate rounded px-1 text-[11px] leading-4 font-bold text-white" style={{ background: byId.get(e.subjectId)?.color ?? 'var(--brass)' }}>
                      {byId.get(e.subjectId)?.short} {e.kind === 'Schularbeit' ? 'SA' : e.kind}
                    </span>
                  ))}
                  <span className="mt-auto flex items-center gap-1">
                    {ls.length > 0 && <span className={cx('h-1 flex-1 rounded-full', isSel ? 'bg-paper/40' : 'bg-line')} title={`${ls.length} Einheiten`} />}
                    {ts.length > 0 && <span className={cx('rounded-full px-1 text-[10px] font-bold', isSel ? 'bg-paper text-ink' : 'bg-sunken text-ink-2')}>{ts.length}</span>}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="px-2 pt-2 pb-1 text-xs text-ink-3">Balken = Schultag · Zahl = fällige Aufgaben · farbig = Prüfungen</p>
        </Panel>

        <div className="space-y-5">
          <h2 className="display text-2xl">{formatLong(selected)}</h2>
          <Panel title="Prüfungen" action={<IconButton label="Prüfung an diesem Tag" onClick={() => setEditExam(null)}><Plus size={20} /></IconButton>}>
            {examsOn(selected).length ? (
              <ul className="divide-y divide-line">{examsOn(selected).map((e) => <ExamRow key={e.id} exam={e} today={today} onOpen={setEditExam} />)}</ul>
            ) : <p className="px-4 pb-3 text-ink-3">Keine.</p>}
          </Panel>
          <Panel title="Fällige Aufgaben" action={<IconButton label="Aufgabe für diesen Tag" onClick={() => setEditTask(null)}><Plus size={20} /></IconButton>}>
            {tasks.filter((t) => t.due === selected).length ? (
              <ul className="divide-y divide-line">{tasks.filter((t) => t.due === selected).map((t) => <TaskRow key={t.id} task={t} onOpen={setEditTask} onDelete={del} />)}</ul>
            ) : <p className="px-4 pb-3 text-ink-3">Keine.</p>}
          </Panel>
          <Panel title="Unterricht">
            {selLessons.length ? (
              <ul className="px-4 pb-3">
                {selLessons.map((l) => {
                  const { start, end } = lessonSpan(l, periods)
                  return (
                    <li key={l.id} className="flex items-center gap-3 py-1.5">
                      <span className="w-24 shrink-0 text-sm text-ink-2 tabular">{start}–{end}</span>
                      <SubjectTag subject={byId.get(l.subjectId)} />
                      <span className="truncate">{byId.get(l.subjectId)?.name}</span>
                    </li>
                  )
                })}
              </ul>
            ) : <p className="px-4 pb-3 text-ink-3">Kein Unterricht.</p>}
          </Panel>
        </div>
      </div>
      <TaskSheet open={editTask !== undefined} task={editTask} defaultDue={selected} onClose={() => setEditTask(undefined)} />
      <ExamSheet open={editExam !== undefined} exam={editExam} defaultDate={selected} onClose={() => setEditExam(undefined)} />
      {confirm.element}
    </div>
  )
}
