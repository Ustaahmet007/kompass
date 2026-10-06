import type { Grade, Subject } from '../db'

/** Sum of the configured category weights (should be 100). */
export function weightSum(subject: Subject): number {
  return subject.categories.reduce((s, c) => s + (Number(c.weight) || 0), 0)
}

/**
 * Weighted average on the Austrian 1–5 scale.
 * Each category is averaged first, then categories are combined by weight.
 * Categories without any grade yet are left out and the remaining weights are rescaled.
 */
export function weightedAverage(subject: Subject, grades: Grade[]): number | null {
  let weighted = 0
  let used = 0
  for (const cat of subject.categories) {
    const g = grades.filter((x) => x.category === cat.name)
    if (!g.length || !cat.weight) continue
    const avg = g.reduce((s, x) => s + x.value, 0) / g.length
    weighted += avg * cat.weight
    used += cat.weight
  }
  // Grades in a category that no longer exists still count, unweighted, so nothing silently disappears.
  const known = new Set(subject.categories.map((c) => c.name))
  const orphans = grades.filter((g) => !known.has(g.category))
  if (orphans.length && used === 0) {
    return orphans.reduce((s, x) => s + x.value, 0) / orphans.length
  }
  return used ? weighted / used : null
}

/** Projected Zeugnisnote: the average rounded to a whole grade (x,5 rounds to the worse grade). */
export function projectedGrade(avg: number | null): number | null {
  if (avg == null) return null
  return Math.min(5, Math.max(1, Math.round(avg)))
}

export interface NeededResult {
  /** Worst grade that still reaches the target, or null if no grade reaches it. */
  needed: number | null
  /** Target already reached even with a 5. */
  safe: boolean
  /** Average if the needed grade is achieved. */
  resultingAvg: number | null
}

/** Notenrechner: what is needed in the next exam of `category` to reach `target`? */
export function neededGrade(subject: Subject, grades: Grade[], target: number, category: string): NeededResult {
  let best: number | null = null
  let bestAvg: number | null = null
  for (let g = 5; g >= 1; g--) {
    const trial: Grade[] = [...grades, { subjectId: subject.id ?? 0, category, value: g, date: '9999-12-31' }]
    const avg = weightedAverage(subject, trial)
    if (avg != null && projectedGrade(avg)! <= target) {
      best = g
      bestAvg = avg
      break
    }
  }
  return { needed: best, safe: best === 5, resultingAvg: bestAvg }
}

/** Running weighted average after each grade, in date order — for the trend chart. */
export function runningAverages(subject: Subject, grades: Grade[]) {
  const sorted = [...grades].sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0))
  return sorted.map((g, i) => ({ grade: g, avg: weightedAverage(subject, sorted.slice(0, i + 1)) ?? g.value }))
}

/** Green (1) → red (5). */
export function gradeColor(value: number): string {
  const v = Math.min(5, Math.max(1, value))
  const hue = 148 - ((v - 1) / 4) * 144
  return `hsl(${hue.toFixed(0)} 62% 42%)`
}

export function gradeName(v: number): string {
  return ['Sehr gut', 'Gut', 'Befriedigend', 'Genügend', 'Nicht genügend'][Math.round(v) - 1] ?? ''
}

export function formatAvg(v: number | null): string {
  return v == null ? '–' : v.toFixed(2).replace('.', ',')
}
