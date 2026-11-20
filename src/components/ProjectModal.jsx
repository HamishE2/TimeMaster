/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  fmt,
  getCategorizedProjects,
  monthlyPlan,
  uuid,
} from '../lib/utils.js';
import { validateProjectDraft } from '../lib/projectOperations.js';
import { isGeneralTask, phaseHours } from '../lib/tasks.js';
import ScopePicker from './ScopePicker.jsx';
import ModalBackdrop from './ModalBackdrop.jsx';

// Chronograph project palette (matches the --proj-* tokens in the mockups).
const PROJECT_COLOURS = [
  '#0e8c7e',
  '#6b4fd8',
  '#e0533a',
  '#b5870f',
  '#3e7d3a',
  '#2e86c1',
  '#c2457a',
  '#5b6472',
];

export default function ProjectModal({
  isOpen,
  focusPhase,
  onClose,
  onSave,
  initial,
  projects = [],
  visibleProjects = [],
  weekKey,
}) {
  const [projectType, setProjectType] = useState('standard');
  const [durationPreset, setDurationPreset] = useState('1 week');
  const [durationWeeks, setDurationWeeks] = useState(1);
  const [durationDays, setDurationDays] = useState(0);
  const [remainderLimit, setRemainderLimit] = useState('');
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('active');
  const [color, setColor] = useState('#6366f1');
  const [hours, setHours] = useState('');
  const [unlimited, setUnlimited] = useState(false);
  const [monthlyHours, setMonthlyHours] = useState('');
  const [historicalMonthly, setHistoricalMonthly] = useState('');
  const [applyScope, setApplyScope] = useState('project'); // 'project' or 'week'
  const [isBillable, setIsBillable] = useState(true);
  const [errors, setErrors] = useState({});
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedExistingId, setSelectedExistingId] = useState(null);
  const [tasks, setTasks] = useState([{ id: 'general', name: 'General' }]);
  // Phase reordering: drag the grip (live reorder as it crosses neighbours)
  // or use arrow keys on it. Items slide to their new spots (FLIP).
  const taskListRef = useRef(null);
  const taskFlip = useRef(null);
  const taskDrag = useRef(null);
  const taskRefocus = useRef(null);
  const taskItems = () => [
    ...(taskListRef.current?.querySelectorAll('.project-task-item') || []),
  ];
  const moveTask = (id, toIndex) => {
    setTasks((current) => {
      const from = current.findIndex((task) => task.id === id);
      if (
        from < 0 ||
        toIndex < 0 ||
        toIndex >= current.length ||
        toIndex === from
      )
        return current;
      taskFlip.current = new Map(
        taskItems().map((el) => [
          el.dataset.task,
          el.getBoundingClientRect().top,
        ]),
      );
      const next = [...current];
      next.splice(toIndex, 0, ...next.splice(from, 1));
      return next;
    });
  };
  useLayoutEffect(() => {
    const before = taskFlip.current;
    if (before) {
      taskFlip.current = null;
      const reduce = window.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      for (const el of taskItems()) {
        const delta =
          (before.get(el.dataset.task) ?? 0) - el.getBoundingClientRect().top;
        if (!delta || reduce) continue;
        el.style.transition = 'none';
        el.style.transform = `translateY(${delta}px)`;
        el.getBoundingClientRect();
        el.style.transition = 'transform 180ms cubic-bezier(.2,.8,.2,1)';
        el.style.transform = '';
      }
    }
    if (taskRefocus.current) {
      taskListRef.current
        ?.querySelector(`[data-task="${taskRefocus.current}"] .grip`)
        ?.focus();
      taskRefocus.current = null;
    }
  });
  const onTaskGripMove = (event) => {
    const id = taskDrag.current;
    if (!id) return;
    const items = taskItems();
    const from = items.findIndex((el) => el.dataset.task === id);
    let to = 0;
    items.forEach((el, i) => {
      if (i === from) return;
      const r = el.getBoundingClientRect();
      if (r.top + r.height / 2 < event.clientY) to += 1;
    });
    if (to !== from) moveTask(id, to);
  };
  const [newTask, setNewTask] = useState('');
  const [pendingTaskRemoval, setPendingTaskRemoval] = useState(null);
  const [activeSection, setActiveSection] = useState('Identity');
  const bodyRef = useRef(null);
  const jumpingRef = useRef(false);
  // On narrow screens the dialog itself scrolls rather than the body, so track
  // the active section from the dialog too.
  useEffect(() => {
    const sheet = bodyRef.current?.closest('.modal');
    if (!sheet) return undefined;
    const onScroll = () => {
      if (jumpingRef.current) return;
      const nav = sheet.querySelector('.edit-sections');
      const top =
        (nav
          ? nav.getBoundingClientRect().bottom
          : sheet.getBoundingClientRect().top) + 24;
      const current = ['Identity', 'Allocation', 'Phases', 'Schedule']
        .filter((label) => {
          const el = document.getElementById(`edit-${label.toLowerCase()}`);
          return el && el.getBoundingClientRect().top <= top;
        })
        .at(-1);
      if (current) setActiveSection(current);
    };
    sheet.addEventListener('scroll', onScroll, { passive: true });
    return () => sheet.removeEventListener('scroll', onScroll);
  }, []);
  const jumpTimer = useRef(null);
  const phaseRef = useRef(null);
  const nameRef = useRef(null);
  const dropdownRef = useRef(null);

  const { active, inactive } = getCategorizedProjects(
    projects,
    visibleProjects,
  );

  // Opening the dialog creates a fresh editable draft from the selected project.
  useEffect(() => {
    if (isOpen) {
      setProjectType(initial?.projectType || 'standard');
      if (initial?.projectType === 'one-time') {
        setDurationWeeks(initial.durationWeeks || 0);
        setDurationDays(initial.durationDays || 0);
        setRemainderLimit(initial.remainderLimit ?? '');
        if (initial.durationWeeks === 0 && initial.durationDays === 1)
          setDurationPreset('1 day');
        else if (initial.durationWeeks === 1 && initial.durationDays === 0)
          setDurationPreset('1 week');
        else setDurationPreset('custom');
      } else {
        setDurationPreset('1 week');
        setDurationWeeks(1);
        setDurationDays(0);
        setRemainderLimit('');
      }

      setName(initial?.name ?? '');
      setClient(initial?.client ?? '');
      setCode(initial?.code ?? '');
      setStatus(initial?.status ?? 'active');
      setColor(initial?.color ?? '#6366f1');

      const isUnlim =
        initial?.resourcedHours === null ||
        initial?.resourcedHours === undefined;
      let initHours = isUnlim ? '' : (initial?.resourcedHours ?? '');

      // Check if there's a weekly override for the current week
      if (
        initial &&
        initial.weeklyOverrides &&
        Object.hasOwn(initial.weeklyOverrides, weekKey)
      ) {
        initHours = initial.weeklyOverrides[weekKey];
        setApplyScope(initial.projectType === 'one-time' ? 'onwards' : 'week');
        setUnlimited(initHours === null || initHours === undefined);
      } else {
        setApplyScope(initial ? 'project' : 'onwards');
        setUnlimited(initial ? isUnlim : false);
      }

      setHours(initHours);

      const currentMonthly = initial ? monthlyPlan(initial, weekKey) : null;
      const isMonthlyUnlim =
        currentMonthly === null || currentMonthly === undefined;
      setMonthlyHours(isMonthlyUnlim ? '' : currentMonthly);
      setHistoricalMonthly(initial?.historicalMonthlyHours ?? '');

      setIsBillable(initial?.isBillable ?? true);
      setErrors({});
      setDropdownOpen(false);
      setSelectedExistingId(null);
      setTasks(
        initial?.tasks?.length
          ? initial.tasks
          : [{ id: 'general', name: 'General' }],
      );
      setNewTask('');
      setPendingTaskRemoval(null);
      setActiveSection('Identity');
      const timer = setTimeout(
        () => (phaseRef.current || nameRef.current)?.focus(),
        50,
      );
      return () => clearTimeout(timer);
    }
  }, [isOpen, initial, weekKey, focusPhase]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const handleSelectProject = (project) => {
    setSelectedExistingId(project.id);
    setProjectType(project.projectType || 'standard');
    if (project.projectType === 'one-time') {
      setDurationWeeks(project.durationWeeks || 0);
      setDurationDays(project.durationDays || 0);
      setRemainderLimit(project.remainderLimit ?? '');
      if (project.durationWeeks === 0 && project.durationDays === 1)
        setDurationPreset('1 day');
      else if (project.durationWeeks === 1 && project.durationDays === 0)
        setDurationPreset('1 week');
      else setDurationPreset('custom');
    } else {
      setDurationPreset('1 week');
      setDurationWeeks(1);
      setDurationDays(0);
      setRemainderLimit('');
    }
    setName(project.name);
    setClient(project.client ?? '');
    setCode(project.code ?? '');
    setStatus(project.status ?? 'active');
    setColor(project.color ?? '#6366f1');
    const isUnlim =
      project.resourcedHours === null || project.resourcedHours === undefined;
    setUnlimited(isUnlim);
    setHours(isUnlim ? '' : project.resourcedHours);
    setApplyScope(initial ? 'project' : 'onwards');
    const currentMonthly = monthlyPlan(project, weekKey),
      isMonthlyUnlim = currentMonthly === null || currentMonthly === undefined;
    setMonthlyHours(isMonthlyUnlim ? '' : currentMonthly);
    setHistoricalMonthly(project.historicalMonthlyHours ?? '');
    setIsBillable(project.isBillable ?? true);
    setTasks(
      project.tasks?.length
        ? project.tasks
        : [{ id: 'general', name: 'General' }],
    );
    setNewTask('');
    setDropdownOpen(false);
  };

  if (!isOpen) return null;

  const validate = () => {
    const e = validateProjectDraft({
      name,
      unlimited,
      hours,
      monthlyHours,
      historicalMonthly,
      projectType,
      durationWeeks,
      durationDays,
      remainderLimit,
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (validate()) {
      const saved = onSave(
        name.trim(),
        unlimited ? null : Number(hours),
        isBillable,
        applyScope,
        monthlyHours === '' ? null : Number(monthlyHours),
        historicalMonthly === '' ? 0 : Number(historicalMonthly),
        client.trim(),
        code.trim(),
        status,
        color,
        selectedExistingId,
        tasks.map((task) => ({
          ...task,
          name: task.name.trim() || 'Untitled task',
        })),
        projectType,
        durationWeeks,
        durationDays,
        remainderLimit === '' ? null : Number(remainderLimit),
      );
      if (saved !== false) onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
  };

  const addTask = () => {
    const value = newTask.trim();
    if (!value) return;
    setTasks((current) => [...current, { id: uuid(), name: value }]);
    setNewTask('');
  };

  const showSchedule =
    projectType !== 'one-time' && ((initial && !unlimited) || !initial);
  const sections = [
    'Identity',
    'Allocation',
    'Phases',
    ...(showSchedule ? ['Schedule'] : []),
  ];
  const scopeOptions = initial
    ? [
        ['retro', 'Past weeks'],
        ['onwards', 'This week onwards'],
        ['week', 'This week only'],
        ['project', 'Entire project'],
      ]
    : [
        ['week', 'This week only'],
        ['onwards', 'This week onwards'],
        ['next-onwards', 'Next week onwards'],
      ];
  const swatches = PROJECT_COLOURS.includes(color)
    ? PROJECT_COLOURS
    : [...PROJECT_COLOURS, color];

  // Tabs scroll the sheet body only. While a jump is animating, scroll tracking
  // is paused so the clicked tab stays selected even if its section can't
  // reach the top (e.g. the last section).
  // The sheet body scrolls on wide screens; on narrow ones the whole dialog does.
  const scroller = () => {
    const body = bodyRef.current;
    if (!body) return null;
    return body.scrollHeight > body.clientHeight + 1
      ? body
      : body.closest('.modal') || body;
  };
  const jumpTo = (label) => {
    const body = scroller();
    const section = document.getElementById(`edit-${label.toLowerCase()}`);
    if (!body || !section) return;
    setActiveSection(label);
    // Briefly highlight the section that was jumped to.
    section.classList.remove('jump-flash');
    void section.offsetWidth; // restart the animation on repeat clicks
    section.classList.add('jump-flash');
    jumpingRef.current = true;
    clearTimeout(jumpTimer.current);
    jumpTimer.current = setTimeout(() => (jumpingRef.current = false), 700);
    body.scrollTo({
      top:
        body.scrollTop +
        section.getBoundingClientRect().top -
        body.getBoundingClientRect().top -
        // When the dialog scrolls, the pinned tab bar covers its top edge.
        (body === bodyRef.current
          ? 16
          : (body.querySelector('.edit-sections')?.offsetHeight || 0) + 16),
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  };
  const trackSection = (event) => {
    if (jumpingRef.current) return;
    const body = event.currentTarget;
    if (body !== scroller()) return;
    const top = body.getBoundingClientRect().top + 48;
    const current = sections
      .filter(
        (label) =>
          document
            .getElementById(`edit-${label.toLowerCase()}`)
            ?.getBoundingClientRect().top <= top,
      )
      .at(-1);
    if (current && current !== activeSection) setActiveSection(current);
  };
  const heading = (label) => (
    <h3 className="edit-section-title">
      <span aria-hidden="true">
        {String(sections.indexOf(label) + 1).padStart(2, '0')}
      </span>
      {label}
      {label === 'Schedule' && ' · apply changes to'}
    </h3>
  );
  const listProjects = (list, title) =>
    list.length > 0 && (
      <div className="project-select-section">
        <div className="project-select-section-title">{title}</div>
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            className="project-select-item"
            onClick={() => handleSelectProject(p)}
          >
            <span>{p.name}</span>
            <small>
              {p.resourcedHours == null ? '∞' : `${p.resourcedHours}h/wk`}
            </small>
          </button>
        ))}
      </div>
    );

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal project-sheet">
        <div className="modal-header">
          <h2>{initial ? initial.name || 'Edit project' : 'Add project'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <nav className="edit-sections" aria-label="Project sections">
          {sections.map((label, index) => (
            <button
              type="button"
              key={label}
              aria-current={activeSection === label ? 'true' : undefined}
              onClick={() => jumpTo(label)}
            >
              <span aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              {label}
            </button>
          ))}
        </nav>

        <div
          className="modal-body project-editor"
          ref={bodyRef}
          onScroll={trackSection}
        >
          <section id="edit-identity">
            {heading('Identity')}
            {!initial && (
              <div className="field">
                <label>Start from an existing project</label>
                <div className="project-select-container" ref={dropdownRef}>
                  <button
                    type="button"
                    className="project-select-btn"
                    aria-expanded={dropdownOpen}
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                  >
                    <span>Select an existing project…</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {dropdownOpen && (
                    <div className="project-select-dropdown">
                      {listProjects(active, 'Active')}
                      {listProjects(inactive, 'Inactive')}
                      {active.length === 0 && inactive.length === 0 && (
                        <div className="project-select-empty">
                          No previous projects available
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="field">
              <label htmlFor="project-name">Project name</label>
              <input
                ref={nameRef}
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Client Dashboard Redesign"
                className={errors.name ? 'input-error' : ''}
              />
              {errors.name && (
                <span className="field-error">{errors.name}</span>
              )}
            </div>

            <div className="field-pair">
              <div className="field">
                <label htmlFor="project-client">Client</label>
                <input
                  id="project-client"
                  type="text"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Contoso Pty Ltd"
                />
              </div>
              <div className="field">
                <label htmlFor="project-code">Project code</label>
                <input
                  id="project-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. PRJ-1042"
                />
              </div>
            </div>

            <div className="field">
              <label id="project-status-label">Status</label>
              <div
                className="segmented"
                role="radiogroup"
                aria-labelledby="project-status-label"
              >
                {[
                  ['active', 'Active'],
                  ['on-hold', 'On hold'],
                  ['closed', 'Closed'],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    role="radio"
                    key={value}
                    aria-checked={status === value}
                    onClick={() => setStatus(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Colour</label>
              <div className="swatches">
                {swatches.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="color-swatch"
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    style={{ '--swatch': c }}
                    title={`Use ${c}`}
                    aria-label={`Use colour ${c}`}
                  />
                ))}
                <label className="color-swatch custom" title="Custom colour">
                  +
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    aria-label="Custom colour"
                  />
                </label>
              </div>
            </div>

            <label className="switch-row">
              <input
                type="checkbox"
                checked={isBillable}
                onChange={(e) => setIsBillable(e.target.checked)}
              />
              <span>Billable project</span>
            </label>
          </section>

          <section id="edit-allocation">
            {heading('Allocation')}
            <div
              className="type-choice"
              role="radiogroup"
              aria-label="Project type"
            >
              <button
                type="button"
                role="radio"
                aria-checked={projectType === 'standard'}
                onClick={() => {
                  setProjectType('standard');
                  if (initial?.projectType === 'one-time')
                    setApplyScope('onwards');
                }}
              >
                <strong>Standard</strong>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={projectType === 'one-time'}
                onClick={() => setProjectType('one-time')}
              >
                <strong>One-time</strong>
              </button>
            </div>

            {projectType === 'one-time' && (
              <div className="field">
                <label>Duration</label>
                <div className="radio-row">
                  {['1 day', '1 week', 'custom'].map((preset) => (
                    <label key={preset}>
                      <input
                        type="radio"
                        checked={durationPreset === preset}
                        onChange={() => {
                          setDurationPreset(preset);
                          if (preset === '1 day') {
                            setDurationWeeks(0);
                            setDurationDays(1);
                          } else if (preset === '1 week') {
                            setDurationWeeks(1);
                            setDurationDays(0);
                          }
                        }}
                      />
                      {preset.charAt(0).toUpperCase() + preset.slice(1)}
                    </label>
                  ))}
                </div>
                {durationPreset === 'custom' && (
                  <div className="field-pair">
                    <label className="unit-input">
                      <input
                        type="number"
                        min="0"
                        aria-label="Duration weeks"
                        value={durationWeeks}
                        onChange={(e) =>
                          setDurationWeeks(Number(e.target.value) || 0)
                        }
                      />
                      <span>weeks</span>
                    </label>
                    <label className="unit-input">
                      <input
                        type="number"
                        min="0"
                        max="6"
                        aria-label="Duration days"
                        value={durationDays}
                        onChange={(e) =>
                          setDurationDays(Number(e.target.value) || 0)
                        }
                      />
                      <span>days</span>
                    </label>
                  </div>
                )}
                {errors.duration && (
                  <span className="field-error">{errors.duration}</span>
                )}
              </div>
            )}

            <div className="field-pair">
              <div className="field">
                <label htmlFor="project-hours">
                  {projectType === 'one-time'
                    ? durationWeeks === 0 && durationDays > 0
                      ? `Usage limit for ${durationDays} day(s)`
                      : 'Weekly usage limit'
                    : 'Weekly resourced hours'}
                </label>
                <div
                  className={`unit-input ${errors.hours ? 'input-error' : ''}`}
                >
                  <input
                    id="project-hours"
                    type="number"
                    min="0"
                    step="0.25"
                    value={unlimited ? '' : hours}
                    onChange={(e) => setHours(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={unlimited ? '∞' : 'e.g. 12'}
                    disabled={unlimited}
                  />
                  <span>h / week</span>
                </div>
                {errors.hours && (
                  <span className="field-error">{errors.hours}</span>
                )}
              </div>
              <label className="switch-row field-end" title="No budget cap">
                <input
                  type="checkbox"
                  checked={unlimited}
                  onChange={(e) => {
                    setUnlimited(e.target.checked);
                    if (e.target.checked)
                      setApplyScope(initial ? 'project' : 'onwards');
                  }}
                />
                <span>Unlimited</span>
              </label>
            </div>

            {projectType === 'one-time' &&
              durationWeeks > 0 &&
              durationDays > 0 && (
                <div className="field">
                  <label htmlFor="project-remainder-hours">
                    Usage limit for remaining {durationDays} day(s)
                  </label>
                  <div
                    className={`unit-input ${errors.remainderLimit ? 'input-error' : ''}`}
                  >
                    <input
                      id="project-remainder-hours"
                      type="number"
                      min="0"
                      step="0.25"
                      value={remainderLimit}
                      onChange={(e) => setRemainderLimit(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="e.g. 5"
                    />
                    <span>h</span>
                  </div>
                  {errors.remainderLimit && (
                    <span className="field-error">{errors.remainderLimit}</span>
                  )}
                </div>
              )}

            {projectType !== 'one-time' && (
              <div className="field-pair">
                <div className="field">
                  <label htmlFor="project-monthly-hours">Monthly hours</label>
                  <div
                    className={`unit-input ${errors.monthlyHours ? 'input-error' : ''}`}
                  >
                    <input
                      id="project-monthly-hours"
                      type="number"
                      min="0"
                      step="0.25"
                      value={monthlyHours}
                      onChange={(e) => setMonthlyHours(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Optional"
                    />
                    <span>h / month</span>
                  </div>
                  {errors.monthlyHours && (
                    <span className="field-error">{errors.monthlyHours}</span>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="project-historical-hours">
                    Historical monthly usage
                  </label>
                  <div
                    className={`unit-input ${errors.historicalMonthly ? 'input-error' : ''}`}
                  >
                    <input
                      id="project-historical-hours"
                      type="number"
                      min="0"
                      step="0.25"
                      value={historicalMonthly}
                      onChange={(e) => setHistoricalMonthly(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Optional"
                    />
                    <span>h</span>
                  </div>
                  {errors.historicalMonthly && (
                    <span className="field-error">
                      {errors.historicalMonthly}
                    </span>
                  )}
                </div>
              </div>
            )}
          </section>

          <section id="edit-phases">
            {heading('Phases')}
            <div className="project-task-list" ref={taskListRef}>
              {tasks.map((task, taskIndex) => (
                <div
                  className="project-task-item"
                  key={task.id}
                  data-task={task.id}
                >
                  <button
                    type="button"
                    className="grip"
                    aria-label={`Reorder ${task.name}. Use arrow keys to move.`}
                    title="Drag to reorder"
                    disabled={tasks.length < 2}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      taskDrag.current = task.id;
                      event.currentTarget
                        .closest('.project-task-item')
                        ?.classList.add('is-dragging');
                    }}
                    onPointerMove={onTaskGripMove}
                    onPointerUp={(event) => {
                      taskDrag.current = null;
                      event.currentTarget
                        .closest('.project-task-item')
                        ?.classList.remove('is-dragging');
                    }}
                    onPointerCancel={(event) => {
                      taskDrag.current = null;
                      event.currentTarget
                        .closest('.project-task-item')
                        ?.classList.remove('is-dragging');
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
                        return;
                      event.preventDefault();
                      taskRefocus.current = task.id;
                      moveTask(
                        task.id,
                        taskIndex + (event.key === 'ArrowUp' ? -1 : 1),
                      );
                    }}
                  >
                    <svg viewBox="0 0 10 10" aria-hidden="true">
                      <circle cx="2.5" cy="2.5" r="1.5" />
                      <circle cx="7.5" cy="2.5" r="1.5" />
                      <circle cx="2.5" cy="7.5" r="1.5" />
                      <circle cx="7.5" cy="7.5" r="1.5" />
                    </svg>
                  </button>
                  <input
                    ref={task.id === focusPhase ? phaseRef : undefined}
                    aria-label={`Task name: ${task.name}`}
                    value={task.name}
                    onChange={(event) =>
                      setTasks((current) =>
                        current.map((item) =>
                          item.id === task.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                    onBlur={() =>
                      setTasks((current) =>
                        current.map((item) =>
                          item.id === task.id
                            ? {
                                ...item,
                                name: item.name.trim() || 'Untitled task',
                              }
                            : item,
                        ),
                      )
                    }
                  />
                  {isGeneralTask(task) && (
                    <span className="reserved">Reserved</span>
                  )}
                  <b className="phase-hours">
                    {fmt(phaseHours(initial, task.id))}h
                  </b>
                  <button
                    type="button"
                    className="phase-remove"
                    disabled={tasks.length === 1}
                    onClick={() => {
                      if (tasks.length === 1) return;
                      // Same rule as before the redesign: only phase (taskEntries)
                      // time triggers the confirmation.
                      const hasLoggedTime = Object.values(
                        initial?.taskEntries?.[task.id] || {},
                      ).some((week) =>
                        Object.values(week || {}).some(
                          (value) => Number(value) > 0,
                        ),
                      );
                      if (hasLoggedTime) setPendingTaskRemoval(task.id);
                      else
                        setTasks((current) =>
                          current.filter((item) => item.id !== task.id),
                        );
                    }}
                    aria-label={`Remove task ${task.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="project-task-add">
                <input
                  aria-label="New task or phase"
                  value={newTask}
                  onChange={(event) => setNewTask(event.target.value)}
                  placeholder="+ New task or phase"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addTask();
                    }
                  }}
                />
                <button type="button" onClick={addTask}>
                  Add task
                </button>
              </div>
            </div>
            {pendingTaskRemoval && (
              <div className="task-remove-confirm" role="alert">
                <span>
                  Removing this task also removes its logged task time.
                </span>
                <button
                  type="button"
                  onClick={() => setPendingTaskRemoval(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setTasks((current) =>
                      current.filter((item) => item.id !== pendingTaskRemoval),
                    );
                    setPendingTaskRemoval(null);
                  }}
                >
                  Remove task and time
                </button>
              </div>
            )}
          </section>

          {showSchedule && (
            <section id="edit-schedule">
              {heading('Schedule')}
              <ScopePicker
                options={scopeOptions}
                value={applyScope}
                onChange={setApplyScope}
              />
            </section>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            {initial ? 'Save changes' : 'Add project'}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
