import { db, getSetting, setSetting, type ChatMessage, type ExamKind, type Priority, type Subject } from '../db'
import { callClaude, textOf, type ApiMessage, type ContentBlock, type Tool } from './claude'
import { buildSchoolContext } from './context'
import { resolvePersona, type CustomPersona, type PersonaDef } from './personas'
import { minutesOf, mondayOf, nowMinutes, todayISO } from './date'
import { lessonSpan, lessonsForDate } from './hooks'

type Action = NonNullable<ChatMessage['actions']>[number]

async function currentPersona() {
  const id = await getSetting<string>('persona', 'friday')
  const custom = await getSetting<CustomPersona | null>('customPersona', null)
  return resolvePersona(id, custom)
}

function systemPrompt(persona: PersonaDef, context: string) {
  return `Du bist der Assistent in der Schul-App Kompass. Deine Rolle:
${persona.prompt}
Bleib in deiner Rolle, aber die Fakten aus den Daten müssen immer stimmen.

Der Nutzer ist Schüler an einer österreichischen HTL (Klasse 3AHEL). Nutze österreichische Schulbegriffe (Schularbeit, Hausübung, Mitarbeit, Zeugnis).
Antworte in der Sprache, in der der Nutzer schreibt (Deutsch oder Englisch, gemischt ist ok).
Deine Antworten werden oft laut vorgelesen: kurz halten (meist 1–4 Sätze), kein Markdown, keine Aufzählungszeichen, keine Emojis, Uhrzeiten wie "acht Uhr fünf" lesbar schreiben ist nicht nötig, normale Ziffern sind ok.
Wenn der Nutzer etwas eintragen, abhaken oder ändern will, benutze die Werkzeuge, statt nur zu sagen, dass du es tust. Datumsangaben wie "Freitag" oder "morgen" rechnest du selbst in YYYY-MM-DD um.
Erfinde keine Daten. Wenn etwas nicht in den Daten steht, sag das.

AKTUELLE DATEN AUS KOMPASS:
${context}`
}

const TOOLS: Tool[] = [
  {
    name: 'add_task',
    description: 'Trägt eine neue Aufgabe (Hausübung, To-do) ein.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        subject: { type: 'string', description: 'Fach-Kürzel oder Name, falls bekannt' },
        due: { type: 'string', description: 'Fälligkeitsdatum YYYY-MM-DD' },
        priority: { type: 'integer', enum: [1, 2, 3], description: '1 hoch, 2 mittel, 3 niedrig' },
        remind_at: { type: 'string', description: 'Optional: Erinnerung als Push-Mitteilung, lokale Zeit YYYY-MM-DDTHH:MM' },
      },
      required: ['title'],
    },
  },
  {
    name: 'complete_task',
    description: 'Markiert eine offene Aufgabe als erledigt.',
    input_schema: { type: 'object', properties: { task_id: { type: 'integer' } }, required: ['task_id'] },
  },
  {
    name: 'add_exam',
    description: 'Trägt eine Schularbeit, einen Test, eine Prüfung oder eine Abgabe ein.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        kind: { type: 'string', enum: ['Schularbeit', 'Test', 'Prüfung', 'Abgabe'] },
        topic: { type: 'string', description: 'Stoff' },
      },
      required: ['subject', 'date', 'kind'],
    },
  },
  {
    name: 'add_shift',
    description: 'Trägt eine Arbeitsschicht ein (z. B. Bäckerei).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        start: { type: 'string', description: 'HH:MM' },
        end: { type: 'string', description: 'HH:MM' },
        label: { type: 'string', description: 'z. B. Bäckerei' },
      },
      required: ['date', 'start', 'end'],
    },
  },
  {
    name: 'add_grade',
    description: 'Trägt eine Note ein (1 = Sehr gut … 5 = Nicht genügend).',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        value: { type: 'integer', minimum: 1, maximum: 5 },
        category: { type: 'string', description: 'z. B. Schularbeit, Test, Mitarbeit — muss zu den Kategorien des Fachs passen' },
        date: { type: 'string', description: 'YYYY-MM-DD, Standard heute' },
        title: { type: 'string' },
      },
      required: ['subject', 'value'],
    },
  },
]

