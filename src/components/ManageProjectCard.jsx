import { isUnlimited } from '../lib/utils.js';

export default function ManageProjectCard({
  project,
  deleteProject,
  editProject,
}) {
  const unlimited = isUnlimited(project);
  return (
    <article className="manage-project-card">
      <header>
        <span
          className="manage-project-swatch"
          style={{ background: project.color || 'var(--muted)' }}
        />
        <div>
          <h3>{project.name}</h3>
          <p>{`${[project.client, project.code].filter(Boolean).join(' · ') || 'No client or project code'} · ${(project.tasks || [{ id: 'general' }]).length} task${(project.tasks || [{ id: 'general' }]).length === 1 ? '' : 's'}`}</p>
        </div>
      </header>
      <div className="manage-card-tags">
        <span className={`manage-status status-${project.status || 'active'}`}>
          {(project.status || 'active').replace('-', ' ')}
        </span>
        <span>
          {unlimited
            ? 'Unlimited weekly plan'
            : `${project.resourcedHours ?? 0}h / week`}
        </span>
        <span>
          {project.isBillable === false ? 'Non-billable' : 'Billable'}
        </span>
      </div>
      <footer>
        <button className="btn btn-ghost" onClick={() => editProject(project)}>
          Edit details
        </button>
        <button
          className="btn manage-delete"
          onClick={() => deleteProject(project.id)}
        >
          Delete
        </button>
      </footer>
    </article>
  );
}
