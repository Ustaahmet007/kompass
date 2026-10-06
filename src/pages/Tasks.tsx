import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { db, type Task } from '../db'
import { addDays } from '../lib/date'
import { useSubjects, useToday } from '../lib/hooks'
import { TaskRow, TaskSheet } from '../components/tasks'
import { Button, Empty, PageHeader, Panel, Segmented, Select, useConfirm } from '../components/ui'

type StatusFilter = 'offen' | 'erledigt' | 'alle'
type Sort = 'faellig' | 'prioritaet'

export default function Tasks() {
  const today = useToday()
  const { subjects } = useSubjects()
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], [] as Task[])
  const [status, setStatus] = useState<StatusFilter>('offen')
  const [subjectId, setSubjectId] = useState<string>('')
  const [sort, setSort] = useState<Sort>('faellig')
  const [edit, setEdit] = useState<Task | null | undefined>(undefined)
  const confirm = useConfirm()

  const filtered = tasks.filter(
    (t) =>
      (status === 'alle' || (status === 'offen' ? t.status !== 'erledigt' : t.status === 'erledigt')) &&
      (!subjectId || String(t.subjectId ?? '') === subjectId),
  )
  const byDue = (a: Task, b: Task) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.priority - b.priority
  const byPrio = (a: Task, b: Task) => a.priority - b.priority || byDue(a, b)
  const sorted = [...filtered].sort(status === 'erledigt' ? (a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0) : sort === 'faellig' ? byDue : byPrio)

  const del = async (t: Task) => {
    if (await confirm.ask(`„${t.title}" wird gelöscht.`)) await db.tasks.delete(t.id!)
  }

  const weekEnd = addDays(today, 7)
  const groups: { label: string; items: Task[]; danger?: boolean }[] =
    sort === 'faellig' && status !== 'erledigt'
      ? [
          { label: 'Überfällig', items: sorted.filter((t) => t.status !== 'erledigt' && t.due && t.due < today), danger: true },
          { label: 'Heute', items: sorted.filter((t) => t.due === today) },
          { label: 'Morgen', items: sorted.filter((t) => t.due === addDays(today, 1)) },
          { label: 'Nächste 7 Tage', items: sorted.filter((t) => t.due && t.due > addDays(today, 1) && t.due <= weekEnd) },
          { label: 'Später', items: sorted.filter((t) => t.due && t.due > weekEnd) },
          { label: 'Ohne Datum', items: sorted.filter((t) => !t.due) },
          // erledigte, aber überfällig gewesene Aufgaben (bei "Alle")
          { label: 'Erledigt', items: status === 'alle' ? sorted.filter((t) => t.status === 'erledigt' && t.due && t.due < today) : [] },
        ].filter((g) => g.items.length)
      : [{ label: '', items: sorted }]

  return (
    <div>
      <PageHeader
        title="Aufgaben"
        subtitle="Wischen nach rechts erledigt, nach links löscht."
        action={<Button variant="primary" onClick={() => setEdit(null)}><Plus size={18} /> Aufgabe</Button>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented<StatusFilter> value={status} onChange={setStatus} options={[{ value: 'offen', label: 'Offen' }, { value: 'erledigt', label: 'Erledigt' }, { value: 'alle', label: 'Alle' }]} />
        <Select className="w-auto max-w-56" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Nach Fach filtern">
          <option value="">Alle Fächer</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.short} – {s.name}</option>)}
        </Select>
        {status !== 'erledigt' && (
          <Segmented<Sort> value={sort} onChange={setSort} options={[{ value: 'faellig', label: 'Nach Datum' }, { value: 'prioritaet', label: 'Nach Priorität' }]} />
        )}
      </div>

      {sorted.length ? (
        <div className="space-y-5">
          {groups.map((g) => (
            <Panel key={g.label || 'all'} title={g.label ? <span className={g.danger ? 'text-danger' : undefined}>{g.label} <span className="font-normal text-ink-3">{g.items.length}</span></span> : undefined}>
              <ul className="divide-y divide-line py-1">
                {g.items.map((t) => <TaskRow key={t.id} task={t} onOpen={setEdit} onDelete={del} />)}
              </ul>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty action={status === 'offen' ? <Button onClick={() => setEdit(null)}>Aufgabe anlegen</Button> : undefined}>
            {status === 'offen' ? 'Keine offenen Aufgaben.' : 'Hier ist nichts.'}
          </Empty>
        </Panel>
      )}

      <TaskSheet open={edit !== undefined} task={edit} defaultSubjectId={subjectId ? Number(subjectId) : null} onClose={() => setEdit(undefined)} />
      {confirm.element}
    </div>
  )
}
