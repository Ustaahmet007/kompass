import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Move, RotateCcw, ZoomIn } from 'lucide-react'
import { DEFAULT_FRAMING, framingStyle, setFraming, useImage, type Framing } from '../lib/images'
import { Button, Sheet, cx } from './ui'

/** A stored picture filling its box, framed the way the user set it. */
export function FramedImage({ id, className, blur = 0, alt = '' }: { id?: number | null; className?: string; blur?: number; alt?: string }) {
  const { url, framing } = useImage(id)
  if (!url) return null
  return (
    <img
      src={url}
      alt={alt}
      draggable={false}
      className={cx('size-full', className)}
      style={{ ...framingStyle(framing, blur ? 1.08 : 1), filter: blur ? `blur(${blur}px)` : undefined }}
    />
  )
}

/** Where a picture is shown, so the editor can use the same proportions. */
export type FrameKind = 'home' | 'subject' | 'background' | 'thumb'

export function frameAspect(kind: FrameKind): number {
  const w = window.innerWidth
  const wide = w >= 1000 || (w >= 860 && window.matchMedia('(orientation: landscape)').matches)
  const content = Math.min(w - (wide ? 240 : 0) - (wide ? 96 : 40), 1152)
  switch (kind) {
    case 'home':
      return content / (w >= 640 ? 256 : 208)
    case 'subject':
      return content / (w >= 640 ? 208 : 160)
    case 'background':
      return w / window.innerHeight
    case 'thumb':
      return 56 / 44
  }
}

/**
 * Framing editor: drag the picture to choose the visible part, zoom with the slider.
 * The frame has the exact proportions of where the picture is shown.
 */
export function FramingSheet({ id, kind, open, onClose, overlay, title = 'Ausschnitt wählen' }: { id: number | null | undefined; kind: FrameKind; open: boolean; onClose: () => void; overlay?: ReactNode; title?: string }) {
  if (!open || !id) return null
  return <FramingEditor key={id} id={id} kind={kind} onClose={onClose} overlay={overlay} title={title} />
}

function FramingEditor({ id, kind, onClose, overlay, title }: { id: number; kind: FrameKind; onClose: () => void; overlay?: ReactNode; title: string }) {
  const { url, framing, width, height } = useImage(id)
  const [f, setF] = useState<Framing | null>(null)
  const [aspect] = useState(() => frameAspect(kind))
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; start: Framing } | null>(null)
  const [dragging, setDragging] = useState(false)

  // Start from the stored framing once it has loaded.
  useEffect(() => {
    if (url && !f) setF(framing)
  }, [url, f, framing])
  if (!url || !f) return null

  /** How many px the picture can move per axis — 1px drag ≈ 1px movement. */
  const slack = () => {
    const box = frame.current!.getBoundingClientRect()
    const ar = width && height ? width / height : 1
    const coverW = Math.max(box.width, box.height * ar) * f.zoom
    const coverH = Math.max(box.height, box.width / ar) * f.zoom
    return { x: Math.max(1, coverW - box.width), y: Math.max(1, coverH - box.height) }
  }
  const clamp = (v: number) => Math.min(100, Math.max(0, v))
  const onDown = (e: PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, start: f }
    setDragging(true)
  }
  const onMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const s = slack()
    setF({ ...d.start, focusX: clamp(d.start.focusX - ((e.clientX - d.x) / s.x) * 100), focusY: clamp(d.start.focusY - ((e.clientY - d.y) / s.y) * 100) })
  }
  const onUp = () => {
    drag.current = null
    setDragging(false)
  }
  const save = async () => {
    await setFraming(id, f)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => setF(DEFAULT_FRAMING)}><RotateCcw size={17} /> Zurücksetzen</Button>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={save}>Fertig</Button>
        </>
      }
    >
      <p className="mb-3 flex items-center gap-2 text-sm text-ink-2"><Move size={16} /> Bild ziehen, um den Ausschnitt zu verschieben.</p>
      <div
        ref={frame}
        className={cx('relative mx-auto touch-none overflow-hidden rounded-2xl bg-sunken select-none', dragging ? 'cursor-grabbing' : 'cursor-grab', kind === 'thumb' && 'mx-auto max-w-48')}
        style={{ aspectRatio: String(aspect), width: `min(100%, calc(52dvh * ${aspect}))` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => setF({ ...f, zoom: Math.min(3, Math.max(1, f.zoom - e.deltaY * 0.002)) })}
      >
        <img src={url} alt="" draggable={false} className="pointer-events-none size-full" style={framingStyle(f)} />
        {overlay && <div className="pointer-events-none absolute inset-0">{overlay}</div>}
        {dragging && (
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden>
            {Array.from({ length: 9 }, (_, i) => <span key={i} className="border border-white/35" />)}
          </div>
        )}
      </div>
      <label className="mt-4 flex items-center gap-3">
        <ZoomIn size={18} className="shrink-0 text-ink-2" />
        <span className="sr-only">Zoom</span>
        <input type="range" min={1} max={3} step={0.02} value={f.zoom} onChange={(e) => setF({ ...f, zoom: Number(e.target.value) })} className="w-full accent-[var(--brass)]" />
        <span className="w-14 shrink-0 text-right text-sm whitespace-nowrap text-ink-2 tabular">{Math.round(f.zoom * 100)} %</span>
      </label>
    </Sheet>
  )
}
