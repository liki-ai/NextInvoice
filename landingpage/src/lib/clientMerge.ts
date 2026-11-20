import type { ClientRecord } from './document'

/** A name compared loosely: no case, accents (ë, ç), punctuation or spaces, so "Kosoves" and "Kosovës" are the same. */
export function looseName(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function looseId(value?: string | null) {
  return String(value || '').replace(/\s+/g, '').toLowerCase()
}

const DETAIL_FIELDS = ['address', 'phone', 'email', 'businessId', 'vatNumber', 'fiscalNumber'] as const

function filled(client: ClientRecord) {
  return DETAIL_FIELDS.filter((key) => String(client[key] || '').trim()).length
}

/** Both have an NUI and they differ: perhaps a different business with the same name. */
export function nuiDiffers(a: ClientRecord, b: ClientRecord) {
  const x = looseId(a.businessId)
  const y = looseId(b.businessId)
  return Boolean(x && y && x !== y)
}

export const MERGE_TEXTS = {
  sq: {
    title: 'Klientë të përsëritur',
    banner: '{count} klientë duken të përsëritur, në {groups} grupe. Bashkoji që secili të ketë një kartelë.',
    open: 'Shiko dhe bashko',
    intro:
      'Këta klientë kanë të njëjtin emër (të shkruar ndryshe) ose të njëjtin NUI. Zgjidh cilin ta mbash: faturat, pagesat, kontratat, faturimet periodike dhe projektet e të tjerëve kalojnë te ai, të dhënat që i mungojnë merren nga të tjerët, dhe të tjerët fshihen. Faturat e lëshuara mbeten siç janë.',
    keep: 'Mbaje',
    include: 'Bashkoje',
    otherNui: 'NUI tjetër, ndoshta biznes tjetër',
    invoiced: 'Faturuar',
    mergeGroup: 'Bashko në një',
    mergeAll: 'Bashko të gjitha',
    merging: 'Duke bashkuar…',
    done: 'U bashkuan {count} klientë.',
    none: 'Nuk ka më klientë të përsëritur.',
    close: 'Mbyll',
    openCard: 'Hap kartelën e klientit',
    unpaid: 'E papaguar',
  },
  en: {
    title: 'Repeated clients',
    banner: '{count} clients look repeated, in {groups} groups. Merge them so each has one card.',
    open: 'Review and merge',
    intro:
      'These clients have the same name (written differently) or the same business number. Choose which one to keep: the others\' invoices, payments, contracts, recurring invoices and projects move to it, details it lacks are taken from the others, and the others are deleted. Issued invoices stay as they are.',
    keep: 'Keep',
    include: 'Merge',
    otherNui: 'Different business number, maybe another business',
    invoiced: 'Invoiced',
    mergeGroup: 'Merge into one',
    mergeAll: 'Merge all',
    merging: 'Merging…',
    done: '{count} clients merged.',
    none: 'No repeated clients left.',
    close: 'Close',
    openCard: 'Open the client card',
    unpaid: 'Unpaid',
  },
  it: {
    title: 'Clienti ripetuti',
    banner: '{count} clienti sembrano ripetuti, in {groups} gruppi. Uniscili perché ognuno abbia una scheda.',
    open: 'Controlla e unisci',
    intro:
      'Questi clienti hanno lo stesso nome (scritto in modo diverso) o la stessa partita IVA. Scegli quale tenere: fatture, pagamenti, contratti, fatture ricorrenti e progetti degli altri passano a lui, i dati mancanti vengono presi dagli altri, e gli altri vengono eliminati. Le fatture emesse restano come sono.',
    keep: 'Tieni',
    include: 'Unisci',
    otherNui: 'Partita IVA diversa, forse un\'altra azienda',
    invoiced: 'Fatturato',
    mergeGroup: 'Unisci in uno',
    mergeAll: 'Unisci tutti',
    merging: 'Unione in corso…',
    done: '{count} clienti uniti.',
    none: 'Non ci sono più clienti ripetuti.',
    close: 'Chiudi',
    openCard: 'Apri la scheda del cliente',
    unpaid: 'Non pagato',
  },
} as const

export type MergeTexts = Record<keyof (typeof MERGE_TEXTS)['sq'], string>

export function mergeTexts(lang: string): MergeTexts {
  return lang === 'en' || lang === 'it' ? MERGE_TEXTS[lang] : MERGE_TEXTS.sq
}

export type DuplicateGroup = {
  key: string
  /** The one suggested to keep first: most invoiced, then most details, then the oldest. */
  members: ClientRecord[]
  keepId: string
  /** Members whose NUI differs from the kept one's: perhaps a different business with the same name. */
  differentId: Set<string>
}

/**
 * Clients that look like the same one: the same name written differently (accents, case,
 * punctuation) or the same NUI. `invoiced` gives each client's invoiced sum, to suggest which to keep.
 */
export function duplicateClientGroups(clients: ClientRecord[], invoiced: (id: string) => number): DuplicateGroup[] {
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    const up = parent.get(id) ?? id
    if (up === id) return id
    const root = find(up)
    parent.set(id, root)
    return root
  }
  const join = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }
  const firstByName = new Map<string, string>()
  const firstById = new Map<string, string>()
  for (const client of clients) {
    parent.set(client.id, client.id)
    const name = looseName(client.fullName)
    if (name) {
      const seen = firstByName.get(name)
      if (seen) join(seen, client.id)
      else firstByName.set(name, client.id)
    }
    const nui = looseId(client.businessId)
    if (nui.length >= 4) {
      const seen = firstById.get(nui)
      if (seen) join(seen, client.id)
      else firstById.set(nui, client.id)
    }
  }
  const byRoot = new Map<string, ClientRecord[]>()
  for (const client of clients) {
    const root = find(client.id)
    byRoot.set(root, [...(byRoot.get(root) || []), client])
  }
  const groups: DuplicateGroup[] = []
  for (const [key, list] of byRoot) {
    if (list.length < 2) continue
    const members = [...list].sort(
      (a, b) => invoiced(b.id) - invoiced(a.id) || filled(b) - filled(a) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
    )
    const keep = members[0]
    const keepNui = looseId(keep.businessId)
    const differentId = new Set(
      members.filter((item) => item.id !== keep.id && keepNui && looseId(item.businessId) && looseId(item.businessId) !== keepNui).map((item) => item.id),
    )
    // Same name but every other one has its own NUI: different businesses, not a repeat.
    if (members.length - differentId.size < 2) continue
    groups.push({ key, members, keepId: keep.id, differentId })
  }
  return groups.sort((a, b) => String(a.members[0].fullName || '').localeCompare(String(b.members[0].fullName || '')))
}
