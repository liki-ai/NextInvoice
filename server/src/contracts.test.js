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
