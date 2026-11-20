// Small empty ledger: a header strip over a 5 × 4 grid with one filled cell.
function EmptyLedger() {
  return (
    <svg className="empty-ledger" viewBox="0 0 172 108" aria-hidden="true">
      <rect className="head" x="1" y="1" width="170" height="14" rx="2" />
      <rect className="mark" x="6" y="6" width="40" height="4" rx="1" />
      {Array.from({ length: 20 }, (_, i) => (
        <rect
          key={i}
          className={i === 6 ? 'cell fill' : 'cell'}
          x={1 + (i % 5) * 34}
          y={20 + Math.floor(i / 5) * 22}
          width="32"
          height="20"
          rx="2"
        />
      ))}
    </svg>
  );
}

export default function Empty({ projects, onNew, onManage, onSample }) {
  const title = projects.length ? 'Nothing scheduled this week' : 'No projects yet';
  return (
    <div className="empty">
      <EmptyLedger />
      <div className="empty-copy">
        <h2>{title}</h2>
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
    </div>
  );
}
