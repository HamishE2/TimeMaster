import {
  EPSILON,
  getMonthKeyForWeek,
  shiftWeek,
  uuid,
  weeklyPlan,
} from './utils.js';
import {
  clearEntryAnnotationsRecord,
  pruneNotes,
  removeWeekNotesRecord,
} from './entryNotes.js';

const knownWeeks = (project) =>
  new Set([
    ...Object.keys(project.entries || {}),
    ...Object.values(project.taskEntries || {}).flatMap((entries) =>
      Object.keys(entries || {}),
    ),
    ...Object.keys(project.weeklyOverrides || {}),
    ...Object.keys(project.monthlyOverrides || {}),
    ...Object.keys(project.frontloads || {}),
    ...Object.keys(project.frontloads || {}).map((key) => shiftWeek(key, 1)),
  ]);

const commonFields = (project, fields, week) => {
  const tasks = fields.tasks?.length
    ? fields.tasks
    : project.tasks?.length
      ? project.tasks
      : [{ id: 'general', name: 'General' }];
  const taskIds = new Set(tasks.map((task) => task.id));
  const taskEntries = Object.fromEntries(
    Object.entries(project.taskEntries || {}).filter(([taskId]) =>
      taskIds.has(taskId),
    ),
  );
  const taskRows = Object.fromEntries(
    Object.entries(project.taskRows || {}).map(([key, ids]) => [
      key,
      (Array.isArray(ids) ? ids : []).filter((id) => taskIds.has(id)),
    ]),
  );

  const common = {
    ...project,
    name: fields.name,
    isBillable: fields.isBillable,
    client: fields.client,
    code: fields.code,
    status: fields.status,
    color: fields.color,
    tasks,
    taskEntries,
    taskRows,
    ...(project.notes ? { notes: pruneNotes(project.notes, taskIds) } : {}),
    ...(project.activityTags
      ? { activityTags: pruneNotes(project.activityTags, taskIds) }
      : {}),
    historicalMonthlyMonth: getMonthKeyForWeek(week),
    historicalMonthlyHours: fields.historical,
    monthlyAdjustments: {
      ...(project.monthlyAdjustments || {}),
      [getMonthKeyForWeek(week)]: fields.historical,
    },
    projectType: fields.projectType || 'standard',
    durationWeeks: fields.durationWeeks,
    durationDays: fields.durationDays,
    remainderLimit: fields.remainderLimit,
  };

  return common;
};

const applyMonthlyScope = (project, next, scope, week, value) => {
  const overrides = { ...(project.monthlyOverrides || {}) };
  if (scope === 'project') {
    next.monthlyResourcedHours = value;
    next.monthlyOverrides = {};
  } else if (scope === 'week') {
    overrides[week] = value;
    next.monthlyOverrides = overrides;
  } else if (scope === 'retro') {
    for (const key of knownWeeks(project))
      if (key < week) overrides[key] = value;
    next.monthlyOverrides = overrides;
  } else {
    for (const key of knownWeeks(project)) {
      if (key < week && !Object.hasOwn(overrides, key))
        overrides[key] = project.monthlyResourcedHours ?? null;
      if (key >= week) delete overrides[key];
    }
    next.monthlyResourcedHours = value;
    next.monthlyOverrides = overrides;
  }
};

