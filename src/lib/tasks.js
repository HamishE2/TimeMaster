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
