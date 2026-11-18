/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { isUnlimited } from './utils';

function ManageProjectRow({ project, updateProject, deleteProject, editProject }) {
  const [name, setName] = useState(project.name);
  const [unlimited, setUnlimited] = useState(isUnlimited(project));
  const [hours, setHours] = useState(isUnlimited(project) ? '' : (project.resourcedHours ?? ''));

  useEffect(() => {
    setName(project.name);
    const nextUnlimited = isUnlimited(project);
    setUnlimited(nextUnlimited);
    setHours(nextUnlimited ? '' : (project.resourcedHours ?? ''));
  }, [project]);

  const save = (nextName = name, nextUnlimited = unlimited, nextHours = hours) => {
    const saved = updateProject(project.id, nextName, nextUnlimited ? null : nextHours);
    if (saved === false) {
      setName(project.name);
      const projectUnlimited = isUnlimited(project);
      setUnlimited(projectUnlimited);
      setHours(projectUnlimited ? '' : (project.resourcedHours ?? ''));
    }
    return saved;
  };

  const toggleUnlimited = checked => {
    setUnlimited(checked);
    save(name, checked, hours);
  };

  return (
    <div className="manage-project-row">
      <div className="manage-project-identity">
        <span className="manage-project-swatch" style={{ background: project.color || 'var(--muted)' }} />
        <div>
          {project.client && <span className="manage-project-client">{project.client}</span>}<label className="sr-only" htmlFor={`manage-name-${project.id}`}>Project name</label>
          <input
            id={`manage-name-${project.id}`}
            type="text"
            className="manage-input-name"
            value={name}
            onChange={event => setName(event.target.value)}
            onBlur={() => save()}
            onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()}
            placeholder="Project name"
          />
          <span className="manage-project-meta">
            {`${[project.code].filter(Boolean).join(' · ') || 'No project code'} · ${(project.tasks || [{id:'general'}]).length} task${(project.tasks || [{id:'general'}]).length === 1 ? '' : 's'}`}
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
          onChange={event => setHours(event.target.value)}
          onBlur={() => save()}
          onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()}
          disabled={unlimited}
          placeholder={unlimited ? '∞' : '0'}
        />
      </div>

      <label className="manage-unlimited-toggle" title="Use an unlimited weekly plan">
        <input type="checkbox" checked={unlimited} onChange={event => toggleUnlimited(event.target.checked)} />
        <span>Unlimited</span>
      </label>

      <span className={`manage-status status-${project.status || 'active'}`}>{(project.status || 'active').replace('-', ' ')}</span>

      <div className="manage-row-actions">
        <button className="btn btn-ghost manage-edit" onClick={() => editProject(project)}>Edit details</button>
        <button className="icon-btn icon-btn-danger" onClick={() => deleteProject(project.id)} aria-label={`Delete ${project.name}`} title="Delete project">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ManageProjectCard({ project, deleteProject, editProject }) {
  const unlimited = isUnlimited(project);
  return (
    <article className="manage-project-card">
      <header>
        <span className="manage-project-swatch" style={{ background: project.color || 'var(--muted)' }} />
        <div>
          <h3>{project.name}</h3>
          <p>{`${[project.client, project.code].filter(Boolean).join(' · ') || 'No client or project code'} · ${(project.tasks || [{id:'general'}]).length} task${(project.tasks || [{id:'general'}]).length === 1 ? '' : 's'}`}</p>
        </div>
      </header>
      <div className="manage-card-tags">
        <span className={`manage-status status-${project.status || 'active'}`}>{(project.status || 'active').replace('-', ' ')}</span>
        <span>{unlimited ? 'Unlimited weekly plan' : `${project.resourcedHours ?? 0}h / week`}</span>
        <span>{project.isBillable === false ? 'Non-billable' : 'Billable'}</span>
      </div>
      <footer>
        <button className="btn btn-ghost" onClick={() => editProject(project)}>Edit details</button>
        <button className="btn manage-delete" onClick={() => deleteProject(project.id)}>Delete</button>
      </footer>
    </article>
  );
}

export default function ManageProjectsModal({ isOpen, onClose, projects, updateProject, deleteProject, onImport, onSample, onAdd, onEdit }) {
  const [viewMode, setViewMode] = useState('list');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal manage-modal" role="dialog" aria-modal="true" aria-labelledby="manage-projects-title" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Workspace library</p>
            <h2 id="manage-projects-title">Manage projects</h2>
          </div>
          <div className="manage-header-actions">
            <button className="btn btn-ghost" onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}>
              {viewMode === 'list' ? 'Grid view' : 'List view'}
            </button>
            <button className="modal-close" onClick={onClose} aria-label="Close project manager">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="modal-body manage-body">
          {projects.length === 0 ? (
            <div className="manage-empty">
              <h3>No projects yet</h3>
              <p>Create the first project, then add its weekly plan and details.</p>
              <div className="manage-empty-actions"><button className="btn btn-primary" onClick={onAdd}>Create project</button><button className="btn btn-ghost" onClick={onSample}>Add sample workspace</button></div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="manage-project-grid">
              {projects.map(project => <ManageProjectCard key={project.id} project={project} editProject={onEdit} deleteProject={deleteProject} />)}
            </div>
          ) : (
            <div className="manage-project-list">
              <div className="manage-list-head" aria-hidden="true">
                <span>Project</span><span>Weekly plan</span><span>Limit</span><span>Status</span><span>Actions</span>
              </div>
              {projects.map(project => (
                <ManageProjectRow key={project.id} project={project} updateProject={updateProject} editProject={onEdit} deleteProject={deleteProject} />
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer manage-footer">
          <button className="btn btn-ghost btn-import-manage" onClick={onImport}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2v8M4 6l4 4 4-4M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Import CSV
          </button>
          <span className="manage-count">{projects.length} project{projects.length === 1 ? '' : 's'}</span>
          <button className="btn btn-primary" onClick={onAdd}>Add project</button>
          <button className="btn btn-ghost" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}
