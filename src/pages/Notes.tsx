import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Plus, Search, Trash2 } from 'lucide-react'
import { db, type Note } from '../db'
import { useSubjects } from '../lib/hooks'
import { Button, Empty, IconButton, Input, PageHeader, Panel, Select, SubjectSelect, SubjectTag, cx, useConfirm } from '../components/ui'

function snippet(body: string, q: string) {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (!q) return flat.slice(0, 110)
  const i = flat.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return flat.slice(0, 110)
  const start = Math.max(0, i - 40)
  return (start ? '…' : '') + flat.slice(start, start + 110)
}

export default function Notes() {
  const { id } = useParams()
  const nav = useNavigate()
  const { subjects, byId } = useSubjects()
  const notes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray(), [], [] as Note[])
  const [q, setQ] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const selectedId = id ? Number(id) : null

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return notes.filter(
      (n) =>
        (!subjectFilter || String(n.subjectId ?? '') === subjectFilter) &&
        (!needle || n.title.toLowerCase().includes(needle) || n.body.toLowerCase().includes(needle) || (byId.get(n.subjectId ?? -1)?.short.toLowerCase() === needle)),
    )
  }, [notes, q, subjectFilter, byId])

  const create = async () => {
    const now = Date.now()
    const newId = await db.notes.add({ title: '', body: '', subjectId: subjectFilter ? Number(subjectFilter) : null, createdAt: now, updatedAt: now })
    nav(`/notizen/${newId}`)
  }

  const list = (
    <Panel className="overflow-hidden">
      {filtered.length ? (
        <ul className="divide-y divide-line">
          {filtered.map((n) => (
            <li key={n.id}>
              <Link to={`/notizen/${n.id}`} className={cx('block px-4 py-3 hover:bg-sunken', n.id === selectedId && 'bg-sunken')}>
                <div className="flex items-center gap-2">
                  <SubjectTag subject={byId.get(n.subjectId ?? -1)} />
                  <span className="truncate font-semibold">{n.title || 'Ohne Titel'}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{snippet(n.body, q) || <span className="text-ink-3">Leer</span>}</p>
                <p className="mt-1 text-xs text-ink-3">{new Date(n.updatedAt).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty action={!q && <Button onClick={create}>Notiz anlegen</Button>}>{q ? `Nichts gefunden für „${q}".` : 'Noch keine Notizen.'}</Empty>
      )}
    </Panel>
  )

  const filters = (
    <div className="mb-4 flex flex-wrap gap-2">
      <label className="relative min-w-48 flex-1">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Notizen durchsuchen" className="pl-10" aria-label="Notizen durchsuchen" />
      </label>
      <Select className="w-auto max-w-48" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} aria-label="Nach Fach filtern">
        <option value="">Alle Fächer</option>
        {subjects.map((s) => <option key={s.id} value={s.id}>{s.short} – {s.name}</option>)}
      </Select>
    </div>
  )

  return (
    <div>
      <PageHeader title="Notizen" subtitle={`${notes.length} ${notes.length === 1 ? 'Notiz' : 'Notizen'}`} action={<Button variant="primary" onClick={create}><Plus size={18} /> Notiz</Button>} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className={cx(selectedId != null && 'hidden lg:block')}>
          {filters}
          {list}
        </div>
        {selectedId != null ? (
          <NoteEditor key={selectedId} id={selectedId} subjects={subjects} onClose={() => nav('/notizen')} />
        ) : (
          <div className="hidden lg:block">
            <Panel><Empty>Wähle links eine Notiz oder leg eine neue an.</Empty></Panel>
          </div>
        )}
      </div>
    </div>
  )
}

function NoteEditor({ id, subjects, onClose }: { id: number; subjects: ReturnType<typeof useSubjects>['subjects']; onClose: () => void }) {
  const note = useLiveQuery(() => db.notes.get(id), [id])
  const [draft, setDraft] = useState<Pick<Note, 'title' | 'body' | 'subjectId'> | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const confirm = useConfirm()
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (note && !draft) setDraft({ title: note.title, body: note.body, subjectId: note.subjectId ?? null })
  }, [note, draft])

  // Grow the text area with its content.
  useEffect(() => {
    const el = bodyRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.max(320, el.scrollHeight)}px`
    }
  }, [draft?.body])

  // Save shortly after typing stops, and when leaving.
  const save = (d: typeof draft) => d && db.notes.update(id, { ...d, updatedAt: Date.now() })
  const change = (patch: Partial<NonNullable<typeof draft>>) => {
    setDraft((d) => {
      const next = { ...d!, ...patch }
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => save(next), 400)
      return next
    })
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (note === undefined) return null
  if (!note || !draft) return <Panel><Empty>Diese Notiz gibt es nicht mehr.</Empty></Panel>

  const remove = async () => {
    if (await confirm.ask(`„${draft.title || 'Ohne Titel'}" wird gelöscht.`)) {
      window.clearTimeout(timer.current)
      await db.notes.delete(id)
      onClose()
    }
  }
  const close = async () => {
    window.clearTimeout(timer.current)
    await save(draft)
    // Throw away notes that were opened but never written in.
    if (!draft.title.trim() && !draft.body.trim()) await db.notes.delete(id)
    onClose()
  }

  return (
    <Panel className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
        <IconButton label="Zurück" onClick={close} className="lg:hidden"><ArrowLeft size={20} /></IconButton>
        <div className="w-56 max-w-[50%]">
          <SubjectSelect subjects={subjects} value={draft.subjectId} onChange={(v) => change({ subjectId: v })} allowNone />
        </div>
        <span className="ml-auto text-xs text-ink-3">Wird automatisch gespeichert</span>
        <IconButton label="Notiz löschen" onClick={remove}><Trash2 size={19} /></IconButton>
      </div>
      <div className="px-5 pt-4 pb-6">
        <input
          value={draft.title}
          onChange={(e) => change({ title: e.target.value })}
          placeholder="Titel"
          className="display w-full bg-transparent text-2xl placeholder:text-ink-3 focus:outline-none"
          aria-label="Titel"
        />
        <textarea
          ref={bodyRef}
          value={draft.body}
          onChange={(e) => change({ body: e.target.value })}
          placeholder="Schreib los …"
          className="mt-3 w-full resize-none bg-transparent leading-relaxed placeholder:text-ink-3 focus:outline-none"
          aria-label="Text"
        />
      </div>
      {confirm.element}
    </Panel>
  )
}
