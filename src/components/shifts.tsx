import { useState } from 'react'
import { Briefcase } from 'lucide-react'
import { db, type Shift } from '../db'
import { formatDate, todayISO } from '../lib/date'
import { useSetting } from '../lib/hooks'
import { Button, Field, Input, Sheet, cx } from './ui'

/** Usual shift times, editable by just using different ones (most used come first next time). */
export const DEFAULT_SHIFT_PRESETS: [string, string][] = [
  ['05:00', '11:00'],
  ['06:00', '12:00'],
  ['07:00', '13:00'],
  ['13:00', '18:00'],
]

export const shiftLabel = (s: Pick<Shift, 'start' | 'end'>) => `${s.start.replace(/^0/, '')}–${s.end.replace(/^0/, '')}`

export function ShiftSheet({ open, onClose, shift, defaultDate }: { open: boolean; onClose: () => void; shift?: Shift | null; defaultDate?: string }) {
  return open ? <ShiftForm key={shift?.id ?? 'new'} onClose={onClose} shift={shift} defaultDate={defaultDate} /> : null
}

function ShiftForm({ onClose, shift, defaultDate }: { onClose: () => void; shift?: Shift | null; defaultDate?: string }) {
  const presets = useSetting<[string, string][]>('shiftPresets', DEFAULT_SHIFT_PRESETS)
  const lastLabel = useSetting<string>('shiftLabel', 'Bäckerei')
  const [date, setDate] = useState(shift?.date ?? defaultDate ?? todayISO())
  const [start, setStart] = useState(shift?.start ?? presets[1]?.[0] ?? '06:00')
  const [end, setEnd] = useState(shift?.end ?? presets[1]?.[1] ?? '12:00')
  const [label, setLabel] = useState(shift?.label ?? lastLabel)
  const valid = !!date && !!start && !!end && end > start

  const save = async () => {
    if (!valid) return
    const data = { date, start, end, label: label.trim() || 'Arbeit' }
    if (shift?.id) await db.shifts.update(shift.id, data)
    else await db.shifts.add(data)
    await db.settings.put({ key: 'shiftLabel', value: data.label })
    // Remember new time combinations as presets.
    if (!presets.some(([a, b]) => a === start && b === end)) {
      await db.settings.put({ key: 'shiftPresets', value: [...presets, [start, end]].slice(-6) })
    }
    onClose()
  }
  const remove = async () => {
    if (shift?.id) await db.shifts.delete(shift.id)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={shift ? 'Schicht bearbeiten' : 'Schicht eintragen'}
      footer={
        <>
          {shift && <Button variant="danger" className="mr-auto" onClick={remove}>Löschen</Button>}
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={save} disabled={!valid}>Speichern</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tag">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-2">Übliche Zeiten</span>
          <div className="flex flex-wrap gap-2">
            {presets.map(([a, b]) => (
              <button
                key={`${a}-${b}`}
                type="button"
                onClick={() => { setStart(a); setEnd(b) }}
                aria-pressed={start === a && end === b}
                className={cx('min-h-11 rounded-full border px-4 font-semibold tabular', start === a && end === b ? 'border-brass bg-brass-soft text-brass' : 'border-line text-ink-2')}
              >
                {shiftLabel({ start: a, end: b })}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Beginn"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Ende"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        {!valid && start && end && <p className="text-sm text-danger">Das Ende muss nach dem Beginn liegen.</p>}
        <Field label="Was?">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bäckerei" />
        </Field>
      </div>
    </Sheet>
  )
}

export function ShiftRow({ shift, onOpen, showDate = false }: { shift: Shift; onOpen: (s: Shift) => void; showDate?: boolean }) {
  return (
    <button type="button" onClick={() => onOpen(shift)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brass-soft text-brass"><Briefcase size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{shift.label}</span>
        <span className="text-sm text-ink-2 tabular">{showDate ? `${formatDate(shift.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ` : ''}{shift.start}–{shift.end}</span>
      </span>
    </button>
  )
}
