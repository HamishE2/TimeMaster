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
  const next = { ...project, notes };
  // Deleting a note also drops the activity tag chosen for it.
  return !value && project.notes?.[id]?.[week]?.[day]
    ? setActivityTagRecord(next, taskId, week, day, null)
    : next;
}

export function removeWeekNotesRecord(project, taskId, week) {
  const id = noteTaskId(taskId);
  if (!project.notes?.[id]?.[week])
    return removeWeekActivityTagsRecord(project, taskId, week);
  const notes = { ...project.notes },
    weeks = { ...notes[id] };
  delete weeks[week];
  if (Object.keys(weeks).length) notes[id] = weeks;
  else delete notes[id];
  return removeWeekActivityTagsRecord({ ...project, notes }, taskId, week);
}

// Drops notes for phases that no longer exist on the project.
export function pruneNotes(notes, taskIds) {
  return Object.fromEntries(
    Object.entries(notes || {}).filter(
      ([id]) => id === GENERAL_NOTE_ID || taskIds.has(id),
    ),
  );
}

// Explicit activity tags sit beside notes:
// project.activityTags[taskId][week][day] = activityId, or NO_ACTIVITY_TAG
// when the user said the time is not for any costed activity. A tag overrides
// automatic note matching and is cleared with its note or hours.
export const NO_ACTIVITY_TAG = 'none';

export function entryActivityTag(project, taskId, week, day) {
  return project?.activityTags?.[noteTaskId(taskId)]?.[week]?.[day] || null;
}

export function setActivityTagRecord(project, taskId, week, day, activityId) {
  const id = noteTaskId(taskId),
    value = activityId == null ? '' : String(activityId),
    tags = { ...(project.activityTags || {}) },
    weeks = { ...(tags[id] || {}) },
    days = { ...(weeks[week] || {}) };
  if (!value && !project.activityTags?.[id]?.[week]?.[day]) return project;
  if (value) days[day] = value;
  else delete days[day];
  if (Object.keys(days).length) weeks[week] = days;
  else delete weeks[week];
  if (Object.keys(weeks).length) tags[id] = weeks;
  else delete tags[id];
  return { ...project, activityTags: tags };
}

// Clears both the note and the activity tag of one entry (used when its
// hours are cleared).
export const clearEntryAnnotationsRecord = (project, taskId, week, day) =>
  setActivityTagRecord(
    setEntryNoteRecord(project, taskId, week, day, ''),
    taskId,
    week,
    day,
    null,
  );

export function removeWeekActivityTagsRecord(project, taskId, week) {
  const id = noteTaskId(taskId);
  if (!project.activityTags?.[id]?.[week]) return project;
  const tags = { ...project.activityTags },
    weeks = { ...tags[id] };
  delete weeks[week];
  if (Object.keys(weeks).length) tags[id] = weeks;
  else delete tags[id];
  return { ...project, activityTags: tags };
}
