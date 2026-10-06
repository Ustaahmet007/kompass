import { useEffect, useState, type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

/**
 * Shrinks a photo before storing it: iPad photos are 5–10 MB, a cover needs ~200 KB.
 * Long side max `maxDim` px, saved as JPEG.
 */
export async function compressImage(file: File, maxDim = 1800, quality = 0.82) {
  if (!file.type.startsWith('image/')) throw new Error('Das ist kein Bild.')
  // Decode through an <img>: Safari applies the photo's EXIF rotation there, so pictures come out upright.
  let bitmap: ImageBitmap | HTMLImageElement
  const src = URL.createObjectURL(file)
  try {
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Das Bild konnte nicht geöffnet werden.'))
      img.src = src
    })
  } catch {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } finally {
    setTimeout(() => URL.revokeObjectURL(src), 0)
  }
  const w0 = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width
  const h0 = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height
  const scale = Math.min(1, maxDim / Math.max(w0, h0))
  const width = Math.round(w0 * scale)
  const height = Math.round(h0 * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Das Bild konnte nicht gespeichert werden.'))), 'image/jpeg', quality),
  )
  return { blob, width, height }
}

/** Stores a picture and returns its id. Replaces (and deletes) `replaceId` if given. */
export async function saveImage(file: File, replaceId?: number | null) {
  const { blob, width, height } = await compressImage(file)
  const id = (await db.images.add({ blob, width, height, createdAt: Date.now() })) as number
  if (replaceId) await db.images.delete(replaceId)
  return id
}

/** Stores an animated GIF as it is (compressing would freeze it). Max 8 MB. */
export async function saveGif(file: File, replaceId?: number | null) {
  if (file.type !== 'image/gif') return saveImage(file, replaceId)
  if (file.size > 8 * 1024 * 1024) throw new Error('Das GIF ist größer als 8 MB.')
  const src = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Das GIF konnte nicht geöffnet werden.'))
      i.src = src
    })
    const id = (await db.images.add({ blob: file, width: img.naturalWidth, height: img.naturalHeight, createdAt: Date.now() })) as number
    if (replaceId) await db.images.delete(replaceId)
    return id
  } finally {
    URL.revokeObjectURL(src)
  }
}

export function deleteImage(id?: number | null) {
  return id ? db.images.delete(id) : Promise.resolve()
}

export interface Framing {
  focusX: number
  focusY: number
  zoom: number
}
export const DEFAULT_FRAMING: Framing = { focusX: 50, focusY: 50, zoom: 1 }

/** Turns a stored picture 90° clockwise (keeps its id, resets the framing). */
export async function rotateImage(id: number) {
  const row = await db.images.get(id)
  if (!row) return
  const bmp = await createImageBitmap(row.blob)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.height
  canvas.height = bmp.width
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width, 0)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(bmp, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Drehen ging nicht.'))), 'image/jpeg', 0.88))
  // New createdAt so every view picks up the new pixels.
  await db.images.update(id, { blob, width: canvas.width, height: canvas.height, createdAt: Date.now(), ...DEFAULT_FRAMING })
}

export function setFraming(id: number, f: Partial<Framing>) {
  return db.images.update(id, f)
}

/** Picture URL plus its framing. */
export function useImage(id?: number | null) {
  const img = useLiveQuery(() => (id ? db.images.get(id) : undefined), [id])
  const url = useBlobUrl(img?.blob, img ? `${img.id}-${img.createdAt}` : '')
  const framing: Framing = { focusX: img?.focusX ?? 50, focusY: img?.focusY ?? 50, zoom: img?.zoom ?? 1 }
  return { url, framing, width: img?.width ?? 0, height: img?.height ?? 0 }
}

/** CSS for an <img> that fills its box using the stored framing. */
export function framingStyle(f: Framing, extraScale = 1): CSSProperties {
  return {
    objectFit: 'cover',
    objectPosition: `${f.focusX}% ${f.focusY}%`,
    transform: `scale(${f.zoom * extraScale})`,
    transformOrigin: `${f.focusX}% ${f.focusY}%`,
  }
}

/** One object URL per stored picture; re-reads after a framing change don't recreate it (no flicker). */
function useBlobUrl(blob: Blob | undefined, key: string) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob || !key) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return url
}

/** Object URL for a stored picture (revoked automatically). */
export function useImageUrl(id?: number | null) {
  const img = useLiveQuery(() => (id ? db.images.get(id) : undefined), [id])
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!img?.blob) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(img.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [img])
  return url
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}
