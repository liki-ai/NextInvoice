export const ITEM_UNITS = ['pcs', 'hours', 'days', 'm', 'kg'];

export function emptyCatalogItem() {
  return {
    description: '',
    unitCost: '',
    unit: 'pcs',
    taxable: true,
    additionalDetails: '',
  };
}

export function invoiceLineFromCatalog(item, generateId) {
  return {
    id: generateId(),
    description: item.description || '',
    quantity: '1',
    unitPrice: String(item.unitCost ?? ''),
  };
}
