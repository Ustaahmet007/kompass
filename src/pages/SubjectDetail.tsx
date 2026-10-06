import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowLeft, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { db, type Exam, type Grade, type Lesson, type Task } from '../db'
import { DAY_SHORT, formatDate } from '../lib/date'
import { formatAvg, gradeColor, gradeName, projectedGrade, runningAverages, weightSum, weightedAverage } from '../lib/grades'
import { lessonSpan, usePeriods, useSubjectColorMode, useSubjects, useToday } from '../lib/hooks'
import { displaySubjectColor } from '../lib/theme'
import { ExamSheet, GradeSheet } from '../components/forms'
import { GradeTrend, TrendLegend } from '../components/GradeTrend'
import { Notenrechner } from '../components/Notenrechner'
import { SubjectSheet, deleteSubject } from '../components/SubjectSheet'
import { TaskRow, TaskSheet } from '../components/tasks'
import { Button, Empty, GradeChip, IconButton, Panel, Sheet, useConfirm } from '../components/ui'
import { ImagePicker } from '../components/DesignSettings'
import { useImageUrl } from '../lib/images'
import { ExamRow } from './Exams'

export default function SubjectDetail() {
  const { id } = useParams()
  const subjectId = Number(id)
  const nav = useNavigate()
  const today = useToday()
  const periods = usePeriods()
  const { subjects } = useSubjects()
  const subject = useLiveQuery(() => db.subjects.get(subjectId), [subjectId])
  const grades = useLiveQuery(() => db.grades.where('subjectId').equals(subjectId).toArray(), [subjectId], [] as Grade[])
  const tasks = useLiveQuery(() => db.tasks.where('subjectId').equals(subjectId).toArray(), [subjectId], [] as Task[])
  const exams = useLiveQuery(() => db.exams.where('subjectId').equals(subjectId).sortBy('date'), [subjectId], [] as Exam[])
  const lessons = useLiveQuery(() => db.lessons.where('subjectId').equals(subjectId).toArray(), [subjectId], [] as Lesson[])
  const [editing, setEditing] = useState(false)
  const [grade, setGrade] = useState<Grade | null | undefined>(undefined)
  const [task, setTask] = useState<Task | null | undefined>(undefined)
  const [exam, setExam] = useState<Exam | null | undefined>(undefined)
  const [showDone, setShowDone] = useState(false)
  const [coverOpen, setCoverOpen] = useState(false)
  const cover = useImageUrl(subject?.coverId)
  const colorMode = useSubjectColorMode()
  const confirm = useConfirm()

  if (subject === undefined) return null
  if (!subject) {
    return <Empty action={<Link to="/faecher"><Button>Zu den Fächern</Button></Link>}>Dieses Fach gibt es nicht mehr.</Empty>
  }

  const tint = displaySubjectColor(subject.color, colorMode)
  const avg = weightedAverage(subject, grades)
  const projected = projectedGrade(avg)
  const sum = weightSum(subject)
  const openTasks = tasks.filter((t) => t.status !== 'erledigt').sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const doneTasks = tasks.filter((t) => t.status === 'erledigt')
  const upcoming = exams.filter((e) => e.date >= today)
  const sortedLessons = [...lessons].sort((a, b) => a.day - b.day || a.period - b.period)

  const remove = async () => {
    if (await confirm.ask(`„${subject.name}" wird mit allen Noten, Prüfungen und Stundenplan-Einträgen gelöscht. Aufgaben bleiben ohne Fach erhalten.`)) {
      await deleteSubject(subjectId)
      nav('/faecher')
    }
  }
  const delTask = async (t: Task) => { if (await confirm.ask(`„${t.title}" wird gelöscht.`)) await db.tasks.delete(t.id!) }

  return (
    <div>
      <button type="button" onClick={() => nav(-1)} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-ink-2 hover:text-ink">
        <ArrowLeft size={18} /> Zurück
      </button>

      {cover && (
        <div className="relative mb-5 overflow-hidden rounded-3xl">
          <img src={cover} alt="" className="h-40 w-full object-cover sm:h-52" />
          <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: tint }} />
        </div>
      )}
      <header className="mb-6 flex flex-wrap items-start gap-4 border-l-8 pl-4" style={{ borderColor: tint }}>
        <div className="min-w-0 flex-1">
          <p className="font-semibold" style={{ color: tint }}>{subject.short}</p>
          <h1 className="display text-3xl sm:text-4xl">{subject.name}</h1>
          <p className="mt-1.5 text-ink-2">
            {[subject.teacher, subject.room].filter(Boolean).join(' · ') || 'Keine Lehrkraft eingetragen'}
          </p>
          {sortedLessons.length > 0 && (
            <p className="mt-1 text-sm text-ink-3">
              {sortedLessons.map((l) => `${DAY_SHORT[l.day]} ${lessonSpan(l, periods).start}${l.length > 1 ? ` (${l.length} Std.)` : ''}${l.week !== 'alle' ? ` ${l.week}` : ''}`).join(', ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Titelbild" onClick={() => setCoverOpen(true)}><ImagePlus size={19} /></IconButton>
          <IconButton label="Fach bearbeiten" onClick={() => setEditing(true)}><Pencil size={19} /></IconButton>
          <IconButton label="Fach löschen" onClick={remove}><Trash2 size={19} /></IconButton>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Panel title="Noten" action={<Button variant="ghost" onClick={() => setGrade(null)}><Plus size={18} /> Note</Button>}>
            <div className="flex flex-wrap items-center gap-6 px-4 pt-2 pb-3">
              <div className="flex items-center gap-3">
                {projected != null ? <GradeChip value={projected} size="lg" /> : <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-line text-xl text-ink-3">–</span>}
                <div>
                  <p className="text-sm text-ink-2">Tendenz Zeugnis</p>
                  <p className="font-semibold">{projected != null ? gradeName(projected) : 'noch offen'}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-ink-2">Gewichteter Schnitt</p>
                <p className="display text-3xl tabular" style={{ color: avg != null ? gradeColor(avg) : undefined }}>{formatAvg(avg)}</p>
              </div>
            </div>
            {sum !== 100 && (
              <p className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                <AlertTriangle size={16} className="shrink-0" /> Die Gewichtung ergibt {sum} % statt 100 %. <button type="button" className="font-semibold underline" onClick={() => setEditing(true)}>Anpassen</button>
              </p>
            )}
            <div className="px-2"><GradeTrend points={runningAverages(subject, grades)} /></div>
            {grades.length > 0 && <TrendLegend />}

            <div className="border-t border-line">
              {subject.categories.map((c) => {
                const own = grades.filter((g) => g.category === c.name).sort((a, b) => a.date.localeCompare(b.date))
                const catAvg = own.length ? own.reduce((s, g) => s + g.value, 0) / own.length : null
                return (
                  <div key={c.name} className="border-b border-line px-4 py-3 last:border-b-0">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{c.name} <span className="font-normal text-ink-3">{c.weight} %</span></span>
                      <span className="text-sm text-ink-2 tabular">Ø {formatAvg(catAvg)}</span>
                    </div>
                    {own.length ? (
                      <div className="flex flex-wrap gap-2">
                        {own.map((g) => (
                          <button key={g.id} type="button" onClick={() => setGrade(g)} className="flex min-h-11 items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1 hover:bg-sunken" title={g.title}>
                            <GradeChip value={g.value} size="sm" />
                            <span className="text-sm text-ink-2">{g.title ? `${g.title} · ` : ''}{formatDate(g.date)}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-ink-3">Noch keine Note.</p>
                    )}
                  </div>
                )
              })}
            </div>
          </Panel>

          <Panel title="Aufgaben" action={<Button variant="ghost" onClick={() => setTask(null)}><Plus size={18} /> Aufgabe</Button>}>
            {openTasks.length ? (
              <ul className="divide-y divide-line">{openTasks.map((t) => <TaskRow key={t.id} task={t} onOpen={setTask} onDelete={delTask} showSubject={false} />)}</ul>
            ) : <p className="px-4 pb-3 text-ink-3">Keine offenen Aufgaben.</p>}
            {doneTasks.length > 0 && (
              <>
                <button type="button" onClick={() => setShowDone((v) => !v)} className="block min-h-11 w-full border-t border-line px-4 text-left text-sm font-medium text-brass">
                  {showDone ? 'Erledigte ausblenden' : `${doneTasks.length} erledigt anzeigen`}
                </button>
                {showDone && <ul className="divide-y divide-line">{doneTasks.map((t) => <TaskRow key={t.id} task={t} onOpen={setTask} onDelete={delTask} showSubject={false} />)}</ul>}
              </>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Prüfungen" action={<Button variant="ghost" onClick={() => setExam(null)}><Plus size={18} /> Prüfung</Button>}>
            {upcoming.length ? (
              <ul className="divide-y divide-line">{upcoming.map((e) => <ExamRow key={e.id} exam={e} today={today} onOpen={setExam} showSubject={false} />)}</ul>
            ) : <p className="px-4 pb-3 text-ink-3">Keine anstehend.</p>}
          </Panel>
          <Panel title="Notenrechner">
            <Notenrechner subjects={subjects} grades={grades} fixedSubject={subject} />
          </Panel>
        </div>
      </div>

      <SubjectSheet open={editing} subject={subject} onClose={() => setEditing(false)} />
      <GradeSheet open={grade !== undefined} grade={grade} defaultSubjectId={subjectId} onClose={() => setGrade(undefined)} />
      <TaskSheet open={task !== undefined} task={task} defaultSubjectId={subjectId} onClose={() => setTask(undefined)} />
      <ExamSheet open={exam !== undefined} exam={exam} defaultSubjectId={subjectId} onClose={() => setExam(undefined)} />
      <Sheet open={coverOpen} onClose={() => setCoverOpen(false)} title={`Titelbild für ${subject.short}`}>
        <ImagePicker value={subject.coverId} onChange={(id) => db.subjects.update(subjectId, { coverId: id })} label="Titelbild" />
        <p className="mt-3 text-sm text-ink-3">Zum Beispiel ein Foto von deiner Schaltung, deinem Heft oder was dich an das Fach erinnert.</p>
      </Sheet>
      {confirm.element}
    </div>
  )
}
