import Commands from './components/Commands.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DAY_NAMES,
  DEFAULT_CAPACITY,
  DEFAULT_VISIBLE_DAYS,
  EPSILON,
  SCHEMA_VERSION,
  fmt,
  frontloadAmount,
  frontloadLimit,
  isVisible,
  migrateBackup,
  parseHours,
  shiftWeek,
  weekKeyFor,
  weekLabel,
} from './lib/utils.js';
import {
  FILE_CHANGED_CODE,
  backupPayload,
  chooseNewBackupHandle,
  downloadBackup,
  openBackup,
  readHandle,
  supportsFileSystemAccess,
  workspaceSignature,
  writeHandle,
} from './lib/backupService.js';
import { loadSessionFromIdb, saveSessionToIdb } from './lib/idb.js';
import ProjectModal from './components/ProjectModal.jsx';
import ImportModal from './components/ImportModal.jsx';
import ManageProjectsModal from './components/ManageProjectsModal.jsx';
import ConfirmDeleteModal from './components/ConfirmDeleteModal.jsx';
import {
  createProjectRecord,
  fillProjectResourcingRecord,
  hideProjectRecord,
  setFrontloadRecord,
  showProjectRecord,
  moveProjectRecord,
  setEntryRecord,
  setTaskEntryRecord,
  toggleLeaveRecord,
  editProjectRecord,
  pinTaskLineRecord,
  removeTaskLineRecord,
  restoreProjectRecord,
  validateManagedProject,
} from './lib/projectOperations.js';
import { downloadTimesheetCsv } from './lib/csvExport.js';
import {
  matchingProjects,
  timesheetTotals,
  developmentEntryUpdates,
} from './lib/timesheet.js';
import { importProjects } from './lib/projectImport.js';
import CapacityModal from './components/CapacityModal.jsx';
import ConfirmAction from './components/ConfirmAction.jsx';
import CounterRail from './components/CounterRail.jsx';
import Empty from './components/Empty.jsx';
import FilePanel from './components/FilePanel.jsx';
import FrontloadModal from './components/FrontloadModal.jsx';
import Insights from './components/Insights.jsx';
import MobileCards from './components/MobileCards.jsx';
import MobileDays from './components/MobileDays.jsx';
import Overview from './components/Overview.jsx';
import ProjectLineModal from './components/ProjectLineModal.jsx';
import Settings from './components/Settings.jsx';
import TimesheetTable from './components/TimesheetTable.jsx';

const empty = {
  schemaVersion: SCHEMA_VERSION,
  projects: [],
  settings: {
    visibleDays: DEFAULT_VISIBLE_DAYS,
    leaveWeeks: {},
    capacityByDay: DEFAULT_CAPACITY,
    theme: 'system',
  },
};

const icon = (d) => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d={d} />
  </svg>
);

function isoWeek(week) {
  const thursday = new Date(week + 'T00:00:00Z');
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
}

