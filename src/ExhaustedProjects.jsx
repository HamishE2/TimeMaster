import { usedHours, isUnlimited, fmtHours } from './utils';

function ProjectMiniCard({ p, weekKey }) {
  const used = usedHours(p, weekKey);
  const remaining = p.resourcedHours - used;
  const isExhausted = remaining <= 0;
  const statusClass = isExhausted ? 'status-light-red' : 'status-orange';

  return (
    <div className="suggestion-card" style={{ marginBottom: '12px' }}>
      <div className="suggestion-card-header">
        <h4 style={{ fontSize: '13px', fontWeight: '600' }}>{p.name}</h4>
        <span className={`suggestion-badge ${statusClass}`} style={{ fontSize: '10px' }}>
          {fmtHours(remaining)}h left
        </span>
      </div>
      <div className="suggestion-card-body">
        <div className="progress-bar-track" style={{ height: '3px', marginBottom: '8px' }}>
          <div 
            className={`progress-bar-fill ${statusClass}`}
            style={{ width: `${Math.max(0, Math.min((used / p.resourcedHours) * 100, 100))}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ExhaustedProjects({ projects, weekKey }) {
  if (!projects || projects.length === 0) return null;

  const exhausted = [];
  const nearlyExhausted = [];

  projects.forEach(p => {
    if (!isUnlimited(p)) {
      const used = usedHours(p, weekKey);
      const remaining = p.resourcedHours - used;
      if (remaining <= 0) {
        exhausted.push(p);
      } else if (remaining < 1) {
        nearlyExhausted.push(p);
      }
    }
  });

  if (exhausted.length === 0 && nearlyExhausted.length === 0) {
    return null;
  }

  // Sort them
  exhausted.sort((a, b) => (a.resourcedHours - usedHours(a, weekKey)) - (b.resourcedHours - usedHours(b, weekKey)));
  nearlyExhausted.sort((a, b) => (a.resourcedHours - usedHours(a, weekKey)) - (b.resourcedHours - usedHours(b, weekKey)));

  return (
    <div className="billable-chart-card" style={{ marginTop: '24px' }}>
      <h3 className="chart-title">Your Projects</h3>
      
      {nearlyExhausted.length > 0 && (
        <div className="suggestions-section" style={{ marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--orange)' }}>Nearly Exhausted</h4>
          <div className="suggestions-list">
            {nearlyExhausted.map(p => <ProjectMiniCard key={p.id} p={p} weekKey={weekKey} />)}
          </div>
        </div>
      )}

      {exhausted.length > 0 && (
        <div className="suggestions-section">
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--light-red)' }}>Exhausted</h4>
          <div className="suggestions-list">
            {exhausted.map(p => <ProjectMiniCard key={p.id} p={p} weekKey={weekKey} />)}
          </div>
        </div>
      )}
    </div>
  );
}
