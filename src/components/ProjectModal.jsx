/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef } from 'react';
import { getCategorizedProjects, monthlyPlan, uuid } from '../lib/utils.js';
import { validateProjectDraft } from '../lib/projectOperations.js';
import ModalBackdrop from './ModalBackdrop.jsx';

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
  const [newTask, setNewTask] = useState('');
  const [pendingTaskRemoval, setPendingTaskRemoval] = useState(null);
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

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal">
        <div className="modal-header">
          <h2>{initial ? 'Edit project' : 'Add project'}</h2>
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

        <div className="modal-body">
          <div className="field" style={{ marginBottom: '16px' }}>
            <label>Project type</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setProjectType('standard');
                  if (initial?.projectType === 'one-time')
                    setApplyScope('onwards');
                }}
                style={{
                  padding: '10px 12px',
                  fontSize: '13px',
                  border: `1px solid ${projectType === 'standard' ? 'var(--brand)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor:
                    projectType === 'standard'
                      ? 'var(--brand-glow)'
                      : 'var(--bg-elevated)',
                  color:
                    projectType === 'standard'
                      ? 'var(--brand-light)'
                      : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: projectType === 'standard' ? 600 : 500,
                  transition: 'all 0.2s ease',
                }}
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => setProjectType('one-time')}
                style={{
                  padding: '10px 12px',
                  fontSize: '13px',
                  border: `1px solid ${projectType === 'one-time' ? 'var(--brand)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor:
                    projectType === 'one-time'
                      ? 'var(--brand-glow)'
                      : 'var(--bg-elevated)',
                  color:
                    projectType === 'one-time'
                      ? 'var(--brand-light)'
                      : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: projectType === 'one-time' ? 600 : 500,
                  transition: 'all 0.2s ease',
                }}
              >
                One-Time
              </button>
            </div>
          </div>

          {projectType === 'one-time' && (
            <div className="field" style={{ marginBottom: '16px' }}>
              <label>Duration</label>
              <div
                style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}
              >
                {['1 day', '1 week', 'custom'].map((preset) => (
                  <label
                    key={preset}
                    style={{
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                      color: 'var(--text)',
                    }}
                  >
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
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{ fontSize: '11px', color: 'var(--text-muted)' }}
                    >
                      Weeks
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={durationWeeks}
                      onChange={(e) =>
                        setDurationWeeks(Number(e.target.value) || 0)
                      }
                      style={{
                        width: '100%',
                        padding: '6px',
                        fontSize: '13px',
                        borderRadius: '4px',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{ fontSize: '11px', color: 'var(--text-muted)' }}
                    >
                      Days
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="6"
                      value={durationDays}
                      onChange={(e) =>
                        setDurationDays(Number(e.target.value) || 0)
                      }
                      style={{
                        width: '100%',
                        padding: '6px',
                        fontSize: '13px',
                        borderRadius: '4px',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </div>
                </div>
              )}
              {errors.duration && (
                <span
                  className="field-error"
                  style={{ marginTop: '4px', display: 'block' }}
                >
                  {errors.duration}
                </span>
              )}
            </div>
          )}

          {!initial && (
            <div className="field" style={{ marginBottom: '16px' }}>
              <label>Select project</label>
              <div
                className="project-select-container"
                ref={dropdownRef}
                style={{ position: 'relative' }}
              >
                <button
                  type="button"
                  className="project-select-btn"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    padding: '10px 14px',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-muted)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all var(--transition)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.backgroundColor =
                      'var(--bg-elevated)';
                  }}
                >
                  <span>Select an existing project...</span>
                  <svg
                    style={{
                      transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
                      transition: 'transform var(--transition)',
                      color: 'var(--text-muted)',
                    }}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
                {dropdownOpen && (
                  <div
                    className="project-select-dropdown"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: '6px',
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: 'var(--shadow)',
                      zIndex: 1000,
                      maxHeight: '260px',
                      overflowY: 'auto',
                      padding: '6px 0',
                    }}
                  >
                    {active.length > 0 && (
                      <div className="project-select-section">
                        <div
                          className="project-select-section-title"
                          style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            color: 'var(--brand-light)',
                            padding: '8px 14px 4px',
                            letterSpacing: '0.05em',
                          }}
                        >
                          Active
                        </div>
                        {active.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="project-select-item"
                            onClick={() => handleSelectProject(p)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              width: '100%',
                              padding: '8px 14px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: 'var(--text)',
                              fontSize: '13.5px',
                              textAlign: 'left',
                              cursor: 'pointer',
                              transition: 'all var(--transition)',
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor =
                                'var(--bg-hover)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor =
                                'transparent';
                            }}
                          >
                            <span>{p.name}</span>
                            <span
                              style={{
                                fontSize: '12px',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {p.resourcedHours === null ||
                              p.resourcedHours === undefined
                                ? '∞'
                                : `${p.resourcedHours}h/wk`}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {inactive.length > 0 && (
                      <div className="project-select-section">
                        <div
                          className="project-select-section-title"
                          style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            color: 'var(--text-dim)',
                            padding: '8px 14px 4px',
                            letterSpacing: '0.05em',
                            borderTop:
                              active.length > 0
                                ? '1px solid var(--border)'
                                : 'none',
                            marginTop: active.length > 0 ? '4px' : '0',
                          }}
                        >
                          Inactive
                        </div>
                        {inactive.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="project-select-item"
                            onClick={() => handleSelectProject(p)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              width: '100%',
                              padding: '8px 14px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              fontSize: '13.5px',
                              textAlign: 'left',
                              cursor: 'pointer',
                              transition: 'all var(--transition)',
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor =
                                'var(--bg-hover)';
                              e.currentTarget.style.color = 'var(--text)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor =
                                'transparent';
                              e.currentTarget.style.color = 'var(--text-muted)';
                            }}
                          >
                            <span>{p.name}</span>
                            <span
                              style={{
                                fontSize: '12px',
                                color: 'var(--text-dim)',
                              }}
                            >
                              {p.resourcedHours === null ||
                              p.resourcedHours === undefined
                                ? '∞'
                                : `${p.resourcedHours}h/wk`}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {active.length === 0 && inactive.length === 0 && (
                      <div
                        style={{
                          padding: '12px 14px',
                          fontSize: '13.5px',
                          color: 'var(--text-dim)',
                          textAlign: 'center',
                        }}
                      >
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
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="field" style={{ marginTop: '16px' }}>
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

          <div className="field" style={{ marginTop: '16px' }}>
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

          <div className="field" style={{ marginTop: '16px' }}>
            <label htmlFor="project-status">Status</label>
            <select
              id="project-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text)',
                fontSize: '14px',
              }}
            >
              <option value="active">Active</option>
              <option value="on-hold">On hold</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div
            className="field"
            style={{ marginTop: '16px', marginBottom: '16px' }}
          >
            <label>Colour</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                '#6b7280',
                '#334155',
                '#0f9e8e',
                '#2563eb',
                '#7c3aed',
                '#db2777',
                '#f59e0b',
                '#16a34a',
                '#dc2626',
                '#4f46e5',
                '#06b6d4',
                '#ea580c',
                '#92400e',
                '#65a30d',
              ].map((c) => (
                <button
                  key={c}
                  type="button"
                  className="color-swatch"
                  onClick={() => setColor(c)}
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    backgroundColor: c,
                    border:
                      color === c
                        ? '2px solid var(--text)'
                        : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                  title={`Use ${c}`}
                  aria-label={`Use colour ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="project-hours">
              {projectType === 'one-time'
                ? durationWeeks === 0 && durationDays > 0
                  ? `Usage limit for ${durationDays} day(s)`
                  : 'Weekly usage limit'
                : 'Weekly resourced hours'}
            </label>
            <div className="hours-field-row">
              <input
                id="project-hours"
                type="number"
                min="0"
                step="0.25"
                value={unlimited ? '' : hours}
                onChange={(e) => setHours(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={unlimited ? '∞ Unlimited' : 'e.g. 12'}
                className={errors.hours ? 'input-error' : ''}
                disabled={unlimited}
              />
              <label
                className="unlimited-toggle"
                title="Set to unlimited (no budget cap)"
              >
                <input
                  type="checkbox"
                  checked={unlimited}
                  onChange={(e) => {
                    setUnlimited(e.target.checked);
                    if (e.target.checked)
                      setApplyScope(initial ? 'project' : 'onwards'); // overrides usually aren't unlimited
                  }}
                />
                <span className="unlimited-label">∞</span>
              </label>
            </div>
            {errors.hours && (
              <span className="field-error">{errors.hours}</span>
            )}

            {projectType === 'one-time' &&
              durationWeeks > 0 &&
              durationDays > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <label
                    htmlFor="project-remainder-hours"
                    style={{
                      fontSize: '13px',
                      display: 'block',
                      marginBottom: '8px',
                    }}
                  >
                    Usage limit for remaining {durationDays} day(s)
                  </label>
                  <div className="hours-field-row">
                    <input
                      id="project-remainder-hours"
                      type="number"
                      min="0"
                      step="0.25"
                      value={remainderLimit}
                      onChange={(e) => setRemainderLimit(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="e.g. 5"
                      className={errors.remainderLimit ? 'input-error' : ''}
                    />
                  </div>
                  {errors.remainderLimit && (
                    <span className="field-error">{errors.remainderLimit}</span>
                  )}
                </div>
              )}

            {projectType !== 'one-time' &&
              ((initial && !unlimited) || !initial) && (
                <div style={{ marginTop: '16px' }}>
                  <label
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      marginBottom: '8px',
                      display: 'block',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {initial ? 'Apply changes to:' : 'Add to:'}
                  </label>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                    }}
                  >
                    {initial
                      ? [
                          { id: 'retro', label: 'Retrospectively' },
                          { id: 'onwards', label: 'This Week Onwards' },
                          { id: 'week', label: 'This Week Only' },
                          { id: 'project', label: 'Entire Project' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setApplyScope(opt.id)}
                            style={{
                              padding: '10px 12px',
                              fontSize: '13px',
                              border: `1px solid ${applyScope === opt.id ? 'var(--brand)' : 'var(--border)'}`,
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor:
                                applyScope === opt.id
                                  ? 'var(--brand-glow)'
                                  : 'var(--bg-elevated)',
                              color:
                                applyScope === opt.id
                                  ? 'var(--brand-light)'
                                  : 'var(--text-muted)',
                              cursor: 'pointer',
                              fontWeight: applyScope === opt.id ? 600 : 500,
                              transition: 'all 0.2s ease',
                              textAlign: 'center',
                            }}
                            onMouseOver={(e) => {
                              if (applyScope !== opt.id) {
                                e.currentTarget.style.borderColor =
                                  'var(--border-light)';
                                e.currentTarget.style.color = 'var(--text)';
                              }
                            }}
                            onMouseOut={(e) => {
                              if (applyScope !== opt.id) {
                                e.currentTarget.style.borderColor =
                                  'var(--border)';
                                e.currentTarget.style.color =
                                  'var(--text-muted)';
                              }
                            }}
                          >
                            {opt.label}
                          </button>
                        ))
                      : [
                          { id: 'week', label: 'This Week Only' },
                          { id: 'onwards', label: 'This Week Onwards' },
                          { id: 'next-onwards', label: 'Next Week Onwards' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setApplyScope(opt.id)}
                            style={{
                              padding: '10px 12px',
                              fontSize: '13px',
                              border: `1px solid ${applyScope === opt.id ? 'var(--brand)' : 'var(--border)'}`,
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor:
                                applyScope === opt.id
                                  ? 'var(--brand-glow)'
                                  : 'var(--bg-elevated)',
                              color:
                                applyScope === opt.id
                                  ? 'var(--brand-light)'
                                  : 'var(--text-muted)',
                              cursor: 'pointer',
                              fontWeight: applyScope === opt.id ? 600 : 500,
                              transition: 'all 0.2s ease',
                              textAlign: 'center',
                              gridColumn:
                                opt.id === 'next-onwards' ? 'span 2' : 'auto',
                            }}
                            onMouseOver={(e) => {
                              if (applyScope !== opt.id) {
                                e.currentTarget.style.borderColor =
                                  'var(--border-light)';
                                e.currentTarget.style.color = 'var(--text)';
                              }
                            }}
                            onMouseOut={(e) => {
                              if (applyScope !== opt.id) {
                                e.currentTarget.style.borderColor =
                                  'var(--border)';
                                e.currentTarget.style.color =
                                  'var(--text-muted)';
                              }
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                  </div>
                </div>
              )}
          </div>

          {projectType !== 'one-time' && (
            <>
              <div className="field" style={{ marginTop: '16px' }}>
                <label htmlFor="project-monthly-hours">
                  Monthly resourced hours (optional)
                </label>
                <div className="hours-field-row">
                  <input
                    id="project-monthly-hours"
                    type="number"
                    min="0"
                    step="0.25"
                    value={monthlyHours}
                    onChange={(e) => setMonthlyHours(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="e.g. 40"
                    className={errors.monthlyHours ? 'input-error' : ''}
                  />
                </div>
                {errors.monthlyHours && (
                  <span className="field-error">{errors.monthlyHours}</span>
                )}
              </div>

              <div className="field" style={{ marginTop: '16px' }}>
                <label htmlFor="project-historical-hours">
                  Historical monthly usage (optional)
                </label>
                <div className="hours-field-row">
                  <input
                    id="project-historical-hours"
                    type="number"
                    min="0"
                    step="0.25"
                    value={historicalMonthly}
                    onChange={(e) => setHistoricalMonthly(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="e.g. 10"
                    className={errors.historicalMonthly ? 'input-error' : ''}
                  />
                </div>
                {errors.historicalMonthly && (
                  <span className="field-error">
                    {errors.historicalMonthly}
                  </span>
                )}
              </div>
            </>
          )}

          <div className="field project-tasks-field">
            <label>Tasks / phases</label>
            <p className="field-help">
              Use General for unassigned time, or add task lines for a more
              detailed timesheet.
            </p>
            <div className="project-task-list">
              {tasks.map((task) => (
                <div className="project-task-item" key={task.id}>
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
                  <button
                    type="button"
                    onClick={() => {
                      if (tasks.length === 1) return;
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
                    disabled={tasks.length === 1}
                    aria-label={`Remove task ${task.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
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
            <div className="project-task-add">
              <input
                aria-label="New task or phase"
                value={newTask}
                onChange={(event) => setNewTask(event.target.value)}
                placeholder="New task or phase"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const value = newTask.trim();
                    if (value) {
                      setTasks((current) => [
                        ...current,
                        { id: uuid(), name: value },
                      ]);
                      setNewTask('');
                    }
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const value = newTask.trim();
                  if (value) {
                    setTasks((current) => [
                      ...current,
                      { id: uuid(), name: value },
                    ]);
                    setNewTask('');
                  }
                }}
              >
                Add task
              </button>
            </div>
          </div>

          <div
            className="field"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '16px',
            }}
          >
            <input
              id="project-billable"
              type="checkbox"
              checked={isBillable}
              onChange={(e) => setIsBillable(e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                margin: 0,
                cursor: 'pointer',
              }}
            />
            <label
              htmlFor="project-billable"
              style={{
                margin: 0,
                cursor: 'pointer',
                fontSize: '14px',
                color: 'var(--text)',
              }}
            >
              Billable project
            </label>
          </div>
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
