export default function Empty({ projects, onNew, onManage, onSample }) {
  let title = 'No projects yet',
    copy = 'Create your first project to start planning the week.';
  if (projects.length) {
    title = 'Nothing scheduled this week';
    copy =
      'Projects exist, but they are hidden, archived, or scheduled for another week.';
  }
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{copy}</p>
      <div>
        <button className="primary" onClick={onNew}>
          Create project
        </button>
        {projects.length === 0 && (
          <button onClick={onSample}>Add sample workspace</button>
        )}
        {projects.length > 0 && (
          <button onClick={onManage}>Review projects</button>
        )}
      </div>
    </div>
  );
}
