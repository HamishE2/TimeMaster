import { useEffect, useState } from 'react';
import ManageProjectRow from './ManageProjectRow.jsx';
import ManageProjectCard from './ManageProjectCard.jsx';

export default function ManageProjectsModal({
  isOpen,
  onClose,
  projects,
  updateProject,
  deleteProject,
  onImport,
  onSample,
  onAdd,
  onEdit,
}) {
  const [viewMode, setViewMode] = useState('list');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal manage-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-projects-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Workspace library</p>
            <h2 id="manage-projects-title">Manage projects</h2>
          </div>
          <div className="manage-header-actions">
            <button
              className="btn btn-ghost"
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            >
              {viewMode === 'list' ? 'Grid view' : 'List view'}
            </button>
            <button
              className="modal-close"
              onClick={onClose}
              aria-label="Close project manager"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="modal-body manage-body">
          {projects.length === 0 ? (
            <div className="manage-empty">
              <h3>No projects yet</h3>
              <p>
                Create the first project, then add its weekly plan and details.
              </p>
              <div className="manage-empty-actions">
                <button className="btn btn-primary" onClick={onAdd}>
                  Create project
                </button>
                <button className="btn btn-ghost" onClick={onSample}>
                  Add sample workspace
                </button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="manage-project-grid">
              {projects.map((project) => (
                <ManageProjectCard
                  key={project.id}
                  project={project}
                  editProject={onEdit}
                  deleteProject={deleteProject}
                />
              ))}
            </div>
          ) : (
            <div className="manage-project-list">
              <div className="manage-list-head" aria-hidden="true">
                <span>Project</span>
                <span>Weekly plan</span>
                <span>Limit</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {projects.map((project) => (
                <ManageProjectRow
                  key={project.id}
                  project={project}
                  updateProject={updateProject}
                  editProject={onEdit}
                  deleteProject={deleteProject}
                />
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer manage-footer">
          <button
            className="btn btn-ghost btn-import-manage"
            onClick={onImport}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M8 2v8M4 6l4 4 4-4M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Import CSV
          </button>
          <span className="manage-count">
            {projects.length} project{projects.length === 1 ? '' : 's'}
          </span>
          <button className="btn btn-primary" onClick={onAdd}>
            Add project
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
