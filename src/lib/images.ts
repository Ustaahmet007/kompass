import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

/**
 * Shrinks a photo before storing it: iPad photos are 5–10 MB, a cover needs ~200 KB.
 * Long side max `maxDim` px, saved as JPEG.
 */
export async function compressImage(file: File, maxDim = 1800, quality = 0.82) {
  if (!file.type.startsWith('image/')) throw new Error('Das ist kein Bild.')
  let bitmap: ImageBitmap | HTMLImageElement
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // Fallback for formats createImageBitmap does not handle
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Das Bild konnte nicht geöffnet werden.'))
      img.src = URL.createObjectURL(file)
    })
  }
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
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

export function deleteImage(id?: number | null) {
  return id ? db.images.delete(id) : Promise.resolve()
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