export default function App() {
  const [data, setData] = useState(empty),
    [ready, setReady] = useState(false),
    [week, setWeek] = useState(weekKeyFor(new Date())),
    [panel, setPanel] = useState(null),
    [edit, setEdit] = useState(null),
    [returnToManage, setReturnToManage] = useState(false),
    [removeTarget, setRemoveTarget] = useState(null),
    [confirm, setConfirm] = useState(null),
    [lineTarget, setLineTarget] = useState(null),
    [frontloadTarget, setFrontloadTarget] = useState(null),
    [capacityDetails, setCapacityDetails] = useState(false),
    [query, setQuery] = useState(''),
    [showSheetTools, setShowSheetTools] = useState(false),
    [filter, setFilter] = useState('all'),
    [category, setCategory] = useState('none'),
    [notice, setNotice] = useState(null),
    [file, setFile] = useState(null),
    [mobileView, setMobileView] = useState('projects');
  const [fileName, setFileName] = useState(null),
    [fileRevision, setFileRevision] = useState(null),
    [fileStatus, setFileStatus] = useState('local'),
    [lastSavedAt, setLastSavedAt] = useState(null),
    [savedFileSignature, setSavedFileSignature] = useState('');
  const autoSaveTimer = useRef(),
    saveInFlight = useRef(false),
    saveBlocked = useRef(false),
    latestSignature = useRef(workspaceSignature(empty));

  useEffect(() => {
    loadSessionFromIdb()
      .then((session) => {
        const restored = session?.data ? migrateBackup(session.data) : empty,
          signature = workspaceSignature(restored),
          handle = session?.fileHandle || null,
          saved = session?.savedSignature || (handle ? signature : '');
        setData(restored);
        latestSignature.current = signature;
        setSavedFileSignature(saved);
        setFile(handle);
        setFileName(handle?.name || null);
        setFileRevision(session?.fileRevision || null);
        setLastSavedAt(
          session?.fileRevision?.lastModified
            ? new Date(session.fileRevision.lastModified)
            : null,
        );
        setFileStatus(
          handle ? (saved === signature ? 'saved' : 'dirty') : 'local',
        );
        if (/^\d{4}-\d{2}-\d{2}$/.test(session?.weekKey || ''))
          setWeek(session.weekKey);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);
  const currentSignature = useMemo(() => workspaceSignature(data), [data]);
  useEffect(() => {
    latestSignature.current = currentSignature;
  }, [currentSignature]);
  const dirty = Boolean(file && currentSignature !== savedFileSignature),
    hasLocalOnlyWork = !file && data.projects.length > 0,
    needsDiscardProtection = dirty || hasLocalOnlyWork;

  const days = data.settings.visibleDays || DEFAULT_VISIBLE_DAYS;
  const leave = useMemo(
    () => data.settings.leaveWeeks?.[week] || [],
    [data.settings.leaveWeeks, week],
  );
  const visible = useMemo(
    () => data.projects.filter((p) => isVisible(p, week)),
    [data.projects, week],
  );
  const matching = useMemo(
    () =>
      matchingProjects(visible, query, filter, week, data.settings.leaveWeeks),
    [visible, query, filter, week, data.settings.leaveWeeks],
  );
  const totals = useMemo(
    () => timesheetTotals(visible, week, data.settings, leave),
    [visible, week, data.settings, leave],
  );

  const setEntry = (projectId, targetWeek, day, value) => {
    const wk = typeof targetWeek === 'string' ? targetWeek : week,
      idx = typeof targetWeek === 'string' ? day : targetWeek,
      raw = typeof targetWeek === 'string' ? value : day;
    const parsed = typeof raw === 'number' ? { value: raw } : parseHours(raw);
    if (parsed.error) {
      setNotice({ type: 'error', text: parsed.error });
      return;
    }
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => {
        if (p.id !== projectId) return p;
        return setEntryRecord(p, wk, idx, parsed.value);
      }),
    }));
  };
  const setTaskEntry = (projectId, taskId, targetWeek, day, value) => {
    const parsed = typeof value === 'number' ? { value } : parseHours(value);
    if (parsed.error) {
      setNotice({ type: 'error', text: parsed.error });
      return;
    }
    setData((d) => ({
      ...d,
      projects: d.projects.map((project) => {
        if (project.id !== projectId) return project;
        return setTaskEntryRecord(
          project,
          taskId,
          targetWeek,
          day,
          parsed.value,
        );
      }),
    }));
  };
  const pinTaskLine = (projectId, taskId, targetWeek = week) =>
    setData((d) => ({
      ...d,
      projects: d.projects.map((project) =>
        project.id === projectId
          ? pinTaskLineRecord(project, taskId, targetWeek)
          : project,
      ),
    }));
  const removeTaskLine = (projectId, taskId) => {
    const project = data.projects.find((item) => item.id === projectId),
      task = project?.tasks?.find((item) => item.id === taskId),
      hasTime = Object.values(
        project?.taskEntries?.[taskId]?.[week] || {},
      ).some((value) => Number(value) > 0),
      action = () =>
        setData((d) => ({
          ...d,
          projects: d.projects.map((item) =>
            item.id === projectId
              ? removeTaskLineRecord(item, taskId, week)
              : item,
          ),
        }));
    if (hasTime)
      setConfirm({
        title: 'Remove timesheet line?',
        text: `${task?.name || 'This task'} has logged time this week. Removing the line will also remove those hours.`,
        confirmLabel: 'Remove line and time',
        danger: true,
        action,
      });
    else action();
  };
  const applyLeave = (day) => setData((d) => toggleLeaveRecord(d, week, day));
  const toggleLeave = (day) => {
    const hasTime = visible.some(
        (p) =>
          Number(p.entries?.[week]?.[day] || 0) > 0 ||
          Object.values(p.taskEntries || {}).some(
            (entries) => Number(entries?.[week]?.[day] || 0) > 0,
          ),
      ),
      isLeave = leave.includes(day);
    setConfirm(
      isLeave
        ? {
            title: `Remove ${DAY_NAMES[day]} leave?`,
            text: 'This will return the day to the working-week totals. Logged time is unchanged.',
            confirmLabel: 'Remove leave',
            action: () => applyLeave(day),
          }
        : {
            title: `Mark ${DAY_NAMES[day]} as leave?`,
            text: hasTime
              ? 'This day already contains time. The entries will be kept for your records but excluded from working totals while the day is marked as leave.'
              : 'This day will be excluded from working capacity and timesheet totals.',
            confirmLabel: hasTime
              ? 'Keep time and mark leave'
              : 'Mark as leave',
            action: () => applyLeave(day),
          },
    );
  };
  const move = (id, direction) =>
    setData((d) => moveProjectRecord(d, id, direction));
  const showProjectForWeek = (id, targetWeek) =>
    setData((d) => ({
      ...d,
      projects: d.projects.map((project) =>
        project.id !== id ? project : showProjectRecord(project, targetWeek),
      ),
    }));
  const saveFrontload = (projectId, targetWeek, amount) => {
    const project = data.projects.find((item) => item.id === projectId),
      existing = frontloadAmount(project || {}, targetWeek),
      limit = frontloadLimit(project || {}, targetWeek),
      rounded = Math.round(Number(amount) * 100) / 100,
      maximum = Math.max(existing, limit ?? 0);
    if (
      !project ||
      !Number.isFinite(rounded) ||
      rounded < 0 ||
      rounded > maximum + EPSILON
    ) {
      setNotice({
        type: 'error',
        text: `Frontloading must be between 0 and ${fmt(maximum)} hours.`,
      });
      return false;
    }
    setData((current) => ({
      ...current,
      projects: current.projects.map((item) => {
        if (item.id !== projectId) return item;
        return setFrontloadRecord(item, targetWeek, rounded);
      }),
    }));
    return true;
  };

  const saveProject = (
    name,
    hours,
    isBillable,
    scope = 'project',
    monthly = null,
    historical = 0,
    client = '',
    code = '',
    status = 'active',
    color = '#7aa600',
    selectedExistingId = null,
    tasks = null,
    projectType = 'standard',
    durationWeeks = 0,
    durationDays = 0,
    remainderLimit = null,
  ) => {
    const fields = {
      name,
      hours,
      isBillable,
      monthly,
      historical,
      client,
      code,
      status,
      color,
      tasks,
      projectType,
      durationWeeks,
      durationDays,
      remainderLimit,
    };
    const normal = name.trim().toLowerCase(),
      duplicate = data.projects.find(
        (p) =>
          p.id !== edit?.id &&
          p.id !== selectedExistingId &&
          p.name.trim().toLowerCase() === normal,
      );
    if (duplicate) {
      setNotice({
        type: 'error',
        text: `“${duplicate.name}” already exists. Restore or edit it from Projects.`,
      });
      return false;
    }
    setData((d) => {
      if (!edit && selectedExistingId)
        return {
          ...d,
          projects: d.projects.map((p) =>
            p.id === selectedExistingId
              ? restoreProjectRecord(p, fields, scope, week)
              : p,
          ),
        };
      if (!edit)
        return {
          ...d,
          projects: [...d.projects, createProjectRecord(fields, scope, week)],
        };
      return {
        ...d,
        projects: d.projects.map((p) =>
          p.id === edit.id ? editProjectRecord(p, fields, scope, week) : p,
        ),
      };
    });
    setEdit(null);
    setPanel(returnToManage ? 'manage' : null);
    setReturnToManage(false);
    return true;
  };
  const manageUpdate = (id, name, hours) => {
    const result = validateManagedProject(data.projects, id, name, hours);
    if (result.error) {
      setNotice({ type: 'error', text: result.error });
      return false;
    }
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === id
          ? { ...p, name: result.name, resourcedHours: result.hours }
          : p,
      ),
    }));
    return true;
  };
  const deletePermanent = (id) => {
    const project = data.projects.find((item) => item.id === id);
    if (!project) return;
    setConfirm({
      title: 'Delete project permanently?',
      text: `“${project.name}” and all of its logged history will be removed. This cannot be undone.`,
      confirmLabel: 'Delete project',
      danger: true,
      action: () =>
        setData((d) => ({
          ...d,
          projects: d.projects.filter((item) => item.id !== id),
        })),
    });
  };
  const hide = (id, from, only = false) =>
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === id ? hideProjectRecord(p, from, only) : p,
      ),
    }));
  const importData = (result, items) => {
    setData((d) => importProjects(d, result, items, week));
    if (result.weekKey) setWeek(result.weekKey);
    setNotice({
      type: 'success',
      text: `Imported ${items.length} project${items.length === 1 ? '' : 's'} into ${result.weekKey || 'the workspace'}.`,
    });
  };
  const fillDevelopment = () => {
    const pd = data.projects.find(
      (p) => p.name.trim().toLowerCase() === 'professional development',
    );
    if (!pd) {
      setNotice({
        type: 'error',
        text: 'Create a project named Professional Development before using Fill remaining.',
      });
      return;
    }
    const remaining = Math.max(0, totals.remaining);
    if (!remaining) return;
    const updates = developmentEntryUpdates(
      pd,
      week,
      days,
      leave,
      visible,
      data.settings,
      remaining,
    );
    Object.entries(updates).forEach(([day, val]) =>
      setEntry(pd.id, week, Number(day), Math.round(val * 100) / 100),
    );
    setNotice({
      type: 'success',
      text: 'Filled available working capacity with Professional Development.',
    });
  };
  const fillCapacityWithDevelopment = () => {
    const pd = data.projects.find(
        (p) => p.name.trim().toLowerCase() === 'professional development',
      ),
      amount = totals.resourcingCapacity;
    if (!pd) {
      setNotice({
        type: 'error',
        text: 'Create a project named Professional Development before filling capacity.',
      });
      return false;
    }
    if (amount <= EPSILON) return false;
    setData((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id !== pd.id
          ? project
          : fillProjectResourcingRecord(project, week, amount),
      ),
    }));
    setNotice({
      type: 'success',
      text: `Allocated ${fmt(amount)}h of capacity to Professional Development.`,
    });
    return true;
  };
  const addSample = () => {
    const sample = [
      {
        name: 'Contoso M365 Adoption',
        hours: 15,
        isBillable: true,
        monthly: null,
        historical: 0,
        client: 'Contoso Pty Ltd',
        code: 'PRJ-1042',
        status: 'active',
        color: '#0f9e8e',
      },
      {
        name: 'Northwind Teams Governance',
        hours: 8,
        isBillable: true,
        monthly: null,
        historical: 0,
        client: 'Northwind',
        code: 'PRJ-1088',
        status: 'active',
        color: '#8b5cf6',
      },
    ];
    setData((d) => ({
      ...d,
      projects: [
        ...d.projects,
        ...sample.map((fields) => createProjectRecord(fields, 'onwards', week)),
      ],
    }));
    setNotice({
      type: 'success',
      text: 'Added two sample projects. Edit or remove them whenever you are ready.',
    });
  };
  const attachLoadedFile = useCallback((result) => {
    const signature = workspaceSignature(result.data);
    setSavedFileSignature(signature);
    latestSignature.current = signature;
    saveBlocked.current = false;
    setData(result.data);
    setFile(result.handle);
    setFileName(result.name);
    setFileRevision(result.revision);
    setLastSavedAt(
      result.revision?.lastModified
        ? new Date(result.revision.lastModified)
        : new Date(),
    );
    setFileStatus(result.handle ? 'saved' : 'local');
  }, []);
  const doOpenFile = async () => {
    try {
      const result = await openBackup();
      attachLoadedFile(result);
      setNotice({
        type: 'success',
        text: result.handle
          ? `Opened ${result.name}. Edits will save back to this file.`
          : `Imported ${result.name}. Direct saving requires Chrome or Edge.`,
      });
    } catch (error) {
      if (error?.name !== 'AbortError')
        setNotice({
          type: 'error',
          text: error?.message || 'That TimeMaster file could not be opened.',
        });
    }
  };
  const openFile = () => {
    if (needsDiscardProtection) {
      setConfirm({
        title: 'Open another file?',
        text: 'This will replace the workspace currently shown. Save now or export a backup copy first if you need to keep these changes.',
        confirmLabel: 'Replace workspace',
        danger: true,
        action: doOpenFile,
      });
      return;
    }
    doOpenFile();
  };
  const saveAs = async () => {
    if (!supportsFileSystemAccess()) {
      downloadBackup(
        backupPayload(data.projects, data.settings),
        'TimeMaster.json',
      );
      setNotice({
        type: 'success',
        text: 'Downloaded TimeMaster.json. Direct saving requires a recent Chrome or Edge browser on HTTPS.',
      });
      return;
    }
    try {
      const handle = await chooseNewBackupHandle(),
        payload = backupPayload(data.projects, data.settings),
        signature = workspaceSignature(payload),
        revision = await writeHandle(handle, payload);
      setSavedFileSignature(signature);
      saveBlocked.current = false;
      setFile(handle);
      setFileName(handle.name);
      setFileRevision(revision);
      setLastSavedAt(new Date(revision.lastModified));
      setFileStatus('saved');
      setNotice({
        type: 'success',
        text: `Created and attached ${handle.name}.`,
      });
    } catch (error) {
      if (error?.name !== 'AbortError')
        setNotice({
          type: 'error',
          text: error?.message || 'The TimeMaster file could not be created.',
        });
    }
  };
  const saveAttachedFile = useCallback(
    async ({ notify = false } = {}) => {
      if (!file) {
        if (notify) setPanel('file');
        return false;
      }
      if (saveInFlight.current) return false;
      saveInFlight.current = true;
      setFileStatus('saving');
      const payload = backupPayload(data.projects, data.settings),
        signature = workspaceSignature(payload);
      try {
        const revision = await writeHandle(file, payload, fileRevision);
        setSavedFileSignature(signature);
        saveBlocked.current = false;
        setFileRevision(revision);
        setLastSavedAt(new Date(revision.lastModified));
        setFileStatus(
          latestSignature.current === signature ? 'saved' : 'dirty',
        );
        if (notify) setNotice({ type: 'success', text: `Saved ${file.name}.` });
        return true;
      } catch (error) {
        if (error?.code === FILE_CHANGED_CODE) {
          saveBlocked.current = true;
          setFileStatus('conflict');
          setNotice({ type: 'error', text: error.message });
        } else {
          setFileStatus('error');
          setNotice({
            type: 'error',
            text:
              error?.message ||
              'The workspace could not be saved. Export a backup copy from File.',
          });
        }
        return false;
      } finally {
        saveInFlight.current = false;
      }
    },
    [data, file, fileRevision],
  );
  const doRefreshFile = async () => {
    if (!file) return;
    try {
      const result = await readHandle(file);
      attachLoadedFile(result);
      setNotice({ type: 'success', text: `Refreshed from ${result.name}.` });
    } catch (error) {
      setNotice({
        type: 'error',
        text: error?.message || 'The attached file could not be refreshed.',
      });
    }
  };
  const refreshFile = () => {
    if (!file) return;
    if (dirty) {
      setConfirm({
        title: 'Replace unsaved changes?',
        text: `Refreshing from ${file.name} will discard the unsaved changes in this tab.`,
        confirmLabel: 'Refresh and discard',
        danger: true,
        action: doRefreshFile,
      });
      return;
    }
    doRefreshFile();
  };

  useEffect(() => {
    if (!ready) return;
    const payload = backupPayload(data.projects, data.settings),
      signature = workspaceSignature(payload);
    saveSessionToIdb(
      file,
      week,
      payload,
      fileRevision,
      savedFileSignature,
    ).catch(() =>
      setNotice({
        type: 'error',
        text: 'The browser copy could not be saved. Export a backup copy from File.',
      }),
    );
    clearTimeout(autoSaveTimer.current);
    if (file && signature !== savedFileSignature && !saveBlocked.current) {
      setFileStatus((current) => (current === 'saving' ? current : 'dirty'));
      autoSaveTimer.current = setTimeout(() => saveAttachedFile(), 800);
    }
    return () => {
      clearTimeout(autoSaveTimer.current);
    };
  }, [
    data,
    file,
    fileRevision,
    ready,
    saveAttachedFile,
    savedFileSignature,
    week,
  ]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const saveStatusText =
    fileStatus === 'saving'
      ? 'Saving…'
      : fileStatus === 'dirty'
        ? 'Unsaved changes'
        : fileStatus === 'conflict'
          ? 'Save blocked · file changed'
          : fileStatus === 'error'
            ? 'Save needs attention'
            : fileStatus === 'saved' && lastSavedAt
              ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : file
                ? 'Attached'
                : fileName
                  ? 'Imported copy · browser only'
                  : 'Stored in this browser';

  if (!ready) return <div className="loading">Opening workspace…</div>;
  return (
    <div className="app" data-theme={data.settings.theme}>
      <header className="topbar">
        <a className="brand" href="#workspace">
          Time<span>Master</span>
        </a>
        <button
          className={`file-status file-status-${fileStatus}`}
          onClick={() => setPanel('file')}
          title="Open file controls"
        >
          <strong>{fileName || 'No JSON attached'}</strong>
          <span>{saveStatusText}</span>
        </button>
        <nav className="top-actions">
          <Commands
            actions={[
              ['File', () => setPanel('file')],
              ['Import', () => setPanel('import')],
              ['Projects', () => setPanel('manage')],
              ['Settings', () => setPanel('settings')],
              [
                'New project',
                () => {
                  setEdit(null);
                  setPanel('project');
                },
              ],
              ['Capacity breakdown', () => setCapacityDetails(true)],
              ['Add line', () => setLineTarget(true)],
              ['Previous week', () => setWeek(shiftWeek(week, -1))],
              ['Next week', () => setWeek(shiftWeek(week, 1))],
              ['Today', () => setWeek(weekKeyFor(new Date()))],
            ]}
          />
          <button onClick={() => setPanel('file')}>File</button>
          <button onClick={() => setPanel('import')}>Import</button>
          <button onClick={() => setPanel('manage')}>Projects</button>
          <button onClick={() => setPanel('settings')}>Settings</button>
          <button
            className="primary"
            onClick={() => {
              setEdit(null);
              setPanel('project');
            }}
          >
            New project
          </button>
        </nav>
      </header>
      <main id="workspace">
        <section className="week-head">
          <div>
            <span className="week-stamp">
              Wk <b>{isoWeek(week)}</b>
            </span>
            <h1>{weekLabel(week, days)}</h1>
          </div>
          <div className="week-nav">
            <button
              onClick={() => setWeek(shiftWeek(week, -1))}
              aria-label="Previous week"
            >
              {icon('M15 18l-6-6 6-6')}
            </button>
            <button onClick={() => setWeek(weekKeyFor(new Date()))}>
              Today
            </button>
            <button
              onClick={() => setWeek(shiftWeek(week, 1))}
              aria-label="Next week"
            >
              {icon('M9 18l6-6-6-6')}
            </button>
          </div>
        </section>
        <section
          className={`workspace ${mobileView === 'days' ? 'day-mode' : ''}`}
        >
          <div className="week-readouts">
            <Overview totals={totals} week={week} settings={data.settings} />
            <CounterRail
              totals={totals}
              projects={visible}
              onFill={fillDevelopment}
              onCapacity={() => setCapacityDetails(true)}
            />
          </div>
          <div className="sheet">
            <div className="mobile-switch">
              <button
                className={mobileView === 'projects' ? 'selected' : ''}
                onClick={() => setMobileView('projects')}
              >
                By project
              </button>
              <button
                className={mobileView === 'days' ? 'selected' : ''}
                onClick={() => setMobileView('days')}
              >
                By day
              </button>
            </div>

            <div
              className={`sheet-toolbar ${showSheetTools ? 'tools-open' : ''}`}
            >
              <div>
                <h2>Timesheet</h2>
                <span>
                  {matching.length} of {visible.length} projects
                </span>
              </div>
              <button
                className="sheet-tools-toggle"
                aria-expanded={showSheetTools}
                onClick={() => setShowSheetTools(!showSheetTools)}
              >
                Filters
                {(query || filter !== 'all' || category !== 'none') && ' •'}
              </button>
              <label className="search">
                <span className="sr-only">Search projects</span>
                {icon(
                  'M21 21l-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0z',
                )}
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a project"
                />
              </label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Filter projects"
              >
                <option value="all">All projects</option>
                <option value="logged">Logged</option>
                <option value="unlogged">Not logged</option>
                <option value="under">Allowance left</option>
                <option value="at">At allocation</option>
                <option value="over">Over allocation</option>
                <option value="unlimited">Unlimited</option>
                <option value="billable">Billable</option>
                <option value="nonbillable">Non-billable</option>
              </select>
              <label className="timesheet-grouping">
                Group
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  aria-label="Categorise timesheet"
                >
                  <option value="none">No grouping</option>
                  <option value="status">Status</option>
                  <option value="client">Client</option>
                  <option value="billability">Billable / non-billable</option>
                  <option value="usage">Usage</option>
                </select>
              </label>
              {(query || filter !== 'all') && (
                <button
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => {
                  downloadTimesheetCsv(data.projects);
                  setNotice({
                    type: 'success',
                    text: 'Exported the complete timesheet as CSV.',
                  });
                }}
              >
                Export CSV
              </button>
              <button className="primary" onClick={() => setLineTarget(true)}>
                Add line
              </button>
            </div>
            {visible.length === 0 ? (
              <Empty
                projects={data.projects}
                onNew={() => setPanel('project')}
                onManage={() => setPanel('manage')}
                onSample={addSample}
              />
            ) : (
              <>
                <TimesheetTable
                  projects={matching}
                  allProjects={visible}
                  category={category}
                  week={week}
                  days={days}
                  leave={leave}
                  leaveWeeks={data.settings.leaveWeeks}
                  totals={totals}
                  onEntry={setEntry}
                  onTaskEntry={setTaskEntry}
                  onAddLine={(project) => setLineTarget(project.id)}
                  onRemoveTaskLine={removeTaskLine}
                  onLeave={toggleLeave}
                  onEdit={(p) => {
                    setEdit(p);
                    setPanel('project');
                  }}
                  onFrontload={(project) =>
                    setFrontloadTarget({ id: project.id })
                  }
                  onSuggestFrontload={(project, prompt) =>
                    setFrontloadTarget({
                      id: project.id,
                      prompt: true,
                      amount: prompt.amount,
                      adjustment: prompt.adjustment,
                    })
                  }
                  onRemove={setRemoveTarget}
                  onMove={move}
                />
                {mobileView === 'projects' ? (
                  <MobileCards
                    projects={matching}
                    category={category}
                    week={week}
                    days={days}
                    leave={leave}
                    leaveWeeks={data.settings.leaveWeeks}
                    onEntry={setEntry}
                    onTaskEntry={setTaskEntry}
                    onAddLine={(project) => setLineTarget(project.id)}
                    onRemoveTaskLine={removeTaskLine}
                    onEdit={(p) => {
                      setEdit(p);
                      setPanel('project');
                    }}
                    onFrontload={(project) =>
                      setFrontloadTarget({ id: project.id })
                    }
                  />
                ) : (
                  <MobileDays
                    projects={matching}
                    week={week}
                    days={days}
                    leave={leave}
                    onEntry={setEntry}
                    onTaskEntry={setTaskEntry}
                  />
                )}{' '}
                {matching.length === 0 && (
                  <div className="no-results">
                    <h3>No projects match</h3>
                    <p>
                      Clear the current search or filter to see the whole week.
                    </p>
                    <button
                      onClick={() => {
                        setQuery('');
                        setFilter('all');
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <Insights
            projects={visible}
            week={week}
            leaveWeeks={data.settings.leaveWeeks}
          />
        </section>
      </main>
      {notice && (
        <div className={`toast ${notice.type}`} role="status">
          <span>
            {String(
              notice.text ||
                'Something went wrong. Open File to export a backup.',
            )}
          </span>
          <button
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
      <ProjectModal
        isOpen={panel === 'project'}
        onClose={() => {
          setPanel(returnToManage ? 'manage' : null);
          setEdit(null);
          setReturnToManage(false);
        }}
        onSave={saveProject}
        initial={edit}
        projects={data.projects}
        visibleProjects={visible}
        weekKey={week}
      />
      <ImportModal
        isOpen={panel === 'import'}
        onClose={() => setPanel(null)}
        existingProjects={data.projects}
        onImport={importData}
      />
      <ManageProjectsModal
        isOpen={panel === 'manage'}
        onClose={() => setPanel(null)}
        projects={data.projects}
        updateProject={manageUpdate}
        deleteProject={(id) => {
          setPanel(null);
          deletePermanent(id);
        }}
        onImport={() => setPanel('import')}
        onSample={addSample}
        onAdd={() => {
          setEdit(null);
          setReturnToManage(true);
          setPanel('project');
        }}
        onEdit={(project) => {
          setEdit(project);
          setReturnToManage(true);
          setPanel('project');
        }}
      />
      <ConfirmDeleteModal
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        project={removeTarget}
        onDeleteThisWeek={() => hide(removeTarget.id, week, true)}
        onDeleteThisWeekOnwards={() => hide(removeTarget.id, week)}
        onDeleteNextWeekOnwards={() =>
          hide(removeTarget.id, shiftWeek(week, 1))
        }
        onDeleteAllWeeks={() => deletePermanent(removeTarget.id)}
      />
      {panel === 'settings' && (
        <Settings
          settings={data.settings}
          onClose={() => setPanel(null)}
          onSave={(settings) => {
            setData((d) => ({ ...d, settings }));
            setPanel(null);
          }}
        />
      )}
      {confirm && (
        <ConfirmAction
          confirmation={confirm}
          onClose={() => setConfirm(null)}
        />
      )}
      {capacityDetails && (
        <CapacityModal
          projects={visible}
          week={week}
          leaveWeeks={data.settings.leaveWeeks}
          totals={totals}
          onClose={() => setCapacityDetails(false)}
          onFillCapacity={fillCapacityWithDevelopment}
        />
      )}
      {frontloadTarget &&
        data.projects.find((project) => project.id === frontloadTarget.id) && (
          <FrontloadModal
            project={data.projects.find(
              (project) => project.id === frontloadTarget.id,
            )}
            week={week}
            leaveWeeks={data.settings.leaveWeeks}
            title={
              frontloadTarget.adjustment
                ? 'Adjust frontloaded hours?'
                : frontloadTarget.prompt
                  ? 'Frontload additional hours?'
                  : 'Frontload hours'
            }
            initialAmount={frontloadTarget.amount}
            preferInitial={frontloadTarget.adjustment}
            onClose={() => setFrontloadTarget(null)}
            onSave={(amount) => saveFrontload(frontloadTarget.id, week, amount)}
          />
        )}
      {lineTarget && (
        <ProjectLineModal
          projects={data.projects.map((project) => ({
            ...project,
            __visibleNow: visible.some((item) => item.id === project.id),
          }))}
          week={week}
          initialProjectId={lineTarget === true ? null : lineTarget}
          onClose={() => setLineTarget(null)}
          onAddTask={(id, task, targetWeek) => {
            showProjectForWeek(id, targetWeek);
            pinTaskLine(id, task, targetWeek);
          }}
          onAddProject={showProjectForWeek}
          onManage={() => {
            setLineTarget(null);
            setPanel('manage');
          }}
        />
      )}
      {panel === 'file' && (
        <FilePanel
          attached={!!file}
          fileName={fileName}
          status={saveStatusText}
          dirty={dirty}
          supported={supportsFileSystemAccess()}
          onClose={() => setPanel(null)}
          onOpen={openFile}
          onCreate={saveAs}
          onSaveNow={() => saveAttachedFile({ notify: true })}
          onRefresh={refreshFile}
          onExport={() => {
            downloadBackup(backupPayload(data.projects, data.settings));
            setNotice({ type: 'success', text: 'Exported a backup copy.' });
          }}
          onExportCsv={() => {
            downloadTimesheetCsv(data.projects);
            setNotice({
              type: 'success',
              text: 'Exported the complete timesheet as CSV.',
            });
          }}
          onManage={() => setPanel('manage')}
        />
      )}
    </div>
  );
}
