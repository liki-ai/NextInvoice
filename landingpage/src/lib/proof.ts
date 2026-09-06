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
