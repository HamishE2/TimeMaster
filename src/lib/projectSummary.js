import { projectStatus, projectStatusLabel } from './projectGrouping.js';
import { EPSILON, fmt, projectMetrics } from './utils.js';

export function projectSummary(project, week, leaveWeeks) {
  const metrics = projectMetrics(project, week, leaveWeeks);
  const { remaining, frontloadedOut } = metrics;
  const status = projectStatus(project.status);
  const frontloaded = frontloadedOut > EPSILON ? fmt(frontloadedOut) : null;
  const remainingLabel =
    metrics.status === 'unlimited'
      ? 'Unlimited'
      : metrics.status === 'over'
        ? `${fmt(-remaining)}h over`
        : metrics.status === 'at'
          ? 'At plan'
          : `${fmt(Math.max(0, remaining))}h left`;

  return {
    metrics,
    status,
    statusLabel: projectStatusLabel(status),
    remainingLabel,
    sourceNote:
      frontloaded === null
        ? null
        : `−${frontloaded}h frontloaded to previous week`,
    sourceNoteTitle:
      frontloaded === null
        ? null
        : `Weekly limit reduced by ${frontloaded} hours due to frontloading in the previous week`,
  };
}