export function createProjectRecord(
  fields,
  scope,
  week,
  id = uuid(),
  createdAt = new Date().toISOString(),
) {
  const isOneTime = fields.projectType === 'one-time';

  if (isOneTime) {
    const totalWeeks = fields.durationWeeks + (fields.durationDays > 0 ? 1 : 0);
    const overrides = {};
    for (let i = 0; i < totalWeeks; i++) {
      const key = shiftWeek(week, i);
      if (i === totalWeeks - 1 && fields.durationDays > 0) {
        overrides[key] =
          fields.durationWeeks === 0 ? fields.hours : fields.remainderLimit;
      } else {
        overrides[key] = fields.hours;
      }
    }
    return {
      id,
      name: fields.name,
      isBillable: fields.isBillable,
      resourcedHours: null,
      monthlyResourcedHours: null,
      monthlyOverrides: {},
      monthlyAdjustments: {},
      historicalMonthlyMonth: getMonthKeyForWeek(week),
      historicalMonthlyHours: 0,
      client: fields.client,
      code: fields.code,
      status: fields.status,
      color: fields.color,
      tasks: fields.tasks?.length
        ? fields.tasks
        : [{ id: 'general', name: 'General' }],
      taskEntries: {},
      taskRows: {},
      entries: {},
      weeklyOverrides: overrides,
      frontloads: {},
      hiddenWeeks: [],
      visibleOnwardsFrom: week,
      hiddenOnwardsFrom: shiftWeek(week, totalWeeks),
      createdAt,
      projectType: 'one-time',
      durationWeeks: fields.durationWeeks,
      durationDays: fields.durationDays,
      remainderLimit: fields.remainderLimit,
    };
  }

  const start = scope === 'next-onwards' ? shiftWeek(week, 1) : week;
  return {
    id,
    name: fields.name,
    isBillable: fields.isBillable,
    resourcedHours: fields.hours,
    monthlyResourcedHours: scope === 'week' ? null : fields.monthly,
    monthlyOverrides: scope === 'week' ? { [week]: fields.monthly } : {},
    monthlyAdjustments: fields.historical
      ? { [getMonthKeyForWeek(week)]: fields.historical }
      : {},
    historicalMonthlyMonth: getMonthKeyForWeek(week),
    historicalMonthlyHours: fields.historical,
    client: fields.client,
    code: fields.code,
    status: fields.status,
    color: fields.color,
    tasks: fields.tasks?.length
      ? fields.tasks
      : [{ id: 'general', name: 'General' }],
    taskEntries: {},
    taskRows: {},
    entries: {},
    weeklyOverrides: scope === 'week' ? { [week]: fields.hours } : {},
    frontloads: {},
    hiddenWeeks: [],
    visibleOnwardsFrom: start,
    hiddenOnwardsFrom: scope === 'week' ? shiftWeek(week, 1) : null,
    createdAt,
    projectType: 'standard',
  };
}

export function editProjectRecord(project, fields, scope, week) {
  const next = commonFields(project, fields, week);

  if (fields.projectType === 'one-time') {
    // A converted standard project starts its temporary schedule now.  An
    // existing temporary project keeps its original start week when edited.
    const startWeek =
      project.projectType === 'one-time'
        ? project.visibleOnwardsFrom || week
        : week;
    const totalWeeks = fields.durationWeeks + (fields.durationDays > 0 ? 1 : 0);
    // Preserve historical allocations, but replace the temporary schedule and
    // any future standard allocations from its new start point.
    const overrides = Object.fromEntries(
      Object.entries(project.weeklyOverrides || {}).filter(
        ([key]) => key < startWeek,
      ),
    );

    for (let i = 0; i < totalWeeks; i++) {
      const key = shiftWeek(startWeek, i);
      if (i === totalWeeks - 1 && fields.durationDays > 0) {
        overrides[key] =
          fields.durationWeeks === 0 ? fields.hours : fields.remainderLimit;
      } else {
        overrides[key] = fields.hours;
      }
    }

    next.resourcedHours = null;
    next.monthlyResourcedHours = null;
    next.monthlyOverrides = {};
    next.weeklyOverrides = overrides;
    next.visibleOnwardsFrom = startWeek;
    next.hiddenWeeks = (project.hiddenWeeks || []).filter(
      (key) => key < startWeek,
    );
    next.hiddenOnwardsFrom = shiftWeek(startWeek, totalWeeks);

    return next;
  }

  const overrides = { ...(project.weeklyOverrides || {}) };
  if (project.projectType === 'one-time') {
    // Removing the temporary type must also remove its expiry and generated
    // future overrides, otherwise a newly-standard project still disappears.
    const retained = Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key < week),
    );
    next.resourcedHours = fields.hours;
    next.weeklyOverrides = retained;
    next.hiddenWeeks = (project.hiddenWeeks || []).filter((key) => key < week);
    next.hiddenOnwardsFrom = null;
    next.visibleOnwardsFrom =
      project.visibleOnwardsFrom && project.visibleOnwardsFrom < week
        ? project.visibleOnwardsFrom
        : week;
    applyMonthlyScope(project, next, 'onwards', week, fields.monthly);
    return next;
  }
  applyMonthlyScope(project, next, scope, week, fields.monthly);

  if (scope === 'project') {
    next.resourcedHours = fields.hours;
    next.weeklyOverrides = {};
  } else if (scope === 'week') {
    if (fields.hours == null) delete overrides[week];
    else overrides[week] = fields.hours;
    next.weeklyOverrides = overrides;
    next.hiddenWeeks = (project.hiddenWeeks || []).filter(
      (key) => key !== week,
    );
  } else if (scope === 'retro') {
    for (const key of knownWeeks(project)) {
      if (key < week) {
        if (fields.hours == null) delete overrides[key];
        else overrides[key] = fields.hours;
      }
    }
    next.weeklyOverrides = overrides;
  } else {
    for (const key of knownWeeks(project)) {
      if (
        key < week &&
        overrides[key] === undefined &&
        project.resourcedHours != null
      )
        overrides[key] = project.resourcedHours;
      if (key >= week) delete overrides[key];
    }
    next.resourcedHours = fields.hours;
    next.weeklyOverrides = overrides;
    next.hiddenWeeks = (project.hiddenWeeks || []).filter((key) => key < week);
    next.hiddenOnwardsFrom = null;
    if (next.visibleOnwardsFrom && next.visibleOnwardsFrom > week)
      next.visibleOnwardsFrom = week;
  }

  return next;
}

