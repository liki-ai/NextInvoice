import { api, apiBase, getToken } from './api'

// The company's contracts, kept on the server with the signed document behind each one. A document
// is read there once; the fields it fills are listed in `filled`.

export type ContractFile = { id: string; name: string; mime: string; size: number }
export type ContractReading = { state: 'pending' | 'done' | 'failed' | 'unsupported'; at: string; error?: string }

export type Contract = {
  id: string
  title: string
  number: string
  reference: string
  counterparty: string
  type: string
  summary: string
  paymentTerms: string
  signatories: string
  notes: string
  signedDate: string
  startDate: string
  endDate: string
  value: number | null
  monthlyValue: number | null
  currency: string
  vatIncluded: boolean | null
  status: 'active' | 'completed'
  completedAt: string | null
  file: ContractFile | null
  reading: ContractReading | null
  filled: string[]
  createdAt: string
  updatedAt: string
}

export type ContractFields = Pick<
  Contract,
  'title' | 'number' | 'reference' | 'counterparty' | 'type' | 'summary' | 'paymentTerms' | 'signatories' | 'notes' | 'signedDate' | 'startDate' | 'endDate' | 'value' | 'monthlyValue' | 'currency' | 'vatIncluded'
>

export type ContractState = 'active' | 'expiring' | 'expired' | 'upcoming' | 'completed'

export const ACCEPT = '.pdf,.docx,.doc,.odt,.rtf,.txt,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,text/plain'

const DAY = 24 * 60 * 60 * 1000
const EXPIRING_DAYS = 30

export function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Whole days from one YYYY-MM-DD to another. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)
}

/** Where the contract stands today: done by hand, not yet started, running, near its end, or past it. */
export function contractState(contract: Contract, on = today()): ContractState {
  if (contract.status === 'completed') return 'completed'
  if (contract.endDate && contract.endDate < on) return 'expired'
  if (contract.startDate && contract.startDate > on) return 'upcoming'
  if (contract.endDate && daysBetween(on, contract.endDate) <= EXPIRING_DAYS) return 'expiring'
  return 'active'
}

/** 2026-09-17 → 17.09.2026. */
export function shortDate(value: string | null | undefined) {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  return day ? `${day[3]}.${day[2]}.${day[1]}` : ''
}

export function fileKind(file: ContractFile | null) {
  if (!file) return ''
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf') || file.mime === 'application/pdf') return 'pdf'
  if (/\.(png|jpe?g|webp|gif)$/.test(name) || file.mime.startsWith('image/')) return 'image'
  if (name.endsWith('.docx') || file.mime.includes('wordprocessingml')) return 'docx'
  if (name.endsWith('.txt') || file.mime === 'text/plain') return 'text'
  return ''
}

export async function listContracts() {
  return (await api<{ contracts: Contract[] }>('/api/contracts')).contracts
}

/** A new contract, with its document when one is given; the server starts reading the document. */
export async function createContract(fields: Partial<ContractFields>, file?: File | null) {
  if (!file) return (await api<{ contract: Contract }>('/api/contracts', { method: 'POST', body: fields })).contract
  const form = new FormData()
  form.append('file', file)
  form.append('fields', JSON.stringify(fields))
  return (await api<{ contract: Contract }>('/api/contracts', { method: 'POST', form })).contract
}

export async function updateContract(id: string, body: Partial<ContractFields> & { status?: Contract['status'] }) {
  return (await api<{ contract: Contract }>(`/api/contracts/${id}`, { method: 'PUT', body })).contract
}

export async function replaceContractFile(id: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return (await api<{ contract: Contract }>(`/api/contracts/${id}/file`, { method: 'POST', form })).contract
}

export async function readContractAgain(id: string) {
  return (await api<{ contract: Contract }>(`/api/contracts/${id}/read`, { method: 'POST' })).contract
}

export async function deleteContract(id: string) {
  await api(`/api/contracts/${id}`, { method: 'DELETE' })
}

export async function contractText(id: string) {
  return (await api<{ text: string }>(`/api/contracts/${id}/text`)).text
}

/** The document's bytes, typed by its name so the browser can show a PDF or an image. */
export async function contractBlob(contract: Contract) {
  const res = await fetch(`${apiBase()}/api/contracts/${contract.id}/file`, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) throw new Error(String(res.status))
  const blob = await res.blob()
  const kind = fileKind(contract.file)
  if (kind === 'pdf') return new Blob([blob], { type: 'application/pdf' })
  return blob
}

export async function downloadContract(contract: Contract) {
  const url = URL.createObjectURL(await contractBlob(contract))
  const link = document.createElement('a')
  link.href = url
  link.download = contract.file?.name || 'kontrata'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
