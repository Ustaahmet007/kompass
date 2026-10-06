import { useRef, useState } from 'react'
import { Check, ImagePlus, Trash2 } from 'lucide-react'
import { setSetting } from '../db'
import { DEFAULT_THEME, FONTS, PRESETS, type Background, type FontId, type PresetId, type ThemeSettings } from '../lib/theme'
import { deleteImage, saveImage, useImageUrl } from '../lib/images'
import { useSetting } from '../lib/hooks'
import { Button, Field, Input, Panel, Segmented, cx } from './ui'

const ACCENTS = ['#a35d16', '#c9a14a', '#b44a6c', '#3d7a48', '#2f6db5', '#7c4dbd', '#c2410c', '#0f766e']

/** Upload button + preview for one stored picture setting. */
export function ImagePicker({ value, onChange, label, aspect = 'aspect-[3/1]' }: { value: number | null | undefined; onChange: (id: number | null) => void; label: string; aspect?: string }) {
  const url = useImageUrl(value)
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pick = async (f?: File) => {
    if (!f) return
    setBusy(true)
    setError('')
    try {
      onChange(await saveImage(f, value))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Das Bild ging nicht.')
    }
    setBusy(false)
  }
  return (
    <div>
      {url ? (
        <div className={cx('relative overflow-hidden rounded-xl', aspect)}>
          <img src={url} alt={label} className="size-full object-cover" />
          <div className="absolute right-2 bottom-2 flex gap-2">
            <Button className="bg-surface" onClick={() => ref.current?.click()} disabled={busy}><ImagePlus size={17} /> Ändern</Button>
            <Button variant="danger" onClick={async () => { await deleteImage(value); onChange(null) }} aria-label={`${label} entfernen`}><Trash2 size={17} /></Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className={cx('flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-ink-2 hover:border-brass hover:text-brass', aspect)}
        >
          <ImagePlus size={24} />
          <span className="font-medium">{busy ? 'Wird gespeichert …' : `${label} auswählen`}</span>
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  )
}

export function DesignSettings() {
  const legacyMode = useSetting<'system' | 'light' | 'dark'>('theme', 'system')
  const design = useSetting<ThemeSettings | null>('design', null) ?? { ...DEFAULT_THEME, mode: legacyMode }
  const name = useSetting('userName', '')
  const homeCover = useSetting<number | null>('homeCoverId', null)
  const bgImage = useSetting<number | null>('bgImageId', null)
  const set = (patch: Partial<ThemeSettings>) => setSetting('design', { ...design, ...patch })
  const dark = document.documentElement.dataset.theme === 'dark'

  return (
    <Panel title="Design">
      <div className="space-y-6 px-4 pt-1 pb-5">
        <Field label="Wie soll Kompass dich nennen?" hint="Für die Begrüßung auf „Heute“.">
          <Input value={name} onChange={(e) => setSetting('userName', e.target.value)} placeholder="z. B. Ahmet" />
        </Field>

        <Field label="Hell oder dunkel">
          <Segmented className="w-full" value={design.mode} onChange={(v) => set({ mode: v })} options={[{ value: 'system', label: 'Wie iPad' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }]} />
        </Field>

        <div>
          <span className="mb-2 block text-sm font-medium text-ink-2">Farbthema</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.keys(PRESETS) as PresetId[]).map((id) => {
              const p = PRESETS[id]
              const t = dark ? p.dark : p.light
              const active = design.preset === id
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set({ preset: id })}
                  className={cx('relative overflow-hidden rounded-xl border-2 p-3 text-left transition-colors', active ? 'border-brass' : 'border-line')}
                  style={{ background: t.paper, color: t.ink }}
                >
                  <div className="mb-2 flex gap-1.5">
                    <span className="h-6 flex-1 rounded-md" style={{ background: t.surface, border: `1px solid ${t.line}` }} />
                    <span className="size-6 rounded-full" style={{ background: t.accent }} />
                  </div>
                  <span className="font-semibold">{p.name}</span>
                  {active && <Check size={16} className="absolute top-2 right-2" style={{ color: t.accent }} />}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-ink-2">Akzentfarbe</span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => set({ accent: null })} aria-pressed={!design.accent} className={cx('min-h-9 rounded-full border px-3 text-sm font-medium', !design.accent ? 'border-brass bg-brass-soft text-brass' : 'border-line text-ink-2')}>
              Vom Thema
            </button>
            {ACCENTS.map((c) => (
              <button key={c} type="button" aria-label={`Akzent ${c}`} aria-pressed={design.accent === c} onClick={() => set({ accent: c })} className={cx('size-9 rounded-full', design.accent === c && 'ring-3 ring-ink ring-offset-2 ring-offset-surface')} style={{ background: c }} />
            ))}
            <label className="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-line text-xs text-ink-3" title="Eigene Farbe">
              +
              <input type="color" value={design.accent ?? '#a35d16'} onChange={(e) => set({ accent: e.target.value })} className="absolute inset-0 opacity-0" aria-label="Eigene Akzentfarbe" />
            </label>
          </div>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-ink-2">Schrift für Überschriften</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(FONTS) as FontId[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={design.font === f}
                onClick={() => set({ font: f })}
                className={cx('rounded-xl border-2 px-3 py-2.5 text-left', design.font === f ? 'border-brass bg-brass-soft/50' : 'border-line')}
              >
                <span className="block text-2xl" style={{ fontFamily: FONTS[f].family, fontWeight: f === 'nunito' ? 800 : f === 'archivo' ? 700 : 600, fontStretch: f === 'archivo' ? '125%' : undefined }}>Heute</span>
                <span className="text-sm text-ink-2">{FONTS[f].label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Field label="Hintergrund">
            <Segmented<Background> className="w-full" value={design.background} onChange={(v) => set({ background: v })} options={[{ value: 'plain', label: 'Schlicht' }, { value: 'grid', label: 'Karopapier' }, { value: 'image', label: 'Eigenes Foto' }]} />
          </Field>
          {design.background === 'image' && (
            <>
              <ImagePicker value={bgImage} onChange={(id) => setSetting('bgImageId', id)} label="Hintergrundfoto" aspect="aspect-[4/3]" />
              <Field label={`Abdunkeln: ${design.bgDim} %`} hint="Mehr = Text besser lesbar">
                <input type="range" min={0} max={90} step={5} value={design.bgDim} onChange={(e) => set({ bgDim: Number(e.target.value) })} className="w-full accent-[var(--brass)]" />
              </Field>
              <Field label={`Unschärfe: ${design.bgBlur} px`}>
                <input type="range" min={0} max={24} step={2} value={design.bgBlur} onChange={(e) => set({ bgBlur: Number(e.target.value) })} className="w-full accent-[var(--brass)]" />
              </Field>
            </>
          )}
        </div>

        <Field label="Titelbild auf „Heute“">
          <ImagePicker value={homeCover} onChange={(id) => setSetting('homeCoverId', id)} label="Titelbild" />
        </Field>
        <p className="text-sm text-ink-3">Titelbilder für einzelne Fächer stellst du auf der jeweiligen Fach-Seite ein. Fotos werden verkleinert und bleiben nur auf diesem Gerät (und in deiner Sicherung).</p>
      </div>
    </Panel>
  )
}
