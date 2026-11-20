export function isGeneralTask(task) {
  return task.id === 'general' || task.name.toLowerCase() === 'general';
}

const isPhaseTask = (task) => !isGeneralTask(task);

export function phasesOf(project) {
  return (project?.tasks || []).filter(isPhaseTask);
}

export function hasPhases(project) {
  return (project?.tasks || []).some(isPhaseTask);
}

// Total hours logged against one task line of a project, shown beside each
// phase in the project editor and used to confirm before removing a phase.
// General hours live in project.entries[week][day]; every other phase lives in
// project.taskEntries[taskId][week][day]. Returns 0 for a new (unsaved) project.
export function phaseHours(project, taskId) {
  if (!project) return 0;
  const weeks = isGeneralTask({ id: taskId, name: '' })
    ? project.entries
    : project.taskEntries?.[taskId];
  return Object.values(weeks || {}).reduce(
    (sum, days) =>
      sum +
      Object.values(days || {}).reduce(
        (n, value) => n + (Number(value) || 0),
        0,
      ),
    0,
  );
}
