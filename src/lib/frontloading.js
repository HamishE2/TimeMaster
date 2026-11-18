import {
  EPSILON,
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
