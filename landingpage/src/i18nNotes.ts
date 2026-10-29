// Texts for the invoice notes and the links in them, in the three languages; i18nCore mounts them
// under `notesEditor`.

const sq = {
  addLink: 'Shto link',
  hint: 'Zgjidh një pjesë të tekstit, p.sh. “Paguaj këtu”, dhe kliko Shto link. Klienti e klikon në faturë, në PDF dhe në lidhjen e faturës.',
  url: 'Adresa e linkut',
  urlPlaceholder: 'https://buy.stripe.com/…',
  linkText: 'Teksti që shihet',
  defaultText: 'Paguaj online',
  apply: 'Vendos linkun',
  urlInvalid: 'Shkruaj një adresë që fillon me https://',
  onInvoice: 'Në faturë:',
}

const en: typeof sq = {
  addLink: 'Add link',
  hint: 'Select part of the text, e.g. “Pay here”, and click Add link. The client can click it on the invoice, in the PDF and on the invoice link.',
  url: 'Link address',
  urlPlaceholder: 'https://buy.stripe.com/…',
  linkText: 'Text shown',
  defaultText: 'Pay online',
  apply: 'Insert link',
  urlInvalid: 'Enter an address starting with https://',
  onInvoice: 'On the invoice:',
}

const it: typeof sq = {
  addLink: 'Aggiungi link',
  hint: 'Seleziona una parte del testo, ad es. “Paga qui”, e clicca Aggiungi link. Il cliente lo clicca sulla fattura, nel PDF e nel link della fattura.',
  url: 'Indirizzo del link',
  urlPlaceholder: 'https://buy.stripe.com/…',
  linkText: 'Testo visibile',
  defaultText: 'Paga online',
  apply: 'Inserisci link',
  urlInvalid: 'Inserisci un indirizzo che inizia con https://',
  onInvoice: 'Sulla fattura:',
}

export const notesTexts = { sq, en, it }
