import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { X } from 'lucide-react'
import type { Subject } from '../db'
import { gradeColor } from '../lib/grades'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="display text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

export function Panel({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-xl border border-line bg-surface', className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
          <h2 className="font-semibold text-ink-2">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({ variant = 'secondary', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-ink text-paper hover:opacity-90',
    secondary: 'bg-surface border border-line text-ink hover:bg-sunken',
    ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
    danger: 'bg-danger-soft text-danger hover:opacity-90',
  }
  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-medium transition-colors disabled:opacity-40',
        styles[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-sunken hover:text-ink', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-ink-3">{hint}</span>}
    </label>
  )
}

const inputCls = 'w-full min-h-11 rounded-lg border border-line bg-paper px-3 text-ink placeholder:text-ink-3 focus:border-brass focus:outline-none'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, 'appearance-auto', props.className)} />
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'py-2', props.className)} />
}

export function SubjectSelect({ subjects, value, onChange, allowNone }: { subjects: Subject[]; value: number | null | undefined; onChange: (id: number | null) => void; allowNone?: boolean }) {
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      {allowNone && <option value="">Kein Fach</option>}
      {!allowNone && value == null && <option value="">Fach wählen …</option>}
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.short} – {s.name}
        </option>
      ))}
    </Select>
  )
}

/** Segmented control. */
export function Segmented<T extends string | number>({ options, value, onChange, className }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('inline-flex rounded-lg border border-line bg-sunken p-1', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-9 flex-1 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors',
            o.value === value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SubjectTag({ subject, className }: { subject?: Subject; className?: string }) {
  if (!subject) return null
  return (
    <span
      className={cx('inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-bold tracking-wide text-white', className)}
      style={{ background: subject.color }}
    >
      {subject.short}
    </span>
  )
}

export function GradeChip({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const sz = { sm: 'size-7 text-sm', md: 'size-9 text-base', lg: 'size-14 text-2xl' }[size]
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white tabular', sz)} style={{ background: gradeColor(value) }}>
      {value}
    </span>
  )
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-6 text-ink-2">
      <p>{children}</p>
      {action}
    </div>
  )
}

/** Bottom sheet on narrow screens, centred dialog on wide ones. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={ref} className="sheet-in safe-bottom relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-surface sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-line py-2 pr-2 pl-5">
          <h2 className="display text-xl">{title}</h2>
          <IconButton label="Schließen" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/** Small confirm helper built on Sheet. */
export function useConfirm() {
  const [state, setState] = useState<{ text: string; confirmLabel: string; resolve: (v: boolean) => void } | null>(null)
  const ask = (text: string, confirmLabel = 'Löschen') => new Promise<boolean>((resolve) => setState({ text, confirmLabel, resolve }))
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  const element = (
    <Sheet
      open={!!state}
      onClose={() => close(false)}
      title="Sicher?"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>Abbrechen</Button>
          <Button variant="danger" onClick={() => close(true)}>{state?.confirmLabel}</Button>
        </>
      }
    >
      <p>{state?.text}</p>
    </Sheet>
  )
  return { ask, element }
}
