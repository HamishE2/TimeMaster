export function taskEntrySources(project) {
  const validIds = new Set(
    (project.tasks || [])
      .filter(
        (task) =>
          task.id !== 'general' &&
          String(task.name || '').toLowerCase() !== 'general',
      )
      .map((task) => task.id),
  );
  return Object.entries(project.taskEntries || {})
    .filter(([taskId]) => validIds.has(taskId))
    .map(([, entries]) => entries);
}

export const taskHoursForDay = (project, week, day) =>
  taskEntrySources(project).reduce(
    (sum, entries) => sum + Number(entries?.[week]?.[day] || 0),
    0,
  );

export const isPhaseTask = (task) =>
  task.id !== 'general' && task.name.toLowerCase() !== 'general';

export const taskLinesFor = (project, week) =>
  (project.tasks || [])
    .filter(
      (task) =>
        isPhaseTask(task) &&
        ((project.taskRows?.[week] || []).includes(task.id) ||
          Object.values(project.taskEntries?.[task.id]?.[week] || {}).some(
            (value) => Number(value) > 0,
          )),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

export const addablePhasesFor = (project, week) => {
  const onSheet = new Set(taskLinesFor(project, week).map((task) => task.id));
  return (project.tasks || [])
    .filter((task) => isPhaseTask(task) && !onSheet.has(task.id))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const projectHasPhases = (project) =>
  (project.tasks || []).some(isPhaseTask);
