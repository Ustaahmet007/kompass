import { db, type PlanItem, type StudyPlan } from '../db'
import { callClaude, type ContentBlock, type Tool } from './claude'
import { buildSchoolContext } from './context'
import { DAY_NAMES, addDays, daysBetween, todayISO, weekdayIndex } from './date'

const PLAN_TOOL: Tool = {
  name: 'save_plan',
  description: 'Speichert den fertigen Lernplan.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Kurzer Titel, z. B. "AM-Schularbeit Matrizen"' },
      items: {
        type: 'array',
        description: 'Lerneinheiten in zeitlicher Reihenfolge, höchstens eine bis zwei pro Tag',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD' },
            minutes: { type: 'integer' },
            topic: { type: 'string', description: 'Was gelernt wird, kurz (max. 8 Wörter)' },
            details: { type: 'string', description: 'Konkret was zu tun ist: Kapitel, Aufgabentypen, Methode (1–2 Sätze)' },
            kind: { type: 'string', enum: ['lernen', 'wiederholen', 'probe'] },
          },
          required: ['date', 'minutes', 'topic', 'kind'],
        },
      },
      tips: { type: 'string', description: '2–3 kurze, konkrete Tipps für diesen Stoff' },
    },
    required: ['title', 'items'],
  },
}

const SYSTEM = `Du bist ein Lerncoach für einen Schüler einer österreichischen HTL (3. Jahrgang Elektronik). Du erstellst realistische Lernpläne.
Regeln:
- Plane nur Tage von heute bis einschließlich zum Tag vor der Prüfung (am Prüfungstag selbst höchstens 15 min kurz wiederholen).
- Halte dich an die Minuten pro Tag und die Verfügbarkeit. An Tagen mit Arbeitsschicht nur wenig oder vor/nach der Schicht planen, je nach Länge. Tage mit langem Unterricht (bis 17 oder 18 Uhr) weniger oder gar nicht einplanen.
- Lieber verteilt lernen als alles am Ende: neuer Stoff zuerst, dann Wiederholungen mit Abstand (verteiltes Lernen), und 1–3 Tage vor der Prüfung eine Probeprüfung unter Zeitdruck (kind "probe").
- Aktiv lernen: Aufgaben rechnen, Code schreiben, Schaltungen selbst zeichnen, nicht nur lesen. Schreib das in "details" konkret hinein.
- Berücksichtige andere Prüfungen und Abgaben in den Daten, damit sich nichts staut.
- Sprache: Deutsch, kurz und konkret.
Rufe am Ende immer das Werkzeug save_plan auf.`

export interface PlanInput {
  subjectName?: string
  examLabel?: string
  deadline: string
  minutesPerDay: number
  availability: string
  material: string
  pdf?: { name: string; base64: string }
}

function normalizeItems(raw: unknown, from: string, deadline: string): PlanItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((r: Record<string, unknown>) => ({
      date: String(r.date ?? ''),
      minutes: Math.max(5, Math.min(240, Math.round(Number(r.minutes) || 30))),
      topic: String(r.topic ?? '').trim() || 'Lernen',
      details: r.details ? String(r.details) : undefined,
      kind: (['lernen', 'wiederholen', 'probe'].includes(String(r.kind)) ? r.kind : 'lernen') as PlanItem['kind'],
      done: false,
    }))
    .filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.date) && i.date >= from && i.date <= deadline)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function calendarHint(from: string, deadline: string) {
  const n = Math.min(60, Math.max(0, daysBetween(from, deadline)))
  return Array.from({ length: n + 1 }, (_, i) => {
    const d = addDays(from, i)
    return `${d} ${DAY_NAMES[weekdayIndex(d)]}`
  }).join(', ')
}

export async function generatePlan(input: PlanInput) {
  const today = todayISO()
  const context = await buildSchoolContext()
  const text = `Erstelle einen Lernplan.
Fach: ${input.subjectName ?? 'nicht angegeben'}
Ziel/Prüfung: ${input.examLabel ?? 'nicht angegeben'}
Prüfungs- bzw. Abgabetermin: ${input.deadline}
Zeit pro Tag: etwa ${input.minutesPerDay} Minuten
Verfügbarkeit / Einschränkungen: ${input.availability || 'keine Angaben'}
Kalender zur Orientierung: ${calendarHint(today, input.deadline)}

STOFF:
${input.material || (input.pdf ? 'siehe angehängtes PDF' : 'nicht angegeben – plane anhand des Prüfungsthemas')}

MEINE SCHULDATEN:
${context}`

  const content: ContentBlock[] = []
  if (input.pdf) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdf.base64 } })
  content.push({ type: 'text', text })

  const res = await callClaude({
    system: SYSTEM,
    messages: [{ role: 'user', content }],
    tools: [PLAN_TOOL],
    toolChoice: { type: 'tool', name: 'save_plan' },
    maxTokens: 4000,
  })
  const use = res.content.find((b) => b.type === 'tool_use') as Extract<ContentBlock, { type: 'tool_use' }> | undefined
  if (!use) throw new Error('Claude hat keinen Plan geliefert. Versuch es nochmal.')
  const items = normalizeItems(use.input.items, today, input.deadline)
  if (!items.length) throw new Error('Der Plan war leer. Prüf das Datum und versuch es nochmal.')
  return { title: String(use.input.title ?? 'Lernplan'), items, tips: use.input.tips ? String(use.input.tips) : undefined }
}

/** Re-plans the open part of an existing plan from today on, keeping finished items. */
export async function replan(plan: StudyPlan, note: string) {
  const today = todayISO()
  const done = plan.items.filter((i) => i.done)
  const missed = plan.items.filter((i) => !i.done && i.date < today)
  const open = plan.items.filter((i) => !i.done && i.date >= today)
  const fmt = (list: PlanItem[]) => list.map((i) => `- ${i.date} ${i.minutes} min [${i.kind}] ${i.topic}${i.details ? `: ${i.details}` : ''}`).join('\n') || '- keine'
  const text = `Passe meinen bestehenden Lernplan an. Plane ab heute (${today}) neu bis ${plan.deadline}.
Etwa ${plan.minutesPerDay} Minuten pro Tag. Verfügbarkeit: ${plan.availability || 'keine Angaben'}
Kalender: ${calendarHint(today, plan.deadline)}
${note ? `Was sich geändert hat: ${note}` : ''}

SCHON ERLEDIGT:
${fmt(done)}

VERPASST (noch nicht gemacht, muss untergebracht werden):
${fmt(missed)}

BISHER GEPLANT AB HEUTE:
${fmt(open)}

STOFF:
${plan.material || 'siehe Themen oben'}

MEINE SCHULDATEN:
${await buildSchoolContext()}`
  const res = await callClaude({
    system: SYSTEM,
    messages: [{ role: 'user', content: text }],
    tools: [PLAN_TOOL],
    toolChoice: { type: 'tool', name: 'save_plan' },
    maxTokens: 4000,
  })
  const use = res.content.find((b) => b.type === 'tool_use') as Extract<ContentBlock, { type: 'tool_use' }> | undefined
  if (!use) throw new Error('Claude hat keinen Plan geliefert. Versuch es nochmal.')
  const items = normalizeItems(use.input.items, today, plan.deadline)
  await db.plans.update(plan.id!, {
    items: [...done, ...items],
    tips: use.input.tips ? String(use.input.tips) : plan.tips,
    updatedAt: Date.now(),
  })
}
