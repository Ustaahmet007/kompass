import { useState } from 'react'
import { useImageUrl } from '../lib/images'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { db, type Lesson, type StudyPlan, type Task } from '../db'
import { addDays, daysBetween, formatDate, formatLong, minutesOf, mondayOf, weekKindFor, weekdayIndex, DAY_NAMES } from '../lib/date'
import { lessonSpan, lessonsForDate, useNow, usePeriods, useSetting, useSubjects, useToday } from '../lib/hooks'
import { TaskRow, TaskSheet } from '../components/tasks'
import { Button, Empty, Panel, SubjectTag, cx, useConfirm } from '../components/ui'

export default function Today() {
  const today = useToday()
  const now = useNow()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const periods = usePeriods()
  const abRef = useSetting('abReference', mondayOf(today))
  const { byId } = useSubjects()
  const lessons = useLiveQuery(() => db.lessons.toArray(), [], [] as Lesson[])
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], [] as Task[])
  const exams = useLiveQuery(() => db.exams.where('date').aboveOrEqual(today).sortBy('date'), [today], [])
  const plans = useLiveQuery(() => db.plans.where('deadline').aboveOrEqual(today).toArray(), [today], [] as StudyPlan[])
  const [edit, setEdit] = useState<Task | null | undefined>(undefined)
  const confirm = useConfirm()

  const todays = lessonsForDate(lessons, today, abRef)
  // On a day without lessons (weekend), preview the next school day instead.
  let previewDate = today
  let preview = todays
  const schoolOver = todays.length > 0 && nowMin >= minutesOf(lessonSpan(todays[todays.length - 1], periods).end || '23:59')
  if (!todays.length || schoolOver) {
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i)
      const l = lessonsForDate(lessons, d, abRef)
      if (l.length) {
        previewDate = d
        preview = l
        break
      }
    }
  }
  const showingToday = previewDate === today

  const open = tasks.filter((t) => t.status !== 'erledigt')
  const tomorrow = addDays(today, 1)
  const urgent = open
    .filter((t) => t.due && t.due <= tomorrow)
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '') || a.priority - b.priority)
  const overdue = open.filter((t) => t.due && t.due < today).length
  const nextExam = exams[0]
  const nextExamSubject = nextExam ? byId.get(nextExam.subjectId) : undefined
  const examDays = nextExam ? daysBetween(today, nextExam.date) : 0
  const weekKind = weekKindFor(today, abRef)
  const hasAB = lessons.some((l) => l.week !== 'alle')

  const del = async (t: Task) => {
    if (await confirm.ask(`„${t.title}" wird gelöscht.`)) await db.tasks.delete(t.id!)
  }

  return (
    <div>
      <TodayHeader
        date={formatLong(today)}
        hour={now.getHours()}
        meta={
          <>
            {hasAB ? `Woche ${weekKind}` : null}
            {overdue > 0 && <span className="font-semibold text-danger">{hasAB ? ' · ' : ''}{overdue} überfällig</span>}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel
          title={showingToday ? 'Unterricht heute' : `Nächster Schultag · ${DAY_NAMES[weekdayIndex(previewDate)]}, ${formatDate(previewDate)}`}
          action={<Link to="/stundenplan" className="min-h-11 content-center px-1 text-sm font-medium text-brass">Ganze Woche</Link>}
        >
          {preview.length ? (
            <Timeline lessons={preview} live={showingToday} nowMin={nowMin} />
          ) : (
            <Empty action={<Link to="/stundenplan"><Button>Stundenplan anlegen</Button></Link>}>Im Stundenplan ist noch nichts eingetragen.</Empty>
          )}
        </Panel>

        <div className="flex flex-col gap-5">
          {nextExam && nextExamSubject ? (
            <Link to="/pruefungen" className="block rounded-xl border-2 border-brass bg-brass-soft px-5 py-4 transition-transform active:scale-[0.99]">
              <p className="text-sm font-semibold text-brass">Nächste {nextExam.kind}</p>
              <div className="mt-1 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="display truncate text-2xl">{nextExamSubject.name}</p>
                  <p className="mt-1 truncate text-ink-2">{nextExam.topic || 'Kein Stoff eingetragen'}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="display text-4xl tabular sm:text-5xl">{examDays}</p>
                  <p className="text-sm text-ink-2">{examDays === 1 ? 'Tag' : 'Tage'} · {formatDate(nextExam.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                </div>
              </div>
            </Link>
          ) : (
            <Panel title="Nächste Prüfung">
              <Empty action={<Link to="/pruefungen"><Button>Prüfung eintragen</Button></Link>}>Keine Prüfung geplant.</Empty>
            </Panel>
          )}

          {plans.some((p) => p.items.some((i) => i.date === today)) && (
            <Panel title="Heute lernen" action={<Link to="/lernziele" className="min-h-11 content-center px-1 text-sm font-medium text-brass">Lernziele</Link>}>
              <ul className="divide-y divide-line pb-1">
                {plans.flatMap((p) =>
                  p.items.map((it, idx) => ({ p, it, idx })).filter((x) => x.it.date === today),
                ).map(({ p, it, idx }) => (
                  <li key={`${p.id}-${idx}`} className="flex items-center gap-3 px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => db.plans.update(p.id!, { items: p.items.map((x, j) => (j === idx ? { ...x, done: !x.done } : x)) })}
                      aria-label={it.done ? 'Als offen markieren' : 'Als erledigt markieren'}
                      className="-m-2 flex size-11 shrink-0 items-center justify-center"
                    >
                      <span className={cx('flex size-6 items-center justify-center rounded-md border-2', it.done ? 'border-ok bg-ok text-white' : 'border-ink-3')}>{it.done && '✓'}</span>
                    </button>
                    <Link to={`/lernziele/${p.id}`} className="min-w-0 flex-1">
                      <span className={cx('block truncate font-medium', it.done && 'text-ink-3 line-through')}>{it.topic}</span>
                      <span className="text-sm text-ink-2">{it.minutes} min · {p.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title={<>Fällig bis morgen <span className="font-normal text-ink-3">· {open.length} offen insgesamt</span></>}
            action={
              <button type="button" onClick={() => setEdit(null)} className="flex size-11 items-center justify-center rounded-lg text-brass hover:bg-sunken" aria-label="Neue Aufgabe">
                <Plus size={22} />
              </button>
            }
          >
            {urgent.length ? (
              <ul className="divide-y divide-line pb-1">
                {urgent.map((t) => <TaskRow key={t.id} task={t} onOpen={setEdit} onDelete={del} />)}
              </ul>
            ) : (
              <Empty>Nichts fällig bis morgen.</Empty>
            )}
            <Link to="/aufgaben" className="block border-t border-line px-4 py-3 text-sm font-medium text-brass">Alle Aufgaben</Link>
          </Panel>
        </div>
      </div>

      <TaskSheet open={edit !== undefined} task={edit} onClose={() => setEdit(undefined)} />
      {confirm.element}
    </div>
  )

  function Timeline({ lessons, live, nowMin }: { lessons: Lesson[]; live: boolean; nowMin: number }) {
    const rows = lessons.map((l) => ({ l, ...lessonSpan(l, periods) }))
    const firstStart = rows[0] ? minutesOf(rows[0].start) : 0
    let markerPlaced = !live || nowMin < firstStart - 60 // no marker long before school
    return (
      <ol className="px-2 pt-1 pb-3">
        {rows.map(({ l, start, end }, i) => {
          const s = minutesOf(start)
          const e = minutesOf(end)
          const current = live && nowMin >= s && nowMin < e
          const past = live && nowMin >= e
          const progress = current ? (nowMin - s) / (e - s) : 0
          const subject = byId.get(l.subjectId)
          const prevEnd = i > 0 ? minutesOf(rows[i - 1].end) : null
          const gap = prevEnd != null ? s - prevEnd : 0
          let marker = null
          if (!markerPlaced && nowMin < s) {
            markerPlaced = true
            marker = <NowMarker label={i === 0 ? `Beginn in ${s - nowMin} min` : `Pause · weiter in ${s - nowMin} min`} />
          }
          if (current) markerPlaced = true
          return (
            <li key={l.id}>
              {marker}
              {!marker && gap >= 30 && <p className="py-1 pl-[4.75rem] text-xs text-ink-3">{gap} min Pause</p>}
              <div
                className={cx(
                  'relative my-1 flex items-stretch gap-3 overflow-hidden rounded-lg py-2.5 pr-3',
                  current ? 'bg-sunken ring-2 ring-brass' : '',
                  past && 'opacity-45',
                )}
              >
                <div className="w-16 shrink-0 pl-2 text-right text-sm leading-tight tabular">
                  <div className="font-semibold">{start}</div>
                  <div className="text-ink-3">{end}</div>
                </div>
                <div className="w-1 shrink-0 rounded-full" style={{ background: subject?.color ?? 'var(--line)' }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{subject?.name ?? 'Unbekanntes Fach'}</span>
                    {l.length > 1 && <span className="shrink-0 text-xs text-ink-3">{l.length} Std.</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-sm text-ink-2">
                    <SubjectTag subject={subject} />
                    {(l.room || subject?.room) && <span>{l.room || subject?.room}</span>}
                    {current && <span className="font-semibold text-brass">läuft · noch {e - nowMin} min</span>}
                  </div>
                </div>
                {current && <div className="absolute bottom-0 left-0 h-1 bg-brass" style={{ width: `${progress * 100}%` }} />}
              </div>
            </li>
          )
        })}
        {!markerPlaced && <NowMarker label="Schluss für heute" />}
      </ol>
    )
  }
}

function NowMarker({ label }: { label: string }) {
  return (
    <div className="my-1.5 flex items-center gap-2 pl-[4.75rem]" aria-label={label}>
      <span className="size-2.5 rounded-full bg-brass" />
      <span className="h-px flex-1 bg-brass" />
      <span className="text-xs font-semibold text-brass">{label}</span>
    </div>
  )
}

function greeting(hour: number) {
  if (hour >= 5 && hour < 11) return 'Guten Morgen'
  if (hour >= 11 && hour < 18) return 'Servus'
  if (hour >= 18 && hour < 23) return 'Guten Abend'
  return 'Noch wach'
}

function TodayHeader({ date, hour, meta }: { date: string; hour: number; meta: React.ReactNode }) {
  const name = useSetting('userName', '')
  const coverId = useSetting<number | null>('homeCoverId', null)
  const cover = useImageUrl(coverId)
  const hello = `${greeting(hour)}${name ? `, ${name}` : ''}${hour >= 23 || hour < 5 ? '?' : ''}`
  if (cover) {
    return (
      <header className="relative mb-7 overflow-hidden rounded-3xl">
        <img src={cover} alt="" className="h-52 w-full object-cover sm:h-64" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-5 pb-4 text-white sm:px-7 sm:pb-6">
          <p className="text-lg font-medium text-white/90">{hello}</p>
          <h1 className="display text-4xl drop-shadow sm:text-5xl">{date}</h1>
          <p className="mt-1 text-sm text-white/85 [&_.text-danger]:text-red-200">{meta}</p>
        </div>
      </header>
    )
  }
  return (
    <header className="mb-7">
      <p className="text-lg text-ink-2">{hello}</p>
      <h1 className="display mt-0.5 text-4xl sm:text-5xl">{date}</h1>
      <p className="mt-1 text-sm text-ink-2">{meta}</p>
    </header>
  )
}