export function restoreProjectRecord(project, fields, scope, week) {
  const start = scope === 'next-onwards' ? shiftWeek(week, 1) : week;
  const next = commonFields(project, fields, week);
  const overrides = { ...(project.weeklyOverrides || {}) };
  applyMonthlyScope(project, next, scope, start, fields.monthly);
  next.archived = false;

  if (scope === 'week') {
    if (fields.hours == null) delete overrides[week];
    else overrides[week] = fields.hours;
    next.weeklyOverrides = overrides;
    next.hiddenWeeks = (project.hiddenWeeks || []).filter(
      (key) => key !== week,
    );
    next.visibleOnwardsFrom =
      next.visibleOnwardsFrom && next.visibleOnwardsFrom > week
        ? week
        : next.visibleOnwardsFrom;
    if (next.hiddenOnwardsFrom && next.hiddenOnwardsFrom <= week)
      next.hiddenOnwardsFrom = shiftWeek(week, 1);
  } else {
    for (const key of knownWeeks(project)) {
      if (
        key < start &&
        overrides[key] === undefined &&
        project.resourcedHours != null
      )
        overrides[key] = project.resourcedHours;
      if (key >= start) delete overrides[key];
    }
    next.resourcedHours = fields.hours;
    next.weeklyOverrides = overrides;
    next.hiddenWeeks = (project.hiddenWeeks || []).filter((key) => key < start);
    next.visibleOnwardsFrom = start;
    next.hiddenOnwardsFrom = null;
  }

  return next;
}

