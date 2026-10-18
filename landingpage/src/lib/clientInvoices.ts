import { documentTotals, paymentStatus, remainingOf, totalsByCurrency, type ClientRecord } from './document'
import { sortInvoicesChronologically, type Client, type Invoice } from './invoice'

export type ClientInvoiceGroup = {
  key: string
  client: Client | ClientRecord
  invoices: Invoice[]
}

function nameOf(client?: { fullName?: string } | null) {
  return String(client?.fullName || '').trim().toLowerCase()
}

/**
 * The invoices grouped by client. A client is its id; an invoice without one joins the client of
 * the same name (from the client list or from another invoice that carries the id), so a list
 * sent to a client holds every invoice that is theirs.
 */
export function invoiceClientGroups(invoices: Invoice[], clients: ClientRecord[] = []): ClientInvoiceGroup[] {
  const idByName = new Map<string, string>()
  const clientById = new Map<string, ClientRecord>()
  for (const client of clients) {
    if (!client?.id) continue
    clientById.set(client.id, client)
    const name = nameOf(client)
    if (name && !idByName.has(name)) idByName.set(name, client.id)
  }
  for (const inv of invoices) {
    const id = inv.clientId || inv.client?.id
    const name = nameOf(inv.client)
    if (id && name && !idByName.has(name)) idByName.set(name, id)
  }
  const groups = new Map<string, ClientInvoiceGroup>()
  for (const inv of invoices) {
    const name = nameOf(inv.client)
    const id = inv.clientId || inv.client?.id || idByName.get(name)
    if (!id && !name) continue
    const key = id ? `id:${id}` : `name:${name}`
    const group = groups.get(key)
    if (group) group.invoices.push(inv)
    else groups.set(key, { key, client: (id && clientById.get(id)) || inv.client, invoices: [inv] })
  }
  return [...groups.values()].map((group) => ({ ...group, invoices: sortInvoicesChronologically(group.invoices) }))
}

/** Clients whose name, phone, email or business number holds the query; names that start with it first. */
export function matchClientGroups(groups: ClientInvoiceGroup[], query: string, limit = 6) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hay = (client: ClientInvoiceGroup['client']) =>
    [client.fullName, client.phone, client.email, client.businessId].filter(Boolean).join(' ').toLowerCase()
  return groups
    .filter((group) => hay(group.client).includes(q))
    .sort((a, b) => {
      const sa = nameOf(a.client).startsWith(q) ? 0 : 1
      const sb = nameOf(b.client).startsWith(q) ? 0 : 1
      return sa - sb || String(a.client.fullName || '').localeCompare(String(b.client.fullName || ''))
    })
    .slice(0, limit)
}

/** Unpaid and partly paid: what the client still owes. */
export function isOwed(inv: Invoice) {
  const status = paymentStatus(inv)
  return status === 'unpaid' || status === 'partial'
}

/** How many invoices, what they come to, what was paid of them and what is left, per currency; drafts and cancelled ones carry no money. */
export function clientInvoiceSummary(invoices: Invoice[]) {
  return {
    count: invoices.length,
    invoiced: totalsByCurrency(invoices, (inv) => documentTotals(inv).total),
    paid: totalsByCurrency(invoices, (inv) => documentTotals(inv).total - remainingOf(inv)),
    remaining: totalsByCurrency(invoices, (inv) => remainingOf(inv)),
  }
}
