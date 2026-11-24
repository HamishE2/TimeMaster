import {
  DEFAULT_CAPACITY,
  EPSILON,
  capacityFor,
  hoursValue,
  projectMetrics,
  weekKeyFor,
  weeklyResourcedHours,
  WEEKLY_RESOURCING_CAPACITY,
} from './utils.js';
import { taskHoursForDay } from './taskLines.js';

export function matchingProjects(visible, query, filter, week, leaveWeeks) {
  return visible.filter((p) => {
    const m = projectMetrics(p, week, leaveWeeks);
    const nameMatch =
      !query || p.name.toLowerCase().includes(query.toLowerCase());
    const typeMatch =
      filter === 'all' ||
      filter === m.status ||
      (filter === 'logged' && m.logged > 0) ||
      (filter === 'unlogged' && m.logged === 0) ||
      (filter === 'billable' && p.isBillable !== false) ||
      (filter === 'nonbillable' && p.isBillable === false);
    return nameMatch && typeMatch;
  });
}

export function timesheetTotals(visible, week, settings, leave) {
  const metrics = visible.map((p) => ({
      p,
      m: projectMetrics(p, week, settings.leaveWeeks),
    })),
    logged = metrics.reduce((n, x) => n + x.m.logged, 0),
    capacity = capacityFor(week, settings),
    billable = metrics
      .filter((x) => x.p.isBillable !== false)
      .reduce((n, x) => n + x.m.logged, 0),
    planned = metrics.reduce(
      (n, x) => n + Math.max(0, Number(x.m.plan || 0)),
      0,
    ),
    resourced = weeklyResourcedHours(visible, week, settings.leaveWeeks),
    resourcingCapacity = Math.max(0, WEEKLY_RESOURCING_CAPACITY - resourced),
    frontloading = metrics.reduce(
      (n, x) => n + x.m.frontloadedIn + x.m.frontloadedOut,
      0,
    ),
    over = metrics.filter((x) => x.m.status === 'over').length,
    todayDate = new Date(),
    todayIndex = (todayDate.getDay() + 6) % 7,
    today =
      week === weekKeyFor(todayDate) && !leave.includes(todayIndex)
        ? visible.reduce(
            (sum, project) =>
              sum +
              Number(project.entries?.[week]?.[todayIndex] || 0) +
              taskHoursForDay(project, week, todayIndex),
            0,
          )
        : 0;
  return {
    logged,
    capacity,
    billable,
    planned,
    resourced,
    resourcingCapacity,
    frontloading,
    over,
    today,
    remaining: capacity - logged,
    billablePct: logged ? (billable / logged) * 100 : 0,
  };
}

export function developmentEntryUpdates(
  pd,
  week,
  days,
  leave,
  visible,
  settings,
  remaining,
) {
  const updates = {};
  for (const day of days.filter((d) => !leave.includes(d))) {
    const dayUsed = visible.reduce(
        (n, p) =>
          n +
          Number(p.entries?.[week]?.[day] || 0) +
          taskHoursForDay(p, week, day),
        0,
      ),
      capacity = (settings.capacityByDay || DEFAULT_CAPACITY)[day],
      space = Math.max(0, hoursValue(capacity) - dayUsed),
      // Rounded so float noise (7.6 - 2.3 - 5.3) never writes a 0.0000001h
      // entry or tips a full day over its capacity.
      add = Math.round(Math.min(space, remaining) * 100) / 100;
    if (add > EPSILON) {
      updates[day] =
        Math.round((hoursValue(pd.entries?.[week]?.[day]) + add) * 100) / 100;
      remaining -= add;
    }
  }
  return updates;
}
