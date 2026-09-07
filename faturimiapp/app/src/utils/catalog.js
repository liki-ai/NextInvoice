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

function normalizeExtractedQuantity(value) {
  const n = parseFloat(String(value ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return '1';
  return Number.isInteger(n) ? String(n) : String(n);
}

function matchCatalogItem(catalogItems, description) {
  const q = String(description || '').trim().toLowerCase();
  if (!q) return null;
  const list = catalogItems || [];
  const exact = list.find((item) => String(item.description || '').trim().toLowerCase() === q);
  if (exact) return exact;
  return (
    list.find((item) => {
      const d = String(item.description || '').trim().toLowerCase();
      return d && q.length >= 3 && (d.includes(q) || q.includes(d));
    }) || null
  );
}

export function invoiceLinesFromExtract(extractedItems, catalogItems, generateId) {
  return (Array.isArray(extractedItems) ? extractedItems : [])
    .map((row) => {
      const description = String(row?.description || '').trim();
      if (!description) return null;
      const catalog = matchCatalogItem(catalogItems, description);
      const priceFromPhoto = String(row?.unitPrice ?? '').trim();
      return {
        id: generateId(),
        description: catalog?.description || description,
        quantity: normalizeExtractedQuantity(row?.quantity),
        unitPrice: priceFromPhoto || (catalog ? String(catalog.unitCost ?? '') : ''),
      };
    })
    .filter(Boolean);
}
