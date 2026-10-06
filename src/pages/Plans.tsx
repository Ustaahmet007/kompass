import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Check, FileText, RefreshCw, Sparkles, Timer as TimerIcon, Trash2, X } from 'lucide-react'
import { db, setSetting, getSetting, type Exam, type PlanItem, type StudyPlan } from '../db'
import { daysBetween, formatDate, formatLong } from '../lib/date'
import { useSubjects, useToday } from '../lib/hooks'
import { KiError, fileToBase64 } from '../lib/claude'
import { generatePlan, replan } from '../lib/planner'
import { KiSetupCard, useKi } from '../components/KiGate'
import { Button, Empty, Field, IconButton, Input, PageHeader, Panel, Segmented, Select, SubjectSelect, SubjectTag, Textarea, cx, useConfirm } from '../components/ui'

const KIND_LABEL: Record<PlanItem['kind'], string> = { lernen: 'Neuer Stoff', wiederholen: 'Wiederholen', probe: 'Probeprüfung' }

export function planProgress(p: StudyPlan) {
  const total = p.items.reduce((a, i) => a + i.minutes, 0)
  const done = p.items.filter((i) => i.done).reduce((a, i) => a + i.minutes, 0)
  return total ? done / total : 0
}

export default function Plans() {
  const { id } = useParams()
  if (id === 'neu') return <NewPlan />
  if (id) return <PlanDetail id={Number(id)} />
  return <PlanList />
}

