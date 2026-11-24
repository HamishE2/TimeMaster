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
  FILE_PERMISSION_CODE,
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
  placeProjectRecord,
  placeTaskRecord,
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
import useHistory from './lib/useHistory.js';
import EntryNoteModal from './components/EntryNoteModal.jsx';
import Financials from './components/Financials.jsx';
import ActivityPicker from './components/ActivityPicker.jsx';
import { setActivityTagRecord } from './lib/entryNotes.js';
import {
  applyProjectFinance,
  hourlyRateOf,
  hoursPerDay,
  BUDGET_FOCUS,
} from './lib/budget.js';
import { entryNote, setEntryNoteRecord } from './lib/entryNotes.js';

const empty = {
  schemaVersion: SCHEMA_VERSION,
  projects: [],
  settings: {
    visibleDays: DEFAULT_VISIBLE_DAYS,
    leaveWeeks: {},
    capacityByDay: DEFAULT_CAPACITY,
    theme: 'light',
  },
};

const icon = (d) => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d={d} />
  </svg>
);

export default function App() {
  const {
    data,
    setData,
    resetData,
    undo,
    redo,
    checkpoint,
    canUndo,
    canRedo,
  } = useHistory(empty);
  const [ready, setReady] = useState(false),
    [week, setWeek] = useState(weekKeyFor(new Date())),
    [panel, setPanel] = useState(null),
    [edit, setEdit] = useState(null),
    [focusPhase, setFocusPhase] = useState(null),
    [returnToManage, setReturnToManage] = useState(false),
    [removeTarget, setRemoveTarget] = useState(null),
    [confirm, setConfirm] = useState(null),
    [noteTarget, setNoteTarget] = useState(null),
    [lineTarget, setLineTarget] = useState(null),
    [frontloadTarget, setFrontloadTarget] = useState(null),
    [capacityDetails, setCapacityDetails] = useState(false),
    [query, setQuery] = useState(''),
    [showSheetTools, setShowSheetTools] = useState(false),
    [filter, setFilter] = useState('all'),
    [category, setCategory] = useState(() => {
      try {
        return localStorage.getItem('timemaster.grouping') || 'none';
      } catch {
        return 'none';
      }
    }),
    [notice, setNotice] = useState(null),
    [file, setFile] = useState(null),
    [mobileView, setMobileView] = useState('projects'),
    // Timesheet (time) or Financials (money); a view preference per browser.
    [view, setView] = useState(() => {
      try {
        return localStorage.getItem('timemaster.view') === 'financials'
          ? 'financials'
          : 'timesheet';
      } catch {
        return 'timesheet';
      }
    }),
    [settingsFocus, setSettingsFocus] = useState(null);
  const [fileName, setFileName] = useState(null),
    [fileRevision, setFileRevision] = useState(null),
    [fileStatus, setFileStatus] = useState('local'),
    [lastSavedAt, setLastSavedAt] = useState(null),
    [savedFileSignature, setSavedFileSignature] = useState('');
  // Ctrl/Cmd Z undoes, Ctrl Shift Z or Ctrl Y redoes. Text fields keep their
  // own native undo so typing corrections are not hijacked.
  useEffect(() => {
    const onKey = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target;
      if (target.closest?.('input, textarea, select, [contenteditable="true"]'))
        return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
  // Remember the timesheet grouping between visits (a view preference, so it
  // lives in this browser rather than the workspace file).
  useEffect(() => {
    try {
      localStorage.setItem('timemaster.grouping', category);
    } catch {
      /* storage unavailable: grouping just resets next visit */
    }
  }, [category]);
  useEffect(() => {
    try {
      localStorage.setItem('timemaster.view', view);
    } catch {
      /* storage unavailable: the view resets next visit */
    }
  }, [view]);
  const autoSaveTimer = useRef(),
    saveInFlight = useRef(false),
    saveBlocked = useRef(false),
    // A save requested while another was writing; retried when that ends.
    saveQueued = useRef(false),
    // Bumped whenever a different file is attached, so a save still writing
    // to the previous file cannot overwrite the new file's saved state.
    fileGeneration = useRef(0),
    // Signatures this tab tried to write since (and including) the last
    // confirmed save. A
    // write that timed out may still land; its content is ours, not a
    // change made elsewhere.
    attemptedSignatures = useRef([]),
    sessionUnreadable = useRef(false),
    latestSignature = useRef(workspaceSignature(empty));
  const [saveRetry, setSaveRetry] = useState(0);

  useEffect(() => {
    loadSessionFromIdb()
      .then((session) => {
        const restored = session?.data ? migrateBackup(session.data) : empty,
          signature = workspaceSignature(restored),
          handle = session?.fileHandle || null,
          // Migration can fill defaults the stored copy lacks (archived:
          // false, sorted days), so a copy that matched the file still counts
          // as saved, and the file's own content stays recognised as ours.
          matchedFile =
            !!session?.savedSignature &&
            session.savedSignature === workspaceSignature(session.data),
          saved = matchedFile
            ? signature
            : session?.savedSignature || (handle ? signature : '');
        if (matchedFile) attemptedSignatures.current = [session.savedSignature];
        resetData(restored);
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
      .catch(() => {
        // Keep whatever is stored: writing the blank workspace back would
        // replace the browser copy before anyone could recover it.
        sessionUnreadable.current = true;
        setNotice({
          type: 'error',
          text: 'The workspace saved in this browser could not be opened, so it is being kept as it is. Open your TimeMaster file from File, or import a backup copy. Until then, changes here are not saved in this browser.',
        });
        setReady(true);
      });
  }, [resetData]);
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

  const closeNote = useCallback(() => setNoteTarget(null), []);
  const noteProject =
    noteTarget &&
    data.projects.find((project) => project.id === noteTarget.projectId);
  const setEntry = (projectId, targetWeek, day, value) => {
    const wk = typeof targetWeek === 'string' ? targetWeek : week,
      idx = typeof targetWeek === 'string' ? day : targetWeek,
      raw = typeof targetWeek === 'string' ? value : day;
    const parsed = typeof raw === 'number' ? { value: raw } : parseHours(raw);
    if (parsed.error) {
      setNotice({ type: 'error', text: parsed.error });
      return;
    }
    const previous = data.projects.find((p) => p.id === projectId)?.entries?.[
      wk
    ]?.[idx];
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => {
        if (p.id !== projectId) return p;
        return setEntryRecord(p, wk, idx, parsed.value);
      }),
    }));
    if (
      typeof raw !== 'number' &&
      parsed.value != null &&
      parsed.value !== previous
    )
      setNoteTarget({ projectId, taskId: null, week: wk, day: idx });
  };
  const saveEntryNote = ({ projectId, taskId, week: wk, day }, text) =>
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === projectId ? setEntryNoteRecord(p, taskId, wk, day, text) : p,
      ),
    }));
  // An explicit "which activity is this?" choice; null returns to matching.
  const tagEntryActivity = ({ projectId, taskId, week: wk, day }, activityId) =>
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === projectId
          ? setActivityTagRecord(p, taskId, wk, day, activityId)
          : p,
      ),
    }));
  const openSettings = (focus = null) => {
    setSettingsFocus(focus);
    setPanel('settings');
  };
  const setTaskEntry = (projectId, taskId, targetWeek, day, value) => {
    const parsed = typeof value === 'number' ? { value } : parseHours(value);
    if (parsed.error) {
      setNotice({ type: 'error', text: parsed.error });
      return;
    }
    const previous = data.projects.find((p) => p.id === projectId)
      ?.taskEntries?.[taskId]?.[targetWeek]?.[day];
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
    if (
      typeof value !== 'number' &&
      parsed.value != null &&
      parsed.value !== previous
    )
      setNoteTarget({ projectId, taskId, week: targetWeek, day });
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
  const place = (id, targetId, after) =>
    setData((d) => placeProjectRecord(d, id, targetId, after));
  const placeTask = (projectId, taskId, targetId, after) =>
    setData((d) => placeTaskRecord(d, projectId, taskId, targetId, after));
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
    finance = null,
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
              ? applyProjectFinance(
                  restoreProjectRecord(p, fields, scope, week),
                  finance,
                )
              : p,
          ),
        };
      if (!edit)
        return {
          ...d,
          projects: [
            ...d.projects,
            applyProjectFinance(
              createProjectRecord(fields, scope, week),
              finance,
            ),
          ],
        };
      return {
        ...d,
        projects: d.projects.map((p) =>
          p.id === edit.id
            ? applyProjectFinance(
                editProjectRecord(p, fields, scope, week),
                finance,
              )
            : p,
        ),
      };
    });
    setFocusPhase(null);
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
    const specs = [
      {
        name: 'Contoso M365 Adoption',
        client: 'Contoso',
        code: 'PRJ-1042',
        color: '#078579',
        hours: 12,
        entries: { 0: 2, 3: 1 },
        tasks: [
          { id: 'general', name: 'General' },
          { id: 'training', name: 'Training' },
          { id: 'champions', name: 'Champions network' },
          { id: 'comms', name: 'Comms and launch' },
        ],
        phases: { training: { 0: 2, 1: 3 }, champions: { 3: 2 } },
      },
      {
        name: 'Northwind Teams Governance',
        client: 'Northwind',
        code: 'PRJ-1088',
        color: '#2177a8',
        hours: 5,
        entries: { 0: 2, 1: 2, 3: 2 },
      },
      {
        name: 'Contoso Intranet Refresh',
        client: 'Contoso',
        code: 'PRJ-1120',
        color: '#7957bc',
        hours: 10,
        monthly: 40,
        historical: 18,
        tasks: [
          { id: 'general', name: 'General' },
          { id: 'discovery', name: 'Discovery' },
          { id: 'build', name: 'Build' },
          { id: 'uat', name: 'UAT' },
          { id: 'launch', name: 'Launch' },
        ],
        phases: { discovery: { 0: 1.5, 1: 1 }, build: { 3: 1.5 } },
      },
      {
        name: 'Fabrikam Copilot Pilot',
        client: 'Fabrikam',
        code: 'PRJ-1104',
        isBillable: false,
        color: '#b64e82',
        hours: 3,
        entries: { 1: 1.5 },
        tasks: [
          { id: 'general', name: 'General' },
          { id: 'readiness', name: 'Readiness assessment' },
          { id: 'pilot', name: 'Pilot group' },
        ],
        phases: { readiness: { 3: 1.5 } },
      },
      {
        name: 'Presales',
        client: 'Internal',
        code: 'PS-01',
        color: '#a4780f',
        hours: 4,
        isBillable: false,
      },
      {
        name: 'Professional Development',
        client: 'Internal',
        code: 'PD',
        color: '#60707e',
        hours: null,
        isBillable: false,
      },
    ];
    const sample = specs.map(({ entries, phases, ...fields }) => {
      const project = createProjectRecord(
        {
          monthly: null,
          historical: 0,
          isBillable: true,
          status: 'active',
          ...fields,
        },
        'onwards',
        week,
      );
      if (entries) project.entries[week] = entries;
      for (const [task, hours] of Object.entries(phases || {}))
        project.taskEntries[task] = { [week]: hours };
      return project;
    });
    checkpoint();
    setData((d) => ({ ...d, projects: [...d.projects, ...sample] }));
    checkpoint();
    setNotice({ type: 'success', text: 'Sample workspace added.' });
  };
  const attachLoadedFile = useCallback(
    (result) => {
      const signature = workspaceSignature(result.data);
      // Attempted signatures are kept: a write that was still landing when
      // the file was refreshed holds our content, not someone else's.
      fileGeneration.current += 1;
      setSavedFileSignature(signature);
      latestSignature.current = signature;
      saveBlocked.current = false;
      sessionUnreadable.current = false;
      resetData(result.data);
      setFile(result.handle);
      setFileName(result.name);
      setFileRevision(result.revision);
      setLastSavedAt(
        result.revision?.lastModified
          ? new Date(result.revision.lastModified)
          : new Date(),
      );
      setFileStatus(result.handle ? 'saved' : 'local');
    },
    [resetData],
  );
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
      const handle = await chooseNewBackupHandle(fileName || undefined),
        payload = backupPayload(data.projects, data.settings),
        signature = workspaceSignature(payload),
        revision = await writeHandle(handle, payload);
      fileGeneration.current += 1;
      attemptedSignatures.current = [];
      setSavedFileSignature(signature);
      saveBlocked.current = false;
      setFile(handle);
      setFileName(handle.name);
      setFileRevision(revision);
      setLastSavedAt(new Date(revision.lastModified));
      setFileStatus(latestSignature.current === signature ? 'saved' : 'dirty');
      setNotice({
        type: 'success',
        text: `Saved and attached ${handle.name}.`,
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
      if (saveInFlight.current) {
        saveQueued.current = true;
        return false;
      }
      saveInFlight.current = true;
      saveQueued.current = false;
      setFileStatus('saving');
      const generation = fileGeneration.current,
        payload = backupPayload(data.projects, data.settings),
        signature = workspaceSignature(payload),
        ownSignatures = [savedFileSignature, ...attemptedSignatures.current];
      attemptedSignatures.current = [
        ...attemptedSignatures.current,
        signature,
      ].slice(-5);
      try {
        const revision = await writeHandle(file, payload, fileRevision, {
          // Only a click may raise the browser's permission prompt.
          interactive: notify,
          ownSignatures,
        });
        // Another file was attached while this one was writing.
        if (generation !== fileGeneration.current) return false;
        // Kept as ours: a save already queued before React applies this
        // result still holds the old revision and must not see a conflict.
        attemptedSignatures.current = [signature];
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
        if (generation !== fileGeneration.current) return false;
        if (error?.code === FILE_CHANGED_CODE) {
          saveBlocked.current = true;
          setFileStatus('conflict');
          setNotice({ type: 'error', text: error.message });
        } else if (error?.code === FILE_PERMISSION_CODE) {
          // Autosave cannot ask for permission; wait for Save now.
          saveBlocked.current = true;
          setFileStatus('permission');
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
        // Edits made while this save was writing still need writing, even
        // when this save failed or was for a file no longer attached.
        if (saveQueued.current) {
          saveQueued.current = false;
          setSaveRetry((count) => count + 1);
        }
      }
    },
    [data, file, fileRevision, savedFileSignature],
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
    // An unreadable browser copy is never overwritten by autosave, even
    // after edits: a transient IndexedDB failure must not replace real work.
    // Opening or importing a file lifts the guard.
    if (!sessionUnreadable.current)
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
    } else if (file && signature === savedFileSignature && !saveInFlight.current) {
      // Edits undone back to the saved state leave nothing to save, so an
      // "Unsaved changes" or failed-save status must not linger.
      setFileStatus((current) =>
        current === 'dirty' || current === 'error' ? 'saved' : current,
      );
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
    saveRetry,
    week,
  ]);
  // Write pending edits straight away when the tab is hidden (switching
  // away, minimising or closing), rather than waiting for the autosave delay
  // that background tabs may throttle or never reach.
  useEffect(() => {
    if (!dirty) return;
    const flush = () => {
      if (document.visibilityState !== 'hidden' || saveBlocked.current) return;
      clearTimeout(autoSaveTimer.current);
      saveAttachedFile();
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [dirty, saveAttachedFile]);
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
          : fileStatus === 'permission'
            ? 'Save paused · allow access'
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
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
            />
            <path
              d="M12 3v9h9"
              fill="#ffd23f"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
          <b className="brand-name">
            Time <span>Master</span>
          </b>
        </a>
        <nav className="view-switch" aria-label="View">
          {[
            ['timesheet', 'Time'],
            ['financials', 'Money'],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-current={view === value ? 'page' : undefined}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          className={`file-status file-status-${fileStatus === 'permission' ? 'error' : fileStatus}`}
          onClick={() => setPanel('file')}
          title="Open file controls"
        >
          <strong>{fileName || 'Local workspace'}</strong>
          <span>{saveStatusText}</span>
        </button>
        <nav className="top-actions">
          <Commands
            projects={data.projects}
            onProject={(project, phaseId = null) => {
              setFocusPhase(phaseId);
              setEdit(project);
              setPanel('project');
            }}
            sections={[
              [
                'Timesheet actions',
                [
                  ['Add line', () => setLineTarget(true)],
                  [
                    'Export timesheet CSV',
                    () => downloadTimesheetCsv(data.projects),
                  ],
                  ['Capacity breakdown', () => setCapacityDetails(true)],
                  ['Previous week', () => setWeek(shiftWeek(week, -1))],
                  ['Next week', () => setWeek(shiftWeek(week, 1))],
                  ['Today', () => setWeek(weekKeyFor(new Date()))],
                ],
              ],
              [
                'Other actions',
                [
                  [
                    'New project',
                    () => {
                      setEdit(null);
                      setPanel('project');
                    },
                  ],
                  ['Manage projects', () => setPanel('manage')],
                  ['Import', () => setPanel('import')],
                  ['File', () => setPanel('file')],
                  ...(file && dirty
                    ? [['Save now', () => saveAttachedFile({ notify: true })]]
                    : []),
                ],
              ],
              [
                'Views',
                [
                  ['Timesheet', () => setView('timesheet')],
                  ['Financials', () => setView('financials')],
                ],
              ],
              [
                'Application settings',
                [
                  ['Workspace settings', () => setPanel('settings')],
                  ['Hourly rate', () => openSettings('rate')],
                ],
              ],
            ]}
          />
          <button onClick={() => setPanel('file')}>File</button>
          <button onClick={() => setPanel('import')}>Import</button>
          <button onClick={() => setPanel('manage')}>Projects</button>
          <button onClick={() => setPanel('settings')}>Settings</button>
          <button
            className="primary new-project"
            aria-label="New project"
            onClick={() => {
              setEdit(null);
              setPanel('project');
            }}
          >
            <span className="btn-label">New project</span>
          </button>
        </nav>
      </header>
      <main id="workspace">
        <section className="week-head">
          <nav className="history-nav" aria-label="History">
            <button
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo"
              title="Undo (Ctrl Z)"
            >
              {icon('M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11')}
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo"
              title="Redo (Ctrl Shift Z)"
            >
              {icon('m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13')}
            </button>
          </nav>
          <div>
            <h1>{weekLabel(week, days)}</h1>
          </div>
          <div className="week-nav">
            <button
              onClick={() => setWeek(shiftWeek(week, -1))}
              aria-label="Previous week"
            >
              {icon('M15 18l-6-6 6-6')}
            </button>
            <label className="week-picker">
              <span aria-hidden="true">
                {week === weekKeyFor(new Date())
                  ? 'Today · ' +
                    new Date().toLocaleDateString('en-AU', {
                      weekday: 'short',
                      day: 'numeric',
                    })
                  : 'Choose date'}
              </span>
              <input
                type="date"
                aria-label="Choose a date to view its week"
                value={week}
                onClick={(event) => event.currentTarget.showPicker?.()}
                onChange={(event) => {
                  if (event.target.value)
                    setWeek(
                      weekKeyFor(new Date(event.target.value + 'T12:00:00')),
                    );
                }}
              />
            </label>
            <button
              onClick={() => setWeek(shiftWeek(week, 1))}
              aria-label="Next week"
            >
              {icon('M9 18l6-6-6-6')}
            </button>
          </div>
        </section>
        {view === 'financials' ? (
          <Financials
            projects={data.projects}
            settings={data.settings}
            week={week}
            days={days}
            onOpenSettings={openSettings}
            onEditProject={(project) => {
              if (!project) return;
              setFocusPhase(BUDGET_FOCUS);
              setEdit(project);
              setPanel('project');
            }}
            onNewProject={() => {
              setEdit(null);
              setPanel('project');
            }}
            onTag={tagEntryActivity}
          />
        ) : (
        <section
          className={`workspace ${mobileView === 'days' ? 'day-mode' : ''}`}
        >
          <div className="phone-week-summary">
            <b>{fmt(totals.logged)}h logged</b> ·{' '}
            {fmt(Math.abs(totals.remaining))}h{' '}
            {totals.remaining < 0 ? 'over' : 'free'}{' '}
            <button onClick={() => setCapacityDetails(true)}>Capacity ↗</button>
          </div>
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
                <svg className="chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <div className="sheet-tools">
                <div className="sheet-tools-inner">
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
                    <span className="sr-only">Group</span>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      aria-label="Categorise timesheet"
                    >
                      <option value="none">No grouping</option>
                      <option value="status">Status</option>
                      <option value="client">Client</option>
                      <option value="billability">
                        Billable / non-billable
                      </option>
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
                </div>
              </div>
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
                  capacityByDay={data.settings.capacityByDay}
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
                  onSaveNote={(projectId, taskId, wk, day, text) =>
                    saveEntryNote({ projectId, taskId, week: wk, day }, text)
                  }
                  onUndo={undo}
                  onCheckpoint={checkpoint}
                  onRestoreTag={(projectId, taskId, wk, day, tag) =>
                    tagEntryActivity({ projectId, taskId, week: wk, day }, tag)
                  }
                  renderNoteExtras={(entry) => (
                    <ActivityPicker
                      {...entry}
                      compact
                      onTag={(activityId) =>
                        tagEntryActivity(
                          { ...entry, projectId: entry.project.id },
                          activityId,
                        )
                      }
                    />
                  )}
                  onNote={(projectId, taskId, wk, day) =>
                    setNoteTarget({ projectId, taskId, week: wk, day })
                  }
                  onAddLine={(project) => setLineTarget(project.id)}
                  onRemoveTaskLine={removeTaskLine}
                  onLeave={toggleLeave}
                  onEdit={(p, phaseId = null) => {
                    setFocusPhase(phaseId);
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
                  onPlace={place}
                  onPlaceTask={placeTask}
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
                    onEdit={(p, phaseId = null) => {
                      setFocusPhase(phaseId);
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
        )}
        <nav className="phone-dock" aria-label="Mobile workspace">
          <button
            onClick={() =>
              document.querySelector('.week-head').scrollIntoView()
            }
          >
            Week
          </button>
          <button
            onClick={() => document.querySelector('.insights').scrollIntoView()}
          >
            Usage
          </button>
          <button
            onClick={() =>
              setView(view === 'financials' ? 'timesheet' : 'financials')
            }
          >
            {view === 'financials' ? 'Time' : 'Money'}
          </button>
          <button onClick={() => setPanel('manage')}>Projects</button>
          <button onClick={() => setPanel('file')}>File</button>
        </nav>
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
        focusPhase={focusPhase}
        isOpen={panel === 'project'}
        onClose={() => {
          setPanel(returnToManage ? 'manage' : null);
          setFocusPhase(null);
          setEdit(null);
          setReturnToManage(false);
        }}
        onSave={saveProject}
        initial={edit}
        projects={data.projects}
        visibleProjects={visible}
        weekKey={week}
        hourlyRate={hourlyRateOf(data.settings)}
        perDay={hoursPerDay(data.settings)}
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
        key={removeTarget?.id || 'closed'}
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
          focus={settingsFocus}
          onClose={() => {
            setPanel(null);
            setSettingsFocus(null);
          }}
          onSave={(settings) => {
            setData((d) => ({ ...d, settings }));
            setPanel(null);
            setSettingsFocus(null);
          }}
        />
      )}
      {noteProject && (
        <EntryNoteModal
          key={`${noteTarget.projectId}:${noteTarget.taskId}:${noteTarget.week}:${noteTarget.day}`}
          project={noteProject}
          taskName={
            noteTarget.taskId
              ? noteProject.tasks?.find((task) => task.id === noteTarget.taskId)
                  ?.name || 'Task'
              : 'General'
          }
          week={noteTarget.week}
          day={noteTarget.day}
          hours={
            noteTarget.taskId
              ? noteProject.taskEntries?.[noteTarget.taskId]?.[
                  noteTarget.week
                ]?.[noteTarget.day]
              : noteProject.entries?.[noteTarget.week]?.[noteTarget.day]
          }
          note={entryNote(
            noteProject,
            noteTarget.taskId,
            noteTarget.week,
            noteTarget.day,
          )}
          onSave={(text) => saveEntryNote(noteTarget, text)}
          renderExtras={(note) => (
            <ActivityPicker
              project={noteProject}
              taskId={noteTarget.taskId}
              week={noteTarget.week}
              day={noteTarget.day}
              note={note}
              onTag={(activityId) => tagEntryActivity(noteTarget, activityId)}
            />
          )}
          onClose={closeNote}
        />
      )}
      {capacityDetails && (
        <CapacityModal
          allProjects={data.projects}
          settings={data.settings}
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
            totals={totals}
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
          needsAttention={fileStatus === 'error' || fileStatus === 'permission'}
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
      {/* Last, so a confirmation asked from a panel (File → open another
          file) sits above that panel rather than under its backdrop. */}
      {confirm && (
        <ConfirmAction
          confirmation={confirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
