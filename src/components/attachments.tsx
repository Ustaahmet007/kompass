import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, Loader2, Paperclip, X } from 'lucide-react'
import { db, type Attachment } from '../db'
import { saveImage, useImageUrl } from '../lib/images'
import { fetchFileBlob } from '../lib/sync'
import { Button, IconButton } from './ui'

const MAX_FILE = 25 * 1024 * 1024

const sizeLabel = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** Stores picked files: photos are shrunk into `images`, everything else (PDFs) goes into `files`. */
export async function storeAttachments(files: FileList | File[]): Promise<{ added: Attachment[]; skipped: string[] }> {
  const added: Attachment[] = []
  const skipped: string[] = []
  for (const f of Array.from(files)) {
    try {
      if (f.type.startsWith('image/')) {
        added.push({ kind: 'image', id: await saveImage(f) })
      } else {
        if (f.size > MAX_FILE) {
          skipped.push(`${f.name} (größer als 25 MB)`)
          continue
        }
        const id = (await db.files.add({ name: f.name, type: f.type || 'application/octet-stream', size: f.size, blob: f, createdAt: Date.now() })) as number
        added.push({ kind: 'file', id })
      }
    } catch {
      skipped.push(f.name)
    }
  }
  return { added, skipped }
}

export async function deleteAttachments(list?: Attachment[]) {
  for (const a of list ?? []) {
    if (a.kind === 'image') await db.images.delete(a.id)
    else await db.files.delete(a.id)
  }
}

/** "Foto / PDF" button plus the grid of what is attached to a note. */
export function NoteAttachments({ noteId, attachments }: { noteId: number; attachments: Attachment[] }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [viewing, setViewing] = useState<number | null>(null)

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setMsg('')
    const { added, skipped } = await storeAttachments(files)
    const note = await db.notes.get(noteId)
    if (note) await db.notes.update(noteId, { attachments: [...(note.attachments ?? []), ...added], updatedAt: Date.now() })
    if (skipped.length) setMsg(`Nicht angehängt: ${skipped.join(', ')}`)
    setBusy(false)
    if (input.current) input.current.value = ''
  }
  const remove = async (a: Attachment) => {
    const note = await db.notes.get(noteId)
    if (!note) return
    await db.notes.update(noteId, { attachments: (note.attachments ?? []).filter((x) => !(x.kind === a.kind && x.id === a.id)), updatedAt: Date.now() })
    await deleteAttachments([a])
  }

  const images = attachments.filter((a) => a.kind === 'image')
  const files = attachments.filter((a) => a.kind === 'file')

  return (
    <div className="border-t border-line px-5 pt-3 pb-4">
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />} Foto / PDF
        </Button>
        <span className="text-sm text-ink-3">{attachments.length ? `${attachments.length} angehängt` : 'Tafelbild, Arbeitsblatt, Skript …'}</span>
        <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => add(e.target.files)} />
      </div>
      {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}
      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((a) => <ImageThumb key={a.id} id={a.id} onOpen={() => setViewing(a.id)} onRemove={() => remove(a)} />)}
        </div>
      )}
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((a) => <FileTile key={a.id} id={a.id} onRemove={() => remove(a)} />)}
        </ul>
      )}
      {viewing != null && <ImageViewer ids={images.map((a) => a.id)} start={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function ImageThumb({ id, onOpen, onRemove }: { id: number; onOpen: () => void; onRemove: () => void }) {
  const url = useImageUrl(id)
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg bg-sunken">
      <button type="button" onClick={onOpen} className="size-full" aria-label="Foto ansehen">
        {url && <img src={url} alt="" className="size-full object-cover" />}
      </button>
      <button type="button" onClick={onRemove} aria-label="Foto entfernen" className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-black/55 text-white">
        <X size={16} />
      </button>
    </div>
  )
}

function FileTile({ id, onRemove }: { id: number; onRemove: () => void }) {
  const file = useLiveQuery(() => db.files.get(id), [id])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  if (!file) return null
  const open = async () => {
    setErr('')
    try {
      setLoading(true)
      const b = file.blob ?? (await fetchFileBlob(id))
      if (!b) throw new Error('Die Datei ist nur auf einem anderen Gerät. Melde dich bei der Synchronisierung an.')
      const typed = b.type ? b : new Blob([b], { type: file.type })
      setBlob(typed)
      setViewUrl(URL.createObjectURL(typed))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }
  const closeViewer = () => {
    if (viewUrl) URL.revokeObjectURL(viewUrl)
    setViewUrl(null)
  }
  const share = async () => {
    if (!blob) return
    const f = new File([blob], file.name, { type: file.type })
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: file.name }) } catch { /* cancelled */ }
    } else if (viewUrl) {
      const a = document.createElement('a')
      a.href = viewUrl
      a.download = file.name
      a.click()
    }
  }
  return (
    <li>
      <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brass-soft text-brass">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
        </span>
        <button type="button" onClick={open} className="min-w-0 flex-1 text-left">
          <span className="block truncate font-semibold">{file.name}</span>
          <span className="text-sm text-ink-3">{sizeLabel(file.size)}{file.blob ? '' : ' · in der Cloud'}</span>
        </button>
        <IconButton label="Datei entfernen" onClick={onRemove}><X size={18} /></IconButton>
      </div>
      {err && <p className="mt-1 text-sm text-danger">{err}</p>}
      {viewUrl &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex flex-col bg-black/95" role="dialog" aria-label={file.name}>
            <div className="flex items-center gap-2 p-2 text-white">
              <span className="min-w-0 flex-1 truncate px-3 font-semibold">{file.name}</span>
              <Button variant="secondary" onClick={share}>Öffnen in …</Button>
              <button type="button" onClick={closeViewer} className="flex size-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Schließen"><X size={24} /></button>
            </div>
            <iframe src={viewUrl} title={file.name} className="min-h-0 w-full flex-1 bg-white" />
          </div>,
          document.body,
        )}
    </li>
  )
}

function ImageViewer({ ids, start, onClose }: { ids: number[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(Math.max(0, ids.indexOf(start)))
  const url = useImageUrl(ids[i])
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95" role="dialog" aria-label="Foto">
      <div className="flex items-center justify-between p-2 text-white">
        <span className="px-3 text-sm tabular">{i + 1} / {ids.length}</span>
        <button type="button" onClick={onClose} className="flex size-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Schließen"><X size={24} /></button>
      </div>
      <div className="relative min-h-0 flex-1" onClick={onClose}>
        {url && <img src={url} alt="" className="absolute inset-0 m-auto max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />}
      </div>
      {ids.length > 1 && (
        <div className="flex justify-center gap-3 p-3">
          <Button variant="secondary" onClick={() => setI((i - 1 + ids.length) % ids.length)}>Zurück</Button>
          <Button variant="secondary" onClick={() => setI((i + 1) % ids.length)}>Weiter</Button>
        </div>
      )}
    </div>,
    document.body,
  )
}
