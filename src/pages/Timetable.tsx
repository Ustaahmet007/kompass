import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Briefcase, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { db, type Exam, type Lesson, type Shift, type Task, type WeekKind } from '../db'
import { DAY_NAMES, DAY_SHORT, addDays, minutesOf, mondayOf, weekKindFor, weekdayIndex } from '../lib/date'
import { TaskSheet } from '../components/tasks'
import { ExamSheet } from '../components/forms'
import { ShiftSheet, shiftLabel } from '../components/shifts'
import { useNow, usePeriods, useSetting, useSubjectColorMode, useSubjects, useToday } from '../lib/hooks'
import { Button, Field, IconButton, Input, PageHeader, Segmented, Select, Sheet, SubjectSelect, cx } from '../components/ui'

const DAYS = [0, 1, 2, 3, 4]

export default function Timetable() {
  const today = useToday()
  const now = useNow()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const periods = usePeriods()
  const { subjects, byId } = useSubjects()
  const plain = useSubjectColorMode() === 'schlicht'
  const lessons = useLiveQuery(() => db.lessons.toArray(), [], [] as Lesson[])
  const abRef = useSetting('abReference', mondayOf(today))
  const currentKind = weekKindFor(today, abRef)
  const [offset, setOffset] = useState(0) // weeks from this one
  const monday = addDays(mondayOf(today), offset * 7)
  const dateOf = (d: number) => addDays(monday, d)
  const [week, setWeek] = useState<'A' | 'B'>(currentKind)
  useEffect(() => setWeek(weekKindFor(monday, abRef)), [monday, abRef])
  const showDue = useSetting('ttShowDue', true)
  const sunday = addDays(monday, 6)
  const tasks = useLiveQuery(() => db.tasks.where('due').between(monday, sunday, true, true).toArray(), [monday], [] as Task[])
  const exams = useLiveQuery(() => db.exams.where('date').between(monday, sunday, true, true).toArray(), [monday], [] as Exam[])
  const shifts = useLiveQuery(() => db.shifts.where('date').between(monday, sunday, true, true).toArray(), [monday], [] as Shift[])
  const overdue = useLiveQuery(() => db.tasks.filter((t) => t.status !== 'erledigt' && !!t.due && t.due < today).count(), [today], 0)
  const [editTask, setEditTask] = useState<Task | null | undefined>(undefined)
  const [taskDefaults, setTaskDefaults] = useState<{ due?: string; subjectId?: number | null }>({})
  const [editExam, setEditExam] = useState<Exam | null | undefined>(undefined)
  const [editShift, setEditShift] = useState<Shift | null | undefined>(undefined)
  const openTasksOn = (iso: string) => tasks.filter((t) => t.due === iso && t.status !== 'erledigt').sort((a, b) => a.priority - b.priority)
  const doneTasksOn = (iso: string) => tasks.filter((t) => t.due === iso && t.status === 'erledigt')
  const examsOn = (iso: string) => exams.filter((e) => e.date === iso)
  const shiftsOn = (iso: string) => shifts.filter((x) => x.date === iso)
  const todayIdx = weekdayIndex(today)
  const [day, setDay] = useState(todayIdx < 5 ? todayIdx : 0)
  const [edit, setEdit] = useState<Partial<Lesson> | null>(null)
  const hasAB = lessons.some((l) => l.week !== 'alle')
  const visible = lessons.filter((l) => l.week === 'alle' || l.week === week)

  // Grid rows: one per Stunde, plus a thin spacer row for breaks of 10 minutes or more.
  const { template, rowOf } = useMemo(() => {
    const rows: string[] = []
    const rowOf = new Map<number, number>()
    periods.forEach((p, i) => {
      rows.push('minmax(3.4rem, auto)')
      rowOf.set(p.nr, rows.length)
      const next = periods[i + 1]
      if (next && minutesOf(next.start) - minutesOf(p.end) >= 10) rows.push('0.55rem')
    })
    return { template: rows.join(' '), rowOf }
  }, [periods])

  const showingCurrentWeek = offset === 0
  const nowPeriod = periods.find((p) => nowMin >= minutesOf(p.start) && nowMin < minutesOf(p.end))

  // Something due in this subject on this day: small marker on the lesson.
  const dueBadge = (l: Lesson) => {
    const iso = dateOf(l.day)
    const n = openTasksOn(iso).filter((t) => t.subjectId === l.subjectId).length
    const ex = examsOn(iso).find((e) => e.subjectId === l.subjectId)
    if (!n && !ex) return null
    return (
      <span className="absolute right-1 bottom-1 rounded-full bg-paper px-1.5 text-[10px] leading-4 font-bold text-ink shadow-sm">
        {ex ? (ex.kind === 'Schularbeit' ? 'SA' : ex.kind) : `${n} HÜ`}
      </span>
    )
  }

  const dueList = (iso: string, compact: boolean) => {
    const ex = examsOn(iso)
    const open = openTasksOn(iso)
    const done = doneTasksOn(iso)
    const sh = shiftsOn(iso)
    const max = compact ? 4 : 99
    const items = [
      ...ex.map((e) => (
        <button key={`e${e.id}`} type="button" onClick={() => setEditExam(e)} className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-bold text-white" style={{ background: byId.get(e.subjectId)?.color ?? 'var(--brass)' }}>
          <span className="truncate">{e.kind === 'Schularbeit' ? 'SA' : e.kind} {byId.get(e.subjectId)?.short}</span>
        </button>
      )),
      ...open.map((t) => {
        const sub = byId.get(t.subjectId ?? -1)
        const late = iso < today
        return (
          <button key={`t${t.id}`} type="button" onClick={() => setEditTask(t)} className={cx('flex w-full items-center gap-1.5 rounded-md bg-surface px-1.5 py-1 text-left text-xs shadow-[0_0_0_1px_var(--line)]', late && 'text-danger')}>
            <span className="size-2 shrink-0 rounded-full" style={{ background: sub?.color ?? 'var(--ink-3)' }} />
            <span className="truncate">{sub ? <b>{sub.short} </b> : null}{t.title}</span>
          </button>
        )
      }),
      ...sh.map((x) => (
        <button key={`s${x.id}`} type="button" onClick={() => setEditShift(x)} className="flex w-full items-center gap-1.5 rounded-md bg-brass-soft px-1.5 py-1 text-left text-xs font-semibold text-brass">
          <Briefcase size={12} className="shrink-0" /><span className="truncate">{shiftLabel(x)}</span>
        </button>
      )),
      ...done.map((t) => (
        <button key={`d${t.id}`} type="button" onClick={() => setEditTask(t)} className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-xs text-ink-3 line-through">
          <span className="truncate">{t.title}</span>
        </button>
      )),
    ]
    return (
      <>
        {items.slice(0, max)}
        {items.length > max && <span className="px-1.5 text-xs text-ink-3">+{items.length - max} mehr</span>}
      </>
    )
  }

  const cell = (l: Lesson) => {
    const s = byId.get(l.subjectId)
    const lastNr = l.period + l.length - 1
    const r0 = rowOf.get(l.period)
    const r1 = rowOf.get(lastNr) ?? r0
    if (r0 == null) return null
    const isNow = showingCurrentWeek && l.day === todayIdx && !!nowPeriod && nowPeriod.nr >= l.period && nowPeriod.nr <= lastNr
    return (
      <button
        key={l.id}
        type="button"
        onClick={() => setEdit(l)}
        className={cx(
          'relative m-0.5 flex min-w-0 flex-col items-start overflow-hidden rounded-lg px-2 py-1.5 text-left',
          plain ? 'border-l-4 bg-sunken text-ink' : 'text-white',
          isNow && 'ring-3 ring-brass ring-offset-2 ring-offset-surface',
        )}
        style={{
          gridColumn: l.day + 2,
          gridRow: `${r0 + 2} / ${(r1 ?? r0) + 3}` /* +2: row 1 = day header, row 2 = what's due */,
          ...(plain ? { borderLeftColor: s?.color ?? 'var(--line)' } : { background: s?.color ?? '#64748b' }),
        }}
      >
        <span className="w-full truncate text-[15px] leading-tight font-bold">{s?.short ?? '?'}</span>
        {l.length > 1 && <span className={cx('w-full truncate text-xs', plain ? 'text-ink-2' : 'opacity-90')}>{s?.name}</span>}
        {(l.room || s?.room) && <span className={cx('mt-auto w-full truncate text-xs', plain ? 'text-ink-2' : 'opacity-90')}>{l.room || s?.room}</span>}
        {l.week !== 'alle' && <span className="absolute top-1 right-1.5 text-[10px] font-bold opacity-90">{l.week}</span>}
        {showDue && dueBadge(l)}
      </button>
    )
  }

  return (
    <div>
      <PageHeader
        title="Stundenplan"
        subtitle={`${offset === 0 ? 'Diese Woche' : offset === 1 ? 'Nächste Woche' : offset === -1 ? 'Letzte Woche' : `${Number(monday.slice(8))}.${Number(monday.slice(5, 7))}. – ${Number(addDays(monday, 4).slice(8))}.${Number(addDays(monday, 4).slice(5, 7))}.`}${hasAB ? ` · ${weekKindFor(monday, abRef)}-Woche` : ''}${overdue ? ` · ${overdue} überfällig` : ''}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center">
              <IconButton label="Vorige Woche" onClick={() => setOffset(offset - 1)}><ChevronLeft size={22} /></IconButton>
              {offset !== 0 && <Button variant="ghost" onClick={() => setOffset(0)}>Heute</Button>}
              <IconButton label="Nächste Woche" onClick={() => setOffset(offset + 1)}><ChevronRight size={22} /></IconButton>
            </div>
            <Button variant={showDue ? 'secondary' : 'ghost'} onClick={() => db.settings.put({ key: 'ttShowDue', value: !showDue })} aria-pressed={showDue}>Aufgaben</Button>
            {hasAB && <Segmented value={week} onChange={setWeek} options={[{ value: 'A', label: 'Woche A' }, { value: 'B', label: 'Woche B' }]} />}
            <Button variant="primary" onClick={() => setEdit({ day, period: 1, length: 1, week: 'alle' })}>
              <Plus size={18} /> Stunde
            </Button>
          </div>
        }
      />

      {/* Wide: full week grid */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface p-2 md:block">
        <div className="grid min-w-[640px]" style={{ gridTemplateColumns: '4.5rem repeat(5, minmax(0, 1fr))', gridTemplateRows: `3rem ${showDue ? 'auto' : '0'} ${template}` }}>
          <div />
          {DAYS.map((d) => (
            <div key={d} className={cx('flex items-center justify-center rounded-md text-sm font-semibold', showingCurrentWeek && d === todayIdx ? 'bg-ink text-paper' : 'text-ink-2')} style={{ gridColumn: d + 2, gridRow: 1 }}>
              <span className="flex flex-col items-center leading-tight">
                {DAY_NAMES[d]}
                <span className={cx('text-xs font-normal', showingCurrentWeek && d === todayIdx ? 'text-paper/80' : 'text-ink-3')}>{Number(dateOf(d).slice(8))}.{Number(dateOf(d).slice(5, 7))}.</span>
              </span>
            </div>
          ))}
          {showDue && (
            <>
              <div className="flex items-start justify-end pt-1.5 pr-2 text-xs font-semibold text-ink-3" style={{ gridColumn: 1, gridRow: 2 }}>Fällig</div>
              {DAYS.map((d) => (
                <div key={d} className="m-0.5 mb-2 flex min-h-9 min-w-0 flex-col gap-1 rounded-lg bg-sunken/50 p-1" style={{ gridColumn: d + 2, gridRow: 2 }}>
                  {dueList(dateOf(d), true)}
                  {!openTasksOn(dateOf(d)).length && !examsOn(dateOf(d)).length && !shiftsOn(dateOf(d)).length && !doneTasksOn(dateOf(d)).length && <button type="button" aria-label={`Aufgabe für ${DAY_NAMES[d]} eintragen`} onClick={() => { setTaskDefaults({ due: dateOf(d) }); setEditTask(null) }} className="flex min-h-7 items-center justify-center rounded-md text-ink-3 opacity-60 hover:bg-sunken hover:opacity-100">
                    <Plus size={14} />
                  </button>}
                </div>
              ))}
            </>
          )}
          {periods.map((p) => {
            const r = (rowOf.get(p.nr) ?? 0) + 2
            const active = showingCurrentWeek && nowPeriod?.nr === p.nr && todayIdx < 5
            return (
              <div key={p.nr} className="contents">
                <div className={cx('flex flex-col items-end justify-center pr-2 text-xs leading-tight tabular', active ? 'text-brass' : 'text-ink-3')} style={{ gridColumn: 1, gridRow: r }}>
                  <span className={cx('text-sm font-bold', active ? 'text-brass' : 'text-ink-2')}>{p.nr}.</span>
                  <span>{p.start}</span>
                  <span>{p.end}</span>
                </div>
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-label={`${DAY_NAMES[d]}, ${p.nr}. Stunde eintragen`}
                    onClick={() => setEdit({ day: d, period: p.nr, length: 1, week: 'alle' })}
                    className="m-0.5 rounded-lg border border-dashed border-line/70 hover:border-brass hover:bg-brass-soft/40"
                    style={{ gridColumn: d + 2, gridRow: r }}
                  />
                ))}
              </div>
            )
          })}
          {visible.map((l) => cell({ ...l, period: l.period }))}
        </div>
      </div>

      {/* Narrow (Split View, portrait 1/3): one day at a time */}
      <div className="md:hidden">
        <Segmented className="mb-3 w-full" value={day} onChange={setDay} options={DAYS.map((d) => ({ value: d, label: DAY_SHORT[d] }))} />
        {showDue && (
          <div className="mb-3 space-y-1 rounded-xl border border-line bg-surface p-2">
            <div className="flex items-center justify-between px-1.5">
              <span className="text-sm font-semibold text-ink-2">Fällig am {DAY_NAMES[day]}, {Number(dateOf(day).slice(8))}.{Number(dateOf(day).slice(5, 7))}.</span>
              <IconButton label="Aufgabe eintragen" onClick={() => { setTaskDefaults({ due: dateOf(day) }); setEditTask(null) }}><Plus size={18} /></IconButton>
            </div>
            {dueList(dateOf(day), false)}
          </div>
        )}
        <ol className="space-y-2">
          {periods.map((p) => {
            const l = visible.find((x) => x.day === day && x.period === p.nr)
            const covered = visible.some((x) => x.day === day && x.period < p.nr && x.period + x.length - 1 >= p.nr)
            if (covered) return null
            const s = l ? byId.get(l.subjectId) : undefined
            const last = l ? periods.find((q) => q.nr === l.period + l.length - 1) : undefined
            return (
              <li key={p.nr}>
                <button
                  type="button"
                  onClick={() => setEdit(l ?? { day, period: p.nr, length: 1, week: 'alle' })}
                  className={cx('flex min-h-14 w-full items-stretch gap-3 rounded-xl border text-left', l ? 'border-line bg-surface' : 'border-dashed border-line')}
                >
                  <span className="flex w-16 shrink-0 flex-col justify-center pl-3 text-xs text-ink-3 tabular">
                    <span className="text-sm font-bold text-ink-2">{p.nr}.{l && l.length > 1 ? `–${l.period + l.length - 1}.` : ''}</span>
                    {p.start}–{last?.end ?? p.end}
                  </span>
                  {l ? (
                    <span className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-3">
                      <span className="w-1 self-stretch rounded-full" style={{ background: s?.color }} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{s?.name}</span>
                        <span className="text-sm text-ink-2">{[l.room || s?.room, l.week !== 'alle' && `nur Woche ${l.week}`].filter(Boolean).join(' · ')}</span>
                      </span>
                    </span>
                  ) : (
                    <span className="self-center text-sm text-ink-3">frei</span>
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {showDue && [5, 6].some((d) => openTasksOn(dateOf(d)).length || examsOn(dateOf(d)).length || shiftsOn(dateOf(d)).length) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[5, 6].map((d) => (
            <div key={d} className="rounded-xl border border-line bg-surface p-2">
              <div className="px-1.5 pb-1 text-sm font-semibold text-ink-2">{DAY_NAMES[d]}, {Number(dateOf(d).slice(8))}.{Number(dateOf(d).slice(5, 7))}.</div>
              <div className="space-y-1">{dueList(dateOf(d), false)}</div>
              {!openTasksOn(dateOf(d)).length && !examsOn(dateOf(d)).length && !shiftsOn(dateOf(d)).length && <p className="px-1.5 text-sm text-ink-3">frei</p>}
            </div>
          ))}
        </div>
      )}

      <TaskSheet open={editTask !== undefined} task={editTask} defaultDue={taskDefaults.due} defaultSubjectId={taskDefaults.subjectId} onClose={() => setEditTask(undefined)} />
      <ExamSheet open={editExam !== undefined} exam={editExam} onClose={() => setEditExam(undefined)} />
      <ShiftSheet open={editShift !== undefined} shift={editShift} onClose={() => setEditShift(undefined)} />
      {edit && <LessonSheet key={edit.id ?? `${edit.day}-${edit.period}`} lesson={edit} onClose={() => setEdit(null)} subjects={subjects} periodsMax={periods.length} />}
      {!subjects.length && <p className="mt-4 text-ink-2">Lege zuerst unter „Fächer" deine Fächer an.</p>}
    </div>
  )
}

function LessonSheet({ lesson, onClose, subjects, periodsMax }: { lesson: Partial<Lesson>; onClose: () => void; subjects: ReturnType<typeof useSubjects>['subjects']; periodsMax: number }) {
  const [subjectId, setSubjectId] = useState<number | null>(lesson.subjectId ?? null)
  const [day, setDay] = useState(lesson.day ?? 0)
  const [period, setPeriod] = useState(lesson.period ?? 1)
  const [length, setLength] = useState(lesson.length ?? 1)
  const [week, setWeek] = useState<WeekKind>(lesson.week ?? 'alle')
  const [room, setRoom] = useState(lesson.room ?? '')
  const maxLen = Math.max(1, periodsMax - period + 1)

  const save = async () => {
    if (subjectId == null) return
    const data = { subjectId, day, period, length: Math.min(length, maxLen), week, room: room.trim() || undefined }
    if (lesson.id) await db.lessons.update(lesson.id, data)
    else await db.lessons.add(data)
    onClose()
  }
  const remove = async () => {
    if (lesson.id) await db.lessons.delete(lesson.id)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={lesson.id ? 'Stunde bearbeiten' : 'Stunde eintragen'}
      footer={
        <>
          {lesson.id && <Button variant="danger" className="mr-auto" onClick={remove}>Entfernen</Button>}
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={save} disabled={subjectId == null}>Speichern</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Fach">
          <SubjectSelect subjects={subjects} value={subjectId} onChange={setSubjectId} />
        </Field>
        <Field label="Tag">
          <Segmented className="w-full" value={day} onChange={setDay} options={DAYS.map((d) => ({ value: d, label: DAY_SHORT[d] }))} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ab Stunde">
            <Select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
              {Array.from({ length: periodsMax }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}. Stunde</option>)}
            </Select>
          </Field>
          <Field label="Dauer" hint="Doppel- und Blockstunden">
            <Select value={Math.min(length, maxLen)} onChange={(e) => setLength(Number(e.target.value))}>
              {Array.from({ length: Math.min(6, maxLen) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? '1 Stunde' : `${n} Stunden`}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Woche" hint="Für Fächer, die nur jede zweite Woche stattfinden">
          <Segmented<WeekKind> className="w-full" value={week} onChange={setWeek} options={[{ value: 'alle', label: 'Jede Woche' }, { value: 'A', label: 'Nur A' }, { value: 'B', label: 'Nur B' }]} />
        </Field>
        <Field label="Raum (optional)">
          <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="z. B. E104" />
        </Field>
      </div>
    </Sheet>
  )
}
