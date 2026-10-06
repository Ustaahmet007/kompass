/** Voice output (speechSynthesis) and input (Web Speech recognition, where Safari allows it). */

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const base = lang.slice(0, 2)
  return (
    voices.find((v) => v.lang === lang && /premium|enhanced|siri/i.test(v.name)) ??
    voices.find((v) => v.lang === lang) ??
    voices.find((v) => v.lang.startsWith(base) && /premium|enhanced|siri/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith(base))
  )
}

/** Very rough language guess so English replies get an English voice. */
function guessLang(text: string): string {
  const de = (text.match(/\b(der|die|das|und|ist|nicht|heute|morgen|du|dein|deine|ich|noch|für)\b/gi) ?? []).length
  const en = (text.match(/\b(the|and|is|not|today|tomorrow|you|your|i|still|for|boss)\b/gi) ?? []).length
  return en > de ? 'en-IE' : 'de-AT'
}

export function cleanForSpeech(text: string) {
  return text.replace(/[*_#`>]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/\s+/g, ' ').trim()
}

/**
 * iPadOS only lets a page talk after a user tap. Call this inside a tap handler
 * (e.g. when the send or mic button is pressed) so later replies can be read out.
 */
export function unlockSpeech() {
  if (!canSpeak) return
  const u = new SpeechSynthesisUtterance('')
  u.volume = 0
  window.speechSynthesis.speak(u)
}

export function speak(text: string, onEnd?: () => void) {
  if (!canSpeak) return onEnd?.()
  window.speechSynthesis.cancel()
  const clean = cleanForSpeech(text)
  const lang = guessLang(clean)
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = lang
  const v = pickVoice(lang) ?? pickVoice('de-DE') ?? pickVoice('en-GB')
  if (v) u.voice = v
  u.rate = 1.05
  u.onend = () => onEnd?.()
  u.onerror = () => onEnd?.()
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (canSpeak) window.speechSynthesis.cancel()
}

// --- Speech recognition -------------------------------------------------------

interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

const Recognition: (new () => RecognitionLike) | undefined =
  typeof window !== 'undefined'
    ? ((window as unknown as Record<string, unknown>).SpeechRecognition as new () => RecognitionLike) ??
      ((window as unknown as Record<string, unknown>).webkitSpeechRecognition as new () => RecognitionLike)
    : undefined

export const canListen = !!Recognition

export function listen(handlers: { onText: (text: string, final: boolean) => void; onEnd: () => void; onError: (msg: string) => void }) {
  if (!Recognition) {
    handlers.onError('Spracheingabe wird hier nicht unterstützt. Nimm das Mikrofon auf der Tastatur.')
    return () => {}
  }
  const r = new Recognition()
  r.lang = 'de-AT'
  r.interimResults = true
  r.continuous = false
  r.onresult = (e) => {
    let text = ''
    let final = false
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript
      if (e.results[i].isFinal) final = true
    }
    handlers.onText(text, final)
  }
  r.onerror = (e) => {
    const msg =
      e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Mikrofon-Zugriff verweigert. Erlaube ihn in den iPad-Einstellungen oder nimm das Mikrofon auf der Tastatur.'
        : e.error === 'no-speech'
          ? 'Nichts gehört. Tipp nochmal aufs Mikrofon.'
          : 'Spracheingabe hat nicht geklappt. Nimm das Mikrofon auf der Tastatur.'
    handlers.onError(msg)
  }
  r.onend = handlers.onEnd
  try {
    r.start()
  } catch {
    handlers.onError('Spracheingabe konnte nicht starten.')
    handlers.onEnd()
  }
  return () => r.stop()
}
