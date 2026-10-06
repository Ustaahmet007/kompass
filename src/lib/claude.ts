import { db, getSetting } from '../db'

/**
 * Talks to the Claude API straight from the browser with the user's own key.
 * Kompass has no server, so the key lives only on this device (never in backups).
 */

export const MODELS = {
  'claude-sonnet-5-5': { label: 'Sonnet 5.5', note: 'empfohlen', inPerM: 2, outPerM: 10 },
  'claude-haiku-4-5-20251001': { label: 'Haiku 4.5', note: 'günstiger, einfacher', inPerM: 1, outPerM: 5 },
  'claude-opus-5-5': { label: 'Opus 5.5', note: 'am klügsten, teurer', inPerM: 4, outPerM: 20 },
} as const
export type ModelId = keyof typeof MODELS
export const DEFAULT_MODEL: ModelId = 'claude-sonnet-5-5'
export const DEFAULT_BUDGET = 8 // USD per month

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface ApiMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface Tool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface ApiResponse {
  content: ContentBlock[]
  stop_reason: string
  usage: { input_tokens: number; output_tokens: number }
}

export class KiError extends Error {}

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function kiStatus() {
  const key = await getSetting<string>('apiKey', '')
  const budget = await getSetting<number>('kiBudget', DEFAULT_BUDGET)
  const usage = await db.usage.get(monthKey())
  return { hasKey: !!key, budget, spent: usage?.costUsd ?? 0 }
}

async function recordUsage(model: ModelId, input: number, output: number) {
  const m = MODELS[model] ?? MODELS[DEFAULT_MODEL]
  const cost = (input * m.inPerM + output * m.outPerM) / 1_000_000
  const key = monthKey()
  await db.transaction('rw', db.usage, async () => {
    const row = (await db.usage.get(key)) ?? { month: key, costUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0 }
    row.costUsd += cost
    row.calls += 1
    row.inputTokens += input
    row.outputTokens += output
    await db.usage.put(row)
  })
}

export async function callClaude(opts: {
  system: string
  messages: ApiMessage[]
  tools?: Tool[]
  toolChoice?: { type: 'auto' } | { type: 'tool'; name: string }
  maxTokens?: number
  model?: ModelId
}): Promise<ApiResponse> {
  const key = await getSetting<string>('apiKey', '')
  if (!key) throw new KiError('Kein API-Schlüssel eingetragen. Trag ihn unter Einstellungen → KI ein.')
  const { budget, spent } = await kiStatus()
  if (spent >= budget) {
    throw new KiError(`Monatslimit erreicht (${spent.toFixed(2)} $ von ${budget} $). Unter Einstellungen → KI kannst du es erhöhen.`)
  }
  const model = opts.model ?? (await getSetting<ModelId>('kiModel', DEFAULT_MODEL))
  if (!navigator.onLine) throw new KiError('Keine Internetverbindung. Die KI braucht Internet, der Rest von Kompass geht auch offline.')

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1500,
        system: opts.system,
        messages: opts.messages,
        ...(opts.tools ? { tools: opts.tools } : {}),
        ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
      }),
    })
  } catch {
    throw new KiError('Claude ist gerade nicht erreichbar. Prüf die Internetverbindung und versuch es nochmal.')
  }

  if (!res.ok) {
    let msg = ''
    try {
      msg = (await res.json())?.error?.message ?? ''
    } catch {
      /* ignore */
    }
    if (res.status === 401) throw new KiError('Der API-Schlüssel stimmt nicht. Prüf ihn unter Einstellungen → KI.')
    if (/credit balance/i.test(msg)) throw new KiError('Dein Guthaben bei Anthropic ist leer. Lade es auf console.anthropic.com auf.')
    if (res.status === 429) throw new KiError('Zu viele Anfragen auf einmal. Warte kurz und versuch es nochmal.')
    if (res.status === 529 || res.status >= 500) throw new KiError('Claude ist gerade überlastet. Versuch es in einer Minute nochmal.')
    throw new KiError(`Anfrage fehlgeschlagen (${res.status})${msg ? `: ${msg}` : ''}`)
  }
  const data = (await res.json()) as ApiResponse
  await recordUsage(model, data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0)
  return data
}

export function textOf(res: ApiResponse) {
  return res.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
