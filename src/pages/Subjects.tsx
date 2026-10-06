import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ChevronRight, Plus } from 'lucide-react'
import { db, type Lesson } from '../db'
import { weightSum } from '../lib/grades'
import { useSubjects } from '../lib/hooks'
import { SubjectSheet } from '../components/SubjectSheet'
import { Button, Empty, PageHeader, Panel } from '../components/ui'

export default function Subjects() {
  const { subjects } = useSubjects()
  const lessons = useLiveQuery(() => db.lessons.toArray(), [], [] as Lesson[])
  const [adding, setAdding] = useState(false)

  return (
    <div>
      <PageHeader
        title="Fächer"
        subtitle={`${subjects.length} ${subjects.length === 1 ? 'Fach' : 'Fächer'}`}
        action={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={18} /> Fach</Button>}
      />
      <Panel>
        {subjects.length ? (
          <ul className="divide-y divide-line">
            {subjects.map((s) => {
              const hours = lessons.filter((l) => l.subjectId === s.id).reduce((a, l) => a + l.length * (l.week === 'alle' ? 1 : 0.5), 0)
              const sum = weightSum(s)
              return (
                <li key={s.id}>
                  <Link to={`/fach/${s.id}`} className="flex min-h-16 items-center gap-4 px-4 py-2.5 hover:bg-sunken">
                    <span className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: s.color }}>{s.short}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.name}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
                        <span>{hours ? `${String(hours).replace('.', ',')} Std./Woche` : 'nicht im Stundenplan'}</span>
                        {s.teacher && <span>· {s.teacher}</span>}
                        {sum !== 100 && <span className="inline-flex items-center gap-1 font-semibold text-danger"><AlertTriangle size={13} /> Gewichtung {sum} %</span>}
                      </p>
                    </div>
                    <ChevronRight size={20} className="shrink-0 text-ink-3" />
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty action={<Button onClick={() => setAdding(true)}>Erstes Fach anlegen</Button>}>Noch keine Fächer.</Empty>
        )}
      </Panel>
      <SubjectSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}
