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
