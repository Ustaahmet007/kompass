import { useState } from 'react'
import { db, type Exam, type ExamKind, type Grade } from '../db'
import { todayISO } from '../lib/date'
import { gradeColor, gradeName } from '../lib/grades'
import { useSubjects } from '../lib/hooks'
import { Button, Field, Input, Select, Sheet, SubjectSelect, Textarea, cx } from './ui'

export const EXAM_KINDS: ExamKind[] = ['Schularbeit', 'Test', 'Prüfung', 'Abgabe']

export function ExamSheet({ open, onClose, exam, defaultSubjectId, defaultDate }: { open: boolean; onClose: () => void; exam?: Exam | null; defaultSubjectId?: number | null; defaultDate?: string }) {
  return open ? <ExamForm key={exam?.id ?? 'new'} onClose={onClose} exam={exam} defaultSubjectId={defaultSubjectId} defaultDate={defaultDate} /> : null
}

function ExamForm({ onClose, exam, defaultSubjectId, defaultDate }: { onClose: () => void; exam?: Exam | null; defaultSubjectId?: number | null; defaultDate?: string }) {
  const { subjects } = useSubjects()
  const [subjectId, setSubjectId] = useState<number | null>(exam?.subjectId ?? defaultSubjectId ?? null)
  const [date, setDate] = useState(exam?.date ?? defaultDate ?? todayISO())
  const [kind, setKind] = useState<ExamKind>(exam?.kind ?? 'Schularbeit')
  const [topic, setTopic] = useState(exam?.topic ?? '')
  const valid = subjectId != null && !!date

  const save = async () => {
    if (!valid) return
    const data = { subjectId: subjectId!, date, kind, topic: topic.trim() }
    if (exam?.id) await db.exams.update(exam.id, data)
    else await db.exams.add(data)
    onClose()
  }
  const remove = async () => {
    if (exam?.id) await db.exams.delete(exam.id)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={exam ? 'Prüfung bearbeiten' : 'Neue Prüfung'}
      footer={
        <>
          {exam && <Button variant="danger" className="mr-auto" onClick={remove}>Löschen</Button>}
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={save} disabled={!valid}>Speichern</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fach">
            <SubjectSelect subjects={subjects} value={subjectId} onChange={setSubjectId} />
          </Field>
          <Field label="Art">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ExamKind)}>
              {EXAM_KINDS.map((k) => <option key={k}>{k}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Datum">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Stoff">
          <Textarea rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="z. B. Timer0, CTC-Modus, Prescaler" />
        </Field>
      </div>
    </Sheet>
  )
}

export function GradeSheet({ open, onClose, grade, defaultSubjectId }: { open: boolean; onClose: () => void; grade?: Grade | null; defaultSubjectId?: number | null }) {
  return open ? <GradeForm key={grade?.id ?? 'new'} onClose={onClose} grade={grade} defaultSubjectId={defaultSubjectId} /> : null
}

function GradeForm({ onClose, grade, defaultSubjectId }: { onClose: () => void; grade?: Grade | null; defaultSubjectId?: number | null }) {
  const { subjects, byId } = useSubjects()
  const [subjectId, setSubjectId] = useState<number | null>(grade?.subjectId ?? defaultSubjectId ?? null)
  const subject = subjectId != null ? byId.get(subjectId) : undefined
  const [category, setCategory] = useState(grade?.category ?? '')
  const [value, setValue] = useState<number>(grade?.value ?? 0)
  const [date, setDate] = useState(grade?.date ?? todayISO())
  const [title, setTitle] = useState(grade?.title ?? '')
  const cats = subject?.categories ?? []
  const cat = category && cats.some((c) => c.name === category) ? category : cats[0]?.name ?? category
  const valid = subjectId != null && value >= 1 && value <= 5 && !!cat

  const save = async () => {
    if (!valid) return
    const data = { subjectId: subjectId!, category: cat, value, date, title: title.trim() || undefined }
    if (grade?.id) await db.grades.update(grade.id, data)
    else await db.grades.add(data)
    onClose()
  }
  const remove = async () => {
    if (grade?.id) await db.grades.delete(grade.id)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={grade ? 'Note bearbeiten' : 'Neue Note'}
      footer={
        <>
          {grade && <Button variant="danger" className="mr-auto" onClick={remove}>Löschen</Button>}
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={save} disabled={!valid}>Speichern</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Fach">
          <SubjectSelect subjects={subjects} value={subjectId} onChange={setSubjectId} />
        </Field>
        <Field label="Note">
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setValue(v)}
                aria-pressed={value === v}
                className={cx('flex min-h-14 flex-col items-center justify-center rounded-lg border-2 font-bold tabular transition-colors', value === v ? 'text-white' : 'border-line text-ink')}
                style={value === v ? { background: gradeColor(v), borderColor: gradeColor(v) } : undefined}
              >
                <span className="text-xl">{v}</span>
                <span className="text-[10px] font-medium opacity-80">{gradeName(v)}</span>
              </button>
            ))}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kategorie">
            <Select value={cat} onChange={(e) => setCategory(e.target.value)} disabled={!cats.length}>
              {cats.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.weight} %)</option>)}
            </Select>
          </Field>
          <Field label="Datum">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Bezeichnung (optional)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. 1. Schularbeit" />
        </Field>
      </div>
    </Sheet>
  )
}
