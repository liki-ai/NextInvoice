const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildOverview, remainingAsOf, resolvePeriod } = require('./overview')

function invoice(overrides) {
  return {
    id: 'inv-1',
    number: 'DEC-001',
    date: '2025-12-15',
    dueDate: '2025-12-31',
    total: 100,
    currency: 'EUR',
    lifecycle: 'issued',
    status: 'unpaid',
    client: { fullName: 'Ana' },
    clientId: 'c1',
    payments: [],
    ...overrides,
  }
}

function obligation(overrides) {
  return {
    id: 'ob-1',
    vendor: 'OSHEE',
    date: '2025-12-10',
    dueDate: '2025-12-20',
    amount: 40,
    currency: 'EUR',
    status: 'unpaid',
    payments: [],
    ...overrides,
  }
}

describe('overview reporting', () => {
  it('splits a December invoice paid in January across months', () => {
    const inv = invoice({
      payments: [{ id: 'p1', amount: 100, date: '2026-01-08' }],
    })
    const dec = resolvePeriod({ preset: 'month', year: 2025, month: 11 }, new Date(2026, 8, 5))
    const jan = resolvePeriod({ preset: 'month', year: 2026, month: 0 }, new Date(2026, 8, 5))
    const decReport = buildOverview({ invoices: [inv], obligations: [], period: dec, currency: 'EUR' })
    const janReport = buildOverview({ invoices: [inv], obligations: [], period: jan, currency: 'EUR' })
    assert.equal(decReport.invoiced, 100)
    assert.equal(decReport.paymentsReceived, 0)
    assert.equal(decReport.receivables, 100)
    assert.equal(janReport.invoiced, 0)
    assert.equal(janReport.paymentsReceived, 100)
    assert.equal(janReport.receivables, 0)
  })

  it('keeps unpaid prior-year amounts in outstanding balances', () => {
    const inv = invoice({ date: '2024-06-01', dueDate: '2024-06-15', total: 80 })
    const period = resolvePeriod({ preset: 'year', year: 2025 }, new Date(2025, 11, 31))
    const report = buildOverview({ invoices: [inv], obligations: [], period, currency: 'EUR' })
    assert.equal(report.invoiced, 0)
    assert.equal(report.receivables, 80)
    assert.equal(report.customers[0].amount, 80)
  })

  it('computes remaining from partial payments as of the period end', () => {
    const inv = invoice({
      total: 90,
      payments: [
        { id: 'p1', amount: 30, date: '2025-12-20' },
        { id: 'p2', amount: 20, date: '2026-02-01' },
      ],
    })
    const dec = resolvePeriod({ preset: 'month', year: 2025, month: 11 }, new Date(2026, 8, 5))
    const report = buildOverview({ invoices: [inv], obligations: [], period: dec, currency: 'EUR' })
    assert.equal(report.paymentsReceived, 30)
    assert.equal(report.receivables, 60)
  })

  it('does not let later payments reduce an earlier historical balance', () => {
    const inv = invoice({
      date: '2025-11-01',
      total: 50,
      payments: [{ id: 'p1', amount: 50, date: '2026-03-01' }],
    })
    const remaining = remainingAsOf(inv, new Date(2025, 11, 31))
    assert.equal(remaining.amount, 50)
  })

  it('excludes cancellations effective on or before the period end', () => {
    const inv = invoice({
      lifecycle: 'cancelled',
      status: 'cancelled',
      cancelledAt: '2025-12-20',
    })
    const dec = resolvePeriod({ preset: 'month', year: 2025, month: 11 }, new Date(2026, 8, 5))
    const report = buildOverview({ invoices: [inv], obligations: [], period: dec, currency: 'EUR' })
    assert.equal(report.invoiced, 0)
    assert.equal(report.receivables, 0)
  })

  it('keeps a later cancellation in an earlier period’s invoiced amount', () => {
    const inv = invoice({
      lifecycle: 'cancelled',
      status: 'cancelled',
      cancelledAt: '2026-01-04',
    })
    const dec = resolvePeriod({ preset: 'month', year: 2025, month: 11 }, new Date(2026, 8, 5))
    const report = buildOverview({ invoices: [inv], obligations: [], period: dec, currency: 'EUR' })
    assert.equal(report.invoiced, 100)
    assert.equal(report.receivables, 100)
  })

  it('flags legacy paid documents without inventing a payment date', () => {
    const inv = invoice({ status: 'paid', payments: [] })
    const dec = resolvePeriod({ preset: 'month', year: 2025, month: 11 }, new Date(2026, 8, 5))
    const report = buildOverview({ invoices: [inv], obligations: [], period: dec, currency: 'EUR' })
    assert.equal(report.invoiced, 100)
    assert.equal(report.paymentsReceived, 0)
    assert.equal(report.receivables, 0)
    assert.equal(report.limitations.legacyPaid, true)
  })

  it('excludes drafts and keeps currencies separate', () => {
    const draft = invoice({ id: 'd1', lifecycle: 'draft', total: 500 })
    const usd = invoice({ id: 'u1', currency: 'USD', total: 25 })
    const dec = resolvePeriod({ preset: 'month', year: 2025, month: 11 }, new Date(2026, 8, 5))
    const eur = buildOverview({ invoices: [draft, usd], obligations: [], period: dec, currency: 'EUR' })
    const usdReport = buildOverview({ invoices: [draft, usd], obligations: [], period: dec, currency: 'USD' })
    assert.equal(eur.invoiced, 0)
    assert.equal(usdReport.invoiced, 25)
  })

  it('uses document dates for obligations and payment dates for payments made', () => {
    const item = obligation({
      payments: [{ id: 'p1', amount: 40, date: '2026-01-02' }],
    })
    const dec = resolvePeriod({ preset: 'month', year: 2025, month: 11 }, new Date(2026, 8, 5))
    const jan = resolvePeriod({ preset: 'month', year: 2026, month: 0 }, new Date(2026, 8, 5))
    const decReport = buildOverview({ invoices: [], obligations: [item], period: dec, currency: 'EUR' })
    const janReport = buildOverview({ invoices: [], obligations: [item], period: jan, currency: 'EUR' })
    assert.equal(decReport.obligationsRecorded, 40)
    assert.equal(decReport.paymentsMade, 0)
    assert.equal(decReport.payables, 40)
    assert.equal(janReport.obligationsRecorded, 0)
    assert.equal(janReport.paymentsMade, 40)
    assert.equal(janReport.payables, 0)
  })

  it('lists overdue obligations as of the period end date', () => {
    const item = obligation({ date: '2025-11-01', dueDate: '2025-11-10', amount: 15 })
    const dec = resolvePeriod({ preset: 'month', year: 2025, month: 11 }, new Date(2026, 8, 5))
    const report = buildOverview({ invoices: [], obligations: [item], period: dec, currency: 'EUR' })
    assert.equal(report.overduePayables.length, 1)
    assert.ok(report.overduePayables[0].daysOverdueAsOf >= 21)
  })

  it('ignores a payment voided on or before the period end', () => {
    const inv = invoice({
      payments: [{ id: 'p1', amount: 100, date: '2025-12-18', voidedAt: '2025-12-19' }],
    })
    const dec = resolvePeriod({ preset: 'month', year: 2025, month: 11 }, new Date(2026, 8, 5))
    const report = buildOverview({ invoices: [inv], obligations: [], period: dec, currency: 'EUR' })
    assert.equal(report.paymentsReceived, 0)
    assert.equal(report.receivables, 100)
  })

  it('still counts a payment that is voided after the period end', () => {
    const inv = invoice({
      payments: [{ id: 'p1', amount: 100, date: '2025-12-18', voidedAt: '2026-01-12' }],
    })
    const dec = resolvePeriod({ preset: 'month', year: 2025, month: 11 }, new Date(2026, 8, 5))
    const report = buildOverview({ invoices: [inv], obligations: [], period: dec, currency: 'EUR' })
    assert.equal(report.paymentsReceived, 100)
    assert.equal(report.receivables, 0)
  })

  it('computes net payments as received minus made', () => {
    const inv = invoice({ payments: [{ id: 'p1', amount: 100, date: '2025-12-20' }] })
    const item = obligation({ payments: [{ id: 'p2', amount: 40, date: '2025-12-22' }] })
    const dec = resolvePeriod({ preset: 'month', year: 2025, month: 11 }, new Date(2026, 8, 5))
    const report = buildOverview({ invoices: [inv], obligations: [item], period: dec, currency: 'EUR' })
    assert.equal(report.netPayments, 60)
  })

  it('reads day-month-year dates before US Date.parse', () => {
    const inv = invoice({ date: '05.09.2026', total: 70, status: 'unpaid' })
    const period = resolvePeriod({ preset: 'this_month' }, new Date(2026, 8, 5))
    const report = buildOverview({ invoices: [inv], obligations: [], period, currency: 'EUR' })
    assert.equal(report.invoiced, 70)
    assert.equal(report.receivables, 70)
  })
})
