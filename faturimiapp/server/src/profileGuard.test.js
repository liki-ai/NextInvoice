const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { syncedProfileChange } = require('./profileGuard');

const tretek = { companyName: 'Tretek SHPK', nui: '811234567', bankName: 'TEB', iban: 'XK05', industry: 'services' };

// What the App Store build 1.3.0 (46) sends on its first sign-in from a phone never filled in.
const unfilledPhone = {
  companyName: 'Kompania juaj (shembull)',
  contactPerson: 'Emri juaj (shembull)',
  nui: '000000000',
  streetAddress: 'Rruga shembull, nr. 1',
  state: 'Kosovë',
  zipCode: '10000',
  email: 'email@shembull.com',
  phone: '+383 00 000 000',
  currency: 'EUR',
  bankName: '',
  iban: '',
  industry: 'other',
};

describe('syncedProfileChange', () => {
  it('ignores an unfilled phone profile sent to a company set up on the web', () => {
    assert.equal(syncedProfileChange(tretek, unfilledPhone), null);
  });

  it('ignores a phone profile with no company name at all', () => {
    assert.equal(syncedProfileChange(tretek, { companyName: '', iban: '' }), null);
  });

  it('keeps real changes and leaves out the placeholders sent with them', () => {
    const change = syncedProfileChange(tretek, { companyName: 'Tretek SHPK', nui: '000000000', phone: '+383 44 111 222' });
    assert.deepEqual(change, { companyName: 'Tretek SHPK', phone: '+383 44 111 222' });
  });

  it('lets a new account take the details typed on the phone', () => {
    const change = syncedProfileChange({ companyName: 'Kompania juaj (shembull)' }, { companyName: 'Studio A', email: 'email@shembull.com' });
    assert.deepEqual(change, { companyName: 'Studio A' });
  });
});
