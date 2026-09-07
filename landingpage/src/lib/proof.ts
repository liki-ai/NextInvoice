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
