import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { db, type Exam } from '../db'
import { daysBetween, formatDate } from '../lib/date'
import { useSubjects, useToday } from '../lib/hooks'
import { ExamSheet } from '../components/forms'
import { Button, Empty, PageHeader, Panel, SubjectTag, cx } from '../components/ui'

export default function Exams() {
  const today = useToday()
  const exams = useLiveQuery(() => db.exams.orderBy('date').toArray(), [], [] as Exam[])
  const [edit, setEdit] = useState<Exam | null | undefined>(undefined)
  const [showPast, setShowPast] = useState(false)
  const upcoming = exams.filter((e) => e.date >= today)
  const past = exams.filter((e) => e.date < today).reverse()

  return (
    <div>
      <PageHeader
        title="Prüfungen"
        subtitle={upcoming.length ? `${upcoming.length} anstehend` : undefined}
        action={<Button variant="primary" onClick={() => setEdit(null)}><Plus size={18} /> Prüfung</Button>}
      />
      <Panel>
        {upcoming.length ? (
          <ul className="divide-y divide-line">
            {upcoming.map((e) => <ExamRow key={e.id} exam={e} today={today} onOpen={setEdit} />)}
          </ul>
        ) : (
          <Empty action={<Button onClick={() => setEdit(null)}>Prüfung eintragen</Button>}>Keine Prüfungen geplant.</Empty>
        )}
      </Panel>

      {past.length > 0 && (
        <div className="mt-5">
          <Button variant="ghost" onClick={() => setShowPast((v) => !v)}>{showPast ? 'Vergangene ausblenden' : `Vergangene anzeigen (${past.length})`}</Button>
          {showPast && (
            <Panel className="mt-2">
              <ul className="divide-y divide-line opacity-70">
                {past.map((e) => <ExamRow key={e.id} exam={e} today={today} onOpen={setEdit} />)}
              </ul>
            </Panel>
          )}
        </div>
      )}
      <ExamSheet open={edit !== undefined} exam={edit} onClose={() => setEdit(undefined)} />
    </div>
  )
}

export function ExamRow({ exam, today, onOpen, showSubject = true }: { exam: Exam; today: string; onOpen: (e: Exam) => void; showSubject?: boolean }) {
  const { byId } = useSubjects()
  const s = byId.get(exam.subjectId)
  const d = daysBetween(today, exam.date)
  const soon = d >= 0 && d <= 3
  return (
    <li>
      <button type="button" onClick={() => onOpen(exam)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-sunken">
        <div className={cx('flex w-16 shrink-0 flex-col items-center rounded-lg py-1.5', soon ? 'bg-brass text-white' : 'bg-sunken')}>
          <span className="display text-2xl tabular">{d < 0 ? '✓' : d}</span>
          <span className={cx('text-[11px] font-medium', soon ? 'text-white/90' : 'text-ink-3')}>{d < 0 ? 'vorbei' : d === 0 ? 'heute!' : d === 1 ? 'Tag' : 'Tage'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {showSubject && <SubjectTag subject={s} />}
            <span className="font-semibold">{exam.kind}{showSubject && s ? ` · ${s.name}` : ''}</span>
          </div>
          <p className="mt-0.5 truncate text-ink-2">{exam.topic || 'Kein Stoff eingetragen'}</p>
        </div>
        <span className="shrink-0 text-right text-sm text-ink-2">{formatDate(exam.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </button>
    </li>
  )
}
