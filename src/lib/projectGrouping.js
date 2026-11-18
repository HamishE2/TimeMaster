import { projectMetrics } from './utils.js';

export const projectStatus = (value) =>
  ['active', 'on-hold', 'closed'].includes(value) ? value : 'active';

export const projectStatusLabel = (value) =>
  ({ active: 'Active', 'on-hold': 'On hold', closed: 'Closed' })[
    projectStatus(value)
  ];

const usageLabel = (value) =>
  ({
    under: 'Allowance left',
    at: 'At allocation',
    over: 'Over allocation',
    unlimited: 'Unlimited',
  })[value] || 'Allowance left';

export const categoriseProjects = (projects, category, week, leaveWeeks) => {
  if (category === 'none')
    return [{ key: 'all', label: 'All projects', projects }];
  const groupFor = (project) => {
    if (category === 'status') {
      const value = projectStatus(project.status);
      return {
        key: value,
        label: projectStatusLabel(value),
        order: ['active', 'on-hold', 'closed'].indexOf(value),
      };
    }
    if (category === 'client') {
      const value = project.client?.trim() || 'No client';
      return { key: value.toLocaleLowerCase(), label: value, order: 0 };
    }
    if (category === 'billability') {
      const value = project.isBillable !== false ? 'billable' : 'non-billable';
      return {
        key: value,
        label: value === 'billable' ? 'Billable' : 'Non-billable',
        order: value === 'billable' ? 0 : 1,
      };
    }
    const value = projectMetrics(project, week, leaveWeeks).status;
    return {
      key: value,
      label: usageLabel(value),
      order: ['over', 'at', 'under', 'unlimited'].indexOf(value),
    };
  };
  const groups = new Map();
  projects.forEach((project) => {
    const group = groupFor(project),
      existing = groups.get(group.key) || { ...group, projects: [] };
    existing.projects.push(project);
    groups.set(group.key, existing);
  });
  return [...groups.values()].sort(
    (a, b) => a.order - b.order || a.label.localeCompare(b.label),
  );
};
