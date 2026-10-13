export const MAX_PROOF_BYTES = 4 * 1024 * 1024

export type ProofFields = {
  proofName?: string
  proofMime?: string
  proofData?: string
  proofUri?: string
}

export function proofSource(item?: ProofFields | null) {
  return item?.proofData || item?.proofUri || ''
}

export function isImageProof(item?: ProofFields | null) {
  const mime = String(item?.proofMime || '').toLowerCase()
  const name = String(item?.proofName || item?.proofUri || '').toLowerCase()
  const src = proofSource(item)
  return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/.test(name) || src.startsWith('data:image')
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

const OPENAI_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export async function fileToSupportedImageDataUrl(file: File) {
  const type = String(file.type || '').toLowerCase()
  if (OPENAI_IMAGE_TYPES.has(type)) return fileToDataUrl(file)
  try {
    const bitmap = await createImageBitmap(file)
    const max = 1600
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return fileToDataUrl(file)
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch {
    return fileToDataUrl(file)
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('NOT_AN_IMAGE'))
    img.src = url
  })
}

// The server refuses profile images above 1.5M characters; stay well under it.
const MAX_BRAND_IMAGE_CHARS = 900_000

/**
 * Logos, signatures and stamps live inside the company profile and are embedded in every PDF,
 * so they are redrawn small here. SVG and HEIC come out as PNG/JPEG, which every PDF engine reads.
 */
export async function fileToBrandImage(file: File, maxSide = 640) {
  if (file.type && !file.type.startsWith('image/')) throw new Error('NOT_AN_IMAGE')
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const width = img.naturalWidth || maxSide
    const height = img.naturalHeight || maxSide
    const scale = Math.min(1, maxSide / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('NOT_AN_IMAGE')
    const photo = /jpe?g/i.test(file.type)
    if (photo) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const png = photo ? '' : canvas.toDataURL('image/png')
    if (png && png.length <= MAX_BRAND_IMAGE_CHARS) return png
    // A photo, or a PNG too heavy to keep transparent: flatten onto white.
    const flat = document.createElement('canvas')
    flat.width = canvas.width
    flat.height = canvas.height
    const flatCtx = flat.getContext('2d')
    if (!flatCtx) throw new Error('NOT_AN_IMAGE')
    flatCtx.fillStyle = '#fff'
    flatCtx.fillRect(0, 0, flat.width, flat.height)
    flatCtx.drawImage(canvas, 0, 0)
    return flat.toDataURL('image/jpeg', 0.88)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function fileToProof(file: File) {
  if (file.size > MAX_PROOF_BYTES) {
    const err = new Error('PROOF_TOO_LARGE')
    throw err
  }
  const proofData = await fileToDataUrl(file)
  return {
    proofName: file.name,
    proofMime: file.type || '',
    proofData,
  }
}

export function openProofData(src: string, name?: string) {
  if (!src) return
  const opened = window.open(src, '_blank', 'noopener')
  if (opened) return
  const link = document.createElement('a')
  link.href = src
  link.download = name || 'proof'
  link.click()
}
