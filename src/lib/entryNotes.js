import { isGeneralTask } from './tasks.js';

// Notes live beside the hours they describe:
// project.notes[taskId][week][day] = text, where General time uses the
// reserved `general` task ID.
export const GENERAL_NOTE_ID = 'general';

const noteTaskId = (taskId) =>
  taskId == null || isGeneralTask({ id: taskId, name: '' })
    ? GENERAL_NOTE_ID
    : taskId;

export function entryNote(project, taskId, week, day) {
  return project?.notes?.[noteTaskId(taskId)]?.[week]?.[day] || '';
}

export function setEntryNoteRecord(project, taskId, week, day, text) {
  const id = noteTaskId(taskId),
    value = String(text ?? '').trim(),
    notes = { ...(project.notes || {}) },
    weeks = { ...(notes[id] || {}) },
    days = { ...(weeks[week] || {}) };
  if (value) days[day] = value;
  else delete days[day];
  if (Object.keys(days).length) weeks[week] = days;
  else delete weeks[week];
  if (Object.keys(weeks).length) notes[id] = weeks;
  else delete notes[id];
  if (!Object.keys(notes).length && !project.notes) return project;
  return { ...project, notes };
}

export function removeWeekNotesRecord(project, taskId, week) {
  const id = noteTaskId(taskId);
  if (!project.notes?.[id]?.[week]) return project;
  const notes = { ...project.notes },
    weeks = { ...notes[id] };
  delete weeks[week];
  if (Object.keys(weeks).length) notes[id] = weeks;
  else delete notes[id];
  return { ...project, notes };
}

// Drops notes for phases that no longer exist on the project.
export function pruneNotes(notes, taskIds) {
  return Object.fromEntries(
    Object.entries(notes || {}).filter(
      ([id]) => id === GENERAL_NOTE_ID || taskIds.has(id),
    ),
  );
}
