/** Colour themes, heading fonts and backgrounds. Applied as CSS variables on <html>. */

type Tokens = { paper: string; surface: string; sunken: string; ink: string; ink2: string; ink3: string; line: string; grid: string; accent: string; accentSoft: string }

export interface Preset {
  name: string
  light: Tokens
  dark: Tokens
}

export const PRESETS = {
  kamin: {
    name: 'Kaminabend',
    light: { paper: '#f2ebe1', surface: '#fffaf3', sunken: '#ece3d6', ink: '#2e2420', ink2: '#65554b', ink3: '#9a897c', line: '#e2d6c6', grid: '#e9e0d3', accent: '#a35d16', accentSoft: '#f6e3c8' },
    dark: { paper: '#1c1613', surface: '#271f1a', sunken: '#211a16', ink: '#f1e5d6', ink2: '#c3b2a1', ink3: '#8c7a6b', line: '#3a2f27', grid: '#221b17', accent: '#e8a65a', accentSoft: '#3d2a17' },
  },
  academia: {
    name: 'Dark Academia',
    light: { paper: '#ebe4d4', surface: '#f8f3e7', sunken: '#e3dac6', ink: '#2a2418', ink2: '#5e5440', ink3: '#958a72', line: '#d6cbb2', grid: '#e1d8c4', accent: '#7d5f1c', accentSoft: '#eadcb5' },
    dark: { paper: '#16130f', surface: '#211c16', sunken: '#1b1712', ink: '#ebdfc6', ink2: '#bcae92', ink3: '#857961', line: '#3a3226', grid: '#1d1914', accent: '#c9a14a', accentSoft: '#382d16' },
  },
  wald: {
    name: 'Wald',
    light: { paper: '#ecefe6', surface: '#fafbf6', sunken: '#e2e7da', ink: '#1f2a21', ink2: '#4f5e51', ink3: '#86947f', line: '#d4dccb', grid: '#e1e6d9', accent: '#3d7a48', accentSoft: '#d8ead5' },
    dark: { paper: '#111813', surface: '#19231b', sunken: '#141d16', ink: '#e2ebdd', ink2: '#a9b9a6', ink3: '#728370', line: '#2a382c', grid: '#152017', accent: '#82c08b', accentSoft: '#1f3424' },
  },
  mitternacht: {
    name: 'Mitternacht',
    light: { paper: '#f3f6fa', surface: '#ffffff', sunken: '#e9eef5', ink: '#13254a', ink2: '#4d5d7a', ink3: '#7d8aa3', line: '#d6dfeb', grid: '#e3e9f2', accent: '#9a6b14', accentSoft: '#f6ead0' },
    dark: { paper: '#0b1322', surface: '#131e35', sunken: '#0f182b', ink: '#e4eaf4', ink2: '#a3b1c9', ink3: '#6f7f9b', line: '#24345a', grid: '#131d33', accent: '#dcae55', accentSoft: '#33290f' },
  },
  rose: {
    name: 'Rosé',
    light: { paper: '#f7ecec', surface: '#fffafa', sunken: '#f0e1e2', ink: '#3a2329', ink2: '#6e535a', ink3: '#a08890', line: '#ead7d9', grid: '#f0e3e4', accent: '#b44a6c', accentSoft: '#f8dbe4' },
    dark: { paper: '#1c1417', surface: '#281c21', sunken: '#22181c', ink: '#f3e3e8', ink2: '#c7aeb6', ink3: '#8e7780', line: '#3d2c33', grid: '#21171b', accent: '#ec8fab', accentSoft: '#40222d' },
  },
} satisfies Record<string, Preset>

export type PresetId = keyof typeof PRESETS
export type FontId = 'fraunces' | 'archivo' | 'nunito'
export type Background = 'plain' | 'grid' | 'image'

export const FONTS: Record<FontId, { label: string; family: string }> = {
  fraunces: { label: 'Gemütlich (Serif)', family: "'Fraunces Variable', Georgia, serif" },
  archivo: { label: 'Technisch (breit)', family: "'Archivo Variable', system-ui, sans-serif" },
  nunito: { label: 'Rund', family: "'Nunito Variable', system-ui, sans-serif" },
}

export interface ThemeSettings {
  preset: PresetId
  mode: 'system' | 'light' | 'dark'
  accent: string | null
  font: FontId
  background: Background
  bgDim: number // 0–90 %
  bgBlur: number // px
  subjectColors?: string
}

