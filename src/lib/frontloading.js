import {
  EPSILON,
  fmt,
  isVisible,
  projectMetrics,
  shiftWeek,
  weeklyPlan,
} from './utils.js';

const hasFiniteWeeklyPlan = (project, week) => {
  const plan = weeklyPlan(project, week);
  return plan != null && Number.isFinite(Number(plan)) && Number(plan) >= 0;
};

export const canFrontload = (project, week) => {
  const next = shiftWeek(week, 1);
  return (
    project.status !== 'closed' &&
    isVisible(project, week) &&
    isVisible(project, next) &&
    hasFiniteWeeklyPlan(project, week) &&
    hasFiniteWeeklyPlan(project, next)
  );
};

const latestLoggedEntry = (project, week) => {
  let latest = null;
  for (let day = 0; day < 7; day++)
    if (
      Number(project.entries?.[week]?.[day] || 0) > EPSILON &&
      (!latest || day >= latest.day)
    )
      latest = { day, taskId: null };
  // Entry suggestions have historically skipped the reserved ID only.
  for (const task of project.tasks || [])
    if (task.id !== 'general')
      for (let day = 0; day < 7; day++)
        if (
          Number(project.taskEntries?.[task.id]?.[week]?.[day] || 0) >
            EPSILON &&
          (!latest || day >= latest.day)
        )
          latest = { day, taskId: task.id };
  return latest;
};

export const frontloadSuggestion = (project, week, leaveWeeks) => {
  const metrics = projectMetrics(project, week, leaveWeeks);
  if (
    !canFrontload(project, week) ||
    metrics.frontloadedIn > EPSILON ||
    metrics.weeklyAllowance == null ||
    metrics.logged <= metrics.weeklyAllowance + EPSILON
  )
    return null;
  const entry = latestLoggedEntry(project, week);
  if (!entry) return null;
  return {
    ...entry,
    amount: Math.max(0, metrics.logged - metrics.weeklyAllowance),
  };
};

export const frontloadAdjustment = (project, week, leaveWeeks) => {
  const metrics = projectMetrics(project, week, leaveWeeks),
    overage = Math.max(
      0,
      metrics.logged - Math.max(0, Number(metrics.plan || 0)),
    );
  if (metrics.frontloadedIn <= overage + EPSILON) return null;
  const entry = latestLoggedEntry(project, week);
  return entry ? { ...entry, amount: overage, adjustment: true } : null;
};

const roundQuarter = (n) => Math.round(n * 4) / 4;
export const sameHours = (a, b) => Math.abs(a - b) < EPSILON / 2;

// Quick amounts for the Hours step: the suggestion that opened the dialog,
// this week's overage, thirds of what next week can give, and (when hours
// are already moved) none. Each amount appears once.
export function frontloadChoices({ maximum, suggested, overage, existing }) {
  const list = [];
  const add = (hours, sub) => {
    if (!(hours > EPSILON) || hours > maximum + EPSILON) return;
    if (list.some((item) => sameHours(item.hours, hours))) return;
    list.push({ hours, sub });
  };
  add(suggested, 'Suggested');
  add(overage, 'Matches this week’s overage');
  [1 / 3, 2 / 3].forEach((share) => add(roundQuarter(maximum * share)));
  add(maximum, 'All of next week');
  const options = list
    .slice(0, 4)
    .sort((a, b) => a.hours - b.hours)
    .map((item) => ({
      value: `h:${item.hours}`,
      hours: item.hours,
      label: `${fmt(item.hours)}h`,
      sub: item.sub,
    }));
  if (existing > EPSILON)
    options.push({
      value: 'none',
      hours: 0,
      label: 'None',
      sub: 'Removes the frontloading',
    });
  options.push({ value: 'other', label: 'Other amount' });
  return options;
}
