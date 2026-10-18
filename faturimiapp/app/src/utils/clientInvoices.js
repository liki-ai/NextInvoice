import { documentTotals, paymentStatus, remainingOf } from './document';
import { clientSearchText } from './client';
import { sortInvoicesChronologically } from '../pdf/invoiceTemplate';

function nameOf(client) {
  return String(client?.fullName || '').trim().toLowerCase();
}

/**
 * The invoices grouped by client. A client is its id; an invoice without one joins the client of
 * the same name (from the client list or from another invoice that carries the id), so a list
 * sent to a client holds every invoice that is theirs.
 */
export function invoiceClientGroups(invoices, clients = []) {
  const idByName = new Map();
  const clientById = new Map();
  for (const client of clients || []) {
    if (!client?.id) continue;
    clientById.set(client.id, client);
    const name = nameOf(client);
    if (name && !idByName.has(name)) idByName.set(name, client.id);
  }
  for (const inv of invoices || []) {
    const id = inv.clientId || inv.client?.id;
    const name = nameOf(inv.client);
    if (id && name && !idByName.has(name)) idByName.set(name, id);
  }
  const groups = new Map();
  for (const inv of invoices || []) {
    const name = nameOf(inv.client);
    const id = inv.clientId || inv.client?.id || idByName.get(name);
    if (!id && !name) continue;
    const key = id ? `id:${id}` : `name:${name}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, client: clientById.get(id) || inv.client, invoices: [] };
      groups.set(key, group);
    }
    group.invoices.push(inv);
  }
  return [...groups.values()].map((group) => ({ ...group, invoices: sortInvoicesChronologically(group.invoices) }));
}

/** Clients whose name, phone, email or business number holds the query; names that start with it first. */
export function matchClientGroups(groups, query, limit = 6) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return groups
    .filter((group) => clientSearchText(group.client).includes(q) || nameOf(group.client).includes(q))
    .sort((a, b) => {
      const sa = nameOf(a.client).startsWith(q) ? 0 : 1;
      const sb = nameOf(b.client).startsWith(q) ? 0 : 1;
      return sa - sb || String(a.client?.fullName || '').localeCompare(String(b.client?.fullName || ''));
    })
    .slice(0, limit);
}

/** Invoices whose number holds the query. */
export function matchInvoiceNumbers(invoices, query, limit = 4) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return (invoices || []).filter((inv) => String(inv.number || '').toLowerCase().includes(q)).slice(0, limit);
}

/** Unpaid and partly paid: what the client still owes. */
export function isOwed(inv) {
  const status = paymentStatus(inv);
  return status === 'unpaid' || status === 'partial';
}

/** How many invoices, what they come to, what was paid of them and what is left; drafts and cancelled ones carry no money. */
export function clientInvoiceSummary(invoices) {
  let invoiced = 0;
  let remaining = 0;
  for (const inv of invoices || []) {
    const status = paymentStatus(inv);
    if (status === 'draft' || status === 'cancelled') continue;
    invoiced += documentTotals(inv).total;
    remaining += remainingOf(inv);
  }
  const round = (n) => Math.round(n * 100) / 100;
  return { count: (invoices || []).length, invoiced: round(invoiced), paid: round(invoiced - remaining), remaining: round(remaining) };
}