function PlanList() {
  const today = useToday()
  const { byId } = useSubjects()
  const plans = useLiveQuery(() => db.plans.orderBy('deadline').toArray(), [], [] as StudyPlan[])
  const ki = useKi()
  const active = plans.filter((p) => p.deadline >= today)
  const past = plans.filter((p) => p.deadline < today).reverse()

  return (
    <div>
      <PageHeader
        title="Lernziele"
        subtitle="Sag, bis wann und was. Claude plant, was du wann lernst."
        action={ki?.hasKey && <Link to="/lernziele/neu"><Button variant="primary"><Sparkles size={18} /> Neuer Lernplan</Button></Link>}
      />
      {ki && !ki.hasKey && <div className="mb-5"><KiSetupCard what="Der Lernplaner" /></div>}
      {plans.length ? (
        <div className="space-y-5">
          {[{ label: 'Aktiv', list: active }, { label: 'Vorbei', list: past }].filter((g) => g.list.length).map((g) => (
            <Panel key={g.label} title={g.label}>
              <ul className="divide-y divide-line">
                {g.list.map((p) => {
                  const pr = planProgress(p)
                  const s = byId.get(p.subjectId ?? -1)
                  const d = daysBetween(today, p.deadline)
                  const todayItems = p.items.filter((i) => i.date === today)
                  return (
                    <li key={p.id}>
                      <Link to={`/lernziele/${p.id}`} className="block px-4 py-3 hover:bg-sunken">
                        <div className="flex items-center gap-2">
                          <SubjectTag subject={s} />
                          <span className="truncate font-semibold">{p.title}</span>
                          <span className="ml-auto shrink-0 text-sm text-ink-2">{d >= 0 ? (d === 0 ? 'heute' : `noch ${d} ${d === 1 ? 'Tag' : 'Tage'}`) : formatDate(p.deadline)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                            <div className="h-full rounded-full bg-ok" style={{ width: `${pr * 100}%` }} />
                          </div>
                          <span className="w-10 text-right text-sm text-ink-2 tabular">{Math.round(pr * 100)} %</span>
                        </div>
                        {todayItems.length > 0 && (
                          <p className="mt-1.5 text-sm text-brass">Heute: {todayItems.map((i) => `${i.topic} (${i.minutes} min)${i.done ? ' ✓' : ''}`).join(', ')}</p>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          ))}
        </div>
      ) : (
        ki?.hasKey && (
          <Panel>
            <Empty action={<Link to="/lernziele/neu"><Button>Ersten Lernplan erstellen</Button></Link>}>Noch keine Lernpläne.</Empty>
          </Panel>
        )
      )}
    </div>
  )
}

function NewPlan() {
  const nav = useNavigate()
  const today = useToday()
  const { subjects, byId } = useSubjects()
  const exams = useLiveQuery(() => db.exams.where('date').above(today).sortBy('date'), [today], [] as Exam[])
  const ki = useKi()
  const [examId, setExamId] = useState<number | null>(null)
  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [deadline, setDeadline] = useState('')
  const [minutes, setMinutes] = useState(45)
  const [availability, setAvailability] = useState('')
  const [material, setMaterial] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const exam = exams.find((e) => e.id === examId)
  const subject = byId.get(exam?.subjectId ?? subjectId ?? -1)
  const effectiveDeadline = exam?.date ?? deadline
  const valid = !!effectiveDeadline && effectiveDeadline > today && (!!material.trim() || !!file || !!exam?.topic)

  const pickExam = (v: string) => {
    const e = exams.find((x) => x.id === Number(v))
    setExamId(e?.id ?? null)
    if (e) {
      setSubjectId(e.subjectId)
      if (!material.trim() && e.topic) setMaterial(e.topic)
    }
  }

  const onFile = (f?: File) => {
    setError('')
    if (!f) return
    if (f.type !== 'application/pdf') return setError('Nur PDF-Dateien gehen hier.')
    if (f.size > 15 * 1024 * 1024) return setError('Das PDF ist größer als 15 MB. Nimm nur die Kapitel, die zur Prüfung kommen.')
    setFile(f)
  }

  const create = async () => {
    if (!valid) return
    setBusy(true)
    setError('')
    try {
      const pdf = file ? { name: file.name, base64: await fileToBase64(file) } : undefined
      const examLabel = exam ? `${exam.kind} ${byId.get(exam.subjectId)?.name ?? ''} am ${exam.date}: ${exam.topic}` : undefined
      const result = await generatePlan({ subjectName: subject?.name, examLabel, deadline: effectiveDeadline, minutesPerDay: minutes, availability, material, pdf })
      await setSetting('lastAvailability', availability)
      const now = Date.now()
      const id = await db.plans.add({
        title: result.title,
        subjectId: subject?.id ?? null,
        examId: exam?.id ?? null,
        deadline: effectiveDeadline,
        minutesPerDay: minutes,
        availability,
        material,
        materialFileName: file?.name,
        tips: result.tips,
        items: result.items,
        createdAt: now,
        updatedAt: now,
      })
      nav(`/lernziele/${id}`, { replace: true })
    } catch (e) {
      setError(e instanceof KiError || e instanceof Error ? e.message : 'Etwas ist schiefgelaufen.')
      setBusy(false)
    }
  }

  // Remember the last availability text — it rarely changes.
  useEffect(() => {
    getSetting('lastAvailability', '').then((v) => v && setAvailability((a) => a || v))
  }, [])

  if (ki && !ki.hasKey) return <div><BackLink /><KiSetupCard what="Der Lernplaner" /></div>

  return (
    <div>
      <BackLink />
      <PageHeader title="Neuer Lernplan" subtitle="Je genauer der Stoff, desto besser der Plan." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel>
          <div className="space-y-5 p-4">
            <Field label="Für welche Prüfung?">
              <Select value={examId ?? ''} onChange={(e) => pickExam(e.target.value)}>
                <option value="">Keine eingetragene Prüfung – selbst festlegen</option>
                {exams.map((e) => <option key={e.id} value={e.id}>{formatDate(e.date)} · {e.kind} {byId.get(e.subjectId)?.short}{e.topic ? ` – ${e.topic}` : ''}</option>)}
              </Select>
            </Field>
            {!exam && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fach"><SubjectSelect subjects={subjects} value={subjectId} onChange={setSubjectId} allowNone /></Field>
                <Field label="Bis wann?"><Input type="date" min={today} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
              </div>
            )}
            <Field label="Zeit pro Tag">
              <Segmented className="w-full" value={minutes} onChange={setMinutes} options={[20, 30, 45, 60, 90].map((m) => ({ value: m, label: `${m} min` }))} />
            </Field>
            <Field label="Wann hast du keine Zeit?" hint="Claude kennt deinen Stundenplan schon.">
              <Textarea rows={2} value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder="z. B. Samstag Bäckerei, Mittwoch Training, Sonntag nur abends" />
            </Field>
            <Field label="Stoff" hint="Themen, Kapitel, Buchseiten oder was die Lehrkraft gesagt hat.">
              <Textarea rows={6} value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="z. B. Matrizen: Addition, Multiplikation, Inverse; Gleichungssysteme mit Gauß; Buch S. 120–148" />
            </Field>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink-2">Unterlagen als PDF (optional)</span>
              {file ? (
                <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                  <FileText size={20} className="text-brass" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="text-sm text-ink-3">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                  <IconButton label="PDF entfernen" onClick={() => setFile(null)}><X size={18} /></IconButton>
                </div>
              ) : (
                <Button onClick={() => fileRef.current?.click()}><FileText size={18} /> PDF auswählen</Button>
              )}
              <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger" role="alert">{error}</p>}
            <Button variant="primary" className="w-full" onClick={create} disabled={!valid || busy}>
              {busy ? <><RefreshCw size={18} className="animate-spin" /> Claude plant … (ca. 20–40 s)</> : <><Sparkles size={18} /> Lernplan erstellen</>}
            </Button>
            <p className="text-center text-sm text-ink-3">Kostet ungefähr {file ? '5–15' : '2–5'} Cent{ki ? ` · diesen Monat ${ki.spent.toFixed(2)} $ von ${ki.budget} $` : ''}</p>
          </div>
        </Panel>
        <Panel title="So plant Claude" className="self-start">
          <ul className="space-y-2 px-4 pb-4 text-ink-2">
            <li>Neuer Stoff zuerst, dann Wiederholungen mit Abstand dazwischen.</li>
            <li>1–3 Tage vorher eine Probeprüfung unter Zeitdruck.</li>
            <li>Lange Schultage und deine anderen Prüfungen werden berücksichtigt.</li>
            <li>Kommt was dazwischen: im Plan auf „Neu planen" tippen.</li>
          </ul>
        </Panel>
      </div>
    </div>
  )
}

function BackLink() {
  const nav = useNavigate()
  return (
    <button type="button" onClick={() => nav('/lernziele')} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-ink-2 hover:text-ink">
      <ArrowLeft size={18} /> Lernziele
    </button>
  )
}

function PlanDetail({ id }: { id: number }) {
  const nav = useNavigate()
  const today = useToday()
  const { byId } = useSubjects()
  const plan = useLiveQuery(() => db.plans.get(id), [id])
  const ki = useKi()
  const [replanOpen, setReplanOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const confirm = useConfirm()

  if (plan === undefined) return null
  if (!plan) return <div><BackLink /><Panel><Empty>Diesen Lernplan gibt es nicht mehr.</Empty></Panel></div>

  const s = byId.get(plan.subjectId ?? -1)
  const pr = planProgress(plan)
  const missed = plan.items.filter((i) => !i.done && i.date < today).length
  const toggle = (idx: number) => db.plans.update(plan.id!, { items: plan.items.map((it, j) => (j === idx ? { ...it, done: !it.done } : it)), updatedAt: Date.now() })
  const byDate = new Map<string, { item: PlanItem; idx: number }[]>()
  plan.items.forEach((item, idx) => byDate.set(item.date, [...(byDate.get(item.date) ?? []), { item, idx }]))

  const doReplan = async () => {
    setBusy(true)
    setError('')
    try {
      await replan(plan, note)
      setReplanOpen(false)
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Etwas ist schiefgelaufen.')
    }
    setBusy(false)
  }
  const learnNow = async () => {
    const t = await getSetting<Record<string, unknown>>('timer', {})
    await setSetting('timer', { ...{ phase: 'focus', running: false, endsAt: null, focusMin: 25, breakMin: 5, focusStartedAt: null, remainingMs: 25 * 60_000 }, ...t, subjectId: plan.subjectId ?? null })
    nav('/lerntimer')
  }
  const remove = async () => {
    if (await confirm.ask(`„${plan.title}" wird gelöscht.`)) {
      await db.plans.delete(plan.id!)
      nav('/lernziele')
    }
  }

  return (
    <div>
      <BackLink />
      <header className="mb-6 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><SubjectTag subject={s} /><span className="text-ink-2">bis {formatLong(plan.deadline)}</span></div>
          <h1 className="display mt-1 text-3xl sm:text-4xl">{plan.title}</h1>
          <div className="mt-3 flex max-w-md items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-ok" style={{ width: `${pr * 100}%` }} /></div>
            <span className="text-sm text-ink-2 tabular">{Math.round(pr * 100)} % geschafft</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {ki?.hasKey && plan.deadline >= today && <Button onClick={() => setReplanOpen((v) => !v)}><RefreshCw size={18} /> Neu planen</Button>}
          <IconButton label="Lernplan löschen" onClick={remove}><Trash2 size={19} /></IconButton>
        </div>
      </header>

      {missed > 0 && !replanOpen && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-brass-soft px-4 py-3 text-ink">
          {missed} {missed === 1 ? 'Einheit ist' : 'Einheiten sind'} liegen geblieben.
          {ki?.hasKey && <button type="button" className="font-semibold text-brass underline" onClick={() => setReplanOpen(true)}>Plan anpassen lassen</button>}
        </p>
      )}

      {replanOpen && (
        <Panel className="mb-5">
          <div className="space-y-3 p-4">
            <Field label="Was hat sich geändert? (optional)">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Donnerstag kann ich nicht, Kapitel 3 kann ich schon" />
            </Field>
            {error && <p className="text-danger" role="alert">{error}</p>}
            <div className="flex gap-2">
              <Button variant="primary" onClick={doReplan} disabled={busy}>{busy ? <><RefreshCw size={18} className="animate-spin" /> Plant neu …</> : 'Neu planen'}</Button>
              <Button variant="ghost" onClick={() => setReplanOpen(false)}>Abbrechen</Button>
            </div>
            <p className="text-sm text-ink-3">Erledigtes bleibt, der Rest wird ab heute neu verteilt. Kostet ca. 2–5 Cent.</p>
          </div>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel>
          <ol>
            {[...byDate.entries()].map(([date, entries]) => {
              const isToday = date === today
              const past = date < today
              return (
                <li key={date} className={cx('border-b border-line px-4 py-3 last:border-b-0', isToday && 'bg-brass-soft/60')}>
                  <p className={cx('mb-1.5 text-sm font-semibold', isToday ? 'text-brass' : past ? 'text-ink-3' : 'text-ink-2')}>
                    {isToday ? 'Heute' : formatDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}
                  </p>
                  <ul className="space-y-2">
                    {entries.map(({ item, idx }) => (
                      <li key={idx} className="flex items-start gap-3">
                        <button type="button" onClick={() => toggle(idx)} aria-label={item.done ? 'Als offen markieren' : 'Als erledigt markieren'} className="-m-2 flex size-11 shrink-0 items-center justify-center">
                          <span className={cx('flex size-6 items-center justify-center rounded-md border-2', item.done ? 'border-ok bg-ok text-white' : past ? 'border-danger' : 'border-ink-3')}>
                            {item.done && <Check size={16} strokeWidth={3} />}
                          </span>
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={cx('font-medium', item.done && 'text-ink-3 line-through')}>
                            {item.topic}
                            <span className="ml-2 text-sm font-normal text-ink-3">{item.minutes} min · {KIND_LABEL[item.kind]}</span>
                          </p>
                          {item.details && !item.done && <p className="mt-0.5 text-sm text-ink-2">{item.details}</p>}
                        </div>
                        {isToday && !item.done && (
                          <IconButton label="Mit Lerntimer starten" onClick={learnNow}><TimerIcon size={19} /></IconButton>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ol>
        </Panel>
        <div className="space-y-5">
          {plan.tips && (
            <Panel title="Tipps von Claude"><p className="px-4 pb-4 whitespace-pre-line text-ink-2">{plan.tips}</p></Panel>
          )}
          <Panel title="Grundlage">
            <div className="space-y-2 px-4 pb-4 text-sm text-ink-2">
              <p>{plan.minutesPerDay} min pro Tag{plan.availability ? ` · ${plan.availability}` : ''}</p>
              {plan.materialFileName && <p className="flex items-center gap-1.5"><FileText size={15} /> {plan.materialFileName}</p>}
              {plan.material && <p className="line-clamp-6 whitespace-pre-line">{plan.material}</p>}
            </div>
          </Panel>
          {!ki?.hasKey && <Link to="/einstellungen" className="text-sm text-brass">KI einrichten, um neu planen zu können</Link>}
        </div>
      </div>
      {confirm.element}
    </div>
  )
}
