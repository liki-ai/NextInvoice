export const DEFAULT_EXPORT_NOTE = 'Eksport ne bazë te Ligjit (05-L-037 Neni 33)';

// The export-law line is about goods leaving the country, so service businesses never print it.
export function usesExportNote(company) {
  return company?.industry !== 'services';
}

export function resolveExportNote(company) {
  if (!usesExportNote(company)) return '';
  if (!company || company.exportNote === undefined || company.exportNote === null) return DEFAULT_EXPORT_NOTE;
  return String(company.exportNote).trim();
}