function findSubject(subjects: Subject[], q?: unknown): Subject | undefined {
  if (typeof q !== 'string' || !q.trim()) return undefined
  const s = q.trim().toLowerCase()
  return (
    subjects.find((x) => x.short.toLowerCase() === s) ??
    subjects.find((x) => x.name.toLowerCase() === s) ??
    subjects.find((x) => x.name.toLowerCase().includes(s) || s.includes(x.short.toLowerCase()))
  )
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

async function runTool(name: string, input: Record<string, unknown>, actions: Action[]): Promise<{ content: string; is_error?: boolean }> {
  const subjects = await db.subjects.toArray()
  switch (name) {
    case 'add_task': {
      const subject = findSubject(subjects, input.subject)
      const id = await db.tasks.add({
        title: String(input.title ?? '').trim() || 'Aufgabe',
        subjectId: subject?.id ?? null,
        due: isDate(input.due) ? input.due : null,
        priority: ([1, 2, 3].includes(Number(input.priority)) ? Number(input.priority) : 2) as Priority,
        status: 'offen',
        remindAt: typeof input.remind_at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.remind_at) ? input.remind_at.slice(0, 16) : null,
        createdAt: Date.now(),
      })
      actions.push({ label: `Aufgabe „${input.title}" eingetragen`, undo: { table: 'tasks', id: id as number, op: 'delete' } })
      return { content: `Eingetragen (id ${id})${subject ? ` für ${subject.short}` : ''}.` }
    }
    case 'complete_task': {
      const t = await db.tasks.get(Number(input.task_id))
      if (!t) return { content: 'Diese Aufgabe gibt es nicht.', is_error: true }
      await db.tasks.update(t.id!, { status: 'erledigt', doneAt: Date.now() })
      actions.push({ label: `„${t.title}" abgehakt`, undo: { table: 'tasks', id: t.id!, op: 'restore', before: { status: t.status, doneAt: t.doneAt ?? null } } })
      return { content: 'Abgehakt.' }
    }
    case 'add_exam': {
      const subject = findSubject(subjects, input.subject)
      if (!subject) return { content: `Fach "${input.subject}" nicht gefunden. Vorhanden: ${subjects.map((s) => s.short).join(', ')}`, is_error: true }
      if (!isDate(input.date)) return { content: 'Datum fehlt oder ist ungültig.', is_error: true }
      const kind = (['Schularbeit', 'Test', 'Prüfung', 'Abgabe'].includes(String(input.kind)) ? input.kind : 'Test') as ExamKind
      const id = await db.exams.add({ subjectId: subject.id!, date: input.date, kind, topic: String(input.topic ?? '') })
      actions.push({ label: `${kind} ${subject.short} am ${input.date} eingetragen`, undo: { table: 'exams', id: id as number, op: 'delete' } })
      return { content: 'Eingetragen.' }
    }
    case 'add_shift': {
      const hhmm = (v: unknown) => (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : null)
      const start = hhmm(input.start)
      const end = hhmm(input.end)
      if (!isDate(input.date) || !start || !end) return { content: 'Datum oder Uhrzeit fehlt.', is_error: true }
      const label = String(input.label ?? (await getSetting<string>('shiftLabel', 'Bäckerei')))
      const id = await db.shifts.add({ date: input.date, start, end, label })
      actions.push({ label: `Schicht ${label} ${input.date} ${start}–${end} eingetragen`, undo: { table: 'shifts', id: id as number, op: 'delete' } })
      return { content: 'Eingetragen.' }
    }
    case 'add_grade': {
      const subject = findSubject(subjects, input.subject)
      if (!subject) return { content: `Fach "${input.subject}" nicht gefunden. Vorhanden: ${subjects.map((s) => s.short).join(', ')}`, is_error: true }
      const value = Number(input.value)
      if (!(value >= 1 && value <= 5)) return { content: 'Note muss zwischen 1 und 5 liegen.', is_error: true }
      const wanted = String(input.category ?? '').toLowerCase()
      const cat = subject.categories.find((c) => c.name.toLowerCase() === wanted) ?? subject.categories.find((c) => wanted && c.name.toLowerCase().startsWith(wanted.slice(0, 4))) ?? subject.categories[0]
      const id = await db.grades.add({ subjectId: subject.id!, value, category: cat.name, date: isDate(input.date) ? input.date : todayISO(), title: input.title ? String(input.title) : undefined })
      actions.push({ label: `${value} in ${subject.short} (${cat.name}) eingetragen`, undo: { table: 'grades', id: id as number, op: 'delete' } })
      return { content: `Eingetragen als ${cat.name}.` }
    }
  }
  return { content: 'Unbekanntes Werkzeug.', is_error: true }
}

