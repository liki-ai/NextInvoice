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
  companySnapshot,
  invoiceTotals,
  normalizeTaxRate,
  clientSnapshot,
  parseLooseDate,
} = require('./domain')
const { sanitizeProfile } = require('./routes/profile')

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

describe('company profile', () => {
  it('keeps logo, industry and template on save', () => {
    const logo = 'data:image/png;base64,AAAA'
    const saved = sanitizeProfile({ companyName: 'Tretek', industry: 'services', invoiceTemplate: 'corporate', logoData: logo, accentColor: '#2E75B6' })
    assert.equal(saved.logoData, logo)
    assert.equal(saved.industry, 'services')
    assert.equal(saved.invoiceTemplate, 'corporate')
    assert.equal(saved.accentColor, '#2E75B6')
  })

  it('drops unknown keys and invalid choices', () => {
    const saved = sanitizeProfile({ plan: 'premium', industry: 'banking', invoiceTemplate: 'nope', accentColor: 'red' })
    assert.deepEqual(saved, {})
  })

  it('lets a field be cleared', () => {
    const saved = sanitizeProfile({ exportNote: '', logoData: '' })
    assert.equal(saved.exportNote, '')
    assert.equal(saved.logoData, '')
  })

  it('rejects images that are not image data URLs', () => {
    assert.throws(() => sanitizeProfile({ logoData: 'javascript:alert(1)' }))
    assert.throws(() => sanitizeProfile({ logoData: 'data:image/svg+xml;base64,AAAA' }))
  })

  it('snapshots legal fields but not images', () => {
    const snap = companySnapshot({ companyName: 'Tretek', vatNumber: '330286056', swift: 'MBKOXKPR', industry: 'services', logoData: 'data:image/png;base64,AAAA' })
    assert.equal(snap.vatNumber, '330286056')
    assert.equal(snap.swift, 'MBKOXKPR')
    assert.equal(snap.industry, 'services')
    assert.equal(snap.logoData, undefined)
  })
})

describe('VAT', () => {
  it('reads a rate as a percentage or a spreadsheet fraction', () => {
    assert.equal(normalizeTaxRate(18), 18)
    assert.equal(normalizeTaxRate('18'), 18)
    assert.equal(normalizeTaxRate(0.18), 18)
    assert.equal(normalizeTaxRate(0.08), 8)
    assert.equal(normalizeTaxRate(''), 0)
    assert.equal(normalizeTaxRate(-5), 0)
    assert.equal(normalizeTaxRate(250), 100)
  })

  it('leaves totals untouched when there is no VAT', () => {
    const totals = invoiceTotals([{ quantity: 2, unitPrice: 50 }, { quantity: 1, unitPrice: '19,99' }], 10, 0)
    assert.deepEqual(totals, { subtotal: 119.99, discount: 10, net: 109.99, taxRate: 0, taxAmount: 0, total: 109.99 })
  })

  it('adds VAT after the discount', () => {
    const totals = invoiceTotals([{ quantity: 176, unitPrice: 24 }], 224, 18)
    assert.equal(totals.subtotal, 4224)
    assert.equal(totals.net, 4000)
    assert.equal(totals.taxAmount, 720)
    assert.equal(totals.total, 4720)
  })

  it('rounds only the results, so net prices worked back from a gross price land on it again', () => {
    // 50.00 gross each at 18% VAT is 42.3728… net; five of them must bill 250.00, not 249.99.
    const lines = [42.37288, 42.3728, 42.3728, 42.3728, 42.3728].map((unitPrice) => ({ quantity: 1, unitPrice }))
    const totals = invoiceTotals(lines, 0, 0.18)
    assert.equal(totals.subtotal, 211.86)
    assert.equal(totals.taxAmount, 38.14)
    assert.equal(totals.total, 250)
    assert.equal(invoiceTotals([{ quantity: 1, unitPrice: 1360.17 }], 0, 18).total, 1605)
  })

  it('always has net plus VAT equal the total', () => {
    for (const price of [0.01, 0.07, 33.335, 99.995, 1902.54, 20338.98]) {
      const totals = invoiceTotals([{ quantity: 3, unitPrice: price }], 0.5, 18)
      assert.equal(Math.round((totals.net + totals.taxAmount) * 100), Math.round(totals.total * 100))
    }
  })

  it('keeps a client VAT and fiscal number', () => {
    const snap = clientSnapshot({ fullName: 'ASEE', businessId: 70041518, vatNumber: 330071845, fiscalNumber: 600021571 })
    assert.equal(snap.vatNumber, '330071845')
    assert.equal(snap.fiscalNumber, '600021571')
  })
})

describe('dates', () => {
  it('reads day-first dates, and month-first ones when the day cannot be a month', () => {
    const ymd = (value) => {
      const d = parseLooseDate(value)
      return [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-')
    }
    assert.equal(ymd('05.01.2026'), '2026-1-5')
    assert.equal(ymd('31/12/2025'), '2025-12-31')
    assert.equal(ymd('9/30/2026'), '2026-9-30')
    assert.equal(ymd('JAN 5, 2026'), '2026-1-5')
  })
})

describe('invoice numbering', () => {
  it('continues a YYYYMM-NNN scheme once the account uses it', () => {
    const existing = [
      { number: '202610-008', createdAt: '2026-10-12T00:00:00.000Z' },
      { number: '202610-007', createdAt: '2026-10-12T00:00:00.000Z' },
      { number: '202609-018', createdAt: '2026-09-30T00:00:00.000Z' },
    ]
    assert.equal(allocateInvoiceNumber(existing, new Date(2026, 9, 13)), '202610-009')
    assert.equal(allocateInvoiceNumber(existing, new Date(2026, 10, 2)), '202611-001')
  })

  it('goes by what most invoices look like, not by the newest one', () => {
    const imported = ['202610-008', '202610-007', '202609-018'].map((number) => ({ number, createdAt: '2026-10-12T12:00:00.000Z' }))
    const madeBefore = { number: 'OCT-001', createdAt: '2026-10-13T09:00:00.000Z' }
    assert.equal(allocateInvoiceNumber([madeBefore, ...imported], new Date(2026, 9, 13)), '202610-009')
    assert.equal(allocateInvoiceNumber([madeBefore, { number: 'OCT-002', createdAt: 'x' }, imported[0]], new Date(2026, 9, 13)), 'OCT-003')
  })

  it('keeps the month-name scheme otherwise', () => {
    assert.equal(allocateInvoiceNumber([{ number: 'OCT-004', createdAt: '2026-10-01T00:00:00.000Z' }], new Date(2026, 9, 13)), 'OCT-005')
    assert.equal(allocateInvoiceNumber([], new Date(2026, 9, 13)), 'OCT-001')
  })
})
