import { useState, useCallback, useEffect } from 'react';
import { uuid, DEFAULT_VISIBLE_DAYS, weekKeyFor, shiftWeek } from './utils';
import { writeBackup } from './backupService';
import { saveSessionToIdb } from './idb';

export function useStore() {
  const [fileHandle, setFileHandle] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState({ visibleDays: DEFAULT_VISIBLE_DAYS, leaveWeeks: {} });
 
   const initFromBackup = useCallback((handle, data) => {
     setFileHandle(handle);
     if (data) {
       if (data.projects) setProjects(data.projects);
       if (data.settings) {
         setSettings({
           visibleDays: data.settings.visibleDays ?? DEFAULT_VISIBLE_DAYS,
           leaveWeeks: data.settings.leaveWeeks ?? {}
         });
       }
     }
     setInitialized(true);
   }, []);
 
   // Persist on every change
   useEffect(() => {
     if (!initialized) return;
     const currentWeekKey = weekKeyFor(new Date());
     const dataToSave = { projects, settings };
     
     // Always save to IDB so we have immediate access next reload
     saveSessionToIdb(fileHandle, currentWeekKey, dataToSave).catch(e => console.warn('IDB save failed', e));
 
     if (fileHandle) {
       writeBackup(fileHandle, projects, settings);
     }
   }, [projects, settings, initialized, fileHandle]);
 
   const visibleDays = settings.visibleDays ?? DEFAULT_VISIBLE_DAYS;
 
   const setVisibleDays = useCallback((days) => {
     // Sort and ensure at least one day
     const sorted = [...days].sort((a, b) => a - b);
     if (sorted.length === 0) return;
     setSettings(prev => ({ ...prev, visibleDays: sorted }));
   }, []);
 
   const toggleDay = useCallback((dayIndex) => {
     setSettings(prev => {
       const current = prev.visibleDays ?? DEFAULT_VISIBLE_DAYS;
       let next;
       if (current.includes(dayIndex)) {
         next = current.filter(d => d !== dayIndex);
         if (next.length === 0) return prev; // Keep at least one day
       } else {
         next = [...current, dayIndex].sort((a, b) => a - b);
       }
       return { ...prev, visibleDays: next };
     });
   }, []);

   const toggleLeaveDay = useCallback((weekKey, dayIndex) => {
     setSettings(prev => {
       const leaveWeeks = prev.leaveWeeks || {};
       const current = leaveWeeks[weekKey] || [];
       let next;
       if (current.includes(dayIndex)) {
         next = current.filter(d => d !== dayIndex);
       } else {
         next = [...current, dayIndex].sort((a, b) => a - b);
       }
       return {
         ...prev,
         leaveWeeks: {
           ...leaveWeeks,
           [weekKey]: next
         }
       };
     });
   }, []);

  // resourcedHours: null = unlimited, number = budget
  const addProject = useCallback((name, resourcedHours, isBillable = true, monthlyResourcedHours = null, historicalMonthlyHours = 0, applyScope = 'onwards', weekKey = null, client = '', code = '', status = 'active', color = '#6366f1') => {
    setProjects(prev => {
      let finalResourcedHours = resourcedHours;
      let visibleOnwardsFrom = null;
      let hiddenOnwardsFrom = null;

      if (weekKey) {
        if (applyScope === 'week') {
          visibleOnwardsFrom = weekKey;
          hiddenOnwardsFrom = shiftWeek(weekKey, 1);
        } else if (applyScope === 'onwards') {
          visibleOnwardsFrom = weekKey;
        } else if (applyScope === 'next-onwards') {
          visibleOnwardsFrom = shiftWeek(weekKey, 1);
        }
      }

      return [...prev, {
        id: uuid(),
        name,
        client,
        code,
        status,
        color,
        resourcedHours: finalResourcedHours,
        monthlyResourcedHours,
        historicalMonthlyHours,
        isBillable,
        entries: {},
        weeklyOverrides: {},
        visibleOnwardsFrom,
        hiddenOnwardsFrom,
        createdAt: new Date().toISOString(),
      }];
    });
  }, []);

  const updateProject = useCallback((id, name, resourcedHours, isBillable = true, monthlyResourcedHours = undefined, weeklyOverride = undefined, weekKey = null, projectHoursOverride = undefined, historicalMonthlyHours = undefined, applyScope = undefined, client = undefined, code = undefined, status = undefined, color = undefined) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, name, isBillable };
      if (client !== undefined) updated.client = client;
      if (code !== undefined) updated.code = code;
      if (status !== undefined) updated.status = status;
      if (color !== undefined) updated.color = color;
      
      // Update project-level weekly resourced hours if specified
      if (projectHoursOverride !== undefined) {
        updated.resourcedHours = projectHoursOverride;
      } else if (resourcedHours !== undefined && weeklyOverride === undefined && !applyScope) {
        // Fallback for older signatures (e.g. from ManageProjectsModal)
        updated.resourcedHours = resourcedHours;
      }

      if (monthlyResourcedHours !== undefined) {
        updated.monthlyResourcedHours = monthlyResourcedHours;
      }

      if (historicalMonthlyHours !== undefined) {
        updated.historicalMonthlyHours = historicalMonthlyHours;
      }

      const overrides = p.weeklyOverrides ? { ...p.weeklyOverrides } : {};

      if (applyScope) {
        if (applyScope === 'project') {
          updated.resourcedHours = resourcedHours;
        } else if (applyScope === 'week' && weekKey) {
          if (resourcedHours === null) delete overrides[weekKey];
          else overrides[weekKey] = Number(resourcedHours);

          // Update visibility: visible this week, hidden next week onwards
          const hiddenWeeks = p.hiddenWeeks || [];
          updated.hiddenWeeks = hiddenWeeks.filter(w => w !== weekKey);
          updated.hiddenOnwardsFrom = shiftWeek(weekKey, 1);
        } else if (applyScope === 'onwards' && weekKey) {
          const keys = new Set([...Object.keys(p.entries || {}), ...Object.keys(p.weeklyOverrides || {})]);
          for (const k of keys) {
            if (k < weekKey) {
              if (p.weeklyOverrides?.[k] === undefined && p.resourcedHours !== undefined && p.resourcedHours !== null) {
                overrides[k] = p.resourcedHours;
              }
            } else {
              delete overrides[k];
            }
          }
          updated.resourcedHours = resourcedHours;

          // Update visibility: visible this week onwards
          const hiddenWeeks = p.hiddenWeeks || [];
          updated.hiddenWeeks = hiddenWeeks.filter(w => w < weekKey);
          if (updated.hiddenOnwardsFrom && updated.hiddenOnwardsFrom >= weekKey) {
            updated.hiddenOnwardsFrom = null;
          }
        } else if (applyScope === 'next-onwards' && weekKey) {
          const nextWeek = shiftWeek(weekKey, 1);
          const keys = new Set([...Object.keys(p.entries || {}), ...Object.keys(p.weeklyOverrides || {})]);
          for (const k of keys) {
            if (k < nextWeek) {
              if (p.weeklyOverrides?.[k] === undefined && p.resourcedHours !== undefined && p.resourcedHours !== null) {
                overrides[k] = p.resourcedHours;
              }
            } else {
              delete overrides[k];
            }
          }
          updated.resourcedHours = resourcedHours;

          // Update visibility: hidden this week, visible next week onwards
          const hiddenWeeks = p.hiddenWeeks || [];
          if (!hiddenWeeks.includes(weekKey)) {
            updated.hiddenWeeks = [...hiddenWeeks.filter(w => w < weekKey), weekKey];
          } else {
            updated.hiddenWeeks = hiddenWeeks.filter(w => w <= weekKey);
          }
          if (updated.hiddenOnwardsFrom && updated.hiddenOnwardsFrom >= nextWeek) {
            updated.hiddenOnwardsFrom = null;
          }
        } else if (applyScope === 'retro' && weekKey) {
          const keys = new Set([...Object.keys(p.entries || {}), ...Object.keys(p.weeklyOverrides || {})]);
          for (const k of keys) {
            if (k < weekKey) {
              if (resourcedHours === null) delete overrides[k];
              else overrides[k] = Number(resourcedHours);
            }
          }
        }
      } else if (weeklyOverride !== undefined && weekKey) {
        if (weeklyOverride === null || weeklyOverride === '') {
          delete overrides[weekKey];
        } else {
          overrides[weekKey] = Number(weeklyOverride);
        }
      }
      
      updated.weeklyOverrides = overrides;

      return updated;
    }));
  }, []);

  const deleteProject = useCallback((id) => {
    setProjects(prev => prev.filter(p => p.id !== id));
  }, []);

  const hideProjectForWeek = useCallback((id, weekKey) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== id) return p;
      const hiddenWeeks = p.hiddenWeeks || [];
      if (!hiddenWeeks.includes(weekKey)) {
        return { ...p, hiddenWeeks: [...hiddenWeeks, weekKey] };
      }
      return p;
    }));
  }, []);

  const hideProjectOnwards = useCallback((id, weekKey) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== id) return p;
      return { ...p, hiddenOnwardsFrom: weekKey };
    }));
  }, []);

  const unhideProjectForWeek = useCallback((id, weekKey) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== id) return p;
      const hiddenWeeks = p.hiddenWeeks || [];
      const updatedHiddenWeeks = hiddenWeeks.filter(w => w !== weekKey);
      
      let nextHiddenOnwardsFrom = p.hiddenOnwardsFrom;
      if (p.hiddenOnwardsFrom && weekKey >= p.hiddenOnwardsFrom) {
        nextHiddenOnwardsFrom = null;
        let current = p.hiddenOnwardsFrom;
        while (current < weekKey) {
          if (!updatedHiddenWeeks.includes(current)) {
            updatedHiddenWeeks.push(current);
          }
          current = shiftWeek(current, 1);
        }
      }
      return {
        ...p,
        hiddenWeeks: updatedHiddenWeeks,
        hiddenOnwardsFrom: nextHiddenOnwardsFrom
      };
    }));
  }, []);

  const setEntry = useCallback((projectId, weekKey, dayIndex, value) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const entries = { ...p.entries };
      const week = { ...(entries[weekKey] || {}) };

      if (value === '' || value == null) {
        delete week[dayIndex];
      } else {
        week[dayIndex] = Number(value);
      }

      // Clean up empty weeks
      if (Object.keys(week).length === 0) {
        delete entries[weekKey];
      } else {
        entries[weekKey] = week;
      }

      return { ...p, entries };
    }));
  }, []);

  const importProjects = useCallback((parsedResult, selectedItems) => {
    setProjects(prev => {
      let next = [...prev];

      for (const item of selectedItems) {
        const existingIdx = next.findIndex(
          p => p.name.toLowerCase().trim() === item.name.toLowerCase().trim()
        );

        const hours = Number(item.resourcedHours ?? item.totalHours ?? 0);
        const safeHours = isNaN(hours) ? 0 : hours;

        if (item.status === 'new' && existingIdx === -1) {
          next.push({
            id: uuid(),
            name: item.name,
            resourcedHours: safeHours,
            isBillable: true,
            entries: {},
            createdAt: new Date().toISOString(),
          });
        } else if (item.status === 'update' && existingIdx >= 0) {
          next[existingIdx] = {
            ...next[existingIdx],
            resourcedHours: safeHours,
          };
        }
      }

      return next;
    });
  }, []);

  const moveProject = useCallback((draggedId, targetId, position = 'middle') => {
    setProjects(prev => {
      const draggedIndex = prev.findIndex(p => p.id === draggedId);
      const targetIndex = prev.findIndex(p => p.id === targetId);
      if (draggedIndex === -1 || targetIndex === -1) return prev;
      
      const next = [...prev];
      if (position === 'middle') {
        const temp = next[draggedIndex];
        next[draggedIndex] = next[targetIndex];
        next[targetIndex] = temp;
      } else {
        const [removed] = next.splice(draggedIndex, 1);
        const newTargetIndex = next.findIndex(p => p.id === targetId);
        const insertAt = position === 'bottom' ? newTargetIndex + 1 : newTargetIndex;
        next.splice(insertAt, 0, removed);
      }
      return next;
    });
  }, []);

  return {
    initialized, initFromBackup,
    projects, addProject, updateProject, deleteProject, moveProject, hideProjectForWeek, hideProjectOnwards, unhideProjectForWeek, setEntry, importProjects,
    visibleDays, setVisibleDays, toggleDay,
    leaveWeeks: settings.leaveWeeks || {}, toggleLeaveDay
  };
}
