import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, Plus } from 'lucide-react'
import { db, type Grade } from '../db'
import { formatAvg, gradeColor, projectedGrade, runningAverages, weightSum, weightedAverage } from '../lib/grades'
import { useSubjects } from '../lib/hooks'
import { GradeSheet } from '../components/forms'
import { GradeTrend } from '../components/GradeTrend'
import { Notenrechner } from '../components/Notenrechner'
import { Button, Empty, GradeChip, PageHeader, Panel, SubjectTag } from '../components/ui'

export default function Grades() {
  const { subjects } = useSubjects()
  const grades = useLiveQuery(() => db.grades.toArray(), [], [] as Grade[])
  const [adding, setAdding] = useState(false)

  const rows = subjects.map((s) => {
    const own = grades.filter((g) => g.subjectId === s.id)
    const avg = weightedAverage(s, own)
    return { s, own, avg, projected: projectedGrade(avg), sum: weightSum(s) }
  })
  const graded = rows.filter((r) => r.avg != null)
  const overall = graded.length ? graded.reduce((a, r) => a + r.avg!, 0) / graded.length : null
  const ordered = [...graded.sort((a, b) => b.avg! - a.avg!), ...rows.filter((r) => r.avg == null)]
  const atRisk = graded.filter((r) => r.projected === 5)

  return (
    <div>
      <PageHeader
        title="Noten"
        subtitle={overall != null ? <>Gesamtschnitt <strong className="tabular" style={{ color: gradeColor(overall) }}>{formatAvg(overall)}</strong> über {graded.length} {graded.length === 1 ? 'Fach' : 'Fächer'}</> : 'Noch keine Noten eingetragen.'}
        action={<Button variant="primary" onClick={() => setAdding(true)} disabled={!subjects.length}><Plus size={18} /> Note</Button>}
      />

      {atRisk.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl bg-danger-soft px-4 py-3 text-danger">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
          <p><strong>Achtung:</strong> In {atRisk.map((r) => r.s.short).join(', ')} steht die Tendenz auf Nicht genügend.</p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Nach Fach" action={<span className="text-sm text-ink-3">schlechtester Schnitt zuerst</span>}>
          {rows.length ? (
            <ul className="divide-y divide-line">
              {ordered.map(({ s, own, avg, projected, sum }) => (
                <li key={s.id}>
                  <Link to={`/fach/${s.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                    {projected != null ? <GradeChip value={projected} /> : <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-line text-ink-3">–</span>}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <SubjectTag subject={s} />
                        <span className="truncate font-semibold">{s.name}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
                        <span className="tabular">Schnitt {formatAvg(avg)}</span>
                        <span className="text-ink-3">· {own.length} {own.length === 1 ? 'Note' : 'Noten'}</span>
                        {sum !== 100 && (
                          <span className="inline-flex items-center gap-1 font-semibold text-danger">
                            <AlertTriangle size={13} /> Gewichtung {sum} %
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="hidden sm:block"><GradeTrend compact points={runningAverages(s, own)} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty action={<Link to="/faecher"><Button>Fächer anlegen</Button></Link>}>Noch keine Fächer.</Empty>
          )}
        </Panel>

        <Panel title="Notenrechner" className="self-start">
          <Notenrechner subjects={subjects} grades={grades} />
        </Panel>
      </div>

      <GradeSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}
