export const ITEM_UNITS = ['pcs', 'hours', 'days', 'm', 'kg'] as const

export type CatalogItem = {
  id: string
  description: string
  unitCost: number | string
  unit?: string
  taxable?: boolean
  additionalDetails?: string
  createdAt?: string
  updatedAt?: string
}

export function emptyCatalogItem() {
  return {
    description: '',
    unitCost: '',
    unit: 'pcs',
    taxable: true,
    additionalDetails: '',
  }
}

export function invoiceLineFromCatalog(item: CatalogItem) {
  return {
    id: crypto.randomUUID(),
    description: item.description || '',
    quantity: '1',
    unitPrice: String(item.unitCost ?? ''),
  }
}

function normalizeExtractedQuantity(value: unknown) {
  const n = parseFloat(String(value ?? '').trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return '1'
  return Number.isInteger(n) ? String(n) : String(n)
}

function matchCatalogItem(catalogItems: CatalogItem[], description: string) {
  const q = String(description || '').trim().toLowerCase()
  if (!q) return null
  const exact = catalogItems.find((item) => String(item.description || '').trim().toLowerCase() === q)
  if (exact) return exact
  return (
    catalogItems.find((item) => {
      const d = String(item.description || '').trim().toLowerCase()
      return d && q.length >= 3 && (d.includes(q) || q.includes(d))
    }) || null
  )
}

export function invoiceLinesFromExtract(
  extractedItems: { description?: string; quantity?: string | number; unitPrice?: string | number }[] | undefined,
  catalogItems: CatalogItem[],
) {
  const lines: { id: string; description: string; quantity: string; unitPrice: string }[] = []
  for (const row of Array.isArray(extractedItems) ? extractedItems : []) {
    const description = String(row?.description || '').trim()
    if (!description) continue
    const catalog = matchCatalogItem(catalogItems, description)
    const priceFromPhoto = String(row?.unitPrice ?? '').trim()
    lines.push({
      id: crypto.randomUUID(),
      description: catalog?.description || description,
      quantity: normalizeExtractedQuantity(row?.quantity),
      unitPrice: priceFromPhoto || (catalog ? String(catalog.unitCost ?? '') : ''),
    })
  }
  return lines
}
