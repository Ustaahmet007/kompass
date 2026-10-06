/**
 * ElevenLabs cloud voices. The user's own API key stays on this device (never synced, never in backups).
 * Playback goes through one shared <audio> element that is "unlocked" on a tap, because iPadOS
 * blocks audio that starts after an async request otherwise.
 */

const API = 'https://api.elevenlabs.io/v1'

export const ELEVEN_MODELS = {
  eleven_flash_v2_5: { label: 'Flash', note: 'schnell, verbraucht nur halb so viel Kontingent' },
  eleven_multilingual_v2: { label: 'Multilingual', note: 'beste Qualität, doppelter Verbrauch' },
} as const
export type ElevenModel = keyof typeof ELEVEN_MODELS

export interface ElevenConfig {
  key: string
  voiceId: string
  model: ElevenModel
}

let config: ElevenConfig | null = null
export function setElevenConfig(c: ElevenConfig | null) {
  config = c && c.key && c.voiceId ? c : null
}
export function elevenActive() {
  return !!config
}

export interface ElevenVoice {
  voice_id: string
  name: string
  category?: string
  preview_url?: string
  labels?: Record<string, string>
}

function headers(key: string) {
  return { 'xi-api-key': key, 'content-type': 'application/json' }
}

async function check(res: Response) {
  if (res.ok) return res
  let detail = ''
  try {
    const j = await res.json()
    detail = j?.detail?.message ?? j?.detail?.status ?? (typeof j?.detail === 'string' ? j.detail : '')
  } catch {
    /* ignore */
  }
  if (res.status === 401) {
    if (/quota/i.test(detail)) throw new Error('Das ElevenLabs-Kontingent für diesen Monat ist aufgebraucht. Bis dahin liest die iPad-Stimme vor.')
    if (/permission/i.test(detail)) throw new Error('Dem Schlüssel fehlt eine Berechtigung (Text to Speech und Voices: Read).')
    throw new Error('Der ElevenLabs-Schlüssel stimmt nicht.')
  }
  throw new Error(`ElevenLabs-Fehler ${res.status}${detail ? `: ${detail}` : ''}`)
}

/** Voices available to this account (own + saved from the Voice Library + default ones). */
export async function listElevenVoices(key: string): Promise<ElevenVoice[]> {
  const res = await check(await fetch(`${API}/voices`, { headers: headers(key) }))
  const data = await res.json()
  return (data.voices ?? []) as ElevenVoice[]
}

export async function elevenUsage(key: string) {
  const res = await check(await fetch(`${API}/user/subscription`, { headers: headers(key) }))
  const d = await res.json()
  return { used: Number(d.character_count ?? 0), limit: Number(d.character_limit ?? 0), resetsAt: d.next_character_count_reset_unix ? new Date(d.next_character_count_reset_unix * 1000) : null }
}

// ---- playback -----------------------------------------------------------------------------
let audio: HTMLAudioElement | null = null
/** A few milliseconds of silence as a WAV, used to unlock audio on a tap. */
function silentWav() {
  const samples = 800
  const buf = new ArrayBuffer(44 + samples * 2)
  const v = new DataView(buf)
  const str = (o: number, t: string) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true)
  v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples * 2, true)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}
let SILENT = ''
function player() {
  if (!audio) {
    audio = new Audio()
    audio.setAttribute('playsinline', '')
  }
  return audio
}

/** Call inside a tap: unlocks the shared audio element for later replies. */
export function unlockElevenAudio() {
  if (!config) return
  const a = player()
  if (a.src && !a.paused) return
  if (!SILENT) SILENT = silentWav()
  a.src = SILENT
  a.play().catch(() => {})
}

export function stopEleven() {
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
}

// Same text again (e.g. replaying the briefing) shouldn't cost characters twice.
const cache = new Map<string, string>()

export async function elevenSpeak(text: string, override?: Partial<ElevenConfig>): Promise<void> {
  const c = { ...config, ...override } as ElevenConfig
  if (!c.key || !c.voiceId) throw new Error('Keine ElevenLabs-Stimme gewählt.')
  const cacheKey = `${c.voiceId}|${c.model}|${text}`
  let url = cache.get(cacheKey)
  if (!url) {
    const res = await check(
      await fetch(`${API}/text-to-speech/${encodeURIComponent(c.voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { ...headers(c.key), accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: c.model ?? 'eleven_flash_v2_5' }),
      }),
    )
    url = URL.createObjectURL(await res.blob())
    cache.set(cacheKey, url)
    if (cache.size > 20) {
      const [first] = cache.keys()
      URL.revokeObjectURL(cache.get(first)!)
      cache.delete(first)
    }
  }
  const a = player()
  a.src = url
  await new Promise<void>((resolve, reject) => {
    a.onended = () => resolve()
    a.onerror = () => reject(new Error('Wiedergabe fehlgeschlagen.'))
    a.play().catch(reject)
  })
}

/** Plays a voice's preview sample (free, doesn't use the quota). */
export function playPreview(url: string) {
  const a = player()
  a.src = url
  return a.play()
}
