// What one project's figures say is worth doing: where it loses money, what an hour would have to
// bring in, who it depends on, and how it is moving. Worked out from the Projects report alone.

import type { ProjectFigures, ProjectsReport } from './timesheet'

export type Advice = { key: string; tone: 'good' | 'warn' | 'bad' | 'info'; params: Record<string, number | string> }

const round = (value: number) => Math.round(value * 100) / 100

/** The last three months with figures against the three before them, as a change in percent. */
function trend(byMonth: Record<string, number>, months: string[]) {
  const shown = [...months].sort()
  if (shown.length < 6) return null
  const recent = shown.slice(-3).reduce((sum, month) => sum + (byMonth[month] ?? 0), 0)
  const before = shown.slice(-6, -3).reduce((sum, month) => sum + (byMonth[month] ?? 0), 0)
  if (before <= 0 || recent <= 0) return null
  return { change: Math.round(((recent - before) / before) * 100), recent: round(recent / 3), before: round(before / 3) }
}

export function projectAdvice(project: ProjectFigures, report: ProjectsReport): Advice[] {
  const advice: Advice[] = []
  const months = report.months
  const active = months.filter((month) => (project.byMonth[month] ?? 0) > 0).length || 1
  const earns = project.kind === 'client' || project.kind === 'product'

  if (project.kind === 'shared') {
    advice.push({ key: 'shared', tone: 'info', params: { cost: round(project.cost), share: Math.round(project.share * 100) } })
  } else if (earns && (project.revenue === null || project.revenue <= 0)) {
    advice.push({ key: 'noRevenue', tone: 'bad', params: { cost: round(project.cost) } })
  } else if (project.revenue !== null && project.profit !== null) {
    const margin = project.revenue > 0 ? project.profit / project.revenue : 0
    if (project.profit < 0) {
      // What it would take to break even: more revenue a month, or fewer hours at today's revenue per hour.
      const perMonth = round(-project.profit / active)
      const hoursNow = project.hours / active
      const hoursAffordable = project.costPerHour ? project.revenue / active / project.costPerHour : 0
      advice.push({
        key: 'loss',
        tone: 'bad',
        params: {
          loss: round(-project.profit),
          perMonth,
          revenueNeeded: round(project.cost / active),
          hoursNow: Math.round(hoursNow),
          hoursAffordable: Math.round(hoursAffordable),
        },
      })
    } else if (margin >= 0.2) {
      advice.push({ key: 'healthy', tone: 'good', params: { margin: Math.round(margin * 100), profit: round(project.profit) } })
    } else {
      advice.push({ key: 'thin', tone: 'warn', params: { margin: Math.round(margin * 100) } })
    }
    if (project.costPerHour !== null && project.revenuePerHour !== null && project.revenuePerHour < project.costPerHour) {
      advice.push({ key: 'priceGap', tone: 'warn', params: { costHour: project.costPerHour, revenueHour: project.revenuePerHour, gap: round(project.costPerHour - project.revenuePerHour) } })
    }
  }

  if (project.lead && project.people.length > 1 && project.lead.share >= 0.5 && project.hours >= 80) {
    advice.push({ key: 'keyPerson', tone: 'warn', params: { person: project.lead.person, share: Math.round(project.lead.share * 100) } })
  }
  const small = project.people.filter((person) => project.hours > 0 && person.hours / project.hours < 0.05)
  if (small.length >= 3) advice.push({ key: 'scattered', tone: 'info', params: { count: small.length, hours: Math.round(small.reduce((sum, person) => sum + person.hours, 0)) } })

  if (project.kind !== 'shared' && project.cost > 0 && project.overhead / project.cost >= 0.45) {
    advice.push({ key: 'overhead', tone: 'info', params: { share: Math.round((project.overhead / project.cost) * 100) } })
  }

  const hours = trend(project.byMonth, months)
  if (hours && Math.abs(hours.change) >= 25) advice.push({ key: hours.change > 0 ? 'hoursUp' : 'hoursDown', tone: 'info', params: { change: Math.abs(hours.change), recent: Math.round(hours.recent), before: Math.round(hours.before) } })
  const revenue = trend(project.revenueByMonth, months)
  if (revenue && Math.abs(revenue.change) >= 20) advice.push({ key: revenue.change > 0 ? 'revenueUp' : 'revenueDown', tone: revenue.change > 0 ? 'good' : 'warn', params: { change: Math.abs(revenue.change), revenueRecent: revenue.recent, revenueBefore: revenue.before } })

  if (project.llcRevenue > 0 && project.revenue) {
    advice.push({ key: 'llcShare', tone: 'info', params: { share: Math.round((project.llcRevenue / project.revenue) * 100), amount: project.llcRevenue } })
  }
  if (project.unpaidHours > 0) advice.push({ key: 'unpaid', tone: 'info', params: { hours: Math.round(project.unpaidHours) } })
  return advice
}
