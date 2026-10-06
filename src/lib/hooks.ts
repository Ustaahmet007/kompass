import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Lesson, type Period, type Subject } from '../db'
import { todayISO, weekdayIndex, weekKindFor } from './date'

export function useSubjects() {
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], undefined)
  const byId = useMemo(() => {
    const m = new Map<number, Subject>()
    subjects?.forEach((s) => m.set(s.id!, s))
    return m
  }, [subjects])
  const sorted = useMemo(() => [...(subjects ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'de')), [subjects])
  return { subjects: sorted, byId, loading: subjects === undefined }
}

export function usePeriods() {
  return useLiveQuery(() => db.periods.orderBy('nr').toArray(), [], [] as Period[])
}

export function useSetting<T>(key: string, fallback: T): T {
  const row = useLiveQuery(() => db.settings.get(key), [key])
  return row ? (row.value as T) : fallback
}

/** Re-renders every `ms` so "jetzt"-markers and countdowns stay current. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms)
    const onVisible = () => document.visibilityState === 'visible' && setNow(new Date())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ms])
  return now
}

export function useToday() {
  const now = useNow()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => todayISO(), [now.toDateString()])
}

export function lessonsForDate(lessons: Lesson[], iso: string, abReference: string): Lesson[] {
  const day = weekdayIndex(iso)
  const kind = weekKindFor(iso, abReference)
  return lessons
    .filter((l) => l.day === day && (l.week === 'alle' || l.week === kind))
    .sort((a, b) => a.period - b.period)
}

export function lessonSpan(lesson: Lesson, periods: Period[]) {
  const first = periods.find((p) => p.nr === lesson.period)
  const last = periods.find((p) => p.nr === lesson.period + lesson.length - 1) ?? first
  return { start: first?.start ?? '', end: last?.end ?? '' }
}
