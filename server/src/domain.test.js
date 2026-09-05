const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  documentTotals,
  paymentStatus,
  daysOverdue,
  isOverdue,
  allocateInvoiceNumber,
  validatePaymentAmount,
  similarClient,
  hydrateInvoice,
  hydrateObligation,
  reminderText,
} = require('./domain')

describe('payments', () => {
  it('computes remaining from active payments only', () => {
    const doc = {
      total: 100,
      payments: [
        { amount: 40 },
        { amount: 25, voidedAt: '2026-01-01' },
        { amount: 10.5 },
      ],
    }
    const totals = documentTotals(doc)
    assert.equal(totals.amountPaid, 50.5)
    assert.equal(totals.amountDue, 49.5)
  })

  it('rejects amounts over remaining', () => {
    const doc = { total: 20, payments: [{ amount: 15 }] }
    const ok = validatePaymentAmount(doc, 5.01)
    assert.equal(ok.ok, false)
    assert.equal(ok.error, 'AMOUNT_EXCEEDS')
  })

  it('keeps legacy paid without inventing a payment date', () => {
    const inv = hydrateInvoice({ id: '1', total: 80, status: 'paid', client: { fullName: 'Ana' } })
    assert.equal(inv.status, 'paid')
    assert.equal(inv.amountDue, 0)
    assert.equal(inv.amountPaid, 80)
    assert.equal(inv.payments.length, 0)
    assert.equal(inv.snapshotSource, 'migrated')
    assert.equal(inv.companySnapshot, null)
  })
})

describe('status and overdue', () => {
  it('marks partial when some amount remains', () => {
    assert.equal(paymentStatus({ total: 100, payments: [{ amount: 30 }] }), 'partial')
  })

  it('does not mark paid, cancelled, or undated docs overdue', () => {
    const now = new Date('2026-09-05')
    assert.equal(isOverdue({ total: 10, dueDate: 'SEP 1, 2026', status: 'paid' }, now), false)
    assert.equal(isOverdue({ total: 10, lifecycle: 'cancelled', dueDate: 'SEP 1, 2026' }, now), false)
    assert.equal(isOverdue({ total: 10, payments: [] }, now), false)
    assert.equal(daysOverdue({ total: 10, dueDate: 'SEP 1, 2026', status: 'unpaid' }, now), 4)
  })
})

describe('invoice numbers', () => {
  it('allocates unique monthly numbers and skips drafts', () => {
    const existing = [
      { number: 'SEP-001', lifecycle: 'issued' },
      { number: 'SEP-002', lifecycle: 'cancelled' },
      { number: 'SEP-009', lifecycle: 'draft' },
    ]
    assert.equal(allocateInvoiceNumber(existing, new Date('2026-09-05')), 'SEP-003')
  })
})

describe('clients', () => {
  it('does not treat same name alone as a duplicate', () => {
    assert.equal(similarClient({ fullName: 'Ana' }, { fullName: 'Ana' }), false)
    assert.equal(similarClient({ fullName: 'Ana', phone: '044111' }, { fullName: 'Ana', phone: '044111' }), true)
  })
})

describe('obligations hydrate', () => {
  it('uses remaining amount after payments', () => {
    const item = hydrateObligation({ amount: 50, payments: [{ amount: 20 }], status: 'unpaid' })
    assert.equal(item.status, 'partial')
    assert.equal(item.amountDue, 30)
  })
})

describe('reminder', () => {
  it('includes number, due date and remaining', () => {
    const text = reminderText({
      invoice: { number: 'SEP-001', dueDate: 'SEP 1, 2026', total: 40, payments: [{ amount: 10 }] },
      days: 4,
      labels: {
        hello: 'Hello',
        body: 'Invoice {number} was due {due}. Remaining {amount}. {days} days late.',
        thanks: 'Thanks',
      },
    })
    assert.match(text, /SEP-001/)
    assert.match(text, /30.00/)
    assert.match(text, /4 days/)
  })
})
