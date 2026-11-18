/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { isUnlimited } from '../lib/utils.js';

export default function ManageProjectRow({
  project,
  updateProject,
  deleteProject,
  editProject,
}) {
  const [name, setName] = useState(project.name);
  const [unlimited, setUnlimited] = useState(isUnlimited(project));
  const [hours, setHours] = useState(
    isUnlimited(project) ? '' : (project.resourcedHours ?? ''),
  );

  useEffect(() => {
    setName(project.name);
    const nextUnlimited = isUnlimited(project);
    setUnlimited(nextUnlimited);
    setHours(nextUnlimited ? '' : (project.resourcedHours ?? ''));
  }, [project]);

  const save = (
    nextName = name,
    nextUnlimited = unlimited,
    nextHours = hours,
  ) => {
    const saved = updateProject(
      project.id,
      nextName,
      nextUnlimited ? null : nextHours,
    );
    if (saved === false) {
      setName(project.name);
      const projectUnlimited = isUnlimited(project);
      setUnlimited(projectUnlimited);
      setHours(projectUnlimited ? '' : (project.resourcedHours ?? ''));
    }
    return saved;
  };

  const toggleUnlimited = (checked) => {
    setUnlimited(checked);
    save(name, checked, hours);
  };

  return (
    <div className="manage-project-row">
      <div className="manage-project-identity">
        <span
          className="manage-project-swatch"
          style={{ background: project.color || 'var(--muted)' }}
        />
        <div>
          {project.client && (
            <span className="manage-project-client">{project.client}</span>
          )}
          <label className="sr-only" htmlFor={`manage-name-${project.id}`}>
            Project name
          </label>
          <input
            id={`manage-name-${project.id}`}
            type="text"
            className="manage-input-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => save()}
            onKeyDown={(event) =>
              event.key === 'Enter' && event.currentTarget.blur()
            }
            placeholder="Project name"
          />
          <span className="manage-project-meta">
            {`${[project.code].filter(Boolean).join(' · ') || 'No project code'} · ${(project.tasks || [{ id: 'general' }]).length} task${(project.tasks || [{ id: 'general' }]).length === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      <div className="manage-hours-wrap">
        <label htmlFor={`manage-hours-${project.id}`}>Hours / week</label>
        <input
          id={`manage-hours-${project.id}`}
          type="number"
          className="manage-input-hours"
          min="0"
          step="0.25"
          value={unlimited ? '' : hours}
          onChange={(event) => setHours(event.target.value)}
          onBlur={() => save()}
          onKeyDown={(event) =>
            event.key === 'Enter' && event.currentTarget.blur()
          }
          disabled={unlimited}
          placeholder={unlimited ? '∞' : '0'}
        />
      </div>

      <label
        className="manage-unlimited-toggle"
        title="Use an unlimited weekly plan"
      >
        <input
          type="checkbox"
          checked={unlimited}
          onChange={(event) => toggleUnlimited(event.target.checked)}
        />
        <span>Unlimited</span>
      </label>

      <span className={`manage-status status-${project.status || 'active'}`}>
        {(project.status || 'active').replace('-', ' ')}
      </span>

      <div className="manage-row-actions">
        <button
          className="btn btn-ghost manage-edit"
          onClick={() => editProject(project)}
        >
          Edit details
        </button>
        <button
          className="icon-btn icon-btn-danger"
          onClick={() => deleteProject(project.id)}
          aria-label={`Delete ${project.name}`}
          title="Delete project"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
