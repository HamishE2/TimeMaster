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

// Weekly flex: a long day that makes up for shorter days in the same week is
// not "over". Each day's hours are compared with its own capacity, but the
// running week balance (logged minus capacity, in day order) decides whether
// the extra is genuinely surplus. A day is flagged only when it is above its
// own capacity and the week stays above capacity from that day until the last
// day with hours, so a 6h day followed by a 9.2h day (or the reverse) balances.
// `logged` and `capacity` are indexed by day (0 = Monday); leave days count
// as 0h with 0h capacity. Returns { [day]: { over, flex, overBy } }.
export function dailyFlexStatus(days, logged, capacity, leave = []) {
  const working = days.filter((day) => !leave.includes(day)),
    hoursOf = (day) => Math.max(0, hoursValue(logged?.[day])),
    capOf = (day) => Math.max(0, hoursValue(capacity?.[day])),
    balances = [];
  let running = 0,
    lastLogged = -1;
  working.forEach((day, i) => {
    running += hoursOf(day) - capOf(day);
    balances.push(running);
    if (hoursOf(day) > EPSILON) lastLogged = i;
  });
  const result = {};
  for (const day of days) result[day] = { over: false, flex: false, overBy: 0 };
  working.forEach((day, i) => {
    const cap = capOf(day);
    if (cap <= 0 || hoursOf(day) <= cap + EPSILON) return;
    const settled = Math.min(...balances.slice(i, Math.max(i, lastLogged) + 1)),
      overBy =
        Math.round(Math.min(hoursOf(day) - cap, Math.max(0, settled)) * 100) /
        100;
    if (overBy > EPSILON) result[day] = { over: true, flex: false, overBy };
    else result[day] = { over: false, flex: true, overBy: 0 };
  });
  return result;
}
