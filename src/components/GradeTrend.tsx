import type { Grade } from '../db'
import { formatDate } from '../lib/date'
import { gradeColor } from '../lib/grades'

/**
 * Trend chart with an INVERTED y-axis: 1 (Sehr gut) at the top, 5 at the bottom,
 * so improving grades go upwards.
 */
export function GradeTrend({ points, compact = false }: { points: { grade: Grade; avg: number }[]; compact?: boolean }) {
  const W = compact ? 160 : 640
  const H = compact ? 44 : 220
  const padL = compact ? 4 : 34
  const padR = compact ? 4 : 16
  const padT = compact ? 6 : 14
  const padB = compact ? 6 : 28
  const y = (v: number) => padT + ((v - 1) / 4) * (H - padT - padB) // 1 → top, 5 → bottom
  const n = points.length
  const x = (i: number) => (n <= 1 ? (W + padL - padR) / 2 : padL + (i / (n - 1)) * (W - padL - padR))

  if (!n) {
    return compact ? <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-40" aria-hidden /> : <p className="px-4 py-6 text-ink-2">Noch keine Noten — der Verlauf erscheint mit der ersten Note.</p>
  }

  const avgPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={compact ? 'h-11 w-40' : 'h-auto w-full'}
      role="img"
      aria-label={`Notenverlauf, aktueller Schnitt ${points[n - 1].avg.toFixed(2)}`}
    >
      {!compact &&
        [1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v === 1 || v === 5 ? undefined : '3 4'} />
            <text x={padL - 10} y={y(v) + 4} textAnchor="end" fontSize="15" fill="var(--ink-3)" fontWeight="600">{v}</text>
          </g>
        ))}
      {compact && <line x1={padL} x2={W - padR} y1={y(4.5)} y2={y(4.5)} stroke="var(--danger)" strokeOpacity="0.35" strokeDasharray="2 3" />}
      <path d={avgPath} fill="none" stroke="var(--ink)" strokeWidth={compact ? 2 : 2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.grade.id ?? i}>
          {!compact && <circle cx={x(i)} cy={y(p.grade.value)} r="7" fill={gradeColor(p.grade.value)} stroke="var(--surface)" strokeWidth="2" />}
          <circle cx={x(i)} cy={y(p.avg)} r={compact ? 2.5 : 3.5} fill="var(--ink)" />
          {!compact && (i === 0 || i === n - 1 || n <= 8) && (
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="13" fill="var(--ink-3)">{formatDate(p.grade.date, { day: 'numeric', month: 'numeric' })}</text>
          )}
        </g>
      ))}
    </svg>
  )
}

export function TrendLegend() {
  return (
    <div className="flex flex-wrap gap-4 px-4 pb-3 text-sm text-ink-2">
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 rounded bg-ink" /> Schnitt</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full" style={{ background: gradeColor(2) }} /> Einzelnote</span>
      <span>1 ist oben — nach oben heißt besser.</span>
    </div>
  )
}