export function validateManagedProject(projects, id, name, hours) {
  const trimmed = name?.trim();
  if (!trimmed) return { error: 'Project names cannot be blank.' };
  const numeric = hours === '' || hours == null ? null : Number(hours);
  if (numeric !== null && (!Number.isFinite(numeric) || numeric < 0))
    return { error: 'Weekly hours must be zero or greater.' };
  const duplicate = projects.find(
    (project) =>
      project.id !== id &&
      project.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (duplicate) return { error: `“${duplicate.name}” already exists.` };
  return { name: trimmed, hours: numeric };
}

export function validateProjectDraft({
  name,
  unlimited,
  hours,
  monthlyHours,
  historicalMonthly,
  projectType,
  durationWeeks,
  durationDays,
  remainderLimit,
}) {
  const errors = {};
  if (!name.trim()) errors.name = 'Project name is required';

  if (!unlimited) {
    const weekly = Number(hours);
    if (hours === '' || !Number.isFinite(weekly) || weekly < 0)
      errors.hours = 'Hours must be zero or greater';
  }

  if (projectType === 'one-time') {
    const weeks = Number(durationWeeks),
      days = Number(durationDays);
    if (
      !Number.isInteger(weeks) ||
      weeks < 0 ||
      !Number.isInteger(days) ||
      days < 0 ||
      days > 6 ||
      (weeks === 0 && days === 0)
    )
      errors.duration = 'Duration must be whole weeks plus 1–6 remaining days';
    if (weeks > 0 && days > 0) {
      const rem = Number(remainderLimit);
      if (remainderLimit === '' || !Number.isFinite(rem) || rem < 0)
        errors.remainderLimit = 'Must be zero or greater';
    }
  } else {
    if (monthlyHours !== '') {
      const monthly = Number(monthlyHours);
      if (!Number.isFinite(monthly) || monthly < 0)
        errors.monthlyHours = 'Monthly hours must be zero or greater';
    }
    if (historicalMonthly !== '') {
      const historical = Number(historicalMonthly);
      if (!Number.isFinite(historical) || historical < 0)
        errors.historicalMonthly = 'Historical hours cannot be negative';
    }
  }
  return errors;
}

export function pinTaskLineRecord(project, taskId, week) {
  return {
    ...project,
    taskRows: {
      ...(project.taskRows || {}),
      [week]: [...new Set([...(project.taskRows?.[week] || []), taskId])],
    },
  };
}

export function removeTaskLineRecord(project, taskId, week) {
  const taskRows = { ...(project.taskRows || {}) };
  const taskEntries = { ...(project.taskEntries || {}) };
  const entries = { ...(taskEntries[taskId] || {}) };
  taskRows[week] = (taskRows[week] || []).filter((id) => id !== taskId);
  delete entries[week];
  if (Object.keys(entries).length) taskEntries[taskId] = entries;
  else delete taskEntries[taskId];
  return removeWeekNotesRecord(
    { ...project, taskRows, taskEntries },
    taskId,
    week,
  );
}

const cleanWeek = (week) =>
  Object.fromEntries(
    Object.entries(week || {}).filter(
      ([, v]) => v !== undefined && v !== null && v !== '',
    ),
  );

export function setEntryRecord(project, week, day, value) {
  const current = { ...(project.entries?.[week] || {}) };
  if (value == null) delete current[day];
  else current[day] = value;
  const entries = { ...(project.entries || {}) };
  const cleaned = cleanWeek(current);
  if (Object.keys(cleaned).length) entries[week] = cleaned;
  else delete entries[week];
  const next = { ...project, entries };
  return value == null
    ? clearEntryAnnotationsRecord(next, null, week, day)
    : next;
}

export function setTaskEntryRecord(project, taskId, targetWeek, day, value) {
  const taskEntries = { ...(project.taskEntries || {}) },
    entries = { ...(taskEntries[taskId] || {}) },
    current = { ...(entries[targetWeek] || {}) };
  if (value == null) delete current[day];
  else current[day] = value;
  const cleaned = cleanWeek(current);
  if (Object.keys(cleaned).length) entries[targetWeek] = cleaned;
  else delete entries[targetWeek];
  if (Object.keys(entries).length) taskEntries[taskId] = entries;
  else delete taskEntries[taskId];
  const next = { ...project, taskEntries };
  return value == null
    ? clearEntryAnnotationsRecord(next, taskId, targetWeek, day)
    : next;
}

export function toggleLeaveRecord(workspace, week, day) {
  const cur = workspace.settings.leaveWeeks?.[week] || [],
    next = cur.includes(day)
      ? cur.filter((x) => x !== day)
      : [...cur, day].sort();
  return {
    ...workspace,
    settings: {
      ...workspace.settings,
      leaveWeeks: { ...workspace.settings.leaveWeeks, [week]: next },
    },
  };
}

export function moveProjectRecord(workspace, id, direction) {
  const list = [...workspace.projects],
    index = list.findIndex((p) => p.id === id),
    next = index + direction;
  if (index < 0 || next < 0 || next >= list.length) return workspace;
  [list[index], list[next]] = [list[next], list[index]];
  return { ...workspace, projects: list };
}

// Moves a project to sit directly before or after another project. Used by
// drag reordering and the row menu, which work against the visible rows: the
// full list can contain hidden or archived projects between two visible ones.
export function placeProjectRecord(workspace, id, targetId, after = false) {
  if (id === targetId) return workspace;
  const list = workspace.projects.filter((p) => p.id !== id),
    moving = workspace.projects.find((p) => p.id === id),
    at = list.findIndex((p) => p.id === targetId);
  if (!moving || at < 0) return workspace;
  list.splice(after ? at + 1 : at, 0, moving);
  return { ...workspace, projects: list };
}

// Moves a phase within its project so it sits directly before or after
// another phase. Phase order drives the order of task lines on the timesheet.
export function placeTaskRecord(
  workspace,
  projectId,
  taskId,
  targetId,
  after = false,
) {
  if (taskId === targetId) return workspace;
  return {
    ...workspace,
    projects: workspace.projects.map((project) => {
      if (project.id !== projectId) return project;
      const tasks = project.tasks || [];
      const moving = tasks.find((task) => task.id === taskId);
      const rest = tasks.filter((task) => task.id !== taskId);
      const at = rest.findIndex((task) => task.id === targetId);
      if (!moving || at < 0) return project;
      rest.splice(after ? at + 1 : at, 0, moving);
      return { ...project, tasks: rest };
    }),
  };
}

export function showProjectRecord(project, targetWeek) {
  return {
    ...project,
    archived: false,
    hiddenWeeks: (project.hiddenWeeks || []).filter(
      (key) => key !== targetWeek,
    ),
    hiddenOnwardsFrom:
      project.hiddenOnwardsFrom && project.hiddenOnwardsFrom > targetWeek
        ? project.hiddenOnwardsFrom
        : null,
    visibleOnwardsFrom:
      project.visibleOnwardsFrom && project.visibleOnwardsFrom > targetWeek
        ? targetWeek
        : project.visibleOnwardsFrom,
  };
}

export function hideProjectRecord(project, from, only) {
  return only
    ? {
        ...project,
        hiddenWeeks: [...new Set([...(project.hiddenWeeks || []), from])],
      }
    : { ...project, hiddenOnwardsFrom: from };
}

export function setFrontloadRecord(item, targetWeek, rounded) {
  const frontloads = { ...(item.frontloads || {}) };
  if (rounded <= EPSILON) delete frontloads[targetWeek];
  else frontloads[targetWeek] = rounded;
  return { ...item, frontloads };
}

export function fillProjectResourcingRecord(project, week, amount) {
  return {
    ...project,
    archived: false,
    hiddenWeeks: (project.hiddenWeeks || []).filter((key) => key !== week),
    hiddenOnwardsFrom:
      project.hiddenOnwardsFrom && project.hiddenOnwardsFrom > week
        ? project.hiddenOnwardsFrom
        : null,
    visibleOnwardsFrom:
      project.visibleOnwardsFrom && project.visibleOnwardsFrom > week
        ? week
        : project.visibleOnwardsFrom,
    weeklyOverrides: {
      ...(project.weeklyOverrides || {}),
      [week]:
        Math.round(
          (Math.max(0, Number(weeklyPlan(project, week) || 0)) + amount) * 100,
        ) / 100,
    },
  };
}

// Adds a new phase to a project and pins it to a week ("+ New phase" when
// adding a timesheet line). Names are trimmed and must be new to the project;
// "General" is reserved. Returns { project, taskId } or { error }.
export function addPhaseLineRecord(project, name, week, id) {
  const value = String(name ?? '').trim();
  if (!value) return { error: 'Name the new phase.' };
  const taken = (project.tasks || []).some(
    (task) => task.name.trim().toLowerCase() === value.toLowerCase(),
  );
  if (taken || value.toLowerCase() === 'general')
    return { error: `${project.name} already has a phase called ${value}.` };
  const tasks = project.tasks?.length
    ? project.tasks
    : [{ id: 'general', name: 'General' }];
  return {
    taskId: id,
    project: pinTaskLineRecord(
      { ...project, tasks: [...tasks, { id, name: value }] },
      id,
      week,
    ),
  };
}
