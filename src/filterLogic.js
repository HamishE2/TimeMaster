import { usedHours, isUnlimited } from './utils.js';

/**
 * Applies filters and a search query to a list of projects.
 * @param {Array} projects - Array of project objects.
 * @param {string} weekKey - The current week key to calculate logged hours.
 * @param {string} query - The search query string.
 * @param {Object} filters - Active filters: { logged, unlogged, over, under, at, billable, nonBillable }.
 * @returns {Array} - The filtered array of projects.
 */
export function applyFilters(projects, weekKey, query, filters) {
  const {
    logged, unlogged,
    over, under, at,
    billable, nonBillable
  } = filters || {};

  let queryData = { isSemantic: false, searchString: '' };
  if (query) {
    const lowerQuery = query.toLowerCase().trim();
    // Match "over X", "> X", "under X", "< X" (with optional "hours", "hr", etc. but we only extract the number)
    const overRegex = /(?:over|>)\s*(\d+(?:\.\d+)?)/i;
    const underRegex = /(?:under|<)\s*(\d+(?:\.\d+)?)/i;
    
    let match = lowerQuery.match(overRegex);
    if (match) {
      queryData = { isSemantic: true, operator: '>', value: parseFloat(match[1]) };
    } else {
      match = lowerQuery.match(underRegex);
      if (match) {
        queryData = { isSemantic: true, operator: '<', value: parseFloat(match[1]) };
      } else {
        queryData = { isSemantic: false, searchString: lowerQuery };
      }
    }
  }

  return projects.filter(project => {
    const hours = usedHours(project, weekKey);
    const resourcedHours = project.resourcedHours || 0;
    const unlimited = isUnlimited(project);

    // 1. Logged / Unlogged Filter
    if (logged || unlogged) {
      let matches = false;
      if (logged && hours > 0) matches = true;
      if (unlogged && hours === 0) matches = true;
      if (!matches) return false;
    }

    // 2. Over / Under / At Filter
    if (over || under || at) {
      let matches = false;
      // Ignore unlimited projects for over/under/at checks
      if (!unlimited) {
        if (over && hours > resourcedHours) matches = true;
        if (under && hours < resourcedHours) matches = true;
        if (at && hours === resourcedHours) matches = true;
      }
      if (!matches) return false;
    }

    // 3. Billable / Non-Billable Filter
    if (billable || nonBillable) {
      const isProjectBillable = project.isBillable !== false; // true by default if not explicitly false
      let matches = false;
      if (billable && isProjectBillable) matches = true;
      if (nonBillable && !isProjectBillable) matches = true;
      if (!matches) return false;
    }

    // 4. Search Query (Semantic or Fuzzy Name Match)
    if (query && query.trim() !== '') {
      if (queryData.isSemantic) {
        if (queryData.operator === '>' && !(hours > queryData.value)) return false;
        if (queryData.operator === '<' && !(hours < queryData.value)) return false;
      } else {
        const projectName = (project.name || '').toLowerCase();
        if (!projectName.includes(queryData.searchString)) {
          return false;
        }
      }
    }

    return true;
  });
}
