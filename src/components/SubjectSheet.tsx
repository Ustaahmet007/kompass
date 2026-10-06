import { useState } from 'react'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { db, DEFAULT_CATEGORIES, type Category, type Subject } from '../db'
import { Button, Field, IconButton, Input, Sheet, cx } from './ui'

export const SUBJECT_COLORS = ['#c2410c', '#ca8a04', '#65a30d', '#0d9488', '#0284c7', '#2563eb', '#4f46e5', '#7c3aed', '#be185d', '#dc2626', '#57534e', '#0f766e']

export async function deleteSubject(id: number) {
  await db.transaction('rw', [db.subjects, db.lessons, db.tasks, db.grades, db.exams, db.images], async () => {
    await db.lessons.where('subjectId').equals(id).delete()
    await db.grades.where('subjectId').equals(id).delete()
    await db.exams.where('subjectId').equals(id).delete()
    await db.tasks.where('subjectId').equals(id).modify({ subjectId: null })
    const s = await db.subjects.get(id)
    if (s?.coverId) await db.images.delete(s.coverId)
    await db.subjects.delete(id)
  })
}

export function SubjectSheet({ open, onClose, subject }: { open: boolean; onClose: () => void; subject?: Subject | null }) {
  return open ? <SubjectForm key={subject?.id ?? 'new'} onClose={onClose} subject={subject} /> : null
}

function SubjectForm({ onClose, subject }: { onClose: () => void; subject?: Subject | null }) {
  const [name, setName] = useState(subject?.name ?? '')
  const [short, setShort] = useState(subject?.short ?? '')
  const [color, setColor] = useState(subject?.color ?? SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)])
  const [teacher, setTeacher] = useState(subject?.teacher ?? '')
  const [room, setRoom] = useState(subject?.room ?? '')
  const [cats, setCats] = useState<Category[]>(subject?.categories.map((c) => ({ ...c })) ?? DEFAULT_CATEGORIES.map((c) => ({ ...c })))
  const sum = cats.reduce((s, c) => s + (Number(c.weight) || 0), 0)
  const names = cats.map((c) => c.name.trim())
  const duplicate = names.some((n, i) => n && names.indexOf(n) !== i)
  const valid = !!name.trim() && !!short.trim() && cats.length > 0 && cats.every((c) => c.name.trim()) && !duplicate

  const save = async () => {
    if (!valid) return
    const cleaned = cats.map((c) => ({ name: c.name.trim(), weight: Number(c.weight) || 0 }))
    const data = { name: name.trim(), short: short.trim().toUpperCase(), color, teacher: teacher.trim() || undefined, room: room.trim() || undefined, categories: cleaned }
    if (subject?.id) {
      // Renamed categories: move existing grades along with them.
      await db.transaction('rw', db.subjects, db.grades, async () => {
        for (let i = 0; i < subject.categories.length && i < cleaned.length; i++) {
          const from = subject.categories[i].name
          const to = cleaned[i].name
          if (from !== to && !subject.categories.some((c) => c.name === to)) {
            await db.grades.where('subjectId').equals(subject.id!).and((g) => g.category === from).modify({ category: to })
          }
        }
        await db.subjects.update(subject.id!, data)
      })
    } else {
      await db.subjects.add(data)
    }
    onClose()
  }

  const setCat = (i: number, patch: Partial<Category>) => setCats((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  return (
    <Sheet
      open
      onClose={onClose}
      title={subject ? 'Fach bearbeiten' : 'Neues Fach'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={save} disabled={!valid}>Speichern</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Hardwareentwicklung" />
          </Field>
          <Field label="Kürzel">
            <Input value={short} maxLength={6} onChange={(e) => setShort(e.target.value)} placeholder="HWE" />
          </Field>
        </div>
        <Field label="Farbe">
          <div className="flex flex-wrap items-center gap-2">
            {SUBJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Farbe ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
                className={cx('size-9 rounded-full', c === color && 'ring-3 ring-ink ring-offset-2 ring-offset-surface')}
                style={{ background: c }}
              />
            ))}
            <label className="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-line text-ink-3" title="Eigene Farbe">
              <Plus size={16} />
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 opacity-0" aria-label="Eigene Farbe" />
            </label>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lehrkraft (optional)">
            <Input value={teacher} onChange={(e) => setTeacher(e.target.value)} />
          </Field>
          <Field label="Raum (optional)">
            <Input value={room} onChange={(e) => setRoom(e.target.value)} />
          </Field>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-2">Gewichtung der Noten</span>
          <ul className="space-y-2">
            {cats.map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                <Input value={c.name} onChange={(e) => setCat(i, { name: e.target.value })} aria-label="Kategorie" />
                <div className="relative w-28 shrink-0">
                  <Input type="number" inputMode="numeric" min={0} max={100} value={c.weight} onChange={(e) => setCat(i, { weight: Number(e.target.value) })} className="pr-8 text-right tabular" aria-label={`Gewichtung ${c.name}`} />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3">%</span>
                </div>
                <IconButton label="Kategorie entfernen" onClick={() => setCats((cs) => cs.filter((_, j) => j !== i))} disabled={cats.length <= 1}>
                  <Trash2 size={18} />
                </IconButton>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setCats((cs) => [...cs, { name: '', weight: 0 }])}><Plus size={16} /> Kategorie</Button>
            <span className={cx('inline-flex items-center gap-1.5 text-sm font-semibold tabular', sum === 100 ? 'text-ok' : 'text-danger')}>
              {sum !== 100 && <AlertTriangle size={15} />} Summe {sum} %{sum !== 100 && ' – sollte 100 % sein'}
            </span>
          </div>
          {duplicate && <p className="mt-1 text-sm text-danger">Zwei Kategorien haben denselben Namen.</p>}
        </div>
      </div>
    </Sheet>
  )
}
