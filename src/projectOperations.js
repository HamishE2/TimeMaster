import { shiftWeek, uuid } from './utils.js';

const knownWeeks = project => new Set([
  ...Object.keys(project.entries || {}),
  ...Object.values(project.taskEntries || {}).flatMap(entries => Object.keys(entries || {})),
  ...Object.keys(project.weeklyOverrides || {}),
  ...Object.keys(project.monthlyOverrides || {}),
  ...Object.keys(project.frontloads || {}),
  ...Object.keys(project.frontloads || {}).map(key => shiftWeek(key, 1))
]);

const commonFields = (project, fields, week) => {
  const tasks = fields.tasks?.length ? fields.tasks : (project.tasks?.length ? project.tasks : [{id:'general',name:'General'}]);
  const taskIds = new Set(tasks.map(task => task.id));
  const taskEntries = Object.fromEntries(Object.entries(project.taskEntries || {}).filter(([taskId]) => taskIds.has(taskId)));
  const taskRows = Object.fromEntries(Object.entries(project.taskRows || {}).map(([key,ids]) => [key, (Array.isArray(ids) ? ids : []).filter(id => taskIds.has(id))]));
  
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
    historicalMonthlyMonth: week.slice(0, 7),
    historicalMonthlyHours: fields.historical,
    monthlyAdjustments: {
      ...(project.monthlyAdjustments || {}),
      [week.slice(0, 7)]: fields.historical
    },
    projectType: fields.projectType || 'standard',
    durationWeeks: fields.durationWeeks,
    durationDays: fields.durationDays,
    remainderLimit: fields.remainderLimit
  };

  return common;
};

const applyMonthlyScope = (project, next, scope, week, value) => {
  const overrides = {...(project.monthlyOverrides || {})};
  if (scope === 'project') {
    next.monthlyResourcedHours = value;
    next.monthlyOverrides = {};
  } else if (scope === 'week') {
    overrides[week] = value;
    next.monthlyOverrides = overrides;
  } else if (scope === 'retro') {
    for (const key of knownWeeks(project)) if (key < week) overrides[key] = value;
    next.monthlyOverrides = overrides;
  } else {
    for (const key of knownWeeks(project)) {
      if (key < week && !Object.hasOwn(overrides, key)) overrides[key] = project.monthlyResourcedHours ?? null;
      if (key >= week) delete overrides[key];
    }
    next.monthlyResourcedHours = value;
    next.monthlyOverrides = overrides;
  }
};

export function createProjectRecord(fields, scope, week, id = uuid(), createdAt = new Date().toISOString()) {
  const isOneTime = fields.projectType === 'one-time';
  
  if (isOneTime) {
    const totalWeeks = fields.durationWeeks + (fields.durationDays > 0 ? 1 : 0);
    const overrides = {};
    for (let i = 0; i < totalWeeks; i++) {
       const key = shiftWeek(week, i);
       if (i === totalWeeks - 1 && fields.durationDays > 0) {
          overrides[key] = fields.durationWeeks === 0 ? fields.hours : fields.remainderLimit;
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
      historicalMonthlyMonth: week.slice(0, 7),
      historicalMonthlyHours: 0,
      client: fields.client,
      code: fields.code,
      status: fields.status,
      color: fields.color,
      tasks: fields.tasks?.length ? fields.tasks : [{id:'general',name:'General'}],
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
      remainderLimit: fields.remainderLimit
    };
  }

  const start = scope === 'next-onwards' ? shiftWeek(week, 1) : week;
  return {
    id,
    name: fields.name,
    isBillable: fields.isBillable,
    resourcedHours: fields.hours,
    monthlyResourcedHours: scope === 'week' ? null : fields.monthly,
    monthlyOverrides: scope === 'week' ? {[week]: fields.monthly} : {},
    monthlyAdjustments: fields.historical ? {[week.slice(0, 7)]: fields.historical} : {},
    historicalMonthlyMonth: week.slice(0, 7),
    historicalMonthlyHours: fields.historical,
    client: fields.client,
    code: fields.code,
    status: fields.status,
    color: fields.color,
    tasks: fields.tasks?.length ? fields.tasks : [{id:'general',name:'General'}],
    taskEntries: {},
    taskRows: {},
    entries: {},
    weeklyOverrides: scope === 'week' ? {[week]: fields.hours} : {},
    frontloads: {},
    hiddenWeeks: [],
    visibleOnwardsFrom: start,
    hiddenOnwardsFrom: scope === 'week' ? shiftWeek(week, 1) : null,
    createdAt,
    projectType: 'standard'
  };
}

export function editProjectRecord(project, fields, scope, week) {
  const next = commonFields(project, fields, week);

  if (fields.projectType === 'one-time') {
    // A converted standard project starts its temporary schedule now.  An
    // existing temporary project keeps its original start week when edited.
    const startWeek = project.projectType === 'one-time' ? (project.visibleOnwardsFrom || week) : week;
    const totalWeeks = fields.durationWeeks + (fields.durationDays > 0 ? 1 : 0);
    // Preserve historical allocations, but replace the temporary schedule and
    // any future standard allocations from its new start point.
    const overrides = Object.fromEntries(Object.entries(project.weeklyOverrides || {}).filter(([key]) => key < startWeek));
    
    for (let i = 0; i < totalWeeks; i++) {
       const key = shiftWeek(startWeek, i);
       if (i === totalWeeks - 1 && fields.durationDays > 0) {
          overrides[key] = fields.durationWeeks === 0 ? fields.hours : fields.remainderLimit;
       } else {
          overrides[key] = fields.hours;
       }
    }
    
    next.resourcedHours = null;
    next.monthlyResourcedHours = null;
    next.monthlyOverrides = {};
    next.weeklyOverrides = overrides;
    next.visibleOnwardsFrom = startWeek;
    next.hiddenWeeks = (project.hiddenWeeks || []).filter(key => key < startWeek);
    next.hiddenOnwardsFrom = shiftWeek(startWeek, totalWeeks);
    
    return next;
  }

  const overrides = {...(project.weeklyOverrides || {})};
  if (project.projectType === 'one-time') {
    // Removing the temporary type must also remove its expiry and generated
    // future overrides, otherwise a newly-standard project still disappears.
    const retained = Object.fromEntries(Object.entries(overrides).filter(([key]) => key < week));
    next.resourcedHours = fields.hours;
    next.weeklyOverrides = retained;
    next.hiddenWeeks = (project.hiddenWeeks || []).filter(key => key < week);
    next.hiddenOnwardsFrom = null;
    next.visibleOnwardsFrom = project.visibleOnwardsFrom && project.visibleOnwardsFrom < week ? project.visibleOnwardsFrom : week;
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
    next.hiddenWeeks = (project.hiddenWeeks || []).filter(key => key !== week);
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
      if (key < week && overrides[key] === undefined && project.resourcedHours != null) overrides[key] = project.resourcedHours;
      if (key >= week) delete overrides[key];
    }
    next.resourcedHours = fields.hours;
    next.weeklyOverrides = overrides;
    next.hiddenWeeks = (project.hiddenWeeks || []).filter(key => key < week);
    next.hiddenOnwardsFrom = null;
    if (next.visibleOnwardsFrom && next.visibleOnwardsFrom > week) next.visibleOnwardsFrom = week;
  }

  return next;
}

