import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { db, type Lesson, type WeekKind } from '../db'
import { DAY_NAMES, DAY_SHORT, minutesOf, mondayOf, weekKindFor, weekdayIndex } from '../lib/date'
import { useNow, usePeriods, useSetting, useSubjects, useToday } from '../lib/hooks'
import { Button, Field, Input, PageHeader, Segmented, Select, Sheet, SubjectSelect, cx } from '../components/ui'

const DAYS = [0, 1, 2, 3, 4]

export default function Timetable() {
  const today = useToday()
  const now = useNow()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const periods = usePeriods()
  const { subjects, byId } = useSubjects()
  const lessons = useLiveQuery(() => db.lessons.toArray(), [], [] as Lesson[])
  const abRef = useSetting('abReference', mondayOf(today))
  const currentKind = weekKindFor(today, abRef)
  const [week, setWeek] = useState<'A' | 'B'>(currentKind)
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

  const showingCurrentWeek = !hasAB || week === currentKind
  const nowPeriod = periods.find((p) => nowMin >= minutesOf(p.start) && nowMin < minutesOf(p.end))

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
        className={cx('relative m-0.5 flex min-w-0 flex-col items-start overflow-hidden rounded-lg px-2 py-1.5 text-left text-white', isNow && 'ring-3 ring-brass ring-offset-2 ring-offset-surface')}
        style={{ gridColumn: l.day + 2, gridRow: `${r0 + 1} / ${(r1 ?? r0) + 2}` /* +1: row 1 is the day header */, background: s?.color ?? '#64748b' }}
      >
        <span className="w-full truncate text-[15px] leading-tight font-bold">{s?.short ?? '?'}</span>
        {l.length > 1 && <span className="w-full truncate text-xs opacity-90">{s?.name}</span>}
        {(l.room || s?.room) && <span className="mt-auto w-full truncate text-xs opacity-90">{l.room || s?.room}</span>}
        {l.week !== 'alle' && <span className="absolute top-1 right-1.5 text-[10px] font-bold opacity-90">{l.week}</span>}
      </button>
    )
  }

  return (
    <div>
      <PageHeader
        title="Stundenplan"
        subtitle={hasAB ? `Diese Woche ist eine ${currentKind}-Woche.` : 'Tippe auf eine freie Stunde, um etwas einzutragen.'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {hasAB && <Segmented value={week} onChange={setWeek} options={[{ value: 'A', label: 'Woche A' }, { value: 'B', label: 'Woche B' }]} />}
            <Button variant="primary" onClick={() => setEdit({ day, period: 1, length: 1, week: 'alle' })}>
              <Plus size={18} /> Stunde
            </Button>
          </div>
        }
      />

      {/* Wide: full week grid */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface p-2 md:block">
        <div className="grid min-w-[640px]" style={{ gridTemplateColumns: '4.25rem repeat(5, minmax(0, 1fr))', gridTemplateRows: `2.5rem ${template}` }}>
          <div />
          {DAYS.map((d) => (
            <div key={d} className={cx('flex items-center justify-center rounded-md text-sm font-semibold', showingCurrentWeek && d === todayIdx ? 'bg-ink text-paper' : 'text-ink-2')} style={{ gridColumn: d + 2, gridRow: 1 }}>
              {DAY_NAMES[d]}
            </div>
          ))}
          {periods.map((p) => {
            const r = (rowOf.get(p.nr) ?? 0) + 1
            const active = showingCurrentWeek && nowPeriod?.nr === p.nr && todayIdx < 5
            return (
              <div key={p.nr} className="contents">
                <div className={cx('flex flex-col items-end justify-center pr-2 text-xs leading-tight tabular', active ? 'text-brass' : 'text-ink-3')} style={{ gridColumn: 1, gridRow: r }}>
                  <span className={cx('text-sm font-bold', active ? 'text-brass' : 'text-ink-2')}>{p.nr}.</span>
                  <span>{p.start}</span>
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
