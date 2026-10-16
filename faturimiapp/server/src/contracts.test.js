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
