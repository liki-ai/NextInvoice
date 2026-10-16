process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyReading } = require('./contracts/service');

const reading = {
  title: 'Mirëmbajtja për Deklarime Online',
  number: '318-26-5977-2-2-1/C220',
  reference: '318-26-5977-2-2-1',
  counterparty: 'Komisioni i Pavarur për Miniera dhe Minerale',
  type: 'Kontratë publike kornizë',
  summary: '',
  signedDate: '2026-09-11',
  startDate: '2026-09-17',
  endDate: '2029-09-16',
  value: 2987.76,
  monthlyValue: null,
  currency: 'EUR',
  vatIncluded: true,
  paymentTerms: '',
  signatories: 'Gani Nekaj; Florian Musoli',
};

test('a reading fills the empty fields and leaves what the person typed', () => {
  const contract = { title: 'Deklarimet online', number: '', endDate: '', value: null, summary: 'Sipas ofertës', filled: [] };
  const next = applyReading(contract, reading);
  assert.equal(next.title, 'Deklarimet online');
  assert.equal(next.summary, 'Sipas ofertës');
  assert.equal(next.number, '318-26-5977-2-2-1/C220');
  assert.equal(next.endDate, '2029-09-16');
  assert.equal(next.value, 2987.76);
  assert.equal(next.vatIncluded, true);
  assert.ok(!next.filled.includes('title'));
  assert.ok(next.filled.includes('number'));
});

test('a later reading replaces what an earlier one filled, and drops what is not a date', () => {
  const contract = { number: 'OLD-1', endDate: '2027-01-01', filled: ['number', 'endDate'] };
  const next = applyReading(contract, { ...reading, endDate: '16.09.2029', number: 'NEW-2' });
  assert.equal(next.number, 'NEW-2');
  assert.equal(next.endDate, '2027-01-01');
});

const { matchClient } = require('./contracts/service');

const clients = [
  { id: 'kpmm', fullName: 'KPMM', businessId: '' },
  { id: 'kru', fullName: 'KRU Mitrovica Sh.A.', businessId: '811234567' },
  { id: 'ame', fullName: 'Agjencia e Menaxhimit Emergjent' },
  { id: 'tretek', fullName: 'Tretek SH.P.K.' },
];

test('the other party is found among the clients by its number, its name or its short form', () => {
  assert.equal(matchClient(clients, { counterparty: 'K.R.U. MITROVICA SH.A.', counterpartyBusinessId: '' })?.id, 'kru');
  assert.equal(matchClient(clients, { counterparty: 'Kompania X', counterpartyBusinessId: 'NUI 811234567' })?.id, 'kru');
  assert.equal(matchClient(clients, { counterparty: 'Komisioni i Pavarur për Miniera dhe Minerale' })?.id, 'kpmm');
  assert.equal(matchClient(clients, { counterparty: 'AGJENCIA E MENAXHIMIT EMERGJENT' })?.id, 'ame');
  assert.equal(matchClient(clients, { counterparty: 'KRUM' })?.id, 'kru');
  assert.equal(matchClient(clients, { counterparty: 'Komuna e Mitrovicës' }), null);
  assert.equal(matchClient(clients, { counterparty: '' }), null);
});

test('a warranty after the work keeps its own end, counted from the end of the work when not given', () => {
  const next = applyReading({ filled: [] }, { ...reading, startDate: '2025-07-21', endDate: '2026-01-20', maintenanceMonths: 24, maintenanceEndDate: '' });
  assert.equal(next.endDate, '2026-01-20');
  assert.equal(next.maintenanceMonths, 24);
  assert.equal(next.maintenanceEndDate, '2028-01-20');
  const stated = applyReading({ filled: [] }, { ...reading, endDate: '2026-01-20', maintenanceMonths: 24, maintenanceEndDate: '2028-02-15' });
  assert.equal(stated.maintenanceEndDate, '2028-02-15');
  const none = applyReading({ filled: [] }, { ...reading, maintenanceMonths: null, maintenanceEndDate: '' });
  assert.ok(!none.maintenanceEndDate);
});

const { findDuplicate } = require('./contracts/service');

test('the same contract is found under another short name, its value or its number; a renewal is not', () => {
  const list = [
    { id: 'fcms', title: 'Zhvillimi dhe mirëmbajtja e Sistemit të kontrollimit të ushqimit (FCMS)', counterparty: 'Agjencia e Ushqimit dhe Veterinarisë', number: '40800-24-9255-2-1-1/C264', startDate: '2025-02-20', value: 295820 },
    { id: 'kru', title: 'Mirëmbajtja e sistemit të faturimit mobil offline', counterparty: 'K.R.U. MITROVICA SH.A.', clientId: 'kru', startDate: '2026-03-20', value: 3499.92 },
    { id: 'hr', title: 'Mobile Billing', counterparty: 'HR Jugor' },
  ];
  assert.equal(findDuplicate(list, { title: 'ZHVILLIMI DHE MIREMBAJTJA E SISTEMIT TE KONTROLLIMIT TE USHQIMIT (FCMS)', counterparty: 'AVUK', startDate: '2025-03-04', value: 295820 }, clients)?.id, 'fcms');
  assert.equal(findDuplicate(list, { title: 'Tjetër emër', number: '40800-24-9255-2-1-1/c264' }, clients)?.id, 'fcms');
  assert.equal(findDuplicate(list, { title: 'Mirembajtja e sistemit te faturimit mobil offline', counterparty: 'KRUM', startDate: '2026-03-25' }, clients)?.id, 'kru');
  assert.equal(findDuplicate(list, { title: 'Mirembajtja e sistemit te faturimit mobil offline', counterparty: 'KRUM', startDate: '2027-03-20' }, clients), null);
  assert.equal(findDuplicate(list, { title: 'Mobile Billing', counterparty: 'Gjakova' }, clients), null);
});
