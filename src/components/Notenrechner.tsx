import { useState } from 'react'
import type { Grade, Subject } from '../db'
import { formatAvg, gradeColor, gradeName, neededGrade, projectedGrade, weightedAverage } from '../lib/grades'
import { Field, Segmented, Select, SubjectSelect } from './ui'

export function Notenrechner({ subjects, grades, fixedSubject }: { subjects: Subject[]; grades: Grade[]; fixedSubject?: Subject }) {
  const [pickedId, setPickedId] = useState<number | null>(fixedSubject?.id ?? subjects[0]?.id ?? null)
  const subject = fixedSubject ?? subjects.find((s) => s.id === pickedId) ?? subjects[0]
  const [target, setTarget] = useState(2)
  const [catPick, setCatPick] = useState('')
  if (!subject) return <p className="px-4 pb-4 text-ink-2">Lege zuerst ein Fach an.</p>

  const cats = subject.categories
  const defaultCat = cats.find((c) => c.name === 'Schularbeit')?.name ?? cats[0]?.name ?? ''
  const category = cats.some((c) => c.name === catPick) ? catPick : defaultCat
  const own = grades.filter((g) => g.subjectId === subject.id)
  const avg = weightedAverage(subject, own)
  const res = category ? neededGrade(subject, own, target, category) : null

  return (
    <div className="space-y-4 px-4 pb-4">
      {!fixedSubject && (
        <Field label="Fach">
          <SubjectSelect subjects={subjects} value={subject.id} onChange={setPickedId} />
        </Field>
      )}
      <Field label="Ziel im Zeugnis">
        <Segmented className="w-full" value={target} onChange={setTarget} options={[1, 2, 3, 4].map((v) => ({ value: v, label: `${v}` }))} />
      </Field>
      <Field label="Nächste Leistung">
        <Select value={category} onChange={(e) => setCatPick(e.target.value)}>
          {cats.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.weight} %)</option>)}
        </Select>
      </Field>

      <div className="rounded-lg bg-sunken p-4" aria-live="polite">
        <p className="text-sm text-ink-2">
          Jetzt: Schnitt {formatAvg(avg)}
          {avg != null && <> · Tendenz {projectedGrade(avg)}</>}
        </p>
        {res?.needed == null ? (
          <p className="mt-1 font-semibold text-danger">Mit einer einzigen {category} ist eine {target} nicht mehr erreichbar.</p>
        ) : res.safe ? (
          <p className="mt-1 font-semibold text-ok">Die {target} hältst du auch mit einem Fünfer bei der nächsten {category}.</p>
        ) : (
          <div className="mt-2 flex items-center gap-4">
            <span className="display flex size-16 shrink-0 items-center justify-center rounded-full text-3xl text-white" style={{ background: gradeColor(res.needed) }}>
              {res.needed}
            </span>
            <p>
              Du brauchst mindestens ein <strong>{gradeName(res.needed)}</strong> bei der nächsten {category}, dann stehst du bei {formatAvg(res.resultingAvg)}.
            </p>
          </div>
        )}
      </div>
      <p className="text-sm text-ink-3">Gerechnet mit gerundetem Schnitt (x,5 rundet zur schlechteren Note). Die Zeugnisnote legt am Ende die Lehrkraft fest.</p>
    </div>
  )
}
