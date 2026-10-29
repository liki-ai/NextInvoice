// Texts for working with several companies from one account, in the three languages; i18nCore
// mounts them under `companies`.

const sq = {
  label: 'Kompania',
  switch: 'Ndrro kompaninë',
  main: 'Kryesore',
  add: 'Shto kompani',
  addTitle: 'Kompani e re',
  addHint: 'Kompania e re ka faturat, klientët, artikujt dhe profilin e vet. Përdoruesit dhe plani janë të njëjtët si te kompania kryesore. Pasi ta krijosh, plotëso të dhënat e saj te Cilësimet.',
  name: 'Emri i kompanisë',
  namePlaceholder: 'p.sh. Tretek LLC',
  currency: 'Valuta',
  create: 'Krijo dhe hape',
  creating: 'Po krijohet…',
  nameRequired: 'Shkruaj emrin e kompanisë.',
  unnamed: 'Pa emër',
}

const en: typeof sq = {
  label: 'Company',
  switch: 'Switch company',
  main: 'Main',
  add: 'Add company',
  addTitle: 'New company',
  addHint: 'The new company has its own invoices, clients, items and profile. Its users and plan are those of the main company. Once it is created, fill in its details in Settings.',
  name: 'Company name',
  namePlaceholder: 'e.g. Tretek LLC',
  currency: 'Currency',
  create: 'Create and open',
  creating: 'Creating…',
  nameRequired: 'Enter the company name.',
  unnamed: 'Unnamed',
}

const it: typeof sq = {
  label: 'Azienda',
  switch: 'Cambia azienda',
  main: 'Principale',
  add: 'Aggiungi azienda',
  addTitle: 'Nuova azienda',
  addHint: 'La nuova azienda ha fatture, clienti, articoli e profilo propri. Utenti e piano sono quelli dell’azienda principale. Dopo averla creata, completa i suoi dati nelle Impostazioni.',
  name: 'Nome dell’azienda',
  namePlaceholder: 'es. Tretek LLC',
  currency: 'Valuta',
  create: 'Crea e apri',
  creating: 'Creazione…',
  nameRequired: 'Inserisci il nome dell’azienda.',
  unnamed: 'Senza nome',
}

export const companiesTexts = { sq, en, it }