/** One assistant turn, including any tool calls. Saves both messages to the chat history. */
export async function askAssistant(userText: string): Promise<ChatMessage> {
  const persona = await currentPersona()
  const history = (await db.chat.orderBy('ts').reverse().limit(12).toArray()).reverse()
  await db.chat.add({ role: 'user', text: userText, ts: Date.now() })

  // The API wants alternating roles starting with the user; a failed earlier turn can leave two user messages in a row.
  const messages: ApiMessage[] = []
  for (const m of [...history, { role: 'user' as const, text: userText }]) {
    const last = messages.at(-1)
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.text}`
    else messages.push({ role: m.role, content: m.text })
  }
  while (messages.length && messages[0].role !== 'user') messages.shift()

  const actions: Action[] = []
  let answer = ''
  for (let round = 0; round < 5; round++) {
    const res = await callClaude({ system: systemPrompt(persona, await buildSchoolContext()), messages, tools: TOOLS, maxTokens: 800 })
    const uses = res.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
    answer = textOf(res) || answer
    if (res.stop_reason !== 'tool_use' || !uses.length) break
    messages.push({ role: 'assistant', content: res.content })
    const results: ContentBlock[] = []
    for (const u of uses) {
      const r = await runTool(u.name, u.input, actions)
      results.push({ type: 'tool_result', tool_use_id: u.id, content: r.content, ...(r.is_error ? { is_error: true } : {}) })
    }
    messages.push({ role: 'user', content: results })
  }
  const reply: ChatMessage = { role: 'assistant', text: answer || 'Erledigt.', ts: Date.now(), actions: actions.length ? actions : undefined }
  reply.id = (await db.chat.add(reply)) as number
  return reply
}

export async function undoAction(messageId: number, index: number) {
  const msg = await db.chat.get(messageId)
  const a = msg?.actions?.[index]
  if (!msg || !a) return
  const table = db.table(a.undo.table)
  if (a.undo.op === 'delete') await table.delete(a.undo.id)
  else await table.update(a.undo.id, a.undo.before as object)
  const actions = msg.actions!.filter((_, i) => i !== index)
  await db.chat.update(messageId, { actions: actions.length ? actions : undefined })
}

/** Which briefing fits right now: before/at school ("schule") or after school ("zuhause"). */
export async function briefingPhase(): Promise<'schule' | 'zuhause'> {
  const today = todayISO()
  const [lessons, periods] = await Promise.all([db.lessons.toArray(), db.periods.orderBy('nr').toArray()])
  const abRef = await getSetting('abReference', mondayOf(today))
  const todays = lessonsForDate(lessons, today, abRef)
  const now = nowMinutes()
  if (!todays.length) return now < 12 * 60 ? 'schule' : 'zuhause'
  const end = lessonSpan(todays[todays.length - 1], periods).end
  return end && now >= minutesOf(end) ? 'zuhause' : 'schule'
}

const BRIEFING_PROMPT = {
  schule:
    'Begrüß mich kurz (passend zur Tageszeit, mit meinem Namen falls bekannt) und gib mir mein Briefing für heute zum Vorlesen, 4 bis 6 Sätze: ' +
    'wann es losgeht und was heute ansteht (lange Blöcke erwähnen), was heute oder morgen fällig oder schon überfällig ist, ' +
    'die nächste Prüfung und was der Lernplan für heute vorsieht. Nur das Wichtigste, in deiner Rolle.',
  zuhause:
    'Ich bin gerade nach Hause gekommen. Begrüß mich kurz (passend zur Tageszeit, mit meinem Namen falls bekannt) und sag mir in 4 bis 6 Sätzen zum Vorlesen, ' +
    'was ich heute noch erledigen sollte: Hausübungen und Aufgaben für morgen oder überfällige, was der Lernplan heute vorsieht, ' +
    'die nächste Prüfung und womit morgen der Unterricht beginnt. Schlag eine sinnvolle Reihenfolge vor. Nur das Wichtigste, in deiner Rolle.',
}

/** Spoken greeting + overview. Cached per day, time of day and character, so re-playing costs nothing. */
export async function getBriefing(force = false): Promise<{ text: string; phase: 'schule' | 'zuhause' }> {
  const today = todayISO()
  const phase = await briefingPhase()
  const persona = await currentPersona()
  const cached = await getSetting<{ date: string; text: string; persona?: string; phase?: string } | null>('briefing', null)
  if (!force && cached?.date === today && cached.persona === persona.name && cached.phase === phase) return { text: cached.text, phase }
  const name = await getSetting<string>('userName', '')
  const res = await callClaude({
    system: systemPrompt(persona, await buildSchoolContext()) + (name ? `\n\nDer Nutzer heißt ${name}.` : ''),
    messages: [{ role: 'user', content: BRIEFING_PROMPT[phase] }],
    maxTokens: 450,
  })
  const text = textOf(res)
  await setSetting('briefing', { date: today, text, persona: persona.name, phase })
  return { text, phase }
}
