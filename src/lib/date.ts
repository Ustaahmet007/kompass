export const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
export const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const MONTH_NAMES = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

const pad = (n: number) => String(n).padStart(2, '0')

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO(): string {
  return toISO(new Date())
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** 0 = Montag … 6 = Sonntag */
export function weekdayIndex(iso: string): number {
  return (fromISO(iso).getDay() + 6) % 7
}

export function mondayOf(iso: string): string {
  return addDays(iso, -weekdayIndex(iso))
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000)
}

/** A/B-Woche relative to a reference Monday that is defined as an A-Woche. */
export function weekKindFor(iso: string, referenceMonday: string): 'A' | 'B' {
  const weeks = Math.floor(daysBetween(referenceMonday, mondayOf(iso)) / 7)
  return ((weeks % 2) + 2) % 2 === 0 ? 'A' : 'B'
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('de-AT', opts).format(fromISO(iso))
}

export function formatLong(iso: string) {
  return new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long' }).format(fromISO(iso))
}

/** "heute", "morgen", "in 3 Tagen", "vor 2 Tagen" */
export function relativeDay(iso: string, from = todayISO()): string {
  const d = daysBetween(from, iso)
  if (d === 0) return 'heute'
  if (d === 1) return 'morgen'
  if (d === -1) return 'gestern'
  if (d === 2) return 'übermorgen'
  if (d > 0) return `in ${d} Tagen`
  return `vor ${-d} Tagen`
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function nowMinutes(): number {
  const n = new Date()
  return n.getHours() * 60 + n.getMinutes()
}
