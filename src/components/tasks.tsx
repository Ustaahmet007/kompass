import { useRef, useState, type PointerEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Trash2, CircleDot } from 'lucide-react'
import { db, type Priority, type Task, type TaskStatus } from '../db'
import { formatDate, relativeDay, todayISO } from '../lib/date'
import { useSubjects } from '../lib/hooks'
import { Button, Field, Input, Segmented, Sheet, SubjectSelect, SubjectTag, Textarea, cx } from './ui'

export const PRIORITY_LABEL: Record<Priority, string> = { 1: 'Hoch', 2: 'Mittel', 3: 'Niedrig' }
export const STATUS_LABEL: Record<TaskStatus, string> = { offen: 'Offen', inArbeit: 'In Arbeit', erledigt: 'Erledigt' }

/** Open tasks that are due today or overdue — drives the badge. */
export function useDueCount() {
  return useLiveQuery(async () => {
    const t = todayISO()
    return db.tasks.filter((x) => x.status !== 'erledigt' && !!x.due && x.due <= t).count()
  }, [], 0)
}

export function toggleDone(task: Task) {
  const done = task.status !== 'erledigt'
  return db.tasks.update(task.id!, { status: done ? 'erledigt' : 'offen', doneAt: done ? Date.now() : null })
}

const SWIPE = 90

export function TaskRow({ task, onOpen, onDelete, showSubject = true }: { task: Task; onOpen: (t: Task) => void; onDelete: (t: Task) => void; showSubject?: boolean }) {
  const { byId } = useSubjects()
  const subject = task.subjectId ? byId.get(task.subjectId) : undefined
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; locked: boolean | null } | null>(null)
  const moved = useRef(false)
  const today = todayISO()
  const done = task.status === 'erledigt'
  const overdue = !done && !!task.due && task.due < today
  const dueToday = !done && task.due === today

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return
    start.current = { x: e.clientX, y: e.clientY, locked: null }
    moved.current = false
  }
  const onMove = (e: PointerEvent) => {
    const s = start.current
    if (!s) return
    const ddx = e.clientX - s.x
    const ddy = e.clientY - s.y
    if (s.locked === null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) s.locked = Math.abs(ddx) > Math.abs(ddy)
    if (s.locked) {
      moved.current = true
      setDx(Math.max(-140, Math.min(140, ddx)))
    }
  }
  const onUp = () => {
    if (dx > SWIPE) toggleDone(task)
    else if (dx < -SWIPE) onDelete(task)
    start.current = null
    setDx(0)
  }

  return (
    <li className="relative overflow-hidden">
      {dx !== 0 && (
        <div className={cx('absolute inset-0 flex items-center px-5 text-white', dx > 0 ? 'justify-start bg-ok' : 'justify-end bg-danger')}>
          {dx > 0 ? <Check size={22} /> : <Trash2 size={22} />}
        </div>
      )}
      <div
        className="relative flex items-center gap-3 bg-surface py-2 pr-3 pl-1 touch-pan-y"
        style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? 'transform 160ms ease-out' : 'none' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <button
          type="button"
          onClick={() => toggleDone(task)}
          aria-label={done ? 'Als offen markieren' : 'Als erledigt markieren'}
          className="flex size-11 shrink-0 items-center justify-center"
        >
          <span
            className={cx(
              'flex size-6 items-center justify-center rounded-md border-2',
              done ? 'border-ok bg-ok text-white' : overdue ? 'border-danger' : 'border-ink-3',
            )}
          >
            {done && <Check size={16} strokeWidth={3} />}
          </span>
        </button>
        <button type="button" className="min-w-0 flex-1 py-1 text-left" onClick={() => !moved.current && onOpen(task)}>
          <span className={cx('block truncate font-medium', done && 'text-ink-3 line-through')}>{task.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
            {showSubject && <SubjectTag subject={subject} />}
            {task.due && (
              <span className={cx(overdue && 'font-semibold text-danger', dueToday && 'font-semibold text-brass')}>
                {overdue ? `überfällig · ${formatDate(task.due)}` : `${relativeDay(task.due)} · ${formatDate(task.due, { weekday: 'short', day: 'numeric', month: 'short' })}`}
              </span>
            )}
            {task.status === 'inArbeit' && (
              <span className="inline-flex items-center gap-1 text-brass">
                <CircleDot size={13} /> in Arbeit
              </span>
            )}
          </span>
        </button>
        {!done && task.priority === 1 && <span className="shrink-0 rounded-md bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">Hoch</span>}
      </div>
    </li>
  )
}

export function TaskSheet({ open, onClose, task, defaultSubjectId, defaultDue }: { open: boolean; onClose: () => void; task?: Task | null; defaultSubjectId?: number | null; defaultDue?: string }) {
  return open ? <TaskForm key={task?.id ?? 'new'} onClose={onClose} task={task} defaultSubjectId={defaultSubjectId} defaultDue={defaultDue} /> : null
}

function TaskForm({ onClose, task, defaultSubjectId, defaultDue }: { onClose: () => void; task?: Task | null; defaultSubjectId?: number | null; defaultDue?: string }) {
  const { subjects } = useSubjects()
  const [title, setTitle] = useState(task?.title ?? '')
  const [subjectId, setSubjectId] = useState<number | null>(task?.subjectId ?? defaultSubjectId ?? null)
  const [due, setDue] = useState(task?.due ?? defaultDue ?? '')
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 2)
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'offen')
  const [notes, setNotes] = useState(task?.notes ?? '')

  const save = async () => {
    if (!title.trim()) return
    const data = {
      title: title.trim(), subjectId, due: due || null, priority, status, notes: notes.trim() || undefined,
      doneAt: status === 'erledigt' ? task?.doneAt ?? Date.now() : null,
    }
    if (task?.id) await db.tasks.update(task.id, data)
    else await db.tasks.add({ ...data, createdAt: Date.now() })
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>Speichern</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Field label="Titel">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Hausübung Kapitel 4" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fach">
            <SubjectSelect subjects={subjects} value={subjectId} onChange={setSubjectId} allowNone />
          </Field>
          <Field label="Fällig am">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <Field label="Priorität">
          <Segmented<Priority> className="w-full" value={priority} onChange={setPriority} options={[1, 2, 3].map((p) => ({ value: p as Priority, label: PRIORITY_LABEL[p as Priority] }))} />
        </Field>
        <Field label="Status">
          <Segmented<TaskStatus> className="w-full" value={status} onChange={setStatus} options={(['offen', 'inArbeit', 'erledigt'] as TaskStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
        </Field>
        <Field label="Notizen">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}