export const DEFAULT_THEME: ThemeSettings = { preset: 'kamin', mode: 'system', accent: null, font: 'fraunces', background: 'plain', bgDim: 55, bgBlur: 6 }

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
const rgba = (hex: string, a: number) => {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
/** Mix a colour towards another (t = 0 → a, 1 → b). */
function mix(a: string, b: string, t: number) {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  const c = (k: 'r' | 'g' | 'b') => Math.round(x[k] + (y[k] - x[k]) * t).toString(16).padStart(2, '0')
  return `#${c('r')}${c('g')}${c('b')}`
}

export function applyTheme(t: ThemeSettings, systemDark: boolean) {
  const dark = t.mode === 'dark' || (t.mode === 'system' && systemDark)
  const preset = PRESETS[t.preset] ?? PRESETS.kamin
  const tok = dark ? preset.dark : preset.light
  const accent = t.accent ?? tok.accent
  const accentSoft = t.accent ? mix(t.accent, tok.surface, dark ? 0.78 : 0.82) : tok.accentSoft
  const imageBg = t.background === 'image'
  const root = document.documentElement
  const set = (k: string, v: string) => root.style.setProperty(k, v)
  set('--paper', tok.paper)
  set('--surface', imageBg ? rgba(tok.surface, 0.86) : tok.surface)
  set('--sunken', tok.sunken)
  set('--ink', tok.ink)
  set('--ink-2', tok.ink2)
  set('--ink-3', tok.ink3)
  set('--line', imageBg ? rgba(tok.line, 0.8) : tok.line)
  set('--grid', tok.grid)
  set('--brass', accent)
  set('--brass-soft', accentSoft)
  set('--display-font', FONTS[t.font]?.family ?? FONTS.fraunces.family)
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.bg = t.background
  root.dataset.font = t.font
  root.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tok.paper)
  return { dark, tokens: tok }
}

export type SubjectColorMode = 'thema' | 'einfarbig' | 'schlicht' | 'eigene'

/** Older saved values from before the theme palettes existed. */
export function normalizeColorMode(m?: string): SubjectColorMode {
  if (m === 'thema' || m === 'einfarbig' || m === 'schlicht' || m === 'eigene') return m
  if (m === 'kraeftig') return 'eigene'
  return 'thema'
}

/**
 * Subject palettes that belong to each theme. All are mid-dark so white text stays readable
 * in light and dark mode. `mono` is the single colour for "Einfarbig".
 */
export const SUBJECT_PALETTES: Record<PresetId, { colors: string[]; mono: string }> = {
  kamin: { colors: ['#8a5a3c', '#5f6b4a', '#a0522d', '#4f5d6b', '#9c6b30', '#7a3e2f', '#6b5a4a', '#56614f', '#8b6d5c', '#704a3a'], mono: '#7a5a44' },
  academia: { colors: ['#5a4632', '#6b2d2d', '#3f4a3a', '#7a6233', '#2f3d4f', '#5c3b4a', '#4a5240', '#806040', '#3a3a52', '#6a4a2a'], mono: '#4a3c2c' },
  wald: { colors: ['#3d6b47', '#6b6a3a', '#2f5d5a', '#5a7a3a', '#4a5a6b', '#3a5a3a', '#7a5a3a', '#2f4f4a', '#5a6b4f', '#4a6b5a'], mono: '#3d5f47' },
  mitternacht: { colors: ['#2c3e6b', '#3b5b8a', '#4a4a7a', '#2f5f7a', '#5a4a7a', '#3a6a8a', '#1f4a6a', '#6a5a8a', '#34506a', '#4a3a6a'], mono: '#2f4470' },
  rose: { colors: ['#9a4a62', '#7a4a6a', '#b0607a', '#6a4a5a', '#a0505a', '#8a5a7a', '#b07060', '#7a3a4a', '#94627a', '#6a5060'], mono: '#8a4a5e' },
}

/** Colour a subject is shown in, depending on the chosen style and theme. `index` = stable position of the subject. */
export function displaySubjectColor(hex: string, mode: SubjectColorMode, index: number, preset: PresetId) {
  const pal = SUBJECT_PALETTES[preset] ?? SUBJECT_PALETTES.kamin
  if (mode === 'eigene') return hex
  if (mode === 'einfarbig') return pal.mono
  return pal.colors[index % pal.colors.length]
}
