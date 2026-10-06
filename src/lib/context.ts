import { db, getSetting } from '../db'
import { DAY_NAMES, addDays, mondayOf, nowMinutes, todayISO, weekKindFor, weekdayIndex } from './date'
import { lessonSpan, lessonsForDate } from './hooks'
import { formatAvg, projectedGrade, weightedAverage } from './grades'

/** A compact plain-text snapshot of the user's school data for the assistant and the planner. */
export async function buildSchoolContext(): Promise<string> {
  const today = todayISO()
  const [subjects, lessons, periods, tasks, exams, grades, plans] = await Promise.all([
    db.subjects.toArray(),
    db.lessons.toArray(),
    db.periods.orderBy('nr').toArray(),
    db.tasks.toArray(),
    db.exams.where('date').aboveOrEqual(addDays(today, -7)).sortBy('date'),
    db.grades.toArray(),
    db.plans.toArray(),
  ])
  const abRef = await getSetting('abReference', mondayOf(today))
  const name = (id?: number | null) => {
    const s = subjects.find((x) => x.id === id)
    return s ? `${s.short} (${s.name})` : 'ohne Fach'
  }
  const now = new Date()
  const lines: string[] = []
  lines.push(`Jetzt: ${DAY_NAMES[weekdayIndex(today)]}, ${today}, ${now.toTimeString().slice(0, 5)} Uhr. Woche ${weekKindFor(today, abRef)}.`)

  lines.push('\nFÄCHER (Kürzel = Name, Lehrkraft):')
  for (const s of subjects) lines.push(`- ${s.short} = ${s.name}${s.teacher ? `, ${s.teacher}` : ''}`)

  lines.push('\nSTUNDENPLAN der nächsten Schultage:')
  let shown = 0
  for (let i = 0; i < 9 && shown < 5; i++) {
    const d = addDays(today, i)
    const ls = lessonsForDate(lessons, d, abRef)
    if (!ls.length) continue
    shown++
    const parts = ls.map((l) => {
      const { start, end } = lessonSpan(l, periods)
      return `${start}-${end} ${subjects.find((s) => s.id === l.subjectId)?.short ?? '?'}`
    })
    const label = i === 0 ? 'heute' : i === 1 ? 'morgen' : DAY_NAMES[weekdayIndex(d)]
    lines.push(`- ${label} ${d}: ${parts.join(', ')}`)
  }
  if (lessonsForDate(lessons, today, abRef).length) {
    const last = lessonsForDate(lessons, today, abRef).at(-1)!
    const end = lessonSpan(last, periods).end
    if (end) lines.push(`(Heute Schulschluss ${end}${nowMinutes() >= Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) ? ', bereits vorbei' : ''})`)
  }

  const open = tasks.filter((t) => t.status !== 'erledigt').sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  lines.push(`\nOFFENE AUFGABEN (${open.length}):`)
  for (const t of open.slice(0, 40)) {
    const prio = t.priority === 1 ? ', Priorität hoch' : ''
    const late = t.due && t.due < today ? ' ÜBERFÄLLIG' : ''
    lines.push(`- [id ${t.id}] ${t.title} | ${name(t.subjectId)} | fällig ${t.due ?? 'ohne Datum'}${late}${prio}${t.status === 'inArbeit' ? ' | in Arbeit' : ''}`)
  }

  lines.push('\nPRÜFUNGEN (ab letzter Woche):')
  for (const e of exams) lines.push(`- [id ${e.id}] ${e.date} ${e.kind} ${name(e.subjectId)}: ${e.topic || 'kein Stoff eingetragen'}`)
  if (!exams.length) lines.push('- keine')

  lines.push('\nNOTEN (österreichisch 1 = Sehr gut … 5 = Nicht genügend):')
  for (const s of subjects) {
    const own = grades.filter((g) => g.subjectId === s.id)
    if (!own.length) continue
    const avg = weightedAverage(s, own)
    const list = own.sort((a, b) => a.date.localeCompare(b.date)).map((g) => `${g.value} ${g.category}`).join(', ')
    lines.push(`- ${s.short}: Schnitt ${formatAvg(avg)}, Tendenz ${projectedGrade(avg)} | ${list} | Gewichtung ${s.categories.map((c) => `${c.name} ${c.weight}%`).join(', ')}`)
  }

  const planItems = plans.flatMap((p) => p.items.filter((i) => !i.done && i.date >= today && i.date <= addDays(today, 6)).map((i) => ({ p, i })))
  if (planItems.length) {
    lines.push('\nLERNPLAN nächste 7 Tage:')
    for (const { p, i } of planItems.sort((a, b) => a.i.date.localeCompare(b.i.date))) lines.push(`- ${i.date}: ${i.minutes} min ${i.topic} (${p.title})`)
  }
  return lines.join('\n')
}