export function restoreProjectRecord(project, fields, scope, week) {
  const start = scope === 'next-onwards' ? shiftWeek(week, 1) : week;
  const next = commonFields(project, fields, week);
  const overrides = {...(project.weeklyOverrides || {})};
  applyMonthlyScope(project, next, scope, start, fields.monthly);
  next.archived = false;

  if (scope === 'week') {
    if (fields.hours == null) delete overrides[week];
    else overrides[week] = fields.hours;
    next.weeklyOverrides = overrides;
    next.hiddenWeeks = (project.hiddenWeeks || []).filter(key => key !== week);
    next.visibleOnwardsFrom = next.visibleOnwardsFrom && next.visibleOnwardsFrom > week ? week : next.visibleOnwardsFrom;
    if (next.hiddenOnwardsFrom && next.hiddenOnwardsFrom <= week) next.hiddenOnwardsFrom = shiftWeek(week, 1);
  } else {
    for (const key of knownWeeks(project)) {
      if (key < start && overrides[key] === undefined && project.resourcedHours != null) overrides[key] = project.resourcedHours;
      if (key >= start) delete overrides[key];
    }
    next.resourcedHours = fields.hours;
    next.weeklyOverrides = overrides;
    next.hiddenWeeks = (project.hiddenWeeks || []).filter(key => key < start);
    next.visibleOnwardsFrom = start;
    next.hiddenOnwardsFrom = null;
  }

  return next;
}

export function validateManagedProject(projects, id, name, hours) {
  const trimmed = name?.trim();
  if (!trimmed) return {error: 'Project names cannot be blank.'};
  const numeric = hours === '' || hours == null ? null : Number(hours);
  if (numeric !== null && (!Number.isFinite(numeric) || numeric < 0)) return {error: 'Weekly hours must be zero or greater.'};
  const duplicate = projects.find(project => project.id !== id && project.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (duplicate) return {error: `“${duplicate.name}” already exists.`};
  return {name: trimmed, hours: numeric};
}

export function validateProjectDraft({name, unlimited, hours, monthlyHours, historicalMonthly, projectType, durationWeeks, durationDays, remainderLimit}) {
  const errors = {};
  if (!name.trim()) errors.name = 'Project name is required';
  
  if (!unlimited) {
    const weekly = Number(hours);
    if (hours === '' || !Number.isFinite(weekly) || weekly < 0) errors.hours = 'Hours must be zero or greater';
  }
  
  if (projectType === 'one-time') {
     const weeks = Number(durationWeeks), days = Number(durationDays);
     if (!Number.isInteger(weeks) || weeks < 0 || !Number.isInteger(days) || days < 0 || days > 6 || (weeks === 0 && days === 0)) errors.duration = 'Duration must be whole weeks plus 1–6 remaining days';
     if (weeks > 0 && days > 0) {
        const rem = Number(remainderLimit);
        if (remainderLimit === '' || !Number.isFinite(rem) || rem < 0) errors.remainderLimit = 'Must be zero or greater';
     }
  } else {
    if (monthlyHours !== '') {
      const monthly = Number(monthlyHours);
      if (!Number.isFinite(monthly) || monthly < 0) errors.monthlyHours = 'Monthly hours must be zero or greater';
    }
    if (historicalMonthly !== '') {
      const historical = Number(historicalMonthly);
      if (!Number.isFinite(historical) || historical < 0) errors.historicalMonthly = 'Historical hours cannot be negative';
    }
  }
  return errors;
}

export function pinTaskLineRecord(project, taskId, week) {
  return {...project, taskRows: {...(project.taskRows || {}), [week]: [...new Set([...(project.taskRows?.[week] || []), taskId])]}};
}

export function removeTaskLineRecord(project, taskId, week) {
  const taskRows = {...(project.taskRows || {})};
  const taskEntries = {...(project.taskEntries || {})};
  const entries = {...(taskEntries[taskId] || {})};
  taskRows[week] = (taskRows[week] || []).filter(id => id !== taskId);
  delete entries[week];
  if (Object.keys(entries).length) taskEntries[taskId] = entries;
  else delete taskEntries[taskId];
  return {...project, taskRows, taskEntries};
}


