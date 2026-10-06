import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Check, Plus } from 'lucide-react'
import { db, type Lesson } from '../db'
import { DesignSettings } from '../components/DesignSettings'
import { FramedImage } from '../components/Picture'
import { GradeChip, PageHeader, SubjectTag, cx } from '../components/ui'
import { DEFAULT_THEME, normalizeColorMode, type ThemeSettings } from '../lib/theme'
import { usePeriods, useSetting, useSubjects } from '../lib/hooks'

export default function DesignPage() {
  const nav = useNavigate()
  return (
    <div>
      <button type="button" onClick={() => nav('/einstellungen')} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-ink-2 hover:text-ink">
        <ArrowLeft size={18} /> Einstellungen
      </button>
      <PageHeader title="Design" subtitle="Jede Änderung siehst du sofort in der Vorschau." />
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <div className="order-2 md:order-1">
          <DesignSettings />
        </div>
        <div className="order-1 md:order-2">
          <div className="md:sticky md:top-6">
            <p className="mb-2 text-sm font-medium text-ink-2">Vorschau</p>
            <LivePreview />
          </div>
        </div>
      </div>
    </div>
  )
}

/** A miniature Kompass that uses the real theme variables, pictures and subjects. */
export function LivePreview() {
  const design = useSetting<ThemeSettings | null>('design', null) ?? DEFAULT_THEME
  const name = useSetting('userName', '')
  const coverId = useSetting<number | null>('homeCoverId', null)
  const bgId = useSetting<number | null>('bgImageId', null)
  const { byId } = useSubjects()
  const periods = usePeriods()
  const lessons = useLiveQuery(() => db.lessons.toArray(), [], [] as Lesson[])
  const plain = normalizeColorMode(design.subjectColors) === 'schlicht'

  // Two school days with the most lessons, first four periods.
  const days = [0, 1, 2, 3, 4]
    .map((d) => ({ d, ls: lessons.filter((l) => l.day === d && l.period <= 4).sort((a, b) => a.period - b.period) }))
    .sort((a, b) => b.ls.length - a.ls.length)
    .slice(0, 2)
    .sort((a, b) => a.d - b.d)
  const anySubject = [...byId.values()]

  return (
    <div className="relative overflow-hidden rounded-3xl border border-line shadow-xl" style={{ background: 'var(--paper)' }}>
      {design.background === 'image' && bgId && (
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          <FramedImage id={bgId} blur={design.bgBlur} />
          <div className="absolute inset-0" style={{ background: 'var(--paper)', opacity: design.bgDim / 100 }} />
        </div>
      )}
      {design.background === 'grid' && (
        <div className="absolute inset-0" aria-hidden style={{ backgroundImage: 'linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
      )}
      <div className="relative space-y-3 p-3">
        {coverId ? (
          <div className="relative h-32 overflow-hidden rounded-2xl">
            <FramedImage id={coverId} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 px-3 pb-2 text-white">
              <p className="text-xs text-white/90">Guten Morgen{name ? `, ${name}` : ''}</p>
              <p className="display text-2xl">Dienstag, 6. Oktober</p>
            </div>
          </div>
        ) : (
          <div className="px-1 pt-1">
            <p className="text-sm text-ink-2">Guten Morgen{name ? `, ${name}` : ''}</p>
            <p className="display text-2xl">Dienstag, 6. Oktober</p>
          </div>
        )}

        <div className="panel rounded-2xl border border-line bg-surface p-2">
          <div className="grid grid-cols-2 gap-1.5">
            {days.map(({ d, ls }) => (
              <div key={d} className="space-y-1.5">
                <p className={cx('rounded-md py-0.5 text-center text-xs font-semibold', d === days[0].d ? 'bg-ink text-paper' : 'text-ink-2')}>{['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'][d]}</p>
                {ls.slice(0, 3).map((l) => {
                  const s = byId.get(l.subjectId)
                  return (
                    <div
                      key={l.id}
                      className={cx('rounded-md px-2 py-1.5 text-xs', plain ? 'border-l-4 bg-sunken text-ink' : 'text-white')}
                      style={plain ? { borderLeftColor: s?.color } : { background: s?.color }}
                    >
                      <span className="font-bold">{s?.short}</span>
                      <span className={cx('ml-1', plain ? 'text-ink-2' : 'opacity-85')}>{periods.find((p) => p.nr === l.period)?.start}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="panel rounded-2xl border border-line bg-surface">
          <p className="px-3 pt-2 text-sm font-semibold text-ink-2">Fällig bis morgen</p>
          {[{ t: 'Hausübung Timer0', s: anySubject[3], done: false }, { t: 'Vokabeln lernen', s: anySubject[1], done: true }].map((x) => (
            <div key={x.t} className="flex items-center gap-2.5 px-3 py-2">
              <span className={cx('flex size-5 items-center justify-center rounded-md border-2', x.done ? 'border-ok bg-ok text-white' : 'border-ink-3')}>{x.done && <Check size={13} strokeWidth={3} />}</span>
              <span className={cx('flex-1 text-sm', x.done && 'text-ink-3 line-through')}>{x.t}</span>
              <SubjectTag subject={x.s} />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-paper"><Plus size={15} /> Aufgabe</span>
          <span className="rounded-lg bg-brass-soft px-3 py-1.5 text-sm font-semibold text-brass">Akzent</span>
          <span className="ml-auto flex gap-1">{[1, 2, 3].map((g) => <GradeChip key={g} value={g} size="sm" />)}</span>
        </div>
      </div>
    </div>
  )
}
